import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { vi } from "vitest";

/**
 * Vitest 全局 setup：在任何测试文件 import 模块系统之前，
 * 把 MODULE_DATA_DIR 指向临时目录，避免污染真实数据目录。
 */
const testBase = path.join(os.tmpdir(), "fox-modules-vitest");
fs.mkdirSync(testBase, { recursive: true });
process.env.MODULE_DATA_DIR = testBase;

/**
 * vitest VM 环境不支持 `new Function("return import(url)")` 内的动态 import
 * （报 ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING），替换为直接 import()。
 * 生产环境（Next.js / Node.js）使用 `new Function` 绕过 Turbopack 静态分析。
 */
vi.mock("@/lib/module-system/dynamic-import", () => ({
  dynamicImport: (url: string) => import(/* @vite-ignore */ url),
}));
