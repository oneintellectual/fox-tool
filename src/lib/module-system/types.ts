/**
 * Fox Tool 外部模块系统 - 核心类型定义
 *
 * 模块形态：工具页面插件。模块以 Git 仓库形式分发，仓库内包含 module.json
 * 清单与源码；框架拉取后用 esbuild 构建为自包含 ESM bundle，客户端通过
 * mount/unmount（微前端）方式渲染，避免双 React 实例问题。
 */

/** 语义化版本范围字符串，如 "^1.2.0"、"~2.0.0"、">=1.0.0 <2.0.0"、"*" */
export type VersionRange = string;

/** 严格语义化版本号字符串，如 "1.2.3" */
export type SemverString = string;

/** 模块运行状态 */
export type ModuleStatus =
  | "installed" // 已安装但未激活
  | "active" // 已激活，工具页面可访问
  | "inactive" // 已停用
  | "error"; // 加载/激活出错

/** 模块权限声明：模块按需声明，框架在加载时校验并限制 */
export interface ModulePermissions {
  /** 允许发起网络请求 */
  network?: boolean;
  /** 允许访问模块私有目录外的文件系统 */
  filesystem?: boolean;
  /** 允许派生子进程 */
  subprocess?: boolean;
  /** 允许读取环境变量 */
  env?: boolean;
  /** 允许访问宿主数据库（better-sqlite3） */
  database?: boolean;
}

/** 模块间依赖项 */
export interface ModuleDependency {
  /** 依赖的模块 id */
  name: string;
  /** 语义化版本范围 */
  version: VersionRange;
  /** 是否可选（可选依赖缺失时不阻塞安装） */
  optional?: boolean;
}

/**
 * 模块清单 —— module.json 文件结构
 * 模块根目录必须包含 module.json，描述模块元数据、依赖与权限。
 */
export interface ModuleManifest {
  /** 全局唯一 id：小写字母、数字、连字符，如 "json-formatter" */
  id: string;
  /** 显示名称 */
  name: string;
  /** 语义化版本号 */
  version: SemverString;
  /** 模块描述 */
  description: string;
  /** 作者 */
  author?: string;
  /** 图标（emoji 或 URL） */
  icon?: string;
  /** 标签 */
  tags?: string[];
  /** 源码入口（相对模块根目录，默认 "src/index.tsx"） */
  entry?: string;
  /** 依赖的其他外部模块 */
  dependencies?: ModuleDependency[];
  /** 权限声明 */
  permissions?: ModulePermissions;
  /** 框架兼容版本范围，如 "^0.1.0" */
  frameworkVersion?: VersionRange;
  /** 主页 / 仓库地址 */
  homepage?: string;
  /** 许可证 */
  license?: string;
}

/** 模块记录主键（DB 内部使用，与 module_id 区分） */
export interface ModuleRow {
  /** DB 主键 */
  id: string;
  /** 模块 id */
  module_id: string;
  /** 显示名称 */
  name: string;
  /** 当前安装版本 */
  version: string;
  /** Git 仓库地址 */
  git_url: string;
  /** 拉取的 ref（分支/tag/commit），默认 "HEAD" */
  ref: string;
  /** 运行状态 */
  status: ModuleStatus;
  /** 完整清单 JSON */
  manifest: string;
  /** 源码入口（相对 source_dir） */
  entry_path: string;
  /** 克隆源码目录（绝对路径） */
  source_dir: string;
  /** 已构建 bundle 路径（绝对路径） */
  bundle_path: string;
  /** 安装时间（ms） */
  installed_at: number;
  /** 最后更新时间（ms） */
  updated_at: number;
  /** 错误信息（status=error 时） */
  error: string | null;
}

/** 安装请求参数 */
export interface InstallRequest {
  /** Git 仓库地址（HTTPS 或 SSH） */
  gitUrl: string;
  /** 拉取的 ref，默认 "HEAD" */
  ref?: string;
  /** 安装后是否自动激活，默认 true */
  activate?: boolean;
  /** 私有仓库鉴权 token（HTTPS Basic） */
  token?: string;
}

