"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { dynamicImport } from "@/lib/module-system/dynamic-import";

interface Props {
  moduleId: string;
  version: string;
}

/**
 * 浏览器侧动态加载模块客户端 bundle 并调用 tool.mount 渲染。
 *
 * bundle 为 ESM 格式，通过动态 import() 加载。以 version 作为缓存键避免
 * 命中旧版本模块。
 */
export default function ModuleRenderer({ moduleId, version }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const unmountRef = useRef<(() => void) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

    async function load() {
      try {
        // 以 version 为查询参数避免浏览器/import-map 缓存
        const url = `/api/modules/${moduleId}/bundle?v=${encodeURIComponent(version)}`;
        const mod = await dynamicImport(url);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const exported: any = mod?.default ?? mod;
        if (cancelled) return;
        if (!exported?.tool?.mount || typeof exported.tool.mount !== "function") {
          throw new Error("模块未导出 tool.mount 函数");
        }
        const framework = {
          toast: (msg: string, type: "info" | "success" | "error" = "info") => {
            console.log(`[toast:${type}] ${msg}`);
          },
          navigate: (href: string) => {
            window.location.href = href;
          },
          request: (p: string, init?: RequestInit) => fetch(p, init),
          getConfig: (key: string) => {
            try {
              return JSON.parse(localStorage.getItem(`fox:module:${moduleId}:cfg:${key}`) ?? "null");
            } catch {
              return null;
            }
          },
          setConfig: (key: string, value: unknown) => {
            localStorage.setItem(`fox:module:${moduleId}:cfg:${key}`, JSON.stringify(value));
          },
        };
        const unmount = exported.tool.mount(container, { moduleId, version, framework });
        unmountRef.current = typeof unmount === "function" ? unmount : null;
        if (!cancelled) setLoading(false);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
      try {
        unmountRef.current?.();
      } catch {
        // ignore
      }
      unmountRef.current = null;
    };
  }, [moduleId, version]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
        <div className="mx-auto max-w-6xl px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <Link href="/modules" className="text-sm text-slate-500 hover:text-blue-600 dark:text-slate-400">
              ← 模块管理
            </Link>
            <code className="text-xs text-slate-400">
              {moduleId}@{version}
            </code>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        {loading && (
          <div className="flex items-center justify-center py-20 text-sm text-slate-400">
            <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
            加载模块中…
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 dark:border-red-900 dark:bg-red-950/50">
            <h2 className="text-base font-semibold text-red-700 dark:text-red-300">模块加载失败</h2>
            <pre className="mt-2 whitespace-pre-wrap text-sm text-red-600 dark:text-red-400">{error}</pre>
            <Link href="/modules" className="mt-4 inline-block text-sm text-blue-600 hover:underline">
              返回模块管理
            </Link>
          </div>
        )}
        <div ref={containerRef} />
      </main>
    </div>
  );
}
