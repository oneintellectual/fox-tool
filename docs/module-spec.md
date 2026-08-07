# Fox Tool 外部模块开发规范

本规范定义 Fox Tool 外部模块（External Module）的接口、打包、加载与安全要求。所有通过 Git 引入到 Fox Tool 的外部模块必须遵循本规范。

## 1. 设计目标

- **解耦**：模块独立开发、独立版本管理，通过 Git 仓库分发
- **安全**：声明式权限控制 + 静态代码扫描，防止恶意模块破坏宿主
- **隔离**：模块数据目录独立，模块间通信受依赖声明约束
- **微前端**：模块独立构建为 ESM bundle，按需动态加载渲染工具页面
- **可演进**：基于语义化版本（semver）的兼容性验证

## 2. 模块元数据规范（module.json）

每个模块根目录必须提供 `module.json` 清单文件，作为模块的唯一标识与契约。

### 2.1 字段定义

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 模块唯一标识，正则 `^[a-z][a-z0-9-]{1,62}$`（小写字母开头，仅小写字母/数字/连字符，长度 2-63） |
| `name` | string | 是 | 显示名称 |
| `version` | string | 是 | 语义化版本号，必须通过 `semver.valid()` 校验 |
| `description` | string | 是 | 简短描述 |
| `entry` | string | 是 | 入口文件相对路径，默认 `src/index.tsx` |
| `author` | string | 否 | 作者 |
| `icon` | string | 否 | emoji 图标，默认 🧩 |
| `tags` | string[] | 否 | 标签数组 |
| `dependencies` | `ModuleDependency[]` | 否 | 依赖的其他模块声明 |
| `permissions` | `ModulePermissions` | 否 | 权限声明 |
| `frameworkVersion` | string | 否 | 兼容的框架版本范围（semver range），例如 `^0.1.0` |
| `homepage` | string | 否 | 主页地址 |
| `license` | string | 否 | 开源协议，默认 MIT |

### 2.2 ModuleDependency

```ts
interface ModuleDependency {
  name: string;        // 被依赖模块的 id
  version: string;     // 版本范围（semver range），例如 "^1.0.0"
  optional?: boolean;  // 是否可选，默认 false
}
```

### 2.3 ModulePermissions

```ts
interface ModulePermissions {
  network?: boolean;     // 允许发起网络请求（fetch / XMLHttpRequest / WebSocket / http(s) 模块）
  filesystem?: boolean;  // 允许访问文件系统（fs 模块）
  subprocess?: boolean;  // 允许派生子进程（child_process）
  env?: boolean;         // 允许读取环境变量（process.env）
  database?: boolean;    // 允许访问数据库（better-sqlite3 / mysql / pg）
}
```

**核心原则**：模块只能使用声明了权限的能力。未声明权限但使用了对应能力，会被安全扫描标记为高危违规并阻止安装。

### 2.4 清单示例

```json
{
  "id": "json-formatter",
  "name": "JSON 格式化",
  "version": "1.2.0",
  "description": "JSON 数据格式化、压缩、校验与转换",
  "author": "Fox Tool",
  "icon": "{ }",
  "tags": ["JSON", "格式化"],
  "entry": "src/index.tsx",
  "dependencies": [
    { "name": "shared-utils", "version": "^1.0.0" }
  ],
  "permissions": {
    "network": true
  },
  "frameworkVersion": "^0.1.0",
  "license": "MIT"
}
```

## 3. 生命周期钩子

模块入口必须 default 导出一个对象，其中 `lifecycle` 字段实现以下钩子（全部可选）：

```ts
interface ModuleLifecycleHooks {
  install?(ctx: ModuleContext): Promise<void> | void;
  activate?(ctx: ModuleContext): Promise<void> | void;
  deactivate?(ctx: ModuleContext): Promise<void> | void;
  uninstall?(ctx: ModuleContext): Promise<void> | void;
  update?(fromVersion: string, ctx: ModuleContext): Promise<void> | void;
}
```

### 3.1 ModuleContext

```ts
interface ModuleContext {
  moduleId: string;
  version: string;
  logger: Logger;          // 结构化日志
  dataDir: string;         // 模块私有数据目录（可读写）
  framework: FrameworkApi; // 宿主框架 API
}

interface FrameworkApi {
  getConfig(key: string): unknown;
  setConfig(key: string, value: unknown): void;
  call(moduleId: string, fn: string, ...args: unknown[]): Promise<unknown>;
}
```

