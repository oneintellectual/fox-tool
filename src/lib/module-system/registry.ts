import type { ModuleExport } from "./types";
import { ModuleError } from "./types";

/**
 * 已激活模块的内存注册表。
 * 保存服务端 bundle 加载后的导出对象，供生命周期钩子与跨模块调用使用。
 * 进程重启后注册表清空，激活状态由 DB 持久化，按需重新加载。
 */
const activeRegistry = new Map<string, ModuleExport>();

/** 注册一个已激活模块 */
export function registerActive(moduleId: string, exported: ModuleExport): void {
  activeRegistry.set(moduleId, exported);
}

/** 取消注册 */
export function unregister(moduleId: string): void {
  activeRegistry.delete(moduleId);
}

/** 获取已激活模块导出 */
export function getActive(moduleId: string): ModuleExport | undefined {
  return activeRegistry.get(moduleId);
}

/** 判断是否已激活 */
export function isActive(moduleId: string): boolean {
  return activeRegistry.has(moduleId);
}

/** 列出全部已激活模块 id */
export function listActiveIds(): string[] {
  return Array.from(activeRegistry.keys());
}

/**
 * 调用其他已激活模块暴露的 API（受依赖声明约束）。
 * 调用方需在自身 manifest.dependencies 中声明对 target 的依赖。
 */
export async function callModuleApi(
  callerId: string,
  callerDependencies: string[],
  targetId: string,
  fn: string,
  ...args: unknown[]
): Promise<unknown> {
  if (targetId !== callerId && !callerDependencies.includes(targetId)) {
    throw new ModuleError(
      `模块 ${callerId} 未声明对 ${targetId} 的依赖，禁止调用`,
      "DEPENDENCY_MISSING",
    );
  }
  const target = getActive(targetId);
  if (!target) {
    throw new ModuleError(`目标模块 ${targetId} 未激活`, "NOT_FOUND");
  }
  const handler = target.api?.[fn];
  if (typeof handler !== "function") {
    throw new ModuleError(`模块 ${targetId} 未暴露 API: ${fn}`, "NOT_FOUND");
  }
  return Promise.resolve(handler(...args));
}
