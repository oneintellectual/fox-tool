import { describe, it, expect } from "vitest";
import {
  scanSource,
  validateManifest,
  validateFrameworkVersion,
  validateMetadataConsistency,
} from "./security";
import { ModuleError } from "./types";
import type { ModuleManifest } from "./types";

const baseManifest = (overrides: Partial<ModuleManifest> = {}): ModuleManifest => ({
  id: "test-module",
  name: "测试模块",
  version: "1.0.0",
  description: "测试",
  ...overrides,
});

describe("security / scanSource", () => {
  it("干净的代码通过扫描", () => {
    const r = scanSource([{ path: "a.ts", content: "export const x = 1;" }], {});
    expect(r.passed).toBe(true);
    expect(r.issues).toHaveLength(0);
  });

  it("检测 eval 为高危", () => {
    const r = scanSource([{ path: "a.ts", content: "eval('1+1')" }], {});
    expect(r.passed).toBe(false);
    expect(r.issues[0].severity).toBe("high");
    expect(r.issues[0].rule).toBe("eval");
  });

  it("检测 child_process 为高危", () => {
    const r = scanSource([{ path: "a.ts", content: "require('child_process')" }], {});
    expect(r.passed).toBe(false);
    expect(r.issues.some((i) => i.rule === "child_process")).toBe(true);
  });

  it("声明 subprocess 权限后 child_process 降级为 low", () => {
    const r = scanSource([{ path: "a.ts", content: "require('child_process')" }], {
      subprocess: true,
    });
    expect(r.passed).toBe(true); // high 都降级了
    expect(r.issues[0].severity).toBe("low");
  });

  it("检测 fetch 未声明 network 权限为 medium", () => {
    const r = scanSource([{ path: "a.ts", content: "fetch('/api')" }], {});
    expect(r.passed).toBe(true);
    expect(r.issues.some((i) => i.rule === "network-fetch")).toBe(true);
  });

  it("检测可疑宿主路径访问", () => {
    const r = scanSource([{ path: "a.ts", content: "fs.readFileSync('/etc/passwd')" }], {
      filesystem: true,
    });
    expect(r.passed).toBe(false);
    expect(r.issues.some((i) => i.rule === "host-path")).toBe(true);
  });

  it("多文件累加 issue", () => {
    const r = scanSource(
      [
        { path: "a.ts", content: "eval('x')" },
        { path: "b.ts", content: "process.exit(0)" },
      ],
      {},
    );
    expect(r.issues).toHaveLength(2);
    expect(r.passed).toBe(false);
  });
});

describe("security / validateManifest", () => {
  it("合法清单通过校验", () => {
    expect(() => validateManifest(baseManifest())).not.toThrow();
  });

  it("缺少必填字段抛出", () => {
    expect(() => validateManifest({ id: "x", name: "x" })).toThrow(ModuleError);
  });

  it("id 不合法抛出", () => {
    expect(() => validateManifest(baseManifest({ id: "Bad_ID" }))).toThrow(ModuleError);
  });

  it("version 不合法抛出", () => {
    expect(() => validateManifest(baseManifest({ version: "v1" }))).toThrow(ModuleError);
  });

  it("dependencies 非数组抛出", () => {
    expect(() => validateManifest(baseManifest({ dependencies: "x" as unknown as never }))).toThrow(
      ModuleError,
    );
  });
});

describe("security / validateFrameworkVersion", () => {
  it("兼容版本通过", () => {
    const r = validateFrameworkVersion(
      baseManifest({ frameworkVersion: "^0.1.0" }),
      "0.1.5",
    );
    expect(r.passed).toBe(true);
  });

  it("不兼容版本失败", () => {
    const r = validateFrameworkVersion(
      baseManifest({ frameworkVersion: "^1.0.0" }),
      "0.1.5",
    );
    expect(r.passed).toBe(false);
    expect(r.issues[0].severity).toBe("high");
  });

  it("未声明 frameworkVersion 默认通过", () => {
    const r = validateFrameworkVersion(baseManifest(), "0.1.0");
    expect(r.passed).toBe(true);
  });
});

describe("security / validateMetadataConsistency", () => {
  it("元数据一致通过", () => {
    const m = baseManifest();
    expect(() => validateMetadataConsistency(m, { ...m })).not.toThrow();
  });

  it("id 不一致抛出", () => {
    expect(() =>
      validateMetadataConsistency(baseManifest({ id: "a" }), baseManifest({ id: "b" })),
    ).toThrow(ModuleError);
  });

  it("version 不一致抛出", () => {
    expect(() =>
      validateMetadataConsistency(
        baseManifest({ version: "1.0.0" }),
        baseManifest({ version: "1.0.1" }),
      ),
    ).toThrow(ModuleError);
  });
});
