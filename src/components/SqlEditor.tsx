"use client";

import { useRef, useEffect } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection, rectangularSelection, highlightSpecialChars, placeholder as cmPlaceholder } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { sql, MySQL } from "@codemirror/lang-sql";
import { oneDark } from "@codemirror/theme-one-dark";
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { bracketMatching } from "@codemirror/language";
import { lintKeymap } from "@codemirror/lint";

interface SqlEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  height?: string;
  darkMode?: boolean;
}

export default function SqlEditor({
  value,
  onChange,
  placeholder = "请输入 CREATE TABLE 的 DDL 语句...",
  height = "280px",
  darkMode = true,
}: SqlEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const valueRef = useRef(value);
  valueRef.current = value;

  // 初始化编辑器
  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: valueRef.current,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        drawSelection(),
        EditorState.allowMultipleSelections.of(true),
        rectangularSelection(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        keymap.of([
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...completionKeymap,
          ...lintKeymap,
          indentWithTab,
        ]),
        sql({ dialect: MySQL }),
        autocompletion(),
        closeBrackets(),
        bracketMatching(),
        darkMode ? oneDark : [],
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
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
            caretColor: darkMode ? "#5eead4" : "#3b82f6",
          },
          "&.cm-focused": {
            outline: "none",
          },
        }),
        placeholder
          ? cmPlaceholder(placeholder)
          : [],
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
    // 只在挂载时初始化
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [darkMode, height, placeholder]);

  // 外部 value 变化时同步到编辑器
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
