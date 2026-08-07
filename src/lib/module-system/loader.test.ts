import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { loadManifest, buildModule, loadServerBundle } from "./loader";
import { ModuleError } from "./types";

let tmpSourceDir: string;

beforeEach(() => {
  tmpSourceDir = fs.mkdtempSync(path.join(os.tmpdir(), "fox-loader-src-"));
});

afterEach(() => {
  fs.rmSync(tmpSourceDir, { recursive: true, force: true });
});

describe("loader / loadManifest", () => {
  it("读取合法 module.json", () => {
    fs.writeFileSync(
      path.join(tmpSourceDir, "module.json"),
      JSON.stringify({
        id: "demo-tool",
        name: "演示",
        version: "1.0.0",
        description: "x",
        entry: "src/index.tsx",
      }),
    );
    const m = loadManifest(tmpSourceDir);
    expect(m.id).toBe("demo-tool");
    expect(m.version).toBe("1.0.0");
  });

  it("module.json 不存在抛出", () => {
    expect(() => loadManifest(tmpSourceDir)).toThrow(ModuleError);
  });

  it("非法 JSON 抛出", () => {
    fs.writeFileSync(path.join(tmpSourceDir, "module.json"), "{ not json");
    expect(() => loadManifest(tmpSourceDir)).toThrow(ModuleError);
  });

  it("manifest 缺字段抛出", () => {
    fs.writeFileSync(
      path.join(tmpSourceDir, "module.json"),
      JSON.stringify({ id: "demo-tool" }),
    );
    expect(() => loadManifest(tmpSourceDir)).toThrow(ModuleError);
  });
});

describe("loader / buildModule", () => {
  it("构建合法入口生成 server/client bundle", async () => {
    fs.mkdirSync(path.join(tmpSourceDir, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpSourceDir, "src", "index.ts"),
      `export default { metadata: { id: "demo-tool", name: "演示", version: "1.0.0", description: "x" } };`,
    );
    // MODULE_DATA_DIR 已在 vitest.setup.ts 中重定向到临时目录
    const { serverPath, clientPath } = await buildModule(
      tmpSourceDir,
      "src/index.ts",
      "demo-tool-test",
    );
    expect(fs.existsSync(serverPath)).toBe(true);
    expect(fs.existsSync(clientPath)).toBe(true);
  });

  it("入口不存在抛出 BUILD_FAILED", async () => {
    await expect(buildModule(tmpSourceDir, "src/missing.ts", "demo-tool-missing")).rejects.toThrow(
      ModuleError,
    );
  });
});

describe("loader / loadServerBundle", () => {
  it("加载合法 bundle 并返回 metadata", async () => {
    fs.mkdirSync(path.join(tmpSourceDir, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpSourceDir, "src", "index.ts"),
      `export default { metadata: { id: "demo-tool", name: "演示", version: "1.0.0", description: "x" } };`,
    );
    const { serverPath } = await buildModule(tmpSourceDir, "src/index.ts", "demo-tool-load");
    const exported = await loadServerBundle(serverPath);
    expect(exported.metadata.id).toBe("demo-tool");
  });

  it("未导出 metadata 抛出 LOAD_FAILED", async () => {
    fs.mkdirSync(path.join(tmpSourceDir, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpSourceDir, "src", "index.ts"),
      `export default { foo: "bar" };`,
    );
    const { serverPath } = await buildModule(tmpSourceDir, "src/index.ts", "demo-tool-nometa");
    await expect(loadServerBundle(serverPath)).rejects.toThrow(ModuleError);
  });
});
