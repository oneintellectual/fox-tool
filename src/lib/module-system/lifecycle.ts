import fs from "fs";
import path from "path";
import {
  cloneRepo,
} from "./git";
import { loadManifest, buildModule, loadServerBundle, scanModule } from "./loader";
import {
  moduleDataDir,
  moduleDistDir,
  moduleServerBundlePath,
  moduleSourceDir,
  removeDir,
} from "./paths";
import {
  clearConfig,
  deleteModule,
  findModuleByModuleId,
  getConfig,
  listActiveModules,
  setConfig,
  updateModule,
} from "./db";
import { registerActive, unregister, callModuleApi } from "./registry";
import {
  ModuleError,
  type FrameworkApi,
  type InstallRequest,
  type Logger,
  type ModuleContext,
  type ModuleExport,
  type ModuleRow,
} from "./types";
import { validateFrameworkVersion, validateMetadataConsistency } from "./security";
import { HOST_VERSION } from "./host";

type HookName = "install" | "activate" | "deactivate" | "uninstall" | "update";

/** 创建模块上下文 */
function createContext(moduleId: string, version: string, dependencies: string[]): ModuleContext {
  const logger: Logger = {
    info: (msg, ...args) => console.info(`[module:${moduleId}]`, msg, ...args),
    warn: (msg, ...args) => console.warn(`[module:${moduleId}]`, msg, ...args),
    error: (msg, ...args) => console.error(`[module:${moduleId}]`, msg, ...args),
  };

  const framework: FrameworkApi = {
    getConfig: (key) => getConfig(moduleId, key),
    setConfig: (key, value) => setConfig(moduleId, key, value),
    call: (targetId, fn, ...args) =>
      callModuleApi(moduleId, dependencies, targetId, fn, ...args),
  };

  return {
    moduleId,
    version,
    logger,
    dataDir: moduleDataDir(moduleId),
    framework,
  };
}

/** 执行生命周期钩子 */
export async function runLifecycleHook(
  exported: ModuleExport,
  hook: HookName,
  moduleId: string,
  version: string,
  extra?: string,
): Promise<void> {
  const fn = exported.lifecycle?.[hook];
  if (typeof fn !== "function") return;
  const deps = (exported.metadata.dependencies ?? []).map((d) => d.name);
  const ctx = createContext(moduleId, version, deps);
  if (hook === "update") {
    await (fn as (from: string, ctx: ModuleContext) => unknown)(extra ?? "", ctx);
  } else {
    await (fn as (ctx: ModuleContext) => unknown)(ctx);
  }
}

/** 加载服务端 bundle（若未在注册表则加载并返回） */
async function ensureLoaded(row: ModuleRow): Promise<ModuleExport> {
  const existing = findModuleByModuleId(row.module_id);
  if (!existing) {
    throw new ModuleError(`模块 ${row.module_id} 未安装`, "NOT_FOUND");
  }
  const serverPath = moduleServerBundlePath(row.module_id);
  if (!fs.existsSync(serverPath)) {
    throw new ModuleError(`模块 ${row.module_id} 服务端 bundle 不存在，请重新安装`, "LOAD_FAILED");
  }
  return loadServerBundle(serverPath);
}

/** 激活模块 */
export async function activateModule(moduleId: string): Promise<void> {
  const row = findModuleByModuleId(moduleId);
  if (!row) throw new ModuleError(`模块 ${moduleId} 未安装`, "NOT_FOUND");
  if (row.status === "active") return;

  const exported = await ensureLoaded(row);
  await runLifecycleHook(exported, "activate", moduleId, row.version);
  registerActive(moduleId, exported);
  updateModule(moduleId, { status: "active", error: null });
}

/** 停用模块 */
export async function deactivateModule(moduleId: string): Promise<void> {
  const row = findModuleByModuleId(moduleId);
  if (!row) throw new ModuleError(`模块 ${moduleId} 未安装`, "NOT_FOUND");
  if (row.status !== "active") return;

  const exported = await ensureLoaded(row);
  await runLifecycleHook(exported, "deactivate", moduleId, row.version);
  unregister(moduleId);
  updateModule(moduleId, { status: "inactive" });
}

