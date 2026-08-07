import fs from "fs";
import path from "path";
import { ModuleError } from "./types";

/** 脚手架生成选项 */
export interface ScaffoldOptions {
  /** 模块 id */
  id: string;
  /** 显示名称 */
  name: string;
  /** 描述 */
  description: string;
  /** 目标目录（不存在则创建） */
  outDir: string;
  author?: string;
  icon?: string;
  version?: string;
}

/** 生成的文件清单 */
export interface ScaffoldResult {
  outDir: string;
  files: string[];
}

/** 校验脚手架选项 */
export function validateScaffoldOptions(opts: ScaffoldOptions): void {
  if (!/^[a-z][a-z0-9-]{1,62}$/.test(opts.id)) {
    throw new ModuleError(
      "id 必须以小写字母开头，仅含小写字母/数字/连字符，长度 2-63",
      "MANIFEST_INVALID",
    );
  }
  if (!opts.name.trim()) {
    throw new ModuleError("name 不能为空", "MANIFEST_INVALID");
  }
  if (!opts.description.trim()) {
    throw new ModuleError("description 不能为空", "MANIFEST_INVALID");
  }
}

/** 生成符合规范的模块项目结构 */
export function generateScaffold(opts: ScaffoldOptions): ScaffoldResult {
  validateScaffoldOptions(opts);
  const outDir = path.resolve(opts.outDir);
  const srcDir = path.join(outDir, "src");
  fs.mkdirSync(srcDir, { recursive: true });

  const files: string[] = [];
  const write = (rel: string, content: string) => {
    const full = path.join(outDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, "utf-8");
    files.push(rel);
  };

  const id = opts.id;
  const name = opts.name;
  const version = opts.version ?? "1.0.0";
  const icon = opts.icon ?? "🧩";
  const author = opts.author ?? "";

  // 1. module.json 清单
  write(
    "module.json",
    JSON.stringify(
      {
        id,
        name,
        version,
        description: opts.description,
        author: author || undefined,
        icon,
        tags: [],
        entry: "src/index.tsx",
        dependencies: [],
        permissions: {},
        frameworkVersion: "^0.1.0",
        license: "MIT",
      },
      null,
      2,
    ) + "\n",
  );

  // 2. package.json
  write(
    "package.json",
    JSON.stringify(
      {
        name: `fox-tool-module-${id}`,
        version,
        description: opts.description,
        author: author || undefined,
        license: "MIT",
        private: true,
        scripts: {
          build:
            "esbuild src/index.tsx --bundle --format=esm --platform=browser --target=es2020 --jsx=automatic --outfile=dist/client.js",
          "build:server":
            "esbuild src/index.tsx --bundle --format=esm --platform=node --target=es2020 --jsx=automatic --external:react --external:react-dom --external:react-dom/client --outfile=dist/server.js",
        },
        devDependencies: {
          esbuild: "^0.28.0",
          react: "^19.0.0",
          "react-dom": "^19.0.0",
          "@types/react": "^19.0.0",
          "@types/react-dom": "^19.0.0",
          typescript: "^5.0.0",
        },
      },
      null,
      2,
    ) + "\n",
  );

  // 3. tsconfig.json
  write(
    "tsconfig.json",
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2020",
          lib: ["dom", "dom.iterable", "esnext"],
          module: "esnext",
          moduleResolution: "bundler",
          jsx: "react-jsx",
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          noEmit: true,
        },
        include: ["src"],
      },
      null,
      2,
    ) + "\n",
  );

  // 4. 类型定义（模块自包含，无需额外 SDK 包）
  write("src/types.ts", SCAFFOLD_TYPES);

  // 5. 入口文件
  write("src/index.tsx", entryTemplate(id, name, version, opts.description, icon));

  // 6. .gitignore
  write(".gitignore", ["node_modules", "dist", "*.log", ".DS_Store"].join("\n") + "\n");

  // 7. README
  write("README.md", readmeTemplate(id, name, opts.description));

  return { outDir, files };
}

const SCAFFOLD_TYPES = `/**
 * Fox Tool 模块 SDK 类型定义（脚手架自带，可按需精简）。
 * 框架在加载时会用 esbuild 构建本模块，无需安装额外 SDK 包。
 */

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
  homepage?: string;
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
`;

function entryTemplate(
  id: string,
  name: string,
  version: string,
  description: string,
  icon: string,
): string {
  return `import React, { useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ModuleExport, ToolPageProps } from "./types";

const metadata = {
  id: ${JSON.stringify(id)},
  name: ${JSON.stringify(name)},
  version: ${JSON.stringify(version)},
  description: ${JSON.stringify(description)},
  icon: ${JSON.stringify(icon)},
  entry: "src/index.tsx",
  frameworkVersion: "^0.1.0",
};

/** 工具页面根组件 */
function App({ framework }: ToolPageProps) {
  const [count, setCount] = useState(0);

  return (
    <div style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 600 }}>
        ${icon} ${name}
      </h1>
      <p style={{ color: "#64748b", marginTop: 4 }}>{description}</p>
      <div style={{ marginTop: 16, display: "flex", gap: 8, alignItems: "center" }}>
        <button
          onClick={() => setCount((c) => c + 1)}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "1px solid #e2e8f0",
            background: "#fff",
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          点击计数: {count}
        </button>
        <button
          onClick={() => framework.toast(\`当前计数: \${count}\`, "info")}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "1px solid #e2e8f0",
            background: "#fff",
            cursor: "pointer",
            fontSize: 14,
          }}
        >
          调用框架 toast
        </button>
      </div>
    </div>
  );
}

const moduleExport: ModuleExport = {
  metadata,

  lifecycle: {
    install: async (ctx) => {
      ctx.logger.info("模块安装完成", ctx.moduleId);
    },
    activate: async (ctx) => {
      ctx.logger.info("模块已激活");
    },
    deactivate: async (ctx) => {
      ctx.logger.info("模块已停用");
    },
    uninstall: async (ctx) => {
      ctx.logger.info("模块已卸载");
    },
  },

  tool: {
    mount: (container, props) => {
      const root: Root = createRoot(container);
      root.render(React.createElement(App, props));
      return () => root.unmount();
    },
  },
};

export default moduleExport;
`;
}

function readmeTemplate(id: string, name: string, description: string): string {
  return `# ${name}

> ${description}

Fox Tool 外部模块。本模块由脚手架生成。

## 目录结构

\`\`\`
${id}/
├── module.json        # 模块清单（必须）
├── package.json
├── tsconfig.json
├── src/
│   ├── index.tsx      # 模块入口（导出 default { metadata, lifecycle, tool }）
│   └── types.ts       # SDK 类型定义
└── README.md
\`\`\`

## 开发

\`\`\`bash
pnpm install
# 本地构建（可选，框架加载时会自动构建）
pnpm build
\`\`\`

## 安装到 Fox Tool

在 Fox Tool 的「模块管理」页面填入本仓库 Git 地址并安装，或调用 API：

\`\`\`bash
curl -X POST http://localhost:3000/api/modules \\
  -H "Content-Type: application/json" \\
  -d '{"gitUrl":"<本仓库地址>","ref":"HEAD"}'
\`\`\`

## 生命周期钩子

在 \`src/index.tsx\` 的 \`lifecycle\` 中实现：install / activate / deactivate / uninstall / update。

## 权限声明

在 \`module.json\` 的 \`permissions\` 中声明所需权限：network / filesystem / subprocess / env / database。
`;
}
