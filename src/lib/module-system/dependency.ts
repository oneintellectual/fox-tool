import semver from "semver";
import type { ModuleDependency, ModuleManifest } from "./types";
import { ModuleError } from "./types";

/** 依赖缺失项 */
export interface MissingDependency {
  moduleId: string;
  dependency: ModuleDependency;
}

/** 依赖冲突项 */
export interface DependencyConflict {
  moduleId: string;
  dependencyName: string;
  requiredRange: string;
  installedVersion: string;
}

/** 依赖解析结果 */
export interface DependencyResolution {
  satisfied: boolean;
  missing: MissingDependency[];
  conflicts: DependencyConflict[];
  /** 拓扑激活顺序（被依赖者在前） */
  activationOrder: string[];
}

/**
 * 校验单个模块的依赖是否被已安装模块满足。
 * @param manifest 待校验模块清单
 * @param installedVersions 已安装模块 id -> version 映射
 */
export function checkDependencies(
  manifest: ModuleManifest,
  installedVersions: Map<string, string>,
): { missing: MissingDependency[]; conflicts: DependencyConflict[] } {
  const missing: MissingDependency[] = [];
  const conflicts: DependencyConflict[] = [];

  for (const dep of manifest.dependencies ?? []) {
    const installed = installedVersions.get(dep.name);
    if (!installed) {
      if (!dep.optional) {
        missing.push({ moduleId: manifest.id, dependency: dep });
      }
      continue;
    }
    if (!semver.satisfies(installed, dep.version)) {
      conflicts.push({
        moduleId: manifest.id,
        dependencyName: dep.name,
        requiredRange: dep.version,
        installedVersion: installed,
      });
    }
  }
  return { missing, conflicts };
}

/**
 * 解析一批模块的依赖关系，计算缺失、冲突与拓扑激活顺序。
 */
export function resolveDependencies(
  manifests: ModuleManifest[],
  extraInstalled: Map<string, string> = new Map(),
): DependencyResolution {
  const installed = new Map(extraInstalled);
  for (const m of manifests) installed.set(m.id, m.version);

  const allMissing: MissingDependency[] = [];
  const allConflicts: DependencyConflict[] = [];

  for (const m of manifests) {
    const { missing, conflicts } = checkDependencies(m, installed);
    allMissing.push(...missing);
    allConflicts.push(...conflicts);
  }

  const activationOrder = topologicalSort(manifests);

  return {
    satisfied: allMissing.length === 0 && allConflicts.length === 0,
    missing: allMissing,
    conflicts: allConflicts,
    activationOrder,
  };
}

/**
 * 拓扑排序：被依赖的模块排在依赖者之前。
 * 检测循环依赖并抛出 DEPENDENCY_CONFLICT。
 */
export function topologicalSort(manifests: ModuleManifest[]): string[] {
  const idToManifest = new Map(manifests.map((m) => [m.id, m]));
  const visited = new Map<string, "visiting" | "done">();
  const result: string[] = [];

  const visit = (id: string, path: string[]): void => {
    const state = visited.get(id);
    if (state === "done") return;
    if (state === "visiting") {
      throw new ModuleError(
        `检测到循环依赖: ${[...path, id].join(" -> ")}`,
        "DEPENDENCY_CONFLICT",
      );
    }
    const m = idToManifest.get(id);
    if (!m) return; // 外部已安装依赖，跳过
    visited.set(id, "visiting");
    for (const dep of m.dependencies ?? []) {
      if (idToManifest.has(dep.name)) {
        visit(dep.name, [...path, id]);
      }
    }
    visited.set(id, "done");
    result.push(id);
  };

  for (const m of manifests) visit(m.id, []);
  return result;
}

/**
 * 找出两个模块集合之间的版本冲突（用于安装新模块前预检）。
 */
export function findConflicts(
  candidate: ModuleManifest,
  installed: ModuleManifest[],
): DependencyConflict[] {
  const installedMap = new Map(installed.map((m) => [m.id, m.version]));
  const { conflicts } = checkDependencies(candidate, installedMap);
  return conflicts;
}

/**
 * 验证候选模块与已安装集合是否兼容，不兼容则抛出异常。
 * 同时检查已安装模块是否依赖候选模块的旧版本（更新场景）。
 */
export function assertCompatible(
  candidate: ModuleManifest,
  installed: ModuleManifest[],
): void {
  const installedMap = new Map(installed.map((m) => [m.id, m.version]));
  // 候选依赖的已安装模块
  for (const dep of candidate.dependencies ?? []) {
    const v = installedMap.get(dep.name);
    if (v && !semver.satisfies(v, dep.version)) {
      throw new ModuleError(
        `模块 ${candidate.id} 依赖 ${dep.name}@${dep.version}，已安装 ${v}`,
        "DEPENDENCY_CONFLICT",
        { dependencyName: dep.name, requiredRange: dep.version, installedVersion: v },
      );
    }
  }
  // 已安装模块依赖候选的旧版本（更新到不兼容的新版本）
  for (const m of installed) {
    if (m.id === candidate.id) continue;
    for (const dep of m.dependencies ?? []) {
      if (dep.name === candidate.id && !semver.satisfies(candidate.version, dep.version)) {
        throw new ModuleError(
          `已安装模块 ${m.id} 依赖 ${candidate.id}@${dep.version}，候选版本 ${candidate.version} 不兼容`,
          "DEPENDENCY_CONFLICT",
          { dependencyName: candidate.id, requiredRange: dep.version, installedVersion: candidate.version },
        );
      }
    }
  }
}
