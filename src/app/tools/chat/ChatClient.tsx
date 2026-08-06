"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";

/** 对话消息（与 WebLLM ChatCompletionMessageParam 结构兼容） */
interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** 服务端会话记录 */
interface ChatSession {
  id: string;
  title: string;
  model_id: string | null;
  system_prompt: string;
  created_at: number;
  updated_at: number;
}

/** 预置模型列表（WebGPU 浏览器内推理） */
const MODELS = [
  { id: "Qwen2-1.5B-Instruct-q4f32_1-MLC", label: "Qwen2 1.5B（中文友好 · WASM 已内嵌，约 1.5GB 权重）", size: "1.5GB", local: true },
  { id: "Qwen2.5-1.5B-Instruct-q4f32_1-MLC", label: "Qwen2.5 1.5B（中文友好，约 1.5GB）", size: "1.5GB", local: false },
  { id: "Qwen2.5-3B-Instruct-q4f16_1-MLC", label: "Qwen2.5 3B（中文友好，约 2GB）", size: "2GB", local: false },
  { id: "Llama-3.2-1B-Instruct-q4f32_1-MLC", label: "Llama 3.2 1B（英文，约 1GB）", size: "1GB", local: false },
  { id: "Llama-3.2-3B-Instruct-q4f16_1-MLC", label: "Llama 3.2 3B（英文，约 2GB）", size: "2GB", local: false },
  { id: "SmolLM2-360M-Instruct-q4f16_1-MLC", label: "SmolLM2 360M（超小，快速测试，约 360MB）", size: "360MB", local: false },
  { id: "Phi-3.5-mini-instruct-q4f16_1-MLC", label: "Phi 3.5 mini（约 2GB）", size: "2GB", local: false },
] as const;

/** 本地内嵌的 WASM 模型库覆盖：model_id → 本地 wasm 路径 */
const LOCAL_MODEL_LIBS: Record<string, string> = {
  "Qwen2-1.5B-Instruct-q4f32_1-MLC": "/web-llm/Qwen2-1.5B-Instruct-q4f32_1_cs1k-webgpu.wasm",
};

type Status = "idle" | "loading" | "ready" | "generating" | "error";

