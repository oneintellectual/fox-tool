# 文本统计器（Fox Tool 示例模块）

Fox Tool 外部模块的最小可运行示例，演示：

- `module.json` 清单格式
- `src/index.tsx` 入口导出（metadata + lifecycle + tool + api）
- 通过 Git 安装到 Fox Tool 后的渲染与生命周期回调

## 本地构建

```bash
pnpm install
pnpm build        # 构建客户端 bundle
pnpm build:server # 构建服务端 bundle
```

> 安装到 Fox Tool 时由框架自动调用 esbuild 构建，无需手动构建。

## 安装到 Fox Tool

### 方式一：通过 Web 界面

1. 启动 Fox Tool
2. 访问「模块管理」页（首页右上角入口）
3. 填入本仓库 Git 地址，选择分支/标签
4. 点击「安装模块」

### 方式二：通过 API

```bash
# 初始化为 Git 仓库并提交
git init && git add . && git commit -m "init text-counter"

# 推送到远端后，调用安装接口
curl -X POST http://localhost:3000/api/modules \
  -H "Content-Type: application/json" \
  -d '{"gitUrl":"<本仓库地址>","ref":"HEAD"}'
```

## 模块功能

- 实时统计字符数、不含空格字符数、单词数、行数
- 通过 `framework.setConfig` 持久化最后输入内容
- 暴露 `api.countWords(text)` 供其他模块调用

## 生命周期钩子

| 钩子 | 行为 |
|------|------|
| `install` | 打印日志 |
| `activate` | 打印日志，准备渲染 |
| `deactivate` | 打印日志 |
| `uninstall` | 打印日志 |
| `update` | 打印版本变更 |
