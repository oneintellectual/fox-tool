import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import esbuild from "esbuild";
import { dynamicImport } from "./dynamic-import";
import { cloneRepo, readFileInRepo } from "./git";
import {
  collectSourceFiles,
  scanSource,
  validateFrameworkVersion,
  validateManifest,
  validateMetadataConsistency,
  type SecurityReport,
} from "./security";
import {
  findConflicts,
  assertCompatible,
} from "./dependency";
import {
  moduleClientBundlePath,
  moduleDataDir,
  moduleServerBundlePath,
  moduleSourceDir,
  moduleDistDir,
  ensureBaseDir,
  removeDir,
  MODULES_BASE_DIR,
} from "./paths";
import {
  findModuleByModuleId,
  genModuleId,
  insertModule,
  listModules,
} from "./db";
import { HOST_VERSION } from "./host";
import {
  ModuleError,
  type InstallRequest,
  type InstallResult,
  type ModuleExport,
  type ModuleManifest,
  type ModuleRow,
} from "./types";
import { runLifecycleHook, activateModule } from "./lifecycle";

/** esbuild 解析模块时附加的查找路径（保证从宿主 node_modules 解析依赖） */
const NODE_PATHS = [path.join(process.cwd(), "node_modules")];

/** 读取并校验 module.json */
export function loadManifest(sourceDir: string): ModuleManifest {
  const raw = readFileInRepo(sourceDir, "module.json");
  if (!raw) {
    throw new ModuleError("模块根目录缺少 module.json 清单文件", "MANIFEST_INVALID");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new ModuleError("module.json 不是合法 JSON", "MANIFEST_INVALID", e);
  }
  validateManifest(parsed);
  return parsed as ModuleManifest;
}

/** 用 esbuild 构建服务端与客户端两份 bundle */
export async function buildModule(
  sourceDir: string,
  entry: string,
  moduleId: string,
): Promise<{ serverPath: string; clientPath: string }> {
  const entryAbs = path.join(sourceDir, entry);
  if (!fs.existsSync(entryAbs)) {
    throw new ModuleError(`入口文件不存在: ${entry}`, "BUILD_FAILED");
  }

  const distDir = moduleDistDir(moduleId);
  removeDir(distDir);
  fs.mkdirSync(distDir, { recursive: true });

  const serverPath = moduleServerBundlePath(moduleId);
  const clientPath = moduleClientBundlePath(moduleId);

  const common: esbuild.BuildOptions = {
    entryPoints: [entryAbs],
    bundle: true,
    format: "esm",
    target: "es2020",
    jsx: "automatic",
    sourcemap: false,
    logLevel: "silent",
    nodePaths: NODE_PATHS,
    loader: { ".tsx": "tsx", ".ts": "ts", ".js": "js", ".jsx": "jsx" },
  };

  try {
    await Promise.all([
      esbuild.build({
        ...common,
        platform: "node",
        outfile: serverPath,
        // 服务端 bundle 标记 react/react-dom 为外部，复用宿主实例
        external: ["react", "react-dom", "react-dom/client"],
      }),
      esbuild.build({
        ...common,
        platform: "browser",
        outfile: clientPath,
        // 客户端 bundle 打包全部依赖（含 react），实现微前端自包含渲染
      }),
    ]);
  } catch (e) {
    throw new ModuleError(
      `模块构建失败: ${e instanceof Error ? e.message : String(e)}`,
      "BUILD_FAILED",
      e,
    );
  }

  return { serverPath, clientPath };
}

/** 已加载的服务端模块缓存（bundlePath -> ModuleExport），key 带时间戳避免缓存命中 */
const loadedModules = new Map<string, ModuleExport>();

/** 动态导入服务端 bundle 并取得模块导出 */
export async function loadServerBundle(serverPath: string): Promise<ModuleExport> {
  // 用时间戳 query 破坏 ESM 缓存，确保更新后重新加载
  const url = `${pathToFileURL(serverPath).href}?t=${Date.now()}`;
  const mod = await dynamicImport(url);
  const exported: ModuleExport | undefined = (mod?.default ?? mod) as ModuleExport | undefined;
  if (!exported || !exported.metadata) {
    throw new ModuleError("模块未导出 default.metadata", "LOAD_FAILED");
  }
  loadedModules.set(serverPath, exported);
  return exported;
}

export function getCachedModule(serverPath: string): ModuleExport | undefined {
  return loadedModules.get(serverPath);
}

