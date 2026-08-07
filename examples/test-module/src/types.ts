/** Fox Tool 模块 SDK 类型定义（示例模块自带精简版） */

export interface ModulePermissions {
  network?: boolean;
  filesystem?: boolean;
  subprocess?: boolean;
  env?: boolean;
  database?: boolean;
}

export interface ModuleDependency {
  name: string;
  version: string;
  optional?: boolean;
}

export interface ModuleManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author?: string;
  icon?: string;
  tags?: string[];
  entry?: string;
  dependencies?: ModuleDependency[];
  permissions?: ModulePermissions;
  frameworkVersion?: string;
  license?: string;
}

export interface Logger {
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
}

export interface FrameworkApi {
  getConfig(key: string): unknown;
  setConfig(key: string, value: unknown): void;
  call(moduleId: string, fn: string, ...args: unknown[]): Promise<unknown>;
}

export interface ModuleContext {
  moduleId: string;
  version: string;
  logger: Logger;
  dataDir: string;
  framework: FrameworkApi;
}

export interface ModuleLifecycleHooks {
  install?(ctx: ModuleContext): Promise<void> | void;
  activate?(ctx: ModuleContext): Promise<void> | void;
  deactivate?(ctx: ModuleContext): Promise<void> | void;
  uninstall?(ctx: ModuleContext): Promise<void> | void;
  update?(fromVersion: string, ctx: ModuleContext): Promise<void> | void;
}

export interface ClientFrameworkApi {
  toast(message: string, type?: "info" | "success" | "error"): void;
  navigate(href: string): void;
  request(path: string, init?: RequestInit): Promise<Response>;
  getConfig(key: string): unknown;
  setConfig(key: string, value: unknown): void;
}

export interface ToolPageProps {
  moduleId: string;
  version: string;
  framework: ClientFrameworkApi;
}

export type UnmountFn = () => void;

export interface ModuleToolPage {
  mount(container: HTMLElement, props: ToolPageProps): UnmountFn;
}

export interface ModuleExport {
  metadata: ModuleManifest;
  lifecycle?: ModuleLifecycleHooks;
  tool?: ModuleToolPage;
  api?: Record<string, (...args: unknown[]) => unknown>;
}
