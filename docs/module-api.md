# Fox Tool 模块系统 API 文档

本文档涵盖两部分：
1. **HTTP API**：供前端 / 外部脚本调用的 REST 接口
2. **模块 SDK 接口**：模块开发者使用的 TypeScript 类型与宿主框架集成方法

基础地址：`http://localhost:3000`（按实际部署调整）

---

## 一、HTTP API

所有接口返回 JSON。错误响应统一格式：

```json
{
  "error": "错误描述",
  "code": "ERROR_CODE"
}
```

### 1. 列出全部已安装模块

```
GET /api/modules
```

**响应**：

```json
{
  "modules": [
    {
      "module_id": "json-formatter",
      "name": "JSON 格式化",
      "version": "1.2.0",
      "status": "active",
      "git_url": "https://github.com/user/json-formatter.git",
      "ref": "main",
      "manifest": "{\"id\":\"json-formatter\",...}",
      "bundle_path": "/path/to/dist/client.js",
      "error": null,
      "installed_at": 1691234567890,
      "updated_at": 1691234567890
    }
  ]
}
```

### 2. 安装模块

```
POST /api/modules
Content-Type: application/json
```

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `gitUrl` | string | 是 | Git 仓库 HTTPS 地址 |
| `ref` | string | 否 | 分支/标签/commit，默认 `HEAD` |
| `activate` | boolean | 否 | 是否安装后自动激活，默认 `true` |
| `token` | string | 否 | 私有仓库访问令牌 |

**请求示例**：

```json
{
  "gitUrl": "https://github.com/user/module.git",
  "ref": "main",
  "activate": true
}
```

**响应**（201）：

```json
{
  "module": { "module_id": "...", "status": "active", ... },
  "activated": true,
  "warnings": ["install 钩子执行失败: ..."]
}
```

**错误码**：`ALREADY_INSTALLED`(409) / `MANIFEST_INVALID`(422) / `SECURITY_VIOLATION`(403) / `DEPENDENCY_CONFLICT`(422) / `VERSION_INCOMPATIBLE`(422) / `BUILD_FAILED`(500)

### 3. 查询模块详情

```
GET /api/modules/:id
```

**响应**：

```json
{
  "module": {
    "module_id": "json-formatter",
    "name": "JSON 格式化",
    ...
  }
}
```

模块不存在返回 404。

### 4. 激活 / 停用模块

```
PATCH /api/modules/:id
Content-Type: application/json
```

**请求体**：

```json
{
  "action": "activate"   // 或 "deactivate"
}
```

**响应**：返回更新后的 module 对象。

### 5. 更新模块

```
POST /api/modules/:id/update
Content-Type: application/json
```

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `ref` | string | 否 | 新的分支/标签/commit，默认使用原 ref |
| `token` | string | 否 | 访问令牌 |

**响应**：返回更新后的 module 对象。

**错误码**：`NOT_FOUND`(404) / `DEPENDENCY_CONFLICT`(422) / `BUILD_FAILED`(500)

### 6. 卸载模块

```
DELETE /api/modules/:id
```

**响应**：

```json
{
  "ok": true,
  "moduleId": "json-formatter"
}
```

### 7. 获取模块客户端 bundle

```
GET /api/modules/:id/bundle
```

返回模块客户端 ESM bundle（`Content-Type: text/javascript`），供浏览器 `import()` 动态加载渲染。

**响应头**：
- `Content-Type: text/javascript; charset=utf-8`
- `Cache-Control: no-cache`
- `ETag: "<module_id>@<version>"`
- `X-Module-Id` / `X-Module-Version`

**状态码**：200（成功）/ 404（模块或 bundle 不存在）/ 409（模块未激活）

**客户端使用示例**：

```js
const mod = await import(`/api/modules/json-formatter/bundle?v=1.2.0`);
const exported = mod.default ?? mod;
const unmount = exported.tool.mount(container, {
  moduleId: "json-formatter",
  version: "1.2.0",
  framework: { toast: alert, ... }
});
// 卸载时
unmount();
```

### 8. 列出远端仓库分支/标签

```
POST /api/modules/refs
Content-Type: application/json
```

**请求体**：

```json
{
  "gitUrl": "https://github.com/user/module.git",
  "token": "ghp_xxx（可选）"
}
```

**响应**：

```json
{
  "refs": [
    { "ref": "refs/heads/main", "short": "main", "oid": "abc123...", "type": "branch" },
    { "ref": "refs/tags/v1.0.0", "short": "v1.0.0", "oid": "def456...", "type": "tag" },
    { "ref": "HEAD", "short": "HEAD", "oid": "abc123...", "type": "head" }
  ]
}
```

