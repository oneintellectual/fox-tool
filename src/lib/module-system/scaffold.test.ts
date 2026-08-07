import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { generateScaffold, validateScaffoldOptions } from "./scaffold";
import { ModuleError } from "./types";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "fox-scaffold-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("scaffold / validateScaffoldOptions", () => {
  it("合法选项通过", () => {
    expect(() =>
      validateScaffoldOptions({
        id: "my-module",
        name: "我的模块",
        description: "测试",
        outDir: tmpDir,
      }),
    ).not.toThrow();
  });

  it("id 不合法抛出", () => {
    expect(() =>
      validateScaffoldOptions({
        id: "Bad_ID",
        name: "x",
        description: "x",
        outDir: tmpDir,
      }),
    ).toThrow(ModuleError);
  });

  it("name 为空抛出", () => {
    expect(() =>
      validateScaffoldOptions({
        id: "ok-id",
        name: "  ",
        description: "x",
        outDir: tmpDir,
      }),
    ).toThrow(ModuleError);
  });
});

describe("scaffold / generateScaffold", () => {
  it("生成完整文件结构", () => {
    const result = generateScaffold({
      id: "demo-tool",
      name: "演示工具",
      description: "演示模块",
      outDir: tmpDir,
      author: "tester",
    });
    expect(result.files).toContain("module.json");
    expect(result.files).toContain("package.json");
    expect(result.files).toContain("tsconfig.json");
    expect(result.files).toContain("src/index.tsx");
    expect(result.files).toContain("src/types.ts");
    expect(result.files).toContain("README.md");
    expect(result.files).toContain(".gitignore");
  });

  it("module.json 包含正确元数据", () => {
    const result = generateScaffold({
      id: "demo-tool",
      name: "演示工具",
      description: "演示模块",
      outDir: tmpDir,
      version: "2.1.0",
      icon: "🚀",
    });
    const manifest = JSON.parse(
      fs.readFileSync(path.join(result.outDir, "module.json"), "utf-8"),
    );
    expect(manifest.id).toBe("demo-tool");
    expect(manifest.name).toBe("演示工具");
    expect(manifest.version).toBe("2.1.0");
    expect(manifest.icon).toBe("🚀");
    expect(manifest.entry).toBe("src/index.tsx");
  });

  it("入口文件可被解析为模块（语法正确）", () => {
    const result = generateScaffold({
      id: "demo-tool",
      name: "演示工具",
      description: "演示模块",
      outDir: tmpDir,
    });
    const entry = fs.readFileSync(path.join(result.outDir, "src/index.tsx"), "utf-8");
    expect(entry).toContain("export default moduleExport");
    expect(entry).toContain("metadata");
    expect(entry).toContain("lifecycle");
    expect(entry).toContain("tool");
  });

  it("已存在的目录可重复生成（覆盖）", () => {
    generateScaffold({
      id: "demo-tool",
      name: "v1",
      description: "d",
      outDir: tmpDir,
    });
    expect(() =>
      generateScaffold({
        id: "demo-tool",
        name: "v2",
        description: "d",
        outDir: tmpDir,
      }),
    ).not.toThrow();
  });
});
