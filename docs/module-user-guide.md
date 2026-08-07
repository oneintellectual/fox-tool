# Fox Tool 模块加载与使用用户手册

本手册面向 Fox Tool 的最终用户与运维人员，介绍如何通过 Git 仓库安装、管理、使用外部模块。

## 1. 概述

Fox Tool 支持从任意 Git 仓库（GitHub / GitLab / Gitee / 私有仓库）引入外部模块。模块安装后会自动出现在首页工具卡片中，点击即可使用。

**核心特性**：
- 通过 Git 地址一键安装，无需手动下载
- 安装时自动完成：代码拉取 → 安全扫描 → 构建 → 依赖检查 → 生命周期初始化
- 模块独立沙箱运行，数据隔离，权限受控
- 支持激活 / 停用 / 更新 / 卸载完整生命周期

## 2. 模块管理入口

### 2.1 从首页进入

在 Fox Tool 首页右上角点击「🧩 模块管理」按钮，进入模块管理页面。

### 2.2 直接访问

浏览器访问 `http://localhost:3000/modules`（按实际部署地址调整）。

## 3. 安装模块

### 3.1 通过 Web 界面安装

1. 进入「模块管理」页面
2. 在「从 Git 安装模块」表单中：
   - **Git 地址**：填写模块仓库的 HTTPS clone 地址，例如 `https://github.com/user/module.git`
   - **分支/标签/commit**：默认 `HEAD`（即默认分支）。可点击「拉取分支/标签」按钮获取远端所有 ref 列表，点击选择
   - **访问令牌**：私有仓库需填写（作为 HTTPS Basic Auth 的 username，密码留空）
3. 点击「安装模块」按钮
4. 等待安装完成（拉取 + 构建 + 激活，通常 5-30 秒）
5. 安装成功后模块出现在下方列表，状态为「运行中」

### 3.2 通过 API 安装

```bash
curl -X POST http://localhost:3000/api/modules \
  -H "Content-Type: application/json" \
  -d '{
    "gitUrl": "https://github.com/user/module.git",
    "ref": "main",
    "activate": true,
    "token": "ghp_xxx（私有仓库才填）"
  }'
```

响应：

```json
{
  "module": {
    "module_id": "json-formatter",
    "name": "JSON 格式化",
    "version": "1.2.0",
    "status": "active",
    ...
  },
  "activated": true,
  "warnings": []
}
```

### 3.3 安装失败常见原因

| 错误信息 | 原因 | 解决方案 |
|----------|------|----------|
| `模块 X 已安装（版本 Y），请使用更新接口` | 同 id 模块已存在 | 先卸载旧版本，或点击「更新」按钮 |
| `module.json 缺少必填字段: X` | 清单字段不完整 | 联系模块作者补全清单 |
| `version 不是合法的语义化版本` | version 字段格式错误 | 改为 `1.0.0` 格式 |
| `模块要求框架 ^1.0.0，当前宿主为 0.1.5` | 框架版本不兼容 | 升级 Fox Tool 或使用兼容版本的模块 |
| `使用了 eval()，存在任意代码执行风险` | 安全扫描拦截高危代码 | 模块作者需移除危险 API |
| `使用了 fetch，但未声明 network 权限` | 未声明权限 | 在 `module.json.permissions` 中声明 `{"network": true}` |
| `模块 a 依赖 b@^2.0.0，已安装 1.5.0` | 依赖版本冲突 | 先安装/升级依赖模块 b 到 ^2.0.0 |
| `检测到循环依赖: a -> b -> a` | 模块间循环依赖 | 重构模块依赖关系 |

## 4. 管理模块

### 4.1 模块状态

| 状态 | 含义 | 说明 |
|------|------|------|
| `installed` | 已安装 | 安装完成但未激活，不会出现在首页 |
| `active` | 运行中 | 已激活，首页可见，可使用 |
| `inactive` | 已停用 | 手动停用，首页不可见 |
| `error` | 错误 | 生命周期或加载失败，查看 `error` 字段 |

### 4.2 激活 / 停用

- **激活**：模块状态为 `installed` / `inactive` 时，点击「激活」按钮 → 执行 `activate` 钩子 → 注册到内存 → 首页出现卡片
- **停用**：状态为 `active` 时，点击「停用」按钮 → 执行 `deactivate` 钩子 → 从内存移除 → 首页卡片消失

停用不会删除模块代码与数据，可随时重新激活。

### 4.3 更新模块

当模块仓库有新版本时：

1. 在模块卡片点击「更新」按钮
2. 框架会重新拉取仓库（使用原 ref），校验版本兼容性
3. 执行 `update` 生命周期钩子（传入 `fromVersion`）
4. 重新构建 bundle，状态保持为 `active`

**更新前的兼容性检查**：
- 新版本是否与已安装的其他模块兼容（其他模块是否依赖旧版本范围）
- 框架版本是否仍满足新版本的 `frameworkVersion`

通过 API 更新：

```bash
curl -X POST http://localhost:3000/api/modules/json-formatter/update \
  -H "Content-Type: application/json" \
  -d '{"ref": "v1.3.0"}'
```

### 4.4 卸载模块

点击「卸载」按钮：