### 9. 生成模块脚手架

```
POST /api/modules/scaffold
Content-Type: application/json
```

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | 模块 id |
| `name` | string | 是 | 显示名称 |
| `description` | string | 是 | 描述 |
| `outDir` | string | 否 | 输出目录，默认 `./<id>` |
| `author` | string | 否 | 作者 |
| `icon` | string | 否 | emoji 图标 |
| `version` | string | 否 | 版本，默认 `1.0.0` |

**响应**（201）：

```json
{
  "outDir": "/abs/path/to/my-module",
  "files": ["module.json", "package.json", "tsconfig.json", "src/index.tsx", "src/types.ts", "README.md", ".gitignore"]
}
```

也可通过 CLI 生成：

```bash
pnpm scaffold --id my-module --name "我的模块" --desc "描述" --out ./my-module
```

---

## 二、模块 SDK 接口

模块开发者在 `src/index.tsx` 中 default 导出以下结构。类型定义可从脚手架的 `src/types.ts` 复制（无需额外安装 npm 包）。

### ModuleExport

```ts
interface ModuleExport {
  metadata: ModuleManifest;                  // 必填，与 module.json 一致
  lifecycle?: ModuleLifecycleHooks;          // 生命周期钩子
  tool?: ModuleToolPage;                     // 工具页面渲染
  api?: Record<string, (...args: unknown[]) => unknown>;  // 跨模块 API
}
```

### ModuleManifest

```ts
interface ModuleManifest {
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
  homepage?: string;
  license?: string;
}

interface ModuleDependency {
  name: string;
  version: string;        // semver range
  optional?: boolean;
}

interface ModulePermissions {
  network?: boolean;
  filesystem?: boolean;
  subprocess?: boolean;
  env?: boolean;
  database?: boolean;
}
```

### ModuleLifecycleHooks

```ts
interface ModuleLifecycleHooks {
  install?(ctx: ModuleContext): Promise<void> | void;
  activate?(ctx: ModuleContext): Promise<void> | void;
  deactivate?(ctx: ModuleContext): Promise<void> | void;
  uninstall?(ctx: ModuleContext): Promise<void> | void;
  update?(fromVersion: string, ctx: ModuleContext): Promise<void> | void;
}
```

### ModuleContext（服务端）

```ts
interface ModuleContext {
  moduleId: string;
  version: string;
  logger: Logger;
  dataDir: string;          // 模块私有数据目录路径
  framework: FrameworkApi;
}

interface Logger {
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
}

interface FrameworkApi {
  getConfig(key: string): unknown;
  setConfig(key: string, value: unknown): void;
  call(moduleId: string, fn: string, ...args: unknown[]): Promise<unknown>;
}
```

### ModuleToolPage（客户端渲染）

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

interface ClientFrameworkApi {
  toast(message: string, type?: "info" | "success" | "error"): void;
  navigate(href: string): void;
  request(path: string, init?: RequestInit): Promise<Response>;
  getConfig(key: string): unknown;
  setConfig(key: string, value: unknown): void;
}
```

---

## 三、框架集成方法

### 1. 最小模块示例

```tsx
// src/index.tsx
import React from "react";
import { createRoot } from "react-dom/client";
import type { ModuleExport, ToolPageProps } from "./types";

const metadata = {
  id: "hello",
  name: "Hello World",
  version: "1.0.0",
  description: "最小示例",
};

function App({ framework }: ToolPageProps) {
  return (
    <div>
      <h1>Hello from module!</h1>
      <button onClick={() => framework.toast("clicked", "success")}>
        click me
      </button>
    </div>
  );
}

const moduleExport: ModuleExport = {
  metadata,
  lifecycle: {
    install: async (ctx) => ctx.logger.info("installed"),
    activate: async (ctx) => ctx.logger.info("activated"),
  },
  tool: {
    mount: (container, props) => {
      const root = createRoot(container);
      root.render(React.createElement(App, props));
      return () => root.unmount();
    },
  },
};

