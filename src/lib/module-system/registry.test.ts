import { describe, it, expect, beforeEach } from "vitest";
import {
  registerActive,
  unregister,
  getActive,
  isActive,
  listActiveIds,
  callModuleApi,
} from "./registry";
import { ModuleError } from "./types";
import type { ModuleExport, ModuleManifest } from "./types";

const manifest = (id: string): ModuleManifest => ({
  id,
  name: id,
  version: "1.0.0",
  description: "test",
});

const mod = (id: string, extra?: Partial<ModuleExport>): ModuleExport => ({
  metadata: manifest(id),
  ...extra,
});

beforeEach(() => {
  // 清空注册表
  for (const id of listActiveIds()) unregister(id);
});

describe("registry / 基本注册", () => {
  it("register/get/isActive/list", () => {
    registerActive("a", mod("a"));
    expect(isActive("a")).toBe(true);
    expect(isActive("b")).toBe(false);
    expect(getActive("a")?.metadata.id).toBe("a");
    expect(listActiveIds()).toEqual(["a"]);
  });

  it("unregister 移除", () => {
    registerActive("a", mod("a"));
    unregister("a");
    expect(isActive("a")).toBe(false);
    expect(getActive("a")).toBeUndefined();
  });
});

describe("registry / callModuleApi", () => {
  it("调用自身 API 允许", async () => {
    registerActive(
      "a",
      mod("a", { api: { greet: (n: unknown) => `hi ${n}` } }),
    );
    const r = await callModuleApi("a", [], "a", "greet", "fox");
    expect(r).toBe("hi fox");
  });

  it("声明依赖后调用其他模块 API 允许", async () => {
    registerActive("a", mod("a"));
    registerActive(
      "b",
      mod("b", { api: { compute: (x: unknown) => (x as number) * 2 } }),
    );
    const r = await callModuleApi("a", ["b"], "b", "compute", 21);
    expect(r).toBe(42);
  });

  it("未声明依赖调用其他模块抛出 DEPENDENCY_MISSING", async () => {
    registerActive("a", mod("a"));
    registerActive("b", mod("b", { api: { x: () => 1 } }));
    await expect(callModuleApi("a", [], "b", "x")).rejects.toThrow(ModuleError);
    await expect(callModuleApi("a", [], "b", "x")).rejects.toThrow(/未声明对 b 的依赖/);
  });

  it("目标模块未激活抛出 NOT_FOUND", async () => {
    await expect(callModuleApi("a", ["b"], "b", "x")).rejects.toThrow(ModuleError);
    await expect(callModuleApi("a", ["b"], "b", "x")).rejects.toThrow(/未激活/);
  });

  it("目标模块未暴露该 API 抛出 NOT_FOUND", async () => {
    registerActive("b", mod("b", { api: { other: () => 1 } }));
    await expect(callModuleApi("a", ["b"], "b", "missing")).rejects.toThrow(ModuleError);
    await expect(callModuleApi("a", ["b"], "b", "missing")).rejects.toThrow(/未暴露 API/);
  });
});