1. 执行 `uninstall` 生命周期钩子
2. 从内存注册表移除
3. 删除数据库记录
4. 递归删除模块目录：`<base>/<moduleId>/`（含 source / data / dist）

**⚠️ 卸载会永久删除模块数据，不可恢复。** 卸载前请确认。

通过 API 卸载：

```bash
curl -X DELETE http://localhost:3000/api/modules/json-formatter
```

## 5. 使用模块

### 5.1 从首页进入

已激活的模块会以卡片形式出现在首页「全部工具」区域，图标右下角带「外部模块」标签。点击卡片即可进入模块工具页面。

### 5.2 直接访问

浏览器访问 `http://localhost:3000/modules/<module_id>`，例如：

```
http://localhost:3000/modules/json-formatter
```

### 5.3 模块工具页面

模块工具页面由模块自行渲染（通常是 React 单页应用）。页面顶部显示模块 id 与版本，左上角「← 模块管理」返回模块列表。

模块可以通过 `ClientFrameworkApi` 调用宿主能力：
- `framework.toast(msg)` 显示提示
- `framework.navigate(href)` 跳转
- `framework.request(path, init)` 调用宿主 API
- `framework.getConfig/setConfig(key, value)` 持久化配置（localStorage）

## 6. 私有仓库支持

### 6.1 HTTPS + Token

在安装表单的「访问令牌」字段填入 Personal Access Token：

- **GitHub**：Settings → Developer settings → Personal access tokens → 生成 `repo` 权限 token
- **GitLab**：User Settings → Access Tokens → 生成 `read_repository` 权限 token
- **Gitee**：设置 → 私人令牌 → 生成 `projects` 权限 token

Token 作为 HTTPS Basic Auth 的 username 传递，密码留空。

### 6.2 SSH 不支持

当前版本仅支持 HTTPS 协议，暂不支持 SSH（`git@github.com:...`）。请使用 HTTPS 地址。

## 7. 数据存储位置

模块数据按优先级存储在：

1. 环境变量 `MODULE_DATA_DIR` 指定的目录
2. Serverless 环境（Vercel / AWS Lambda）：`/tmp/fox-modules/`
3. 本地开发：`<项目根>/data/modules/`

目录结构：

```
data/modules/
├── modules.db                  # 模块元数据 SQLite 数据库
└── <module-id>/
    ├── source/                 # Git 克隆的源码
    ├── data/                   # 模块私有数据目录（生命周期可写）
    └── dist/
        ├── server.js           # 服务端 bundle
        └── client.js           # 客户端 bundle
```

## 8. 故障排查

### 8.1 模块状态显示「错误」

在模块卡片中查看红色错误信息。常见处理：

- **bundle 缺失**：点击「更新」重新构建
- **激活失败**：查看错误信息，通常是 `activate` 钩子抛出异常，联系模块作者
- **服务端 bundle 加载失败**：可能是 Node 版本不兼容，检查 `frameworkVersion`

### 8.2 模块卡片未出现在首页

确认模块状态为 `active`（而非 `installed` 或 `inactive`）。在模块管理页点击「激活」。

### 8.3 模块工具页面白屏

1. 打开浏览器开发者工具 Console 查看错误
2. 确认 `/api/modules/<id>/bundle` 返回 200
3. 确认模块 `tool.mount` 正确实现（返回 unmount 函数）
4. 若是 React 版本冲突，确认客户端 bundle 自包含 react

### 8.4 更新后仍然加载旧版本

浏览器可能缓存了旧 client bundle。强制刷新页面（Cmd+Shift+R / Ctrl+Shift+R），或确认 `/api/modules/<id>/bundle?v=<version>` 的 version 参数已更新。

### 8.5 进程重启后模块变为「已安装」但未激活

模块激活状态默认不自动恢复。在模块管理页点击「激活」即可。如需进程启动时自动恢复，可调用 `restoreActiveModules()`（见 API 文档）。

## 9. 示例模块

仓库内置一个示例模块 `examples/test-module`（文本统计器），演示：

- `module.json` 清单格式
- 完整的 5 个生命周期钩子
- React 工具页面渲染（字符/单词/行数统计）
- `framework.setConfig` 持久化用户输入
- `api.countWords` 跨模块 API 暴露

本地测试流程：

```bash
# 1. 初始化为 Git 仓库
cd examples/test-module
git init && git add . && git commit -m "init text-counter"

# 2. 推送到任意 Git 远端（或使用本地路径 file://）

# 3. 在 Fox Tool 模块管理页安装
#    Git URL: file:///path/to/fox-tool/examples/test-module
#    或推送到 GitHub 后填入 HTTPS 地址

# 4. 安装完成后在首页点击「🔢 文本统计器」使用
```

## 10. 安全建议

- **仅安装可信来源的模块**：模块代码在宿主进程中执行，恶意模块可能影响宿主
- **审查权限声明**：安装前查看模块 `permissions`，警惕声明了 `subprocess` / `filesystem` / `database` 的模块
- **关注安全扫描警告**：安装时若出现 warnings，仔细阅读后再决定是否使用
- **私有仓库用专用 token**：不要复用个人主 token，为每个模块源生成最小权限 token
- **定期清理不用的模块**：卸载不再使用的模块，减少攻击面