export default moduleExport;
```

### 2. 跨模块 API 调用

模块 A 依赖模块 B，调用 B 暴露的 API：

```json
// A 的 module.json
{
  "id": "module-a",
  "dependencies": [{ "name": "module-b", "version": "^1.0.0" }]
}
```

```ts
// A 的 src/index.tsx
export default {
  metadata: { id: "module-a", ... },
  lifecycle: {
    activate: async (ctx) => {
      // 调用 module-b 暴露的 formatJson 函数
      const result = await ctx.framework.call("module-b", "formatJson", '{"a":1}');
      ctx.logger.info("result:", result);
    },
  },
}
```

```ts
// B 的 src/index.tsx
export default {
  metadata: { id: "module-b", ... },
  api: {
    formatJson: (input: unknown) =>
      JSON.stringify(JSON.parse(input as string), null, 2),
  },
}
```

### 3. 使用宿主配置持久化

```ts
// 服务端（生命周期钩子内）
async install(ctx) {
  const existing = ctx.framework.getConfig("counter");
  if (existing == null) ctx.framework.setConfig("counter", 0);
}

// 客户端（工具页面内）
function App({ framework }) {
  const [count, setCount] = useState(() => framework.getConfig("counter") ?? 0);
  const inc = () => {
    const next = count + 1;
    setCount(next);
    framework.setConfig("counter", next);  // 持久化到 localStorage
  };
  return <button onClick={inc}>{count}</button>;
}
```

### 4. 声明权限

模块使用网络请求需声明权限：

```json
// module.json
{
  "permissions": { "network": true }
}
```

```ts
// src/index.tsx
async activate(ctx) {
  const res = await fetch("https://api.example.com/data");
  ctx.logger.info("fetched:", await res.text());
}
```

未声明 `network` 权限但使用 `fetch`，安全扫描会标记为 `medium` 级别违规（仍可安装，但有警告）。未声明 `subprocess` 但使用 `child_process` 会标记为 `high`，阻止安装。

### 5. 进程启动时恢复激活状态

模块激活状态在进程重启后默认不会自动恢复。如需自动恢复，在应用启动时调用：

```ts
import { restoreActiveModules } from "@/lib/module-system";

// 在 Next.js instrumentation 或自定义启动脚本中
await restoreActiveModules();
```

该函数会遍历 DB 中状态为 `active` 的模块，重新加载服务端 bundle 并注册到内存表（不执行 `activate` 钩子）。

---

## 四、内部模块索引

框架核心实现文件（`src/lib/module-system/`）：

| 文件 | 职责 |
|------|------|
| `types.ts` | 核心类型定义：ModuleManifest / ModuleExport / ModuleError |
| `paths.ts` | 数据目录解析：source / data / dist / bundle 路径 |
| `db.ts` | SQLite 持久化：listModules / findModuleByModuleId / insertModule / updateModule |
| `host.ts` | 宿主框架信息：HOST_VERSION / HOST_FRAMEWORK_ID |
| `git.ts` | Git 操作：cloneRepo / listRemoteRefs / currentHead |
| `security.ts` | 安全扫描：scanSource / validateManifest / validateFrameworkVersion / validateMetadataConsistency |
| `dependency.ts` | 依赖解析：checkDependencies / resolveDependencies / topologicalSort / findConflicts / assertCompatible |
| `loader.ts` | 加载器核心：loadManifest / buildModule / loadServerBundle / installModule |
| `lifecycle.ts` | 生命周期：activateModule / deactivateModule / uninstallModule / updateModuleById / restoreActiveModules |
| `registry.ts` | 内存注册表：registerActive / getActive / callModuleApi |
| `scaffold.ts` | 脚手架：generateScaffold / validateScaffoldOptions |
| `scaffold-cli.ts` | 脚手架 CLI 入口 |
| `index.ts` | 公共 API 统一导出 |

### ModuleError 错误码

```ts
type ModuleErrorCode =
  | "MANIFEST_INVALID"
  | "METADATA_MISMATCH"
  | "DEPENDENCY_MISSING"
  | "DEPENDENCY_CONFLICT"
  | "VERSION_INCOMPATIBLE"
  | "SECURITY_VIOLATION"
  | "BUILD_FAILED"
  | "LOAD_FAILED"
  | "ALREADY_INSTALLED"
  | "NOT_FOUND";
```

### 错误码到 HTTP 状态映射

| code | HTTP |
|------|------|
| `ALREADY_INSTALLED` | 409 |
| `MANIFEST_INVALID` / `METADATA_MISMATCH` / `DEPENDENCY_MISSING` / `DEPENDENCY_CONFLICT` / `VERSION_INCOMPATIBLE` | 422 |
| `SECURITY_VIOLATION` | 403 |
| `NOT_FOUND` | 404 |
| `BUILD_FAILED` / `LOAD_FAILED` / 其他 | 500 |
