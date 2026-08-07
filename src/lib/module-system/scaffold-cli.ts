#!/usr/bin/env tsx
/**
 * 模块脚手架 CLI
 * 用法：
 *   pnpm scaffold --id json-formatter --name "JSON 格式化" --desc "JSON 格式化工具" --out ./my-module
 *   pnpm scaffold -i json-formatter -n "JSON 格式化" -d "JSON 格式化工具"
 */
import path from "path";
import { generateScaffold } from "./scaffold";

interface Args {
  id?: string;
  name?: string;
  desc?: string;
  out?: string;
  author?: string;
  icon?: string;
  version?: string;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    switch (a) {
      case "--id":
      case "-i":
        args.id = next;
        i++;
        break;
      case "--name":
      case "-n":
        args.name = next;
        i++;
        break;
      case "--desc":
      case "-d":
        args.desc = next;
        i++;
        break;
      case "--out":
      case "-o":
        args.out = next;
        i++;
        break;
      case "--author":
        args.author = next;
        i++;
        break;
      case "--icon":
        args.icon = next;
        i++;
        break;
      case "--version":
        args.version = next;
        i++;
        break;
      default:
        if (a?.startsWith("--")) {
          console.warn(`未知参数: ${a}`);
        }
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.id || !args.name || !args.desc) {
    console.error(
      "用法: pnpm scaffold --id <id> --name <名称> --desc <描述> [--out <目录>] [--author <作者>] [--icon <图标>] [--version <版本>]",
    );
    process.exit(1);
  }

  const outDir = args.out ? path.resolve(args.out) : path.resolve(process.cwd(), args.id);

  const result = generateScaffold({
    id: args.id,
    name: args.name,
    description: args.desc,
    outDir,
    author: args.author,
    icon: args.icon,
    version: args.version,
  });

  console.log(`✓ 模块已生成: ${result.outDir}`);
  console.log("  文件清单:");
  for (const f of result.files) console.log(`    - ${f}`);
  console.log("\n下一步:");
  console.log(`  cd ${path.relative(process.cwd(), outDir) || "."}`);
  console.log("  git init && git add . && git commit -m 'init module'");
  console.log("  在 Fox Tool 模块管理页面填入仓库地址安装");
}

main();
