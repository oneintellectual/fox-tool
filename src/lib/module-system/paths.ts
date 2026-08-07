import path from "path";
import fs from "fs";

/**
 * 模块系统数据目录解析（与 chat-db 一致的策略，独立存放模块数据）。
 * 优先级：MODULE_DATA_DIR 环境变量 > Serverless /tmp/fox-modules > 项目根 data/modules
 */
function resolveBaseDir(): string {
  if (process.env.MODULE_DATA_DIR) return process.env.MODULE_DATA_DIR;

  const cwd = process.cwd();
  const isServerless =
    process.env.VERCEL === "1" ||
    process.env.AWS_LAMBDA_FUNCTION_VERSION !== undefined ||
    cwd.startsWith("/var/task");

  if (isServerless) {
    return path.join("/tmp", "fox-modules");
  }
  return path.join(cwd, "data", "modules");
}

export const MODULES_BASE_DIR = resolveBaseDir();

/** 模块源码克隆目录：<base>/<moduleId>/source */
export function moduleSourceDir(moduleId: string): string {
  return path.join(MODULES_BASE_DIR, moduleId, "source");
}

/** 模块私有数据目录：<base>/<moduleId>/data */
export function moduleDataDir(moduleId: string): string {
  return path.join(MODULES_BASE_DIR, moduleId, "data");
}

/** 模块构建产物目录：<base>/<moduleId>/dist */
export function moduleDistDir(moduleId: string): string {
  return path.join(MODULES_BASE_DIR, moduleId, "dist");
}

/** 模块客户端构建产物路径（供浏览器 import 渲染工具页面） */
export function moduleClientBundlePath(moduleId: string): string {
  return path.join(moduleDistDir(moduleId), "client.js");
}

/** 模块服务端构建产物路径（供宿主加载 metadata 与生命周期钩子） */
export function moduleServerBundlePath(moduleId: string): string {
  return path.join(moduleDistDir(moduleId), "server.js");
}

/** 模块构建产物 bundle 路径（客户端，DB 存储用） */
export function moduleBundlePath(moduleId: string): string {
  return moduleClientBundlePath(moduleId);
}

/** DB 文件路径 */
export const MODULE_DB_PATH = path.join(MODULES_BASE_DIR, "modules.db");

/** 确保基础目录存在 */
export function ensureBaseDir(): void {
  if (!fs.existsSync(MODULES_BASE_DIR)) {
    fs.mkdirSync(MODULES_BASE_DIR, { recursive: true });
  }
}

/** 递归删除目录（用于卸载清理） */
export function removeDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