/** 卸载模块：执行 uninstall 钩子并清理全部资源 */
export async function uninstallModule(moduleId: string): Promise<void> {
  const row = findModuleByModuleId(moduleId);
  if (!row) throw new ModuleError(`模块 ${moduleId} 未安装`, "NOT_FOUND");

  // 尝试执行 uninstall 钩子（失败不阻塞清理）
  try {
    if (fs.existsSync(moduleServerBundlePath(moduleId))) {
      const exported = await loadServerBundle(moduleServerBundlePath(moduleId));
      await runLifecycleHook(exported, "uninstall", moduleId, row.version);
    }
  } catch (e) {
    console.warn(`[module:${moduleId}] uninstall 钩子失败:`, e);
  }

  unregister(moduleId);
  clearConfig(moduleId);
  deleteModule(moduleId);
  removeDir(moduleSourceDir(moduleId));
  removeDir(moduleDataDir(moduleId));
  removeDir(moduleDistDir(moduleId));
}

/** 更新模块：拉取新版本 → 校验 → 构建 → 执行 update 钩子 */
export async function updateModuleById(
  moduleId: string,
  req: Pick<InstallRequest, "ref" | "token">,
): Promise<ModuleRow> {
  const row = findModuleByModuleId(moduleId);
  if (!row) throw new ModuleError(`模块 ${moduleId} 未安装`, "NOT_FOUND");

  const wasActive = row.status === "active";
  const ref = req.ref ?? row.ref;

  // 1. 拉取到临时目录
  const tempDir = path.join(path.dirname(moduleSourceDir(moduleId)), ".tmp", `${Date.now()}`);
  await cloneRepo({ url: row.git_url, dir: tempDir, ref, token: req.token });
  const manifest = loadManifest(tempDir);

  if (manifest.id !== moduleId) {
    removeDir(tempDir);
    throw new ModuleError(`更新目标 id 不匹配: 期望 ${moduleId}，实际 ${manifest.id}`, "METADATA_MISMATCH");
  }

  // 2. 安全扫描 + 版本兼容
  const secReport = scanModule(tempDir, manifest);
  if (!secReport.passed) {
    removeDir(tempDir);
    throw new ModuleError(
      `安全扫描未通过：${secReport.issues.map((i) => i.message).join("; ")}`,
      "SECURITY_VIOLATION",
      secReport.issues,
    );
  }
  const fxReport = validateFrameworkVersion(manifest, HOST_VERSION);
  if (!fxReport.passed) {
    removeDir(tempDir);
    throw new ModuleError(fxReport.issues.map((i) => i.message).join("; "), "VERSION_INCOMPATIBLE");
  }

  // 3. 替换源码目录并重建
  removeDir(moduleSourceDir(moduleId));
  fs.renameSync(tempDir, moduleSourceDir(moduleId));
  const entry = manifest.entry ?? "src/index.tsx";
  const { serverPath } = await buildModule(moduleSourceDir(moduleId), entry, moduleId);

  // 4. 加载并校验
  const exported = await loadServerBundle(serverPath);
  validateMetadataConsistency(manifest, exported.metadata);

  // 5. 执行 update 钩子
  await runLifecycleHook(exported, "update", moduleId, manifest.version, row.version);

  // 6. 更新 DB
  updateModule(moduleId, {
    version: manifest.version,
    ref,
    manifest: JSON.stringify(manifest),
    entry_path: entry,
    status: wasActive ? "active" : "inactive",
    error: null,
  });

  if (wasActive) {
    registerActive(moduleId, exported);
  }

  return findModuleByModuleId(moduleId)!;
}

/** 进程启动时恢复已激活模块到注册表（按需调用） */
export async function restoreActiveModules(): Promise<void> {
  const rows = listActiveModules();
  for (const row of rows) {
    try {
      if (!fs.existsSync(moduleServerBundlePath(row.module_id))) {
        updateModule(row.module_id, { status: "error", error: "服务端 bundle 缺失" });
        continue;
      }
      const exported = await loadServerBundle(moduleServerBundlePath(row.module_id));
      registerActive(row.module_id, exported);
    } catch (e) {
      updateModule(row.module_id, {
        status: "error",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
}