### 3.2 钩子触发时机

| 钩子 | 触发时机 | 典型用途 |
|------|----------|----------|
| `install` | 首次安装、构建完成、依赖校验通过后 | 初始化配置、写默认数据 |
| `activate` | 安装后自动激活 / 用户手动激活 | 注册定时任务、预热缓存 |
| `deactivate` | 用户手动停用 / 宿主关闭前 | 清理运行时资源、停止任务 |
| `uninstall` | 用户卸载前 | 清理持久化数据 |
| `update` | 检测到新版本并更新后 | 数据迁移、配置升级 |

### 3.3 钩子执行约束

- 钩子可为同步或异步（返回 Promise），框架会 `await`
- 钩子抛出异常会被捕获并记录到 `module.error` 字段，不会中断宿主
- `install` / `uninstall` 抛出异常会回滚安装状态为 `error`
- 钩子中禁止调用 `process.exit()`（安全扫描会拦截）

## 4. 核心功能实现要求

### 4.1 入口导出结构

```ts
// src/index.tsx
export default {
  metadata: ModuleManifest,         // 必填，必须与 module.json 一致（框架交叉校验）
  lifecycle?: ModuleLifecycleHooks, // 生命周期钩子
  tool?: ModuleToolPage,            // 工具页面渲染（客户端 bundle）
  api?: Record<string, Function>,   // 对其他模块暴露的 API（受依赖声明约束）
}
```

### 4.2 ModuleToolPage（工具页面）

模块若提供工具页面，必须实现 `tool.mount`：

```ts
interface ModuleToolPage {
  mount(container: HTMLElement, props: ToolPageProps): UnmountFn;
}

interface ToolPageProps {
  moduleId: string;
  version: string;
  framework: ClientFrameworkApi;
}

type UnmountFn = () => void;
```

- `mount` 在浏览器侧被调用，需在 `container` 内渲染 UI
- 返回的 `UnmountFn` 在路由切换/模块停用时被调用，用于清理（如 `root.unmount()`）
- **强烈建议**使用 React，通过 `createRoot(container).render(...)` 渲染

### 4.3 ClientFrameworkApi

```ts
interface ClientFrameworkApi {
  toast(message: string, type?: "info" | "success" | "error"): void;
  navigate(href: string): void;
  request(path: string, init?: RequestInit): Promise<Response>;
  getConfig(key: string): unknown;
  setConfig(key: string, value: unknown): void;
}
```

- `getConfig` / `setConfig` 基于浏览器 localStorage 持久化（按模块 id 命名空间隔离）
- `request` 是宿主 `fetch` 的代理，可用于访问宿主 API

### 4.4 模块间 API 调用

模块可在 `api` 字段暴露函数供其他模块调用：

```ts
export default {
  metadata: { id: "shared-utils", ... },
  api: {
    formatJson: (input: string) => JSON.stringify(JSON.parse(input), null, 2),
  },
};
```

调用方需在自身 `module.json` 的 `dependencies` 中声明对目标模块的依赖：

```json
{
  "dependencies": [{ "name": "shared-utils", "version": "^1.0.0" }]
}
```

调用方式（在服务端生命周期钩子内）：

```ts
async activate(ctx) {
  const result = await ctx.framework.call("shared-utils", "formatJson", '{"a":1}');
}
```

**安全约束**：未声明依赖时调用 `framework.call` 会抛出 `DEPENDENCY_MISSING` 错误。

## 5. 模块打包与发布规范

### 5.1 文件结构

```
my-module/
├── module.json              # 模块清单（必须）
├── package.json             # npm 元信息（可选，用于本地开发）
├── tsconfig.json            # TypeScript 配置（可选）
├── src/
│   ├── index.tsx            # 入口文件（必须，路径与 module.json.entry 一致）
│   ├── types.ts             # SDK 类型定义（可选，可从脚手架复制）
│   └── ...其他源文件
├── .gitignore
└── README.md
```

### 5.2 构建产物

