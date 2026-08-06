"use client";

import { useState, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  convertDockerCommandsToCompose,
  parseDockerCommands,
  parseDockerComposeYAML,
  generateDockerComposeYAML,
  type DockerService,
  type ParseWarning,
} from "@/lib/docker-compose-generator";
import ServiceFormEditor, {
  ServiceForm,
  createEmptyService,
  formToService,
  formsToComposeYAML,
} from "./ServiceForm";
import ServicePool, {
  PoolService,
  SplitResult,
} from "./ServicePool";

// 动态导入 CodeMirror 只读查看器，避免 SSR 问题
const CodeViewer = dynamic(() => import("@/components/CodeViewer"), { ssr: false });

type Mode = "command" | "form" | "compose";

const EXAMPLE_COMMANDS = `# 示例：多条 docker run 命令合并为 docker-compose.yml
docker run -d \\
  --name nginx-web \\
  -p 80:80 \\
  -p 443:443 \\
  -v /data/nginx/html:/usr/share/nginx/html:ro \\
  -v /data/nginx/conf:/etc/nginx/conf.d:ro \\
  -e TZ=Asia/Shanghai \\
  -e NGINX_WORKER_PROCESSES=4 \\
  --restart always \\
  --network frontend \\
  --hostname nginx \\
  --health-cmd "curl -f http://localhost/ || exit 1" \\
  --health-interval 30s \\
  --health-timeout 5s \\
  --health-retries 3 \\
  nginx:1.25-alpine

docker run -d \\
  --name mysql-db \\
  -p 3306:3306 \\
  -v /data/mysql:/var/lib/mysql \\
  -e MYSQL_ROOT_PASSWORD=secret123 \\
  -e MYSQL_DATABASE=appdb \\
  -e MYSQL_USER=appuser \\
  -e MYSQL_PASSWORD=apppass \\
  --restart unless-stopped \\
  --network backend \\
  --memory 512m \\
  --cpus 1.5 \\
  --cap-add SYS_NICE \\
  --ulimit nofile=65535:65535 \\
  mysql:8.0

docker run -d \\
  --name redis-cache \\
  -p 6379:6379 \\
  -v /data/redis:/data \\
  --restart always \\
  --network backend \\
  --sysctl net.core.somaxconn=1024 \\
  redis:7-alpine redis-server --appendonly yes`;

const EXAMPLE_COMPOSE_YAML = `# 示例：已有的 docker-compose.yml
version: "3.8"
services:
  web:
    image: nginx:1.25-alpine
    container_name: web
    ports:
      - "80:80"
      - "443:443"
    environment:
      TZ: Asia/Shanghai
    networks:
      - frontend
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost/ || exit 1"]
      interval: 30s
      retries: 3
  db:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: secret
    volumes:
      - dbdata:/var/lib/mysql
    networks:
      - backend
networks:
  frontend:
  backend:`;

/** 表单模式的示例服务（含必填项与几个常用选填项） */
function createExampleForms(): ServiceForm[] {
  const base = createEmptyService(new Set());
  return [
    {
      ...base,
      serviceName: "nginx-web",
      image: "nginx:1.25-alpine",
      container_name: "nginx-web",
      hostname: "nginx",
      restart: "always",
      ports: "80:80\n443:443",
      volumes: "/data/nginx/html:/usr/share/nginx/html:ro",
      environment: "TZ=Asia/Shanghai\nNGINX_WORKER_PROCESSES=4",
      networks: "frontend",
      health_test: "curl -f http://localhost/ || exit 1",
      health_interval: "30s",
      health_timeout: "5s",
      health_retries: "3",
    },
    {
      ...createEmptyService(new Set(["nginx-web"])),
      serviceName: "mysql-db",
      image: "mysql:8.0",
      container_name: "mysql-db",
      restart: "unless-stopped",
      ports: "3306:3306",
      volumes: "/data/mysql:/var/lib/mysql",
      environment:
        "MYSQL_ROOT_PASSWORD=secret123\nMYSQL_DATABASE=appdb\nMYSQL_USER=appuser\nMYSQL_PASSWORD=apppass",
      networks: "backend",
      mem_limit: "512m",
      cpus: "1.5",
      cap_add: "SYS_NICE",
      ulimits: "nofile=65535:65535",
    },
  ];
}

