/**
 * 模块系统运行环境检测
 *
 * Vercel Serverless 函数文件系统只读（除临时 /tmp），且函数实例无状态、
 * 冷启动后 /tmp 数据丢失。模块安装流程需要 Git 克隆、esbuild 构建和
 * 持久化存储，在 Serverless 环境下无法正常工作。
 *
 * 内置工具不依赖模块系统，可正常使用；模块查询接口（list/get）可降级
 * 返回空数据。仅模块写操作（安装/更新/激活/停用/卸载）需要被拦截。
 */

/** 是否运行在 Vercel Serverless 环境 */
export function isVercelServerless(): boolean {
  return process.env.VERCEL === "1" || process.env.VERCEL_ENV !== undefined;
}

/**
 * 拦截 Serverless 环境下的模块写操作，抛出明确错误。
 * 在安装/更新/激活/停用/卸载 API 路由中调用。
 */
export function assertNotServerless(operation: string): void {
  if (isVercelServerless()) {
    throw new Error(
      `「${operation}」在 Vercel Serverless 环境不可用：模块安装需要 Git 克隆、esbuild 构建和持久化存储，而 Serverless 文件系统只读。请使用本地开发环境（pnpm dev）运行此操作。`,
    );
  }
}