export default function ChatClient() {
  // ---- 会话列表与当前会话 ----
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessionsLoading, setSessionsLoading] = useState(true);

  // ---- 模型与对话状态 ----
  const [selectedModel, setSelectedModel] = useState<string>(MODELS[0].id);
  const [status, setStatus] = useState<Status>("idle");
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadText, setLoadText] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("你是一个有帮助的助手。");
  const [errorMsg, setErrorMsg] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // WebLLM 引擎实例（动态加载，避免 SSR）
  type WebLLMEngine = Awaited<ReturnType<typeof import("@mlc-ai/web-llm")["CreateMLCEngine"]>>;
  const engineRef = useRef<WebLLMEngine | null>(null);
  const [loadedModel, setLoadedModel] = useState<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // WebGPU 兼容性检测（useSyncExternalStore 保证 SSR/水合一致）
  const gpuSupported = useSyncExternalStore(
    () => () => {},
    () => !!(navigator as unknown as { gpu?: unknown }).gpu,
    () => null
  );

  // ---- API 调用封装 ----
  const apiFetch = useCallback(async (url: string, opts?: RequestInit) => {
    const res = await fetch(url, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `请求失败 ${res.status}`);
    return data;
  }, []);

  // ---- 加载会话列表 ----
  const refreshSessions = useCallback(async () => {
    try {
      const data = await apiFetch("/api/chat/sessions");
      setSessions(data.sessions || []);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setSessionsLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    // 首次挂载拉取会话列表（异步数据获取属于 effect 合法用途）
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshSessions();
  }, [refreshSessions]);

  // ---- 新建会话 ----
  const handleNewSession = useCallback(async () => {
    try {
      const data = await apiFetch("/api/chat/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "新对话", model_id: selectedModel, system_prompt: systemPrompt }),
      });
      setSessions((s) => [data.session, ...s]);
      setCurrentSessionId(data.session.id);
      setMessages([]);
      setErrorMsg("");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
    }
  }, [apiFetch, selectedModel, systemPrompt]);

  // ---- 切换会话：加载历史消息 ----
  const handleSelectSession = useCallback(async (sessionId: string) => {
    if (sessionId === currentSessionId) return;
    setCurrentSessionId(sessionId);
    setErrorMsg("");
    try {
      const data = await apiFetch(`/api/chat/sessions/${sessionId}`);
      // 加载历史消息到 UI
      const msgs: ChatMessage[] = (data.messages || []).map((m: { role: string; content: string }) => ({
        role: m.role as ChatMessage["role"],
        content: m.content,
      }));
      setMessages(msgs);
      // 同步会话配置
      if (data.session.model_id) setSelectedModel(data.session.model_id);
      if (typeof data.session.system_prompt === "string") setSystemPrompt(data.session.system_prompt);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setMessages([]);
    }
  }, [apiFetch, currentSessionId]);

  // ---- 重命名会话 ----
  const handleRenameSession = useCallback(async (sessionId: string, title: string) => {
    try {
      const data = await apiFetch(`/api/chat/sessions/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      setSessions((s) => s.map((it) => (it.id === sessionId ? data.session : it)));
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
    }
  }, [apiFetch]);

  // ---- 删除会话 ----
  const handleDeleteSession = useCallback(async (sessionId: string) => {
    try {
      await apiFetch(`/api/chat/sessions/${sessionId}`, { method: "DELETE" });
      setSessions((s) => s.filter((it) => it.id !== sessionId));
      if (currentSessionId === sessionId) {
        setCurrentSessionId(null);
        setMessages([]);
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
    }
  }, [apiFetch, currentSessionId]);

  // ---- 保存消息到后端 ----
  const saveMessage = useCallback(async (sessionId: string, role: ChatMessage["role"], content: string) => {
    try {
      await apiFetch(`/api/chat/sessions/${sessionId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, content }),
      });
      // 刷新会话列表（更新 updated_at 排序）
      refreshSessions();
    } catch (e) {
      console.error("保存消息失败", e);
    }
  }, [apiFetch, refreshSessions]);

  // 自动滚动到底部
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, status]);

  // 加载模型
  const loadModel = useCallback(async (modelId: string) => {
    if (loadedModel === modelId && engineRef.current) {
      setStatus("ready");
      return;
    }
    setStatus("loading");
    setLoadProgress(0);
    setLoadText("正在加载模型...");
    setErrorMsg("");
    try {
      if (engineRef.current) {
        await engineRef.current.unload();
        engineRef.current = null;
      }
      const webllm = await import("@mlc-ai/web-llm");
      const modelList = webllm.prebuiltAppConfig.model_list.map((m) => {
        const localLib = LOCAL_MODEL_LIBS[m.model_id];
        if (localLib) return { ...m, model_lib: localLib };
        return m;
      });
      const engine = await webllm.CreateMLCEngine(modelId, {
        appConfig: { ...webllm.prebuiltAppConfig, model_list: modelList },
        initProgressCallback: (report: { progress: number; text: string }) => {
          setLoadProgress(report.progress);
          setLoadText(report.text);
        },
      });
      engineRef.current = engine;
      setLoadedModel(modelId);
      setStatus("ready");
      // 同步模型选择到当前会话（合并为一次 PATCH）
      if (currentSessionId) {
        await apiFetch(`/api/chat/sessions/${currentSessionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model_id: modelId, system_prompt: systemPrompt }),
        });
        refreshSessions();
      }
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }, [loadedModel, currentSessionId, systemPrompt, apiFetch, refreshSessions]);

  const isBusy = status === "loading" || status === "generating";
  const ready = status === "ready" || status === "generating";

  // 发送消息（流式 + 后端持久化）
  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || isBusy) return;
    // 未加载模型时给提示，不阻塞输入
    if (!engineRef.current || status !== "ready") {
      setErrorMsg("请先在设置中加载模型，再发送消息。");
      return;
    }

    // 自动创建会话（如未选择）
    let sessionId = currentSessionId;
    if (!sessionId) {
      try {
        const data = await apiFetch("/api/chat/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: text.slice(0, 24), model_id: selectedModel, system_prompt: systemPrompt }),
        });
        sessionId = data.session.id;
        setSessions((s) => [data.session, ...s]);
        setCurrentSessionId(sessionId);
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : String(e));
        return;
      }
    }

    const userMsg: ChatMessage = { role: "user", content: text };
    const history: ChatMessage[] = [
      ...(systemPrompt.trim() ? [{ role: "system" as const, content: systemPrompt.trim() }] : []),
      ...messages,
      userMsg,
    ];
    setMessages((m) => [...m, userMsg, { role: "assistant", content: "" }]);
    setInput("");
    setStatus("generating");

    // 保存用户消息到后端
    saveMessage(sessionId!, "user", text);

    try {
      const stream = await engineRef.current.chat.completions.create({
        messages: history,
        stream: true,
        temperature: 0.7,
      });
      let assistantText = "";
      for await (const chunk of stream) {
        const delta = (chunk as { choices?: { delta?: { content?: string } }[] }).choices?.[0]?.delta?.content ?? "";
        if (delta) {
          assistantText += delta;
          setMessages((m) => {
            const copy = [...m];
            copy[copy.length - 1] = { role: "assistant", content: assistantText };
            return copy;
          });
        }
      }
      setStatus("ready");
      // 保存 assistant 回复到后端
      saveMessage(sessionId!, "assistant", assistantText);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setStatus("error");
      setMessages((m) => {
        if (m.length > 0 && m[m.length - 1].role === "assistant" && m[m.length - 1].content === "") {
          return m.slice(0, -1);
        }
        return m;
      });
    }
  }, [input, status, isBusy, currentSessionId, messages, systemPrompt, selectedModel, apiFetch, saveMessage]);

  // 停止生成
  const stopGenerate = useCallback(() => {
    engineRef.current?.interruptGenerate();
    setStatus("ready");
  }, []);

  // 卸载清理
  useEffect(() => {
    return () => {
      engineRef.current?.unload().catch(() => {});
    };
  }, []);

  // Enter 发送，Shift+Enter 换行
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }, [sendMessage]);

  const currentSession = sessions.find((s) => s.id === currentSessionId);

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      {/* 侧边栏 */}
      <aside className={`${sidebarOpen ? "w-64" : "w-0"} flex-shrink-0 overflow-hidden border-r border-slate-200/80 bg-white/70 backdrop-blur-xl transition-all duration-200 dark:border-slate-800/80 dark:bg-slate-950/70`}>
        <div className="flex h-full w-64 flex-col">
          <div className="p-3">
            <button
              onClick={handleNewSession}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              新建对话
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-2">
            {sessionsLoading ? (
              <p className="px-2 py-4 text-center text-xs text-slate-400">加载中...</p>
            ) : sessions.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-slate-400">暂无历史对话</p>
            ) : (
              sessions.map((s) => (
                <SessionItem
                  key={s.id}
                  session={s}
                  active={s.id === currentSessionId}
                  onSelect={() => handleSelectSession(s.id)}
                  onRename={(title) => handleRenameSession(s.id, title)}
                  onDelete={() => handleDeleteSession(s.id)}
                />
              ))
            )}
          </div>
        </div>
      </aside>

      {/* 主区域 */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <header className="border-b border-slate-200/80 bg-white/70 backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-950/70">
          <div className="flex items-center gap-3 px-4 py-3.5">
            <button
              onClick={() => setSidebarOpen((s) => !s)}
              className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              title={sidebarOpen ? "收起侧边栏" : "展开侧边栏"}
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <Link href="/" className="flex items-center gap-2 text-slate-500 transition hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/25">
              💬
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="truncate text-lg font-bold text-slate-900 dark:text-white">
                {currentSession?.title || "AI 对话"}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">WebGPU 浏览器本地推理 · 对话历史服务端存储</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                gpuSupported === null ? "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                : gpuSupported ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
                : "bg-rose-50 text-rose-600 dark:bg-rose-950 dark:text-rose-400"
              }`}>
                <span className={`h-1.5 w-1.5 rounded-full ${gpuSupported ? "bg-emerald-500" : gpuSupported === false ? "bg-rose-500" : "bg-slate-400"}`} />
                {gpuSupported === null ? "检测中" : gpuSupported ? "WebGPU 可用" : "WebGPU 不可用"}
              </span>
              <button
                onClick={() => setShowSettings((s) => !s)}
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                title="设置"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>
          </div>

          {/* 设置面板 */}
          {showSettings && (
            <div className="border-t border-slate-200/80 bg-white/50 px-4 py-4 dark:border-slate-800/80 dark:bg-slate-950/50">
              <div className="space-y-3">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">模型选择</label>
                  <div className="flex gap-2">
                    <select
                      value={selectedModel}
                      onChange={(e) => setSelectedModel(e.target.value)}
                      disabled={isBusy}
                      className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    >
                      {MODELS.map((m) => (
                        <option key={m.id} value={m.id}>{m.label}</option>
                      ))}
                    </select>
                    <button
                      onClick={() => loadModel(selectedModel)}
                      disabled={isBusy || !gpuSupported}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {loadedModel === selectedModel && status === "ready" ? "已加载" : "加载模型"}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">系统提示词</label>
                  <textarea
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    disabled={isBusy}
                    rows={2}
                    className="w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    placeholder="设定助手的人设或行为约束"
                  />
                </div>
              </div>
            </div>
          )}
        </header>

        {/* WebGPU 不支持提示 */}
        {gpuSupported === false && (
          <div className="mx-auto mt-4 w-full max-w-4xl px-4">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
              <p className="font-semibold">当前浏览器不支持 WebGPU</p>
              <p className="mt-1">请使用 Chrome/Edge 113+ 或 Safari 18+，并在设置中启用 WebGPU。Firefox 需在 about:config 中启用 <code className="rounded bg-amber-100 px-1 dark:bg-amber-900">dom.webgpu.enabled</code>。</p>
            </div>
          </div>
        )}

        {/* 加载进度 */}
        {status === "loading" && (
          <div className="mx-auto mt-4 w-full max-w-4xl px-4">
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950">
              <div className="flex items-center justify-between text-sm text-blue-700 dark:text-blue-300">
                <span>{loadText || "正在加载模型..."}</span>
                <span>{Math.round(loadProgress * 100)}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-blue-100 dark:bg-blue-900">
                <div className="h-full rounded-full bg-blue-500 transition-all duration-300" style={{ width: `${loadProgress * 100}%` }} />
              </div>
              <p className="mt-2 text-xs text-blue-500 dark:text-blue-400">首次加载需下载模型权重，已加载的模型会被浏览器缓存</p>
            </div>
          </div>
        )}

        {/* 错误提示 */}
        {errorMsg && (
          <div className="mx-auto mt-4 w-full max-w-4xl px-4">
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
              <p className="font-semibold">发生错误</p>
              <p className="mt-1 break-words">{errorMsg}</p>
            </div>
          </div>
        )}

        {/* 消息区 */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-4xl px-4 py-6">
            {messages.length === 0 && status !== "loading" && (
              <EmptyState ready={ready} gpuSupported={gpuSupported} onLoad={() => loadModel(selectedModel)} />
            )}
            {/* 查看历史会话但模型未加载时，引导加载模型以继续对话 */}
            {messages.length > 0 && status !== "ready" && status !== "generating" && gpuSupported && (
              <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                      {status === "loading" ? "正在加载模型..." : "模型未加载"}
                    </p>
                    <p className="mt-0.5 text-xs text-blue-600 dark:text-blue-400">
                      {status === "loading"
                        ? `加载进度 ${Math.round(loadProgress * 100)}%，请稍候`
                        : `加载模型后即可基于当前 ${messages.length} 条历史消息继续对话（上下文已保留）`}
                    </p>
                  </div>
                  {status !== "loading" && (
                    <button
                      onClick={() => loadModel(selectedModel)}
                      className="flex-shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
                    >
                      加载模型
                    </button>
                  )}
                </div>
              </div>
            )}
            {messages.map((msg, i) => (
              <MessageBubble key={i} message={msg} streaming={status === "generating" && i === messages.length - 1 && msg.role === "assistant"} />
            ))}
          </div>
        </div>

        {/* 输入区 */}
        <div className="border-t border-slate-200/80 bg-white/80 backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-950/80">
          <div className="mx-auto max-w-4xl px-4 py-3">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isBusy}
                rows={1}
                placeholder={ready ? "输入消息，Enter 发送，Shift+Enter 换行" : "输入消息（需先在设置中加载模型才能发送）"}
                className="max-h-40 flex-1 resize-none rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                style={{ minHeight: 48 }}
              />
              {status === "generating" ? (
                <button
                  onClick={stopGenerate}
                  className="flex h-12 items-center gap-1.5 rounded-xl bg-rose-600 px-4 text-sm font-medium text-white transition hover:bg-rose-700"
                >
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                  停止
                </button>
              ) : (
                <button
                  onClick={sendMessage}
                  disabled={isBusy || !input.trim()}
                  className="flex h-12 items-center gap-1.5 rounded-xl bg-blue-600 px-5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                  发送
                </button>
              )}
            </div>
            <div className="mt-2 flex items-center justify-between">
              <p className="text-xs text-slate-400 dark:text-slate-500">
                推理在浏览器本地进行 · 对话历史存储于服务端 SQLite
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                {currentSession ? `会话: ${currentSession.title}` : "未选择会话"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** 会话列表项（支持内联重命名与删除） */
function SessionItem({
  session,
  active,
  onSelect,
  onRename,
  onDelete,
}: {
  session: ChatSession;
  active: boolean;
  onSelect: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  // 用 key 在 session.title 变化时重置内部 title 状态，避免在 effect 中 setState
  return (
    <SessionItemInner
      key={session.id + session.title}
      session={session}
      active={active}
      onSelect={onSelect}
      onRename={onRename}
      onDelete={onDelete}
      editing={editing}
      setEditing={setEditing}
    />
  );
}

function SessionItemInner({
  session,
  active,
  onSelect,
  onRename,
  onDelete,
  editing,
  setEditing,
}: {
  session: ChatSession;
  active: boolean;
  onSelect: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
  editing: boolean;
  setEditing: (b: boolean) => void;
}) {
  const [title, setTitle] = useState(session.title);

  const commitRename = useCallback(() => {
    const t = title.trim();
    if (t && t !== session.title) onRename(t);
    else setTitle(session.title);
    setEditing(false);
  }, [title, session.title, onRename, setEditing]);

  return (
    <div className={`group mb-0.5 flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm transition ${
      active ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
      : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
    }`}>
      {editing ? (
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") { setTitle(session.title); setEditing(false); }
          }}
          className="flex-1 rounded border border-blue-400 bg-white px-1.5 py-0.5 text-sm outline-none dark:bg-slate-900 dark:text-slate-100"
        />
      ) : (
        <button onClick={onSelect} className="flex-1 truncate text-left" title={session.title}>
          {session.title || "未命名"}
        </button>
      )}
      {!editing && (
        <div className="hidden group-hover:flex items-center gap-0.5">
          <button
            onClick={(e) => { e.stopPropagation(); setEditing(true); }}
            className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
            title="重命名"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="rounded p-1 text-slate-400 hover:bg-rose-100 hover:text-rose-600 dark:hover:bg-rose-900 dark:hover:text-rose-400"
            title="删除"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

/** 空状态引导 */
function EmptyState({ ready, gpuSupported, onLoad }: { ready: boolean; gpuSupported: boolean | null; onLoad: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-3xl shadow-lg shadow-emerald-500/25">
        💬
      </div>
      <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">AI 对话 · 浏览器本地推理</h2>
      <p className="mt-2 max-w-md text-sm text-slate-500 dark:text-slate-400">
        基于 WebLLM + WebGPU，模型完全在你的浏览器内运行；对话历史持久化到服务端 SQLite。
      </p>
      {!ready && gpuSupported && (
        <button
          onClick={onLoad}
          className="mt-6 rounded-xl bg-blue-600 px-6 py-3 text-sm font-medium text-white transition hover:bg-blue-700"
        >
          加载模型开始对话
        </button>
      )}
      {ready && (
        <p className="mt-6 text-sm text-slate-500 dark:text-slate-400">在下方输入框开始对话吧</p>
      )}
    </div>
  );
}

/** 消息气泡 */
function MessageBubble({ message, streaming }: { message: ChatMessage; streaming: boolean }) {
  const isUser = message.role === "user";
  return (
    <div className={`mb-4 flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`flex max-w-[85%] gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
        <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-sm font-bold ${
          isUser ? "bg-blue-500 text-white" : "bg-gradient-to-br from-emerald-500 to-teal-600 text-white"
        }`}>
          {isUser ? "我" : "AI"}
        </div>
        <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? "bg-blue-600 text-white"
            : "border border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        }`}>
          {message.content === "" && streaming ? (
            <span className="inline-flex items-center gap-1 text-slate-400">
              <span className="h-2 w-2 animate-pulse rounded-full bg-slate-400" />
              思考中...
            </span>
          ) : (
            <MessageContent content={message.content} />
          )}
        </div>
      </div>
    </div>
  );
}

/** 消息内容渲染：代码块 + 行内 code + 换行 */
function MessageContent({ content }: { content: string }) {
  const parts = useMemo(() => parseContent(content), [content]);
  return (
    <>
      {parts.map((part, i) => {
        if (part.type === "code") {
          return (
            <pre key={i} className="my-2 overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100 dark:bg-black">
              {part.lang && <div className="mb-1 text-[10px] uppercase text-slate-400">{part.lang}</div>}
              <code className="font-mono">{part.text}</code>
            </pre>
          );
        }
        if (part.type === "inline-code") {
          return <code key={i} className="rounded bg-black/10 px-1 py-0.5 font-mono text-xs dark:bg-white/10">{part.text}</code>;
        }
        return <span key={i} className="whitespace-pre-wrap">{part.text}</span>;
      })}
    </>
  );
}

type ContentPart =
  | { type: "text"; text: string }
  | { type: "code"; text: string; lang?: string }
  | { type: "inline-code"; text: string };

/** 解析内容：拆分代码块和行内代码 */
function parseContent(content: string): ContentPart[] {
  const parts: ContentPart[] = [];
  const regex = /(```[\s\S]*?```|`[^`\n]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", text: content.slice(lastIndex, match.index) });
    }
    const token = match[0];
    if (token.startsWith("```")) {
      const inner = token.slice(3, -3);
      const nl = inner.indexOf("\n");
      const lang = nl > 0 ? inner.slice(0, nl).trim() : "";
      const text = nl > 0 ? inner.slice(nl + 1) : inner;
      parts.push({ type: "code", text, lang: lang || undefined });
    } else {
      parts.push({ type: "inline-code", text: token.slice(1, -1) });
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < content.length) {
    parts.push({ type: "text", text: content.slice(lastIndex) });
  }
  return parts;
}