export default function DockerComposePage() {
  const [mode, setMode] = useState<Mode>("command");
  const [input, setInput] = useState(EXAMPLE_COMMANDS);
  const [forms, setForms] = useState<ServiceForm[]>(() => createExampleForms());
  const [activeIdx, setActiveIdx] = useState(0);

  const [output, setOutput] = useState("");
  const [warnings, setWarnings] = useState<ParseWarning[]>([]);
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [serviceCount, setServiceCount] = useState(0);
  const [converted, setConverted] = useState(false);
  const [copied, setCopied] = useState(false);

  // 配置文件模式状态
  const [composeInput, setComposeInput] = useState(EXAMPLE_COMPOSE_YAML);

  // 服务池（用于合并/拆分）
  const [pool, setPool] = useState<PoolService[]>([]);
  const [splitResults, setSplitResults] = useState<SplitResult[]>([]);
  const [splitTabIdx, setSplitTabIdx] = useState(0);
  const [showPool, setShowPool] = useState(false);

  const addToPool = useCallback(
    (source: string, services: { name: string; service: DockerService }[]) => {
      if (services.length === 0) return;
      setPool((prev) => {
        const usedIds = new Set(prev.map((p) => p.id));
        const next = [...prev];
        for (const { name, service } of services) {
          let id = "";
          do {
            id = `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
          } while (usedIds.has(id));
          usedIds.add(id);
          next.push({ id, source, serviceName: name, service });
        }
        return next;
      });
      setShowPool(true);
    },
    []
  );

  const handleConvert = useCallback(() => {
    if (mode === "command") {
      const result = convertDockerCommandsToCompose(input);
      setOutput(result.yaml);
      setWarnings(result.warnings);
      setFormErrors([]);
      setServiceCount(result.serviceCount);
    } else if (mode === "form") {
      const result = formsToComposeYAML(forms);
      setOutput(result.yaml);
      setWarnings([]);
      setFormErrors(result.errors);
      setServiceCount(result.serviceCount);
    } else {
      // compose 模式：解析 YAML 并重新生成规范化 YAML
      const { config, warnings: w } = parseDockerComposeYAML(composeInput);
      const yaml = generateDockerComposeYAML(config);
      setOutput(yaml);
      setWarnings(w);
      setFormErrors([]);
      setServiceCount(Object.keys(config.services).length);
    }
    setConverted(true);
    setSplitResults([]);
  }, [mode, input, forms, composeInput]);

  const handleCopy = useCallback(async () => {
    const content = splitResults.length > 0 ? splitResults[splitTabIdx]?.yaml : output;
    if (!content) return;
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [output, splitResults, splitTabIdx]);

  const handleClear = useCallback(() => {
    if (mode === "command") {
      setInput("");
    } else if (mode === "form") {
      setForms([createEmptyService(new Set())]);
      setActiveIdx(0);
    } else {
      setComposeInput("");
    }
    setOutput("");
    setWarnings([]);
    setFormErrors([]);
    setServiceCount(0);
    setConverted(false);
    setSplitResults([]);
  }, [mode]);

  const handleLoadExample = useCallback(() => {
    if (mode === "command") {
      setInput(EXAMPLE_COMMANDS);
    } else if (mode === "form") {
      setForms(createExampleForms());
      setActiveIdx(0);
    } else {
      setComposeInput(EXAMPLE_COMPOSE_YAML);
    }
    setConverted(false);
  }, [mode]);

  const handleDownload = useCallback(() => {
    const content = splitResults.length > 0 ? splitResults[splitTabIdx]?.yaml : output;
    if (!content) return;
    const blob = new Blob([content], { type: "text/yaml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download =
      splitResults.length > 0
        ? `docker-compose-${splitResults[splitTabIdx]?.name || splitTabIdx}.yml`
        : "docker-compose.yml";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [output, splitResults, splitTabIdx]);

  /** 将当前模式的已生成服务加入服务池 */
  const handleAddToPool = useCallback(() => {
    if (mode === "command") {
      const { config } = parseDockerCommands(input);
      const services = Object.entries(config.services).map(
        ([name, service]: [string, DockerService]) => ({ name, service })
      );
      addToPool("命令模式", services);
    } else if (mode === "form") {
      const services = forms
        .filter((f) => f.serviceName.trim() && f.image.trim())
        .map((f) => ({ name: f.serviceName.trim(), service: formToService(f) }));
      addToPool("表单模式", services);
    } else {
      const { config } = parseDockerComposeYAML(composeInput);
      const services = Object.entries(config.services).map(
        ([name, service]: [string, DockerService]) => ({ name, service })
      );
      addToPool("配置文件", services);
    }
  }, [mode, input, forms, composeInput, addToPool]);

  const handlePoolMerge = useCallback((yaml: string, count: number) => {
    setOutput(yaml);
    setWarnings([]);
    setFormErrors([]);
    setServiceCount(count);
    setConverted(true);
    setSplitResults([]);
  }, []);

  const handlePoolSplit = useCallback((results: SplitResult[]) => {
    setSplitResults(results);
    setSplitTabIdx(0);
    if (results.length > 0) {
      setOutput(results[0].yaml);
      setServiceCount(
        results.reduce((sum, r) => sum + (r.yaml.match(/^\s\s\w/m)?.length || 0), 0)
      );
    }
  }, []);

  const handleRemovePoolItem = useCallback((id: string) => {
    setPool((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const handleClearPool = useCallback(() => {
    setPool([]);
    setSplitResults([]);
  }, []);

  const stats = useMemo(() => {
    if (mode === "command") {
      const lines = input.split("\n").filter((l) => l.trim());
      const runCount = lines.filter((l) =>
        /^(\s*)?(sudo\s+)?docker\s+(container\s+)?run\b/i.test(l)
      ).length;
      return { runCount, totalLines: lines.length };
    }
    if (mode === "form") {
      return { runCount: forms.length, totalLines: forms.length };
    }
    const { config } = parseDockerComposeYAML(composeInput);
    return {
      runCount: Object.keys(config.services).length,
      totalLines: composeInput.split("\n").filter((l) => l.trim()).length,
    };
  }, [mode, input, forms, composeInput]);

  const allNames = useMemo(() => forms.map((f) => f.serviceName.trim()), [forms]);

  const handleFormChange = useCallback(
    (idx: number, next: ServiceForm) => {
      setForms((prev) => prev.map((f, i) => (i === idx ? next : f)));
    },
    []
  );

  const handleAddService = useCallback(() => {
    const used = new Set(allNames);
    const fresh = createEmptyService(used);
    setForms((prev) => [...prev, fresh]);
    setActiveIdx(forms.length);
    setConverted(false);
  }, [allNames, forms.length]);

  const handleRemoveService = useCallback(
    (idx: number) => {
      setForms((prev) => {
        if (prev.length <= 1) return [createEmptyService(new Set())];
        return prev.filter((_, i) => i !== idx);
      });
      setActiveIdx((i) => Math.max(0, i >= idx && i > 0 ? i - 1 : i));
      setConverted(false);
    },
    []
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-950/80">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200"
              title="返回工具箱"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-rose-600 text-white font-bold text-lg shadow-lg shadow-orange-500/25">
              🐳
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                Docker Compose 生成器
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                命令 / 表单 / 配置文件 → docker-compose.yml，支持合并拆分
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* 模式切换 + 操作栏 */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* 模式切换 */}
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-800">
              <button
                onClick={() => setMode("command")}
                className={
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all " +
                  (mode === "command"
                    ? "bg-gradient-to-r from-orange-500 to-rose-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700")
                }
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                命令模式
              </button>
              <button
                onClick={() => setMode("form")}
                className={
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all " +
                  (mode === "form"
                    ? "bg-gradient-to-r from-orange-500 to-rose-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700")
                }
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
                表单模式
              </button>
              <button
                onClick={() => setMode("compose")}
                className={
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all " +
                  (mode === "compose"
                    ? "bg-gradient-to-r from-orange-500 to-rose-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700")
                }
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
                配置文件
              </button>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1 dark:bg-slate-800">
                {mode === "command" ? `${stats.runCount} 条 docker run` : `${stats.runCount} 个服务`}
              </span>
              {converted && serviceCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  已生成 {serviceCount} 个服务
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleLoadExample}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition-all hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              示例
            </button>
            <button
              onClick={handleClear}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition-all hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
              </svg>
              清空
            </button>
            <button
              onClick={handleConvert}
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-orange-500 to-rose-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-orange-500/25 transition-all hover:shadow-xl hover:shadow-orange-500/30 hover:from-orange-600 hover:to-rose-700 active:scale-[0.98]"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              生成 Compose
            </button>
            <button
              onClick={handleAddToPool}
              title="将当前输入解析出的服务加入服务池，用于跨模式合并/拆分"
              className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-600 transition-all hover:bg-indigo-100 dark:border-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 dark:hover:bg-indigo-900/50"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              加入服务池
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* 左侧：输入区（根据模式切换） */}
          <div>
            {mode === "command" ? (
              <>
                <div className="mb-2 flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                    输入
                  </span>
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    支持多条 docker run 命令（`\` 续行、引号、注释）
                  </span>
                </div>
                <div className="relative">
                  <textarea
                    value={input}
                    onChange={(e) => {
                      setInput(e.target.value);
                      setConverted(false);
                    }}
                    spellCheck={false}
                    placeholder={`# 粘贴 docker run 命令，例如：\ndocker run -d \\\n  --name nginx \\\n  -p 80:80 \\\n  -v /data/html:/usr/share/nginx/html \\\n  -e TZ=Asia/Shanghai \\\n  --restart always \\\n  nginx:latest`}
                    className="h-[560px] w-full resize-none rounded-xl border border-slate-200 bg-slate-900 p-4 font-mono text-[13px] leading-relaxed text-slate-100 shadow-sm outline-none transition-colors placeholder:text-slate-600 focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 dark:border-slate-700"
                  />
                </div>
              </>
            ) : mode === "form" ? (
              <>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                      表单
                    </span>
                    <span className="text-xs text-slate-400 dark:text-slate-500">
                      必填 <span className="text-red-500">*</span> · 选填不填则不输出
                    </span>
                  </div>
                  <button
                    onClick={handleAddService}
                    className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition-all hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                    title="新增服务"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    新增服务
                  </button>
                </div>

                {/* 服务标签列表 */}
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {forms.map((f, idx) => (
                    <div
                      key={idx}
                      className={
                        "group inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-all cursor-pointer " +
                        (idx === activeIdx
                          ? "border-orange-400 bg-orange-50 text-orange-700 dark:border-orange-500 dark:bg-orange-900/30 dark:text-orange-300"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700")
                      }
                      onClick={() => setActiveIdx(idx)}
                    >
                      <span className="max-w-[120px] truncate">
                        {f.serviceName || `(未命名 ${idx + 1})`}
                      </span>
                      {!f.image.trim() && (
                        <span className="text-amber-500" title="镜像未填">
                          ⚠
                        </span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveService(idx);
                        }}
                        className="ml-0.5 text-slate-400 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                        title="删除服务"
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>

                {/* 当前服务表单 */}
                <div className="max-h-[560px] overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-700 dark:bg-slate-900/50">
                  {forms[activeIdx] && (
                    <ServiceFormEditor
                      form={forms[activeIdx]}
                      onChange={(next) => handleFormChange(activeIdx, next)}
                      allNames={allNames}
                    />
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="mb-2 flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                    配置文件
                  </span>
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    粘贴已有的 docker-compose.yml，可解析、合并或拆分
                  </span>
                </div>
                <div className="relative">
                  <textarea
                    value={composeInput}
                    onChange={(e) => {
                      setComposeInput(e.target.value);
                      setConverted(false);
                    }}
                    spellCheck={false}
                    placeholder={`# 粘贴 docker-compose.yml 内容\nversion: "3.8"\nservices:\n  web:\n    image: nginx:latest\n    ports:\n      - "80:80"`}
                    className="h-[560px] w-full resize-none rounded-xl border border-slate-200 bg-slate-900 p-4 font-mono text-[13px] leading-relaxed text-slate-100 shadow-sm outline-none transition-colors placeholder:text-slate-600 focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 dark:border-slate-700"
                  />
                </div>
              </>
            )}
          </div>

          {/* 右侧：生成的 compose.yml */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                  输出
                </span>
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  {splitResults.length > 0
                    ? `拆分结果（${splitResults.length} 个文件）`
                    : "docker-compose.yml"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDownload}
                  disabled={!output}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  title="下载 docker-compose.yml"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  下载
                </button>
                <button
                  onClick={handleCopy}
                  disabled={!output}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  {copied ? (
                    <>
                      <svg className="h-3.5 w-3.5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      已复制
                    </>
                  ) : (
                    <>
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      复制
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* 拆分结果标签栏 */}
            {splitResults.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1">
                {splitResults.map((r, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setSplitTabIdx(idx);
                      setOutput(r.yaml);
                    }}
                    className={
                      "rounded-md border px-2.5 py-1 text-xs font-medium transition-all " +
                      (idx === splitTabIdx
                        ? "border-indigo-400 bg-indigo-50 text-indigo-700 dark:border-indigo-500 dark:bg-indigo-900/30 dark:text-indigo-300"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300")
                    }
                  >
                    {r.name}
                  </button>
                ))}
              </div>
            )}

            {output ? (
              <CodeViewer value={output} language="yaml" height="560px" />
            ) : (
              <div className="flex h-[560px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900">
                <div className="mb-3 text-4xl">🐳</div>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {mode === "command"
                    ? "粘贴 docker run 命令后点击「生成 Compose」"
                    : mode === "form"
                    ? "填写表单后点击「生成 Compose」"
                    : "粘贴 docker-compose.yml 后点击「生成 Compose」"}
                </p>
                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                  支持多服务、端口、卷、环境变量、健康检查等
                </p>
              </div>
            )}
          </div>
        </div>

        {/* 表单校验错误 */}
        {converted && formErrors.length > 0 && (
          <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-900/20">
            <div className="mb-2 flex items-center gap-2">
              <svg className="h-5 w-5 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span className="text-sm font-semibold text-red-800 dark:text-red-300">
                {formErrors.length} 项校验错误
              </span>
            </div>
            <ul className="space-y-1.5">
              {formErrors.map((msg, i) => (
                <li key={i} className="flex gap-2 text-xs text-red-700 dark:text-red-400">
                  <span className="mt-0.5 text-red-500">•</span>
                  <span>{msg}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 解析警告（命令模式 / 配置文件模式） */}
        {converted && warnings.length > 0 && (
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-900/20">
            <div className="mb-2 flex items-center gap-2">
              <svg className="h-5 w-5 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                {warnings.length} 条提示
              </span>
            </div>
            <ul className="space-y-1.5">
              {warnings.map((w, i) => (
                <li key={i} className="flex gap-2 text-xs text-amber-700 dark:text-amber-400">
                  <span className="mt-0.5 text-amber-500">•</span>
                  <span>
                    <span className="font-medium">{w.message}</span>
                    <code className="ml-1 rounded bg-amber-100 px-1 py-0.5 font-mono text-[11px] text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                      {w.raw.length > 60 ? w.raw.slice(0, 60) + "…" : w.raw}
                    </code>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 服务池：合并 / 拆分 */}
        <div className="mt-6 rounded-xl border border-indigo-200 bg-indigo-50/30 p-4 dark:border-indigo-900/50 dark:bg-indigo-950/20">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-base">🗂️</span>
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                服务池 — 合并 / 拆分
              </h3>
              {pool.length > 0 && (
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                  {pool.length} 个服务
                </span>
              )}
            </div>
            <button
              onClick={() => setShowPool((v) => !v)}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400"
            >
              {showPool ? "收起 ▲" : pool.length > 0 ? "展开 ▼" : "展开 ▼"}
            </button>
          </div>
          {showPool && (
            <ServicePool
              pool={pool}
              onRemove={handleRemovePoolItem}
              onClear={handleClearPool}
              onMerge={handlePoolMerge}
              onSplit={handlePoolSplit}
            />
          )}
          {showPool && pool.length > 0 && (
            <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
              提示：在任意输入模式中点击「加入服务池」可将当前服务添加到上方。勾选服务后可合并为单个 compose，或开启拆分模式将服务自由分组为多个 compose 文件。
            </p>
          )}
        </div>

        {/* 字段说明图例 */}
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-slate-700 dark:text-slate-300">
              📖 字段说明与必填/选填图例
            </summary>
            <div className="mt-3 space-y-3 text-xs text-slate-600 dark:text-slate-400">
              <div className="flex flex-wrap gap-3">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 dark:bg-slate-800">
                  <span className="text-red-500 font-bold">*</span>
                  <span>必填：服务名、镜像</span>
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 dark:bg-slate-800">
                  <span className="rounded bg-slate-200 px-1 py-0.5 text-[10px] dark:bg-slate-700">选填</span>
                  <span>其余字段全部选填，留空则不输出到 YAML</span>
                </span>
              </div>
              <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {[
                  ["服务名 *", "services 节点 key，小写字母/数字/中划线/下划线，不可数字开头"],
                  ["镜像 *", "image 字段，可含 tag 或 digest"],
                  ["容器名", "--name，固定容器名，跨项目可能冲突"],
                  ["主机名", "--hostname，容器内 hostname"],
                  ["重启策略", "--restart，no/always/unless-stopped/on-failure"],
                  ["运行用户", "--user，UID[:GID]"],
                  ["工作目录", "--workdir，进程 cwd"],
                  ["入口点", "--entrypoint，覆盖镜像 ENTRYPOINT"],
                  ["启动命令", "镜像后位置参数，覆盖 CMD"],
                  ["端口映射", "-p，每行 host:container"],
                  ["内部暴露端口", "--expose，仅同网络可见"],
                  ["加入的网络", "--network，自动归集顶层 networks"],
                  ["主机名解析", "--add-host，每行 host:ip"],
                  ["DNS 服务器", "--dns"],
                  ["卷挂载", "-v，每行 src:dst[:mode]"],
                  ["环境变量", "-e，每行 KEY=VALUE"],
                  ["环境变量文件", "--env-file"],
                  ["临时文件系统", "--tmpfs"],
                  ["设备挂载", "--device"],
                  ["/dev/shm 大小", "--shm-size"],
                  ["内存上限", "-m，如 512m"],
                  ["内存+交换上限", "--memory-swap"],
                  ["CPU 数量", "--cpus，可小数"],
                  ["CPU 权重", "--cpu-shares，默认 1024"],
                  ["绑定 CPU", "--cpuset-cpus，如 0-3"],
                  ["添加能力", "--cap-add，如 SYS_NICE"],
                  ["删除能力", "--cap-drop"],
                  ["安全选项", "--security-opt"],
                  ["内核参数", "--sysctl，每行 KEY=VALUE"],
                  ["ulimit", "--ulimit，每行 name=soft:hard"],
                  ["特权模式", "--privileged，慎用"],
                  ["只读根文件系统", "--read-only"],
                  ["init 进程", "--init"],
                  ["保持 stdin / TTY", "-i / -t"],
                  ["日志驱动", "--log-driver"],
                  ["日志选项", "--log-opt，每行 KEY=VALUE"],
                  ["健康检查命令", "--health-cmd"],
                  ["检查间隔 / 超时 / 重试", "--health-interval / timeout / retries"],
                  ["启动宽限期", "--health-start-period"],
                  ["标签", "-l，每行 KEY=VALUE"],
                ].map(([name, desc]) => (
                  <div key={name} className="flex flex-col gap-0.5 border-l-2 border-slate-100 pl-2 dark:border-slate-800">
                    <code className="font-mono text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                      {name}
                    </code>
                    <span className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                      {desc}
                    </span>
                  </div>
                ))}
              </div>
              <p className="border-t border-slate-100 pt-2 text-[11px] text-slate-400 dark:border-slate-800 dark:text-slate-500">
                表单模式下的每个字段都有内联说明（位于输入框下方）。列表类字段一行一条；键值对类字段以 <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">KEY=VALUE</code> 形式每行一条。
              </p>
            </div>
          </details>
        </div>
      </main>
    </div>
  );
}
