import React, { useMemo, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ModuleExport, ToolPageProps } from "./types";

const metadata = {
  id: "text-counter",
  name: "文本统计器",
  version: "1.0.0",
  description: "统计文本的字符数、单词数、行数，演示 Fox Tool 外部模块的完整生命周期与渲染流程",
  icon: "🔢",
  entry: "src/index.tsx",
  frameworkVersion: "^0.1.0",
};

function App({ framework }: ToolPageProps) {
  const [text, setText] = useState<string>(String(framework.getConfig("lastText") ?? ""));

  const stats = useMemo(() => {
    const chars = text.length;
    const charsNoSpace = text.replace(/\s/g, "").length;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const lines = text ? text.split("\n").length : 0;
    return { chars, charsNoSpace, words, lines };
  }, [text]);

  const handleChange = (v: string) => {
    setText(v);
    framework.setConfig("lastText", v);
  };

  const blocks = [
    { label: "字符数", value: stats.chars, color: "text-blue-600" },
    { label: "不含空格", value: stats.charsNoSpace, color: "text-emerald-600" },
    { label: "单词数", value: stats.words, color: "text-violet-600" },
    { label: "行数", value: stats.lines, color: "text-amber-600" },
  ];

  return (
    <div style={{ padding: 24, fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
        <span>🔢 文本统计器</span>
        <span style={{ fontSize: 12, color: "#94a3b8", fontWeight: 400 }}>v1.0.0</span>
      </h1>
      <p style={{ color: "#64748b", marginTop: 4, fontSize: 14 }}>
        粘贴或输入文本，实时统计字符/单词/行数。最后输入内容会通过框架 API 持久化。
      </p>

      <textarea
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="在此输入文本…"
        style={{
          marginTop: 16,
          width: "100%",
          minHeight: 180,
          padding: 12,
          borderRadius: 12,
          border: "1px solid #e2e8f0",
          background: "#fff",
          fontSize: 14,
          fontFamily: "monospace",
          resize: "vertical",
          outline: "none",
          boxSizing: "border-box",
        }}
      />

      <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {blocks.map((b) => (
          <div
            key={b.label}
            style={{
              padding: 16,
              borderRadius: 12,
              border: "1px solid #e2e8f0",
              background: "#fff",
              textAlign: "center",
            }}
          >
            <div style={{ fontSize: 24, fontWeight: 700 }} className={b.color}>
              {b.value}
            </div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{b.label}</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
        <button
          onClick={() => framework.toast(`已统计 ${stats.chars} 个字符`, "success")}
          style={btnStyle}
        >
          调用框架 toast
        </button>
        <button
          onClick={() => handleChange("")}
          style={{ ...btnStyle, color: "#ef4444", borderColor: "#fecaca" }}
        >
          清空
        </button>
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: "8px 16px",
  borderRadius: 8,
  border: "1px solid #e2e8f0",
  background: "#fff",
  cursor: "pointer",
  fontSize: 14,
};

const moduleExport: ModuleExport = {
  metadata,

  lifecycle: {
    install: async (ctx) => {
      ctx.logger.info("[text-counter] install 钩子执行");
    },
    activate: async (ctx) => {
      ctx.logger.info("[text-counter] 已激活", ctx.moduleId, ctx.version);
    },
    deactivate: async (ctx) => {
      ctx.logger.info("[text-counter] 已停用");
    },
    uninstall: async (ctx) => {
      ctx.logger.info("[text-counter] 已卸载");
    },
    update: async (from, ctx) => {
      ctx.logger.info(`[text-counter] 从 ${from} 更新到 ${ctx.version}`);
    },
  },

  /** 暴露给其他模块调用的 API（受依赖声明约束） */
  api: {
    countWords: (text: unknown) => {
      const s = typeof text === "string" ? text : String(text ?? "");
      return s.trim() ? s.trim().split(/\s+/).length : 0;
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