/** 完整安装流程：拉取 → 校验 → 构建 → 加载 → 依赖检查 → 生命周期 install */
export async function installModule(req: InstallRequest): Promise<InstallResult> {
  const { gitUrl, ref = "HEAD", activate = true, token } = req;
  const warnings: string[] = [];

  // 1. 拉取仓库
  const manifestFirst = await peekManifestFromRemote(gitUrl, ref, token);

  // 2. 已安装检查
  const existing = findModuleByModuleId(manifestFirst.id);
  if (existing) {
    throw new ModuleError(
      `模块 ${manifestFirst.id} 已安装（版本 ${existing.version}），请使用更新接口`,
      "ALREADY_INSTALLED",
    );
  }

  // 3. 依赖预检（与已安装模块兼容性）
  const installedManifests = listModules().map((r) => JSON.parse(r.manifest) as ModuleManifest);
  try {
    assertCompatible(manifestFirst, installedManifests);
  } catch (e) {
    if (e instanceof ModuleError) throw e;
    throw new ModuleError("依赖兼容性校验失败", "DEPENDENCY_CONFLICT", e);
  }

  // 4. 克隆到正式目录
  const sourceDir = moduleSourceDir(manifestFirst.id);
  await cloneRepo({ url: gitUrl, dir: sourceDir, ref, token });
  const manifest = loadManifest(sourceDir);

  // 5. 安全扫描
  const report = scanModule(sourceDir, manifest);
  if (!report.passed) {
    // 安全高危，清理并拒绝
    removeDir(sourceDir);
    throw new ModuleError(
      `安全扫描未通过：${report.issues.map((i) => `[${i.rule}] ${i.message}`).join("; ")}`,
      "SECURITY_VIOLATION",
      report.issues,
    );
  }
  warnings.push(...report.issues.map((i) => `[${i.severity}] ${i.rule}: ${i.message}`));

  // 6. 框架版本兼容
  const fxReport = validateFrameworkVersion(manifest, HOST_VERSION);
  if (!fxReport.passed) {
    removeDir(sourceDir);
    throw new ModuleError(
      fxReport.issues.map((i) => i.message).join("; "),
      "VERSION_INCOMPATIBLE",
      fxReport.issues,
    );
  }

  // 7. 构建
  const entry = manifest.entry ?? "src/index.tsx";
  const { serverPath, clientPath } = await buildModule(sourceDir, entry, manifest.id);

  // 8. 加载服务端 bundle 并交叉校验 metadata
  let exported: ModuleExport;
  try {
    exported = await loadServerBundle(serverPath);
  } catch (e) {
    removeDir(sourceDir);
    throw new ModuleError(
      `模块加载失败: ${e instanceof Error ? e.message : String(e)}`,
      "LOAD_FAILED",
      e,
    );
  }
  validateMetadataConsistency(manifest, exported.metadata);

  // 9. 写入 DB
  ensureBaseDir();
  fs.mkdirSync(moduleDataDir(manifest.id), { recursive: true });
  const now = Date.now();
  const row: ModuleRow = {
    id: genModuleId(),
    module_id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    git_url: gitUrl,
    ref,
    status: "installed",
    manifest: JSON.stringify(manifest),
    entry_path: entry,
    source_dir: sourceDir,
    bundle_path: clientPath,
    installed_at: now,
    updated_at: now,
    error: null,
  };
  insertModule(row);

  // 10. 生命周期 install 钩子
  try {
    await runLifecycleHook(exported, "install", manifest.id, manifest.version);
  } catch (e) {
    warnings.push(`install 钩子执行失败: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 11. 激活
  let activated = false;
  let finalStatus: ModuleRow["status"] = row.status;
  if (activate) {
    try {
      await activateModule(manifest.id);
      activated = true;
      finalStatus = "active";
    } catch (e) {
      warnings.push(`激活失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return {
    row: { ...row, status: finalStatus },
    activated,
    warnings,
  };
}

/** 安全扫描封装 */
export function scanModule(sourceDir: string, manifest: ModuleManifest): SecurityReport {
  const files = collectSourceFiles(sourceDir);
  return scanSource(files, manifest.permissions ?? {});
}

/** 仅拉取清单（不落地正式目录），用于安装前预检 */
async function peekManifestFromRemote(
  gitUrl: string,
  ref: string,
  token?: string,
): Promise<ModuleManifest> {
  // 克隆到临时目录读取清单
  const tempDir = path.join(MODULES_BASE_DIR, ".tmp", `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  await cloneRepo({ url: gitUrl, dir: tempDir, ref, token });
  try {
    return loadManifest(tempDir);
  } finally {
    removeDir(tempDir);
  }
}

/** 依赖冲突查询（暴露给管理界面） */
export function getDependencyConflicts(manifest: ModuleManifest): ReturnType<typeof findConflicts> {
  return findConflicts(manifest, listModules().map((r) => JSON.parse(r.manifest) as ModuleManifest));
}
