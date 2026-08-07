/**
 * 内置工具注册表
 *
 * 遵循模块开发规范（ModuleManifest），将内置工具的元数据统一管理。
 * 内置工具与外部模块共享同一套元数据接口，首页与模块管理页可统一渲染。
 *
 * 内置工具不经过 Git 加载 / 安全扫描 / esbuild 构建，直接通过 Next.js 路由渲染，
 * 但其元数据结构完全符合 ModuleManifest 规范，便于未来迁移为外部模块。
 */

import type { ModuleManifest, ModulePermissions } from "@/lib/module-system";

/** 内置工具的 UI 样式信息（ModuleManifest 之外的字段，仅内置工具使用） */
export interface BuiltinToolStyle {
  /** 卡片渐变背景 Tailwind class */
  gradient: string;
  /** 阴影颜色 Tailwind class */
  shadowColor: string;
}

/** 内置工具完整定义：manifest + 路由 + 样式 */
export interface BuiltinTool {
  /** 符合模块开发规范的清单 */
  manifest: ModuleManifest;
  /** 工具页面路由路径 */
  href: string;
  /** 是否已上线（false 表示占位卡片） */
  available: boolean;
  /** UI 样式 */
  style: BuiltinToolStyle;
}

/** 宿主框架版本 */
const FRAMEWORK_VERSION = "^0.1.0";

