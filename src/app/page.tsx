import Link from "next/link";
import { listModules } from "@/lib/module-system/db";
import type { ModuleManifest } from "@/lib/module-system/types";
import { builtinTools, type BuiltinTool } from "@/tools/registry";

export const dynamic = "force-dynamic";

export default function Home() {
  // 已激活外部模块，合并展示在首页
  const externalModules = listModules()
    .filter((m) => m.status === "active")
    .map((m) => JSON.parse(m.manifest) as ModuleManifest);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900">
      {/* Header */}
      <header className="border-b border-slate-200/80 bg-white/60 backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-950/60">
        <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-400 to-rose-500 text-white font-bold text-xl shadow-lg shadow-orange-500/25">
              🦊
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                Fox Tool
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                开发者工具箱 · 效率提升利器
              </p>
            </div>
            <Link
              href="/modules"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              🧩 模块管理
            </Link>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        {/* 分类标题 */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200">
            全部工具
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            选择一个工具开始使用
          </p>
        </div>

        {/* 工具卡片网格 */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {/* 已上线的内置工具 */}
          {builtinTools
            .filter((t) => t.available)
            .map((tool) => (
              <BuiltinCard key={tool.manifest.id} tool={tool} />
            ))}

          {/* 已激活的外部模块 */}
          {externalModules.map((meta) => (
            <ExternalCard key={meta.id} meta={meta} />
          ))}

          {/* 未上线的占位工具 */}
          {builtinTools
            .filter((t) => !t.available)
            .map((tool) => (
              <PlaceholderCard key={tool.manifest.id} tool={tool} />
            ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200/60 bg-white/40 backdrop-blur-sm dark:border-slate-800/60 dark:bg-slate-950/40">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
          <p className="text-center text-xs text-slate-400 dark:text-slate-500">
            Fox Tool · 开发者工具箱 · Made with ❤️
          </p>
        </div>
      </footer>
    </div>
  );
}

/** 已上线内置工具卡片 */
function BuiltinCard({ tool }: { tool: BuiltinTool }) {
  const { manifest: m, style, href } = tool;
  return (
    <Link
      href={href}
      className="group relative flex flex-col rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm transition-all duration-200 dark:border-slate-700/80 dark:bg-slate-900 hover:shadow-lg hover:border-slate-300 hover:-translate-y-0.5 dark:hover:border-slate-600 cursor-pointer"
    >
      <div
        className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${style.gradient} text-white text-xl font-bold shadow-lg ${style.shadowColor}`}
      >
        {m.icon}
      </div>
      <h3 className="text-base font-semibold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
        {m.name}
      </h3>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
        {m.description}
      </p>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {m.tags?.map((tag) => (
          <span
            key={tag}
            className="rounded-md bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400"
          >
            {tag}
          </span>
        ))}
      </div>
      <div className="absolute right-5 top-6 text-slate-300 transition-all group-hover:text-blue-500 group-hover:translate-x-0.5 dark:text-slate-600 dark:group-hover:text-blue-400">
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </Link>
  );
}

/** 外部模块卡片 */
function ExternalCard({ meta }: { meta: ModuleManifest }) {
  const gradient = "from-indigo-500 to-purple-600";
  const shadowColor = "shadow-indigo-500/20";
  const tags = [...(meta.tags || []), "外部模块"];
  return (
    <Link
      href={`/modules/${meta.id}`}
      className="group relative flex flex-col rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm transition-all duration-200 dark:border-slate-700/80 dark:bg-slate-900 hover:shadow-lg hover:border-slate-300 hover:-translate-y-0.5 dark:hover:border-slate-600 cursor-pointer"
    >
      <div
        className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${gradient} text-white text-xl font-bold shadow-lg ${shadowColor}`}
      >
        {meta.icon || "🧩"}
      </div>
      <h3 className="text-base font-semibold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
        {meta.name}
      </h3>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
        {meta.description}
      </p>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <span
            key={tag}
            className="rounded-md bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400"
          >
            {tag}
          </span>
        ))}
      </div>
      <div className="absolute right-5 top-6 text-slate-300 transition-all group-hover:text-blue-500 group-hover:translate-x-0.5 dark:text-slate-600 dark:group-hover:text-blue-400">
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </Link>
  );
}

/** 未上线占位卡片 */
function PlaceholderCard({ tool }: { tool: BuiltinTool }) {
  const { manifest: m, style } = tool;
  return (
    <div className="group relative flex flex-col rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm transition-all duration-200 dark:border-slate-700/80 dark:bg-slate-900 opacity-60 cursor-default">
      <div
        className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${style.gradient} text-white text-xl font-bold shadow-lg ${style.shadowColor}`}
      >
        {m.icon}
      </div>
      <h3 className="text-base font-semibold text-slate-900 dark:text-white">
        {m.name}
        <span className="ml-2 inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          即将上线
        </span>
      </h3>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
        {m.description}
      </p>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {m.tags?.map((tag) => (
          <span
            key={tag}
            className="rounded-md bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400"
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}
