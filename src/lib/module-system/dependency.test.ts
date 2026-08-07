import { describe, it, expect } from "vitest";
import {
  checkDependencies,
  resolveDependencies,
  topologicalSort,
  findConflicts,
  assertCompatible,
} from "./dependency";
import { ModuleError } from "./types";
import type { ModuleManifest } from "./types";

const m = (id: string, version: string, deps: { name: string; version: string }[] = []): ModuleManifest => ({
  id,
  name: id,
  version,
  description: "test",
  dependencies: deps.map((d) => ({ name: d.name, version: d.version })),
});

describe("dependency / checkDependencies", () => {
  it("无依赖通过", () => {
    const r = checkDependencies(m("a", "1.0.0"), new Map());
    expect(r.missing).toHaveLength(0);
    expect(r.conflicts).toHaveLength(0);
  });

  it("缺失必填依赖", () => {
    const r = checkDependencies(
      m("a", "1.0.0", [{ name: "b", version: "^1.0.0" }]),
      new Map(),
    );
    expect(r.missing).toHaveLength(1);
    expect(r.missing[0].dependency.name).toBe("b");
  });

  it("可选依赖缺失不算 missing", () => {
    const r = checkDependencies(
      {
        ...m("a", "1.0.0"),
        dependencies: [{ name: "b", version: "^1.0.0", optional: true }],
      },
      new Map(),
    );
    expect(r.missing).toHaveLength(0);
  });

  it("版本范围不满足产生冲突", () => {
    const r = checkDependencies(
      m("a", "1.0.0", [{ name: "b", version: "^2.0.0" }]),
      new Map([["b", "1.5.0"]]),
    );
    expect(r.conflicts).toHaveLength(1);
    expect(r.conflicts[0].dependencyName).toBe("b");
    expect(r.conflicts[0].installedVersion).toBe("1.5.0");
  });

  it("版本范围满足无冲突", () => {
    const r = checkDependencies(
      m("a", "1.0.0", [{ name: "b", version: "^1.0.0" }]),
      new Map([["b", "1.2.3"]]),
    );
    expect(r.conflicts).toHaveLength(0);
  });
});

describe("dependency / topologicalSort", () => {
  it("简单链式依赖", () => {
    const manifests = [
      m("a", "1.0.0", [{ name: "b", version: "^1.0.0" }]),
      m("b", "1.0.0"),
    ];
    const order = topologicalSort(manifests);
    expect(order.indexOf("b")).toBeLessThan(order.indexOf("a"));
  });

  it("菱形依赖", () => {
    // a -> b, a -> c, b -> d, c -> d
    const manifests = [
      m("a", "1.0.0", [{ name: "b", version: "1.0.0" }, { name: "c", version: "1.0.0" }]),
      m("b", "1.0.0", [{ name: "d", version: "1.0.0" }]),
      m("c", "1.0.0", [{ name: "d", version: "1.0.0" }]),
      m("d", "1.0.0"),
    ];
    const order = topologicalSort(manifests);
    expect(order.indexOf("d")).toBeLessThan(order.indexOf("b"));
    expect(order.indexOf("d")).toBeLessThan(order.indexOf("c"));
    expect(order.indexOf("b")).toBeLessThan(order.indexOf("a"));
    expect(order.indexOf("c")).toBeLessThan(order.indexOf("a"));
  });

  it("循环依赖抛出 DEPENDENCY_CONFLICT", () => {
    const manifests = [
      m("a", "1.0.0", [{ name: "b", version: "1.0.0" }]),
      m("b", "1.0.0", [{ name: "a", version: "1.0.0" }]),
    ];
    expect(() => topologicalSort(manifests)).toThrow(ModuleError);
    expect(() => topologicalSort(manifests)).toThrow(/循环依赖/);
  });
});

describe("dependency / resolveDependencies", () => {
  it("计算完整解析结果", () => {
    const manifests = [
      m("a", "1.0.0", [{ name: "b", version: "^1.0.0" }]),
      m("b", "1.0.0"),
    ];
    const r = resolveDependencies(manifests);
    expect(r.satisfied).toBe(true);
    expect(r.activationOrder).toEqual(["b", "a"]);
  });

  it("缺失依赖标记为不满足", () => {
    const r = resolveDependencies([
      m("a", "1.0.0", [{ name: "b", version: "^1.0.0" }]),
    ]);
    expect(r.satisfied).toBe(false);
    expect(r.missing).toHaveLength(1);
  });
});

describe("dependency / findConflicts", () => {
  it("找出候选模块与已安装集合的冲突", () => {
    const candidate = m("a", "1.0.0", [{ name: "b", version: "^2.0.0" }]);
    const installed = [m("b", "1.5.0")];
    const conflicts = findConflicts(candidate, installed);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].dependencyName).toBe("b");
  });

  it("无冲突时返回空数组", () => {
    const candidate = m("a", "1.0.0", [{ name: "b", version: "^1.0.0" }]);
    const installed = [m("b", "1.2.0")];
    expect(findConflicts(candidate, installed)).toHaveLength(0);
  });
});

describe("dependency / assertCompatible", () => {
  it("兼容时不抛出", () => {
    const candidate = m("a", "1.0.0", [{ name: "b", version: "^1.0.0" }]);
    const installed = [m("b", "1.2.0")];
    expect(() => assertCompatible(candidate, installed)).not.toThrow();
  });

  it("候选依赖不满足已安装版本时抛出", () => {
    const candidate = m("a", "1.0.0", [{ name: "b", version: "^2.0.0" }]);
    const installed = [m("b", "1.5.0")];
    expect(() => assertCompatible(candidate, installed)).toThrow(ModuleError);
    expect(() => assertCompatible(candidate, installed)).toThrow(/DEPENDENCY_CONFLICT|依赖/);
  });

  it("更新场景：已安装模块依赖候选旧版本，候选新版本不兼容时抛出", () => {
    // 候选 b 升级到 2.0.0，已安装的 a 依赖 b@^1.0.0
    const candidate = m("b", "2.0.0");
    const installed = [m("a", "1.0.0", [{ name: "b", version: "^1.0.0" }])];
    expect(() => assertCompatible(candidate, installed)).toThrow(ModuleError);
  });
});
