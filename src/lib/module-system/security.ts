import semver from "semver";
import fs from "fs";
import path from "path";
import type { ModuleManifest, ModulePermissions } from "./types";
import { ModuleError } from "./types";

export type Severity = "high" | "medium" | "low";

export interface SecurityIssue {
  severity: Severity;
  rule: string;
  message: string;
  file?: string;
}

export interface SecurityReport {
  passed: boolean;
  issues: SecurityIssue[];
}

/** 待扫描的源文件 */
export interface SourceFile {
  path: string;
  content: string;
}

interface ScanRule {
  rule: string;
  pattern: RegExp;
  message: string;
  severity: Severity;
  /** 命中该规则需要声明的权限 */
  permission?: keyof ModulePermissions;
}

// 危险 API 模式规则表
const RULES: ScanRule[] = [
  {
    rule: "child_process",
    pattern: /\b(require|import)\s*\(?\s*['"]child_process['"]|from\s+['"]child_process['"]/,
    message: "使用了 child_process，可派生子进程执行任意命令",
    severity: "high",
    permission: "subprocess",
  },
  {
    rule: "eval",
    pattern: /\beval\s*\(/,
    message: "使用了 eval()，存在任意代码执行风险",
    severity: "high",
  },
  {
    rule: "function-constructor",
    pattern: /\bnew\s+Function\s*\(/,
    message: "使用了 new Function()，存在任意代码执行风险",
    severity: "high",
  },
  {
    rule: "vm-module",
    pattern: /\b(require|import)\s*\(?\s*['"]node:vm['"]|from\s+['"]node:vm['"]/,
    message: "使用了 vm 模块，可能绕过沙箱",
    severity: "high",
  },
  {
    rule: "fs-module",
    pattern: /\b(require|import)\s*\(?\s*['"](node:)?fs['"]|from\s+['"](node:)?fs['"]/,
    message: "使用了 fs 模块访问文件系统",
    severity: "medium",
    permission: "filesystem",
  },
  {
    rule: "network-fetch",
    pattern: /\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\b(require|import)\s*\(?\s*['"](node:)?https?['"]/,
    message: "发起了网络请求",
    severity: "medium",
    permission: "network",
  },
  {
    rule: "process-env",
    pattern: /\bprocess\.env\b/,
    message: "读取了环境变量，可能泄露密钥",
    severity: "medium",
    permission: "env",
  },
  {
    rule: "database",
    pattern: /\bbetter-sqlite3\b|\b(require|import)\s*\(?\s*['"]mysql['"]|from\s+['"]pg['"]/,
    message: "访问了数据库",
    severity: "medium",
    permission: "database",
  },
  {
    rule: "process-exit",
    pattern: /\bprocess\.exit\s*\(/,
    message: "调用了 process.exit()，可能中断宿主进程",
    severity: "medium",
  },
  {
    rule: "host-path",
    pattern: /\/etc\/passwd|\/etc\/shadow|\/root\/\.ssh|\.\.\/\.\.\/\.\.\//,
    message: "出现可疑的宿主系统路径访问",
    severity: "high",
  },
  {
    rule: "obfuscated-long-string",
    pattern: /['"`][A-Za-z0-9+/=]{200,}['"`]/,
    message: "存在超长 base64 字符串，可能为混淆代码",
    severity: "low",
  },
];

/** 扫描源文件，依据声明的权限判定是否违规 */
export function scanSource(files: SourceFile[], permissions: ModulePermissions = {}): SecurityReport {
  const issues: SecurityIssue[] = [];

  for (const file of files) {
    for (const rule of RULES) {
      if (rule.pattern.test(file.content)) {
        // 若该规则需要权限且权限已声明，则降级为 low 提示
        if (rule.permission && permissions[rule.permission]) {
          issues.push({
            severity: "low",
            rule: rule.rule,
            message: `${rule.message}（已声明 ${rule.permission} 权限）`,
            file: file.path,
          });
        } else {
          issues.push({
            severity: rule.severity,
            rule: rule.rule,
            message: rule.permission
              ? `${rule.message}，但未声明 ${rule.permission} 权限`
              : rule.message,
            file: file.path,
          });
        }
      }
    }
  }

  const passed = !issues.some((i) => i.severity === "high");
  return { passed, issues };
}

/** 校验清单结构合法性 */
export function validateManifest(manifest: unknown): asserts manifest is ModuleManifest {
  if (!manifest || typeof manifest !== "object") {
    throw new ModuleError("module.json 必须是对象", "MANIFEST_INVALID");
  }
  const m = manifest as Record<string, unknown>;
  const required: (keyof ModuleManifest)[] = ["id", "name", "version", "description"];
  for (const key of required) {
    if (typeof m[key] !== "string" || (m[key] as string).length === 0) {
      throw new ModuleError(`module.json 缺少必填字段: ${key}`, "MANIFEST_INVALID");
    }
  }
  if (!/^[a-z][a-z0-9-]{1,62}$/.test(m.id as string)) {
    throw new ModuleError(
      "module_id 必须以小写字母开头，仅含小写字母/数字/连字符，长度 2-63",
      "MANIFEST_INVALID",
    );
  }
  if (!semver.valid(m.version as string)) {
    throw new ModuleError(`version 不是合法的语义化版本: ${m.version}`, "MANIFEST_INVALID");
  }
  if (m.dependencies !== undefined && !Array.isArray(m.dependencies)) {
    throw new ModuleError("dependencies 必须是数组", "MANIFEST_INVALID");
  }
  if (m.permissions !== undefined && typeof m.permissions !== "object") {
    throw new ModuleError("permissions 必须是对象", "MANIFEST_INVALID");
  }
}

/** 校验框架版本兼容性 */
export function validateFrameworkVersion(
  manifest: ModuleManifest,
  hostVersion: string,
): SecurityReport {
  const issues: SecurityIssue[] = [];
  if (manifest.frameworkVersion) {
    if (!semver.satisfies(hostVersion, manifest.frameworkVersion)) {
      issues.push({
        severity: "high",
        rule: "framework-version",
        message: `模块要求框架 ${manifest.frameworkVersion}，当前宿主为 ${hostVersion}`,
      });
    }
  }
  return { passed: !issues.some((i) => i.severity === "high"), issues };
}

/** 交叉校验清单与模块代码导出的 metadata 是否一致 */
export function validateMetadataConsistency(
  manifest: ModuleManifest,
  exported: ModuleManifest,
): void {
  if (manifest.id !== exported.id) {
    throw new ModuleError(
      `metadata 不一致: module.json id=${manifest.id}，代码 id=${exported.id}`,
      "METADATA_MISMATCH",
    );
  }
  if (manifest.version !== exported.version) {
    throw new ModuleError(
      `metadata 不一致: module.json version=${manifest.version}，代码 version=${exported.version}`,
      "METADATA_MISMATCH",
    );
  }
}

/** 收集目录下所有可扫描源文件 */
export function collectSourceFiles(dir: string, maxFiles = 500): SourceFile[] {
  const results: SourceFile[] = [];
  const exts = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"]);
  const skipDirs = new Set(["node_modules", ".git", "dist", "build", ".next"]);

  const walk = (current: string) => {
    if (results.length >= maxFiles) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (results.length >= maxFiles) return;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!skipDirs.has(entry.name)) walk(full);
      } else if (exts.has(path.extname(entry.name))) {
        try {
          results.push({ path: path.relative(dir, full), content: fs.readFileSync(full, "utf-8") });
        } catch {
          /* 忽略无法读取的文件 */
        }
      }
    }
  };
  walk(dir);
  return results;
}
