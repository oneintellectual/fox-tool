/**
 * 运行时动态 import —— 用 `new Function` 构造器绕过 Turbopack / webpack 的静态分析。
 *
 * 否则构建时会因为 `import(动态字符串)` 报 "Can't resolve <dynamic>" 错误。
 * Next.js 官方推荐此写法处理运行时才确定的 ESM 导入。
 *
 * 注意：vitest VM 环境不支持 `new Function` 内的 `import()`，测试中通过
 * `vitest.setup.ts` 的 `vi.mock` 替换为直接 `import()`。
 */
export const dynamicImport = new Function(
  "url",
  "return import(url)",
) as (url: string) => Promise<Record<string, unknown>>;