/** 安装结果 */
export interface InstallResult {
  row: ModuleRow;
  activated: boolean;
  warnings: string[];
}

/** 模块日志接口 */
export interface Logger {
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
}

/** 服务端框架 API：暴露给模块生命周期钩子使用 */
export interface FrameworkApi {
  /** 读取模块私有配置 */
  getConfig(key: string): unknown;
  /** 写入模块私有配置（持久化到 DB） */
  setConfig(key: string, value: unknown): void;
  /** 调用其他已激活模块导出的方法（受依赖声明约束） */
  call(moduleId: string, fn: string, ...args: unknown[]): Promise<unknown>;
}

/** 生命周期钩子上下文 */
export interface ModuleContext {
  moduleId: string;
  version: string;
  logger: Logger;
  /** 模块私有数据目录（可自由读写） */
  dataDir: string;
  framework: FrameworkApi;
}

/** 模块生命周期钩子 */
export interface ModuleLifecycleHooks {
  /** 安装时执行一次（可做数据迁移、初始化） */
  install?(ctx: ModuleContext): Promise<void> | void;
  /** 激活时执行（每次激活） */
  activate?(ctx: ModuleContext): Promise<void> | void;
  /** 停用时执行 */
  deactivate?(ctx: ModuleContext): Promise<void> | void;
  /** 卸载时执行（清理数据/资源） */
  uninstall?(ctx: ModuleContext): Promise<void> | void;
  /** 更新时执行，fromVersion 为旧版本号 */
  update?(fromVersion: string, ctx: ModuleContext): Promise<void> | void;
}

/** 客户端框架 API：暴露给模块工具页面使用 */
export interface ClientFrameworkApi {
  /** 弹出 toast 提示 */
  toast(message: string, type?: "info" | "success" | "error"): void;
  /** 框架内导航 */
  navigate(href: string): void;
  /** 调用宿主 API 路由 */
  request(path: string, init?: RequestInit): Promise<Response>;
  /** 读取模块私有配置 */
  getConfig(key: string): unknown;
  /** 写入模块私有配置 */
  setConfig(key: string, value: unknown): void;
}

/** 传递给工具页面 mount 的属性 */
export interface ToolPageProps {
  moduleId: string;
  version: string;
  framework: ClientFrameworkApi;
}

/** mount 函数返回的卸载函数 */
export type UnmountFn = () => void;

/**
 * 模块工具页面（微前端模式）
 * 模块自行用 ReactDOM.createRoot 渲染到 container，返回卸载函数。
 * 这样模块自带 React 实例，避免与宿主 React 冲突（Invalid hook call）。
 */
export interface ModuleToolPage {
  mount(container: HTMLElement, props: ToolPageProps): UnmountFn;
}

/**
 * 模块默认导出结构
 * 模块入口（src/index.tsx）应 `export default { metadata, lifecycle, tool, api }`。
 * metadata 必须与 module.json 一致，框架在加载时交叉校验。
 */
export interface ModuleExport {
  metadata: ModuleManifest;
  lifecycle?: ModuleLifecycleHooks;
  tool?: ModuleToolPage;
  /** 可选的对其他模块暴露的 API（受依赖声明约束） */
  api?: Record<string, (...args: unknown[]) => unknown>;
}

/** 加载错误类型 */
export class ModuleError extends Error {
  constructor(
    message: string,
    public code:
      | "MANIFEST_INVALID"
      | "METADATA_MISMATCH"
      | "SECURITY_VIOLATION"
      | "BUILD_FAILED"
      | "LOAD_FAILED"
      | "DEPENDENCY_MISSING"
      | "DEPENDENCY_CONFLICT"
      | "VERSION_INCOMPATIBLE"
      | "NOT_FOUND"
      | "ALREADY_INSTALLED",
    public details?: unknown,
  ) {
    super(message);
    this.name = "ModuleError";
  }
}
