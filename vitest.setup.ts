import path from "node:path";
import os from "node:os";
import fs from "node:fs";

/**
 * Vitest 全局 setup：在任何测试文件 import 模块系统之前，
 * 把 MODULE_DATA_DIR 指向临时目录，避免污染真实数据目录。
 */
const testBase = path.join(os.tmpdir(), "fox-modules-vitest");
fs.mkdirSync(testBase, { recursive: true });
process.env.MODULE_DATA_DIR = testBase;
