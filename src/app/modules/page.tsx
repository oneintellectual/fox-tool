import Link from "next/link";
import { listModules } from "@/lib/module-system";
import ModulesClient from "./ModulesClient";

export const dynamic = "force-dynamic";

export default function ModulesPage() {
  const modules = listModules();
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900">
      <header className="border-b border-slate-200/80 bg-white/60 backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-950/60">
        <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3.5">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white text-xl shadow-lg shadow-indigo-500/25">
                🧩
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                  模块管理
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  从 Git 仓库安装、激活和管理外部模块
                </p>
              </div>
            </div>
            <Link
              href="/"
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              返回首页
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        <ModulesClient initial={modules} />
      </main>
    </div>
  );
}
