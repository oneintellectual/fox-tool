/**
 * Fox Tool 外部模块系统 - 公共 API 入口
 */
export * from "./types";
export * from "./paths";
export { getModuleDb, listModules, findModuleByModuleId } from "./db";
export {
  cloneRepo,
  listRemoteRefs,
  currentHead,
  type RemoteRef,
  type CloneOptions,
} from "./git";
export {
  scanSource,
  collectSourceFiles,
  validateManifest,
  validateFrameworkVersion,
  validateMetadataConsistency,
  type SecurityReport,
  type SecurityIssue,
  type SourceFile,
} from "./security";
export {
  checkDependencies,
  resolveDependencies,
  topologicalSort,
  findConflicts,
  assertCompatible,
  type DependencyResolution,
  type MissingDependency,
  type DependencyConflict,
} from "./dependency";
export {
  loadManifest,
  buildModule,
  loadServerBundle,
  installModule,
  scanModule,
  getCachedModule,
  getDependencyConflicts,
} from "./loader";
export {
  activateModule,
  deactivateModule,
  uninstallModule,
  updateModuleById,
  restoreActiveModules,
  runLifecycleHook,
} from "./lifecycle";
export {
  registerActive,
  unregister,
  getActive,
  isActive,
  listActiveIds,
  callModuleApi,
} from "./registry";
export { generateScaffold, validateScaffoldOptions, type ScaffoldOptions, type ScaffoldResult } from "./scaffold";
export { HOST_VERSION, HOST_FRAMEWORK_ID } from "./host";