框架在安装时自动调用 [esbuild](https://esbuild.github.io/) 构建两份 bundle：

| bundle | 平台 | 用途 | 外部依赖 |
|--------|------|------|----------|
| `dist/server.js` | node | 服务端加载 metadata、执行生命周期钩子 | react / react-dom / react-dom/client（复用宿主实例） |
| `dist/client.js` | browser | 浏览器侧动态 import 渲染工具页面 | 无（自包含，含 react） |

**双 bundle 策略**解决的核心问题：
- 服务端复用宿主 React 实例，避免 Hooks 报错
- 客户端自包含，实现真正的微前端隔离

### 5.3 依赖管理

- **peerDependencies 不支持**：模块不能依赖宿主 npm 包，必须把所需依赖打包进 client bundle（esbuild `bundle: true`）
- **模块间依赖**：通过 `module.json.dependencies` 声明，框架按拓扑顺序激活
- **禁止循环依赖**：检测到循环依赖会抛出 `DEPENDENCY_CONFLICT` 并阻止安装

### 5.4 版本控制策略

- 遵循 [语义化版本](https://semver.org/lang/zh-CN/)（SemVer）：`MAJOR.MINOR.PATCH`
- `module.json.version` 必须是合法 semver
- `frameworkVersion` 使用 semver range（如 `^0.1.0`、`>=1.0.0 <2.0.0`）
- 更新模块时，框架会校验新版本与已安装模块的兼容性（其他模块是否依赖旧版本范围）

### 5.5 发布流程

1. 本地开发：`pnpm dev`（用脚手架生成的脚本）
2. 提交 Git 仓库（公开或私有）
3. 在 Fox Tool 模块管理页填入仓库地址安装
4. 更新版本：修改 `module.json.version` → 提交 → 在 Fox Tool 点击「更新」

## 6. 模块加载机制

### 6.1 安装流程

```
用户输入 Git URL + ref
        │
        ▼
[1] peekManifestFromRemote  ── 拉取 module.json 预览
        │
        ▼
[2] 已安装检查                ── 同 id 已安装则拒绝（使用更新接口）
        │
        ▼
[3] 依赖兼容性预检            ── assertCompatible(candidate, installed)
        │
        ▼
[4] cloneRepo                ── 克隆到 <base>/<moduleId>/source
        │
        ▼
[5] loadManifest             ── 解析并校验清单
        │
        ▼
[6] 元数据一致性校验          ── module.json 与入口导出的 metadata 交叉校验
        │
        ▼
[7] 安全扫描                  ── scanSource + 权限校验 + 框架版本校验
        │
        ▼
[8] buildModule              ── esbuild 构建双 bundle
        │
        ▼
[9] loadServerBundle         ── 动态 import 服务端 bundle
        │
        ▼
[10] 依赖完整性检查           ── resolveDependencies 全量校验
        │
        ▼
[11] 持久化到 DB              ── insertModule
        │
        ▼
[12] runLifecycleHook(install)
        │
        ▼
[13] activateModule（可选）   ── 执行 activate 钩子 + 注册到内存表
```

### 6.2 模块验证与解析

- **清单校验**：`validateManifest` 检查字段类型、id 正则、version 合法性
- **元数据一致性**：`module.json` 与入口 `export default { metadata }` 必须完全一致（id/name/version/description），防止运行时篡改
- **框架版本兼容性**：`validateFrameworkVersion` 校验 `frameworkVersion` range 是否满足当前宿主版本
- **安全扫描**：`scanSource` 静态扫描源码，检测危险 API 使用是否声明了对应权限

### 6.3 依赖冲突处理

安装/更新前执行 `assertCompatible(candidate, installed)`，两类冲突会被检测：

1. **候选模块依赖的已安装模块版本不满足**：如候选依赖 `b@^2.0.0`，已安装 `b@1.5.0`
2. **已安装模块依赖候选的旧版本**：如 `a` 依赖 `b@^1.0.0`，候选 `b` 升级到 `2.0.0`

冲突时抛出 `DEPENDENCY_CONFLICT` 错误，HTTP 状态 422，携带冲突详情：

```json
{
  "error": "模块 a 依赖 b@^1.0.0，候选版本 2.0.0 不兼容",
  "code": "DEPENDENCY_CONFLICT"
}
```

循环依赖在拓扑排序阶段检测，同样抛出 `DEPENDENCY_CONFLICT`。

## 7. 安全策略

### 7.1 权限控制

模块通过 `module.json.permissions` 声明所需权限。框架在加载时进行：

- **静态扫描**：扫描所有 `.ts/.tsx/.js/.jsx` 源文件，匹配危险 API 模式
- **权限降级**：使用了某能力且声明了对应权限 → 降级为 `low` 提示，允许安装
- **高危拦截**：使用了某能力但未声明权限 → 标记 `high`，阻止安装

### 7.2 危险 API 规则

| 规则 | 模式 | 默认级别 | 所需权限 |
|------|------|----------|----------|
| `child_process` | `require('child_process')` / `import ... from 'child_process'` | high | `subprocess` |
| `eval` | `eval(...)` | high | （不可降级，永远拦截） |
| `function-constructor` | `new Function(...)` | high | （不可降级） |
| `vm-module` | `require('node:vm')` | high | （不可降级） |
| `fs-module` | `require('fs')` | medium | `filesystem` |
| `network-fetch` | `fetch(` / `XMLHttpRequest` / `WebSocket` / `require('http')` | medium | `network` |
| `process-env` | `process.env` | medium | `env` |
| `database` | `better-sqlite3` / `require('mysql')` / `require('pg')` | medium | `database` |
| `process-exit` | `process.exit(...)` | medium | （不可降级） |
| `host-path` | `/etc/passwd` / `/root/.ssh` / `../../../` | high | （不可降级） |
| `obfuscated-long-string` | 200+ 字符的 base64 字符串 | low | （提示） |

### 7.3 版本兼容性验证

- **框架版本**：`frameworkVersion` 不满足当前宿主版本时，标记 `high` 阻止安装
- **模块间版本**：`assertCompatible` 防止安装不兼容的依赖版本
- **更新场景**：更新模块时检查其他已安装模块是否依赖其旧版本

### 7.4 数据隔离

- 每个模块有独立的 `dataDir`：`<base>/<moduleId>/data/`
- 模块配置通过 `framework.getConfig/setConfig` 按模块 id 命名空间隔离
- 客户端配置基于 `localStorage`，key 前缀 `fox:module:<moduleId>:cfg:`
- 卸载模块时递归删除其 `source` / `data` / `dist` 目录

## 8. 脚手架工具

提供 CLI 快速生成符合规范的模块项目：

```bash
pnpm scaffold \
  --id my-module \
  --name "我的模块" \
  --desc "模块描述" \
  --out ./my-module \
  --author "作者" \
  --icon 🚀 \
  --version 1.0.0
```

生成的项目包含：`module.json` / `package.json` / `tsconfig.json` / `src/index.tsx`（含 React 示例组件 + 生命周期钩子）/ `src/types.ts`（SDK 类型）/ `README.md` / `.gitignore`。

## 9. 测试要求

模块开发者应自测：

1. **本地构建**：`pnpm build` 与 `pnpm build:server` 成功
2. **清单校验**：`module.json` 字段完整、id 合法、version 合法
3. **安全合规**：如使用网络/文件系统，已在 `permissions` 中声明
4. **生命周期**：install/activate/deactivate/uninstall 钩子无异常

框架自身测试覆盖（见 `src/lib/module-system/*.test.ts`）：

- `security.test.ts`：扫描规则、清单校验、框架版本校验、元数据一致性（18 用例）
- `dependency.test.ts`：依赖检查、拓扑排序、循环依赖检测、冲突查找（15 用例）
- `scaffold.test.ts`：脚手架生成、选项校验、文件结构（7 用例）
- `loader.test.ts`：清单解析、构建、bundle 加载（8 用例）
- `registry.test.ts`：注册表、跨模块 API 调用权限（7 用例）

## 10. 错误码

| code | 含义 | HTTP 状态 |
|------|------|-----------|
| `MANIFEST_INVALID` | 清单字段非法 | 422 |
| `METADATA_MISMATCH` | 清单与入口 metadata 不一致 | 422 |
| `DEPENDENCY_MISSING` | 依赖未安装或未声明 | 422 |
| `DEPENDENCY_CONFLICT` | 依赖版本冲突或循环依赖 | 422 |
| `VERSION_INCOMPATIBLE` | 框架版本不兼容 | 422 |
| `SECURITY_VIOLATION` | 安全扫描高危违规 | 403 |
| `BUILD_FAILED` | esbuild 构建失败 | 500 |
| `LOAD_FAILED` | bundle 加载或导出缺失 | 500 |
| `ALREADY_INSTALLED` | 模块已安装 | 409 |
| `NOT_FOUND` | 模块不存在 | 404 |