/** 内置工具列表（顺序即首页展示顺序） */
export const builtinTools: BuiltinTool[] = [
  {
    manifest: {
      id: "ddl-to-code",
      name: "DDL to Code",
      version: "1.0.0",
      description:
        "解析 SQL 建表语句，自动生成多语言代码，支持 Java 实体类（Lombok、MyBatis-Plus、Swagger 注解）",
      icon: "🔧",
      tags: ["SQL", "Java", "代码生成"],
      entry: "src/app/tools/ddl-to-code/page.tsx",
      permissions: {},
      frameworkVersion: FRAMEWORK_VERSION,
      license: "MIT",
    },
    href: "/tools/ddl-to-code",
    available: true,
    style: { gradient: "from-blue-500 to-indigo-600", shadowColor: "shadow-blue-500/20" },
  },
  {
    manifest: {
      id: "sql-diff",
      name: "SQL Diff",
      version: "1.0.0",
      description:
        "对比两组建表 SQL 差异，自动生成 ALTER TABLE 语句，支持新增表、删除表、新增列、删除列、修改列",
      icon: "⚡",
      tags: ["SQL", "对比", "ALTER"],
      entry: "src/app/tools/sql-diff/page.tsx",
      permissions: {},
      frameworkVersion: FRAMEWORK_VERSION,
      license: "MIT",
    },
    href: "/tools/sql-diff",
    available: true,
    style: { gradient: "from-emerald-500 to-teal-600", shadowColor: "shadow-emerald-500/20" },
  },
  {
    manifest: {
      id: "ssh-monitor",
      name: "SSH Linux 监控",
      version: "1.0.0",
      description:
        "通过 SSH 连接远程 Linux 服务器，实时监控 CPU、内存、磁盘、网络与进程指标",
      icon: "📡",
      tags: ["SSH", "Linux", "监控"],
      entry: "src/app/tools/ssh-monitor/page.tsx",
      permissions: {
        network: true,
        subprocess: true,
        env: true,
      },
      frameworkVersion: FRAMEWORK_VERSION,
      license: "MIT",
    },
    href: "/tools/ssh-monitor",
    available: true,
    style: { gradient: "from-violet-500 to-purple-600", shadowColor: "shadow-violet-500/20" },
  },
  {
    manifest: {
      id: "diagram",
      name: "绘图工具",
      version: "1.0.0",
      description:
        "通过表单填写节点与连线，自动布局生成软件施工图与网络拓扑图，支持导出 SVG / Mermaid / JSON",
      icon: "📐",
      tags: ["绘图", "拓扑图", "架构图"],
      entry: "src/app/tools/diagram/page.tsx",
      permissions: {},
      frameworkVersion: FRAMEWORK_VERSION,
      license: "MIT",
    },
    href: "/tools/diagram",
    available: true,
    style: { gradient: "from-cyan-500 to-sky-600", shadowColor: "shadow-cyan-500/20" },
  },
  {
    manifest: {
      id: "chat",
      name: "AI 对话",
      version: "1.0.0",
      description:
        "基于 WebLLM + WebGPU 的浏览器本地 AI 对话，模型完全在设备内推理，数据不离开浏览器",
      icon: "💬",
      tags: ["AI", "WebGPU", "本地推理"],
      entry: "src/app/tools/chat/page.tsx",
      permissions: {
        network: true,
      },
      frameworkVersion: FRAMEWORK_VERSION,
      license: "MIT",
    },
    href: "/tools/chat",
    available: true,
    style: { gradient: "from-emerald-500 to-teal-600", shadowColor: "shadow-emerald-500/20" },
  },
  {
    manifest: {
      id: "docker-compose",
      name: "Docker Compose 生成器",
      version: "1.0.0",
      description:
        "将 docker run 命令批量转换为 docker-compose.yml 配置文件，支持端口、卷、环境变量、健康检查等",
      icon: "🐳",
      tags: ["Docker", "Compose", "YAML"],
      entry: "src/app/tools/docker-compose/page.tsx",
      permissions: {},
      frameworkVersion: FRAMEWORK_VERSION,
      license: "MIT",
    },
    href: "/tools/docker-compose",
    available: true,
    style: { gradient: "from-orange-500 to-rose-600", shadowColor: "shadow-orange-500/20" },
  },
  // ── 占位工具（未上线，仅展示） ──
  {
    manifest: {
      id: "json-formatter",
      name: "JSON 格式化",
      version: "0.1.0",
      description: "JSON 数据格式化、压缩、校验与转换工具",
      icon: "{ }",
      tags: ["JSON", "格式化"],
      permissions: {},
      frameworkVersion: FRAMEWORK_VERSION,
      license: "MIT",
    },
    href: "#",
    available: false,
    style: { gradient: "from-emerald-500 to-teal-600", shadowColor: "shadow-emerald-500/20" },
  },
  {
    manifest: {
      id: "base64-codec",
      name: "Base64 编解码",
      version: "0.1.0",
      description: "文本与 Base64 互转，支持文件编码",
      icon: "🔐",
      tags: ["编码", "解码"],
      permissions: {},
      frameworkVersion: FRAMEWORK_VERSION,
      license: "MIT",
    },
    href: "#",
    available: false,
    style: { gradient: "from-amber-500 to-orange-600", shadowColor: "shadow-amber-500/20" },
  },
  {
    manifest: {
      id: "regex-tester",
      name: "正则测试",
      version: "0.1.0",
      description: "在线正则表达式测试与匹配验证",
      icon: ".*",
      tags: ["正则", "测试"],
      permissions: {},
      frameworkVersion: FRAMEWORK_VERSION,
      license: "MIT",
    },
    href: "#",
    available: false,
    style: { gradient: "from-violet-500 to-purple-600", shadowColor: "shadow-violet-500/20" },
  },
  {
    manifest: {
      id: "timestamp-converter",
      name: "时间戳转换",
      version: "0.1.0",
      description: "Unix 时间戳与日期时间互转",
      icon: "⏱",
      tags: ["时间", "转换"],
      permissions: {},
      frameworkVersion: FRAMEWORK_VERSION,
      license: "MIT",
    },
    href: "#",
    available: false,
    style: { gradient: "from-rose-500 to-pink-600", shadowColor: "shadow-rose-500/20" },
  },
  {
    manifest: {
      id: "color-converter",
      name: "颜色转换",
      version: "0.1.0",
      description: "HEX、RGB、HSL 颜色格式互转与色板",
      icon: "🎨",
      tags: ["颜色", "设计"],
      permissions: {},
      frameworkVersion: FRAMEWORK_VERSION,
      license: "MIT",
    },
    href: "#",
    available: false,
    style: { gradient: "from-cyan-500 to-sky-600", shadowColor: "shadow-cyan-500/20" },
  },
];

/** 获取已上线的内置工具 */
export function getAvailableBuiltinTools(): BuiltinTool[] {
  return builtinTools.filter((t) => t.available);
}

/** 获取全部内置工具（含占位） */
export function getAllBuiltinTools(): BuiltinTool[] {
  return builtinTools;
}

/** 按 id 查找内置工具 */
export function findBuiltinTool(id: string): BuiltinTool | undefined {
  return builtinTools.find((t) => t.manifest.id === id);
}
