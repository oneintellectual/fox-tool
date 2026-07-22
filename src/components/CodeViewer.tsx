"use client";

import { useRef, useEffect } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, lineNumbers, highlightActiveLine, highlightSpecialChars, drawSelection } from "@codemirror/view";
import { java } from "@codemirror/lang-java";
import { python } from "@codemirror/lang-python";
import { go } from "@codemirror/lang-go";
import { sql } from "@codemirror/lang-sql";
import { oneDark } from "@codemirror/theme-one-dark";
import { bracketMatching, indentOnInput, foldGutter, indentUnit } from "@codemirror/language";
import { SupportedLanguage } from "@/lib/code-generator";

/** 语言到 CodeMirror 语言扩展的映射 */
function getLanguageExtension(lang: SupportedLanguage | string) {
  switch (lang) {
    case "java":
      return java();
    case "python":
      return python();
    case "go":
      return go();
    case "sql":
      return sql();
    default:
      return java();
  }
}

interface CodeViewerProps {
  value: string;
  language: SupportedLanguage | string;
  height?: string;
  darkMode?: boolean;
}

export default function CodeViewer({
  value,
  language,
  height = "600px",
  darkMode = true,
}: CodeViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: valueRef.current,
      extensions: [
        lineNumbers(),
        highlightSpecialChars(),
        drawSelection(),
        highlightActiveLine(),
        foldGutter(),
        indentOnInput(),
        bracketMatching(),
        getLanguageExtension(language),
        darkMode ? oneDark : [],
        // 只读模式
        EditorState.readOnly.of(true),
        EditorView.theme({
          "&": {
            height,
            fontSize: "13px",
          },
          ".cm-scroller": {
            overflow: "auto",
            fontFamily: "'Geist Mono', 'Fira Code', 'JetBrains Mono', monospace",
          },
          ".cm-content": {
            caretColor: "transparent",
          },
          ".cm-cursor": {
            display: "none",
          },
          "&.cm-focused": {
            outline: "none",
          },
          // 只读模式下淡化光标相关样式
          ".cm-activeLine": {
            backgroundColor: darkMode ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
          },
          ".cm-activeLineGutter": {
            backgroundColor: darkMode ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
          },
        }),
        indentUnit.of("    "),
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [language, darkMode, height]);

  // 外部 value 变化时同步
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentDoc = view.state.doc.toString();
    if (currentDoc !== value) {
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: value },
      });
    }
  }, [value]);

  return (
    <div
      ref={containerRef}
      className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm"
    />
  );
}
