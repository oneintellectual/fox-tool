"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  DiagramType,
  DiagramData,
  DiagramNode,
  DiagramEdge,
  DiagramZone,
  NodeType,
  LayoutDirection,
  EdgeStyle,
  NODE_TYPE_CONFIG,
  ZONE_PRESET_COLORS,
  ZONE_PRESETS,
  getNodeTypesByDiagram,
  genId,
} from "@/lib/diagram-types";

const DiagramCanvas = dynamic(
  () => import("@/components/DiagramCanvas").then((m) => m.DiagramCanvas),
  { ssr: false }
);

/** 软件施工图示例模板 */
const SOFTWARE_TEMPLATE: DiagramData = {
  type: "software",
  title: "电商系统架构图",
  zones: [
    { id: "z1", name: "接入层", color: "#06b6d4", description: "前端与网关" },
    { id: "z2", name: "应用层", color: "#3b82f6", description: "业务服务" },
    { id: "z3", name: "数据层", color: "#f59e0b", description: "存储与中间件" },
    { id: "z4", name: "外部依赖", color: "#64748b", description: "第三方服务" },
  ],
  nodes: [
    { id: "n1", name: "Web 前端", type: "frontend", note: "React", zoneId: "z1" },
    { id: "n2", name: "APP 客户端", type: "client", note: "iOS/Android", zoneId: "z1" },
    { id: "n3", name: "API 网关", type: "gateway", note: "Nginx", zoneId: "z1" },
    { id: "n4", name: "用户服务", type: "backend", zoneId: "z2" },
    { id: "n5", name: "商品服务", type: "backend", zoneId: "z2" },
    { id: "n6", name: "订单服务", type: "backend", zoneId: "z2" },
    { id: "n7", name: "MySQL", type: "database", note: "主从", zoneId: "z3" },
    { id: "n8", name: "Redis", type: "cache", zoneId: "z3" },
    { id: "n9", name: "RocketMQ", type: "queue", zoneId: "z3" },
    { id: "n10", name: "支付中心", type: "external", zoneId: "z4" },
  ],
  edges: [
    { id: "e1", from: "前端→网关", fromNodeId: "n1", toNodeId: "n3" },
    { id: "e2", from: "APP→网关", fromNodeId: "n2", toNodeId: "n3" },
    { id: "e3", from: "网关→用户", fromNodeId: "n3", toNodeId: "n4" },
    { id: "e4", from: "网关→商品", fromNodeId: "n3", toNodeId: "n5" },
    { id: "e5", from: "网关→订单", fromNodeId: "n3", toNodeId: "n6" },
    { id: "e6", from: "用户→MySQL", fromNodeId: "n4", toNodeId: "n7" },
    { id: "e7", from: "商品→MySQL", fromNodeId: "n5", toNodeId: "n7" },
    { id: "e8", from: "商品→Redis", fromNodeId: "n5", toNodeId: "n8" },
    { id: "e9", from: "订单→MySQL", fromNodeId: "n6", toNodeId: "n7" },
    { id: "e10", from: "订单→MQ", fromNodeId: "n6", toNodeId: "n9", label: "异步" },
    { id: "e11", from: "订单→支付", fromNodeId: "n6", toNodeId: "n10", label: "调用" },
  ],
};

/** 网络拓扑图示例模板 */
const NETWORK_TEMPLATE: DiagramData = {
  type: "network",
  title: "企业网络拓扑图",
  zones: [
    { id: "z1", name: "互联网区", color: "#64748b", description: "不可信外部网络" },
    { id: "z2", name: "DMZ 区", color: "#f97316", description: "对外服务隔离区" },
    { id: "z3", name: "核心区", color: "#3b82f6", description: "核心业务网络" },
    { id: "z4", name: "数据区", color: "#06b6d4", description: "数据库与存储" },
    { id: "z5", name: "办公区", color: "#8b5cf6", description: "内部办公终端" },
  ],
  nodes: [
    { id: "n1", name: "互联网", type: "internet", zoneId: "z1" },
    { id: "n2", name: "边界防火墙", type: "firewall", zoneId: "z2" },
    { id: "n3", name: "核心路由器", type: "router", zoneId: "z3" },
    { id: "n4", name: "核心交换机", type: "switch", zoneId: "z3" },
    { id: "n5", name: "负载均衡", type: "loadbalancer", zoneId: "z3" },
    { id: "n6", name: "Web 服务器", type: "server", note: "x2", zoneId: "z3" },
    { id: "n7", name: "应用服务器", type: "server", note: "x2", zoneId: "z3" },
    { id: "n8", name: "数据库服务器", type: "server", zoneId: "z4" },
    { id: "n9", name: "办公区终端", type: "client", zoneId: "z5" },
    { id: "n10", name: "云服务", type: "cloud", zoneId: "z1" },
  ],
  edges: [
    { id: "e1", from: "互联网→防火墙", fromNodeId: "n1", toNodeId: "n2" },
    { id: "e2", from: "防火墙→路由", fromNodeId: "n2", toNodeId: "n3" },
    { id: "e3", from: "路由→交换", fromNodeId: "n3", toNodeId: "n4" },
    { id: "e4", from: "交换→LB", fromNodeId: "n4", toNodeId: "n5" },
    { id: "e5", from: "LB→Web", fromNodeId: "n5", toNodeId: "n6", label: "HTTP" },
    { id: "e6", from: "Web→App", fromNodeId: "n6", toNodeId: "n7" },
    { id: "e7", from: "App→DB", fromNodeId: "n7", toNodeId: "n8", label: "TCP" },
    { id: "e8", from: "交换→终端", fromNodeId: "n4", toNodeId: "n9" },
    { id: "e9", from: "路由→云", fromNodeId: "n3", toNodeId: "n10", label: "VPN", dashed: true },
  ],
};

export default function DiagramPage() {
  const [data, setData] = useState<DiagramData>(SOFTWARE_TEMPLATE);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<{ exportSVG: () => string }>(null);

  // 节点表单状态
  const [nodeForm, setNodeForm] = useState({
    name: "",
    type: "frontend" as NodeType,
    note: "",
    zoneId: "" as string,
  });
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);

  // 连线表单状态
  const [edgeForm, setEdgeForm] = useState({
    from: "",
    fromNodeId: "",
    toNodeId: "",
    label: "",
    dashed: false,
    edgeStyle: "" as EdgeStyle | "", // 空字符串表示跟随全局
  });
  const [editingEdgeId, setEditingEdgeId] = useState<string | null>(null);

  // 区域表单状态
  const [zoneForm, setZoneForm] = useState({
    name: "",
    color: ZONE_PRESET_COLORS[0],
    description: "",
  });
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);

  const availableNodeTypes = useMemo(
    () => getNodeTypesByDiagram(data.type),
    [data.type]
  );

  /** 切换图表类型时加载对应模板 */
  const handleTypeChange = useCallback((type: DiagramType) => {
    if (type === data.type) return;
    const template = type === "software" ? SOFTWARE_TEMPLATE : NETWORK_TEMPLATE;
    // 深拷贝模板避免引用共享
    setData(JSON.parse(JSON.stringify(template)));
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setEditingNodeId(null);
    setEditingEdgeId(null);
    setEditingZoneId(null);
    setNodeForm({ name: "", type: getNodeTypesByDiagram(type)[0], note: "", zoneId: "" });
    setEdgeForm({ from: "", fromNodeId: "", toNodeId: "", label: "", dashed: false, edgeStyle: "" });
    setZoneForm({ name: "", color: ZONE_PRESET_COLORS[0], description: "" });
  }, [data.type]);

  // ---- 节点 CRUD ----
  const handleNodeSubmit = useCallback(() => {
    if (!nodeForm.name.trim()) return;
    const zoneId = nodeForm.zoneId || undefined;
    if (editingNodeId) {
      setData((d) => ({
        ...d,
        nodes: d.nodes.map((n) =>
          n.id === editingNodeId
            ? { ...n, name: nodeForm.name.trim(), type: nodeForm.type, note: nodeForm.note.trim() || undefined, zoneId }
            : n
        ),
      }));
      setEditingNodeId(null);
    } else {
      const newNode: DiagramNode = {
        id: genId("node"),
        name: nodeForm.name.trim(),
        type: nodeForm.type,
        note: nodeForm.note.trim() || undefined,
        zoneId,
      };
      setData((d) => ({ ...d, nodes: [...d.nodes, newNode] }));
    }
    setNodeForm({ name: "", type: nodeForm.type, note: "", zoneId: nodeForm.zoneId });
  }, [nodeForm, editingNodeId]);

  const handleEditNode = useCallback((node: DiagramNode) => {
    setNodeForm({ name: node.name, type: node.type, note: node.note ?? "", zoneId: node.zoneId ?? "" });
    setEditingNodeId(node.id);
    setSelectedNodeId(node.id);
  }, []);

  const handleDeleteNode = useCallback((id: string) => {
    setData((d) => ({
      ...d,
      nodes: d.nodes.filter((n) => n.id !== id),
      edges: d.edges.filter((e) => e.fromNodeId !== id && e.toNodeId !== id),
    }));
    if (selectedNodeId === id) setSelectedNodeId(null);
    if (editingNodeId === id) {
      setEditingNodeId(null);
      setNodeForm({ name: "", type: nodeForm.type, note: "", zoneId: "" });
    }
  }, [selectedNodeId, editingNodeId, nodeForm.type]);

  const handleCancelEditNode = useCallback(() => {
    setEditingNodeId(null);
    setNodeForm({ name: "", type: nodeForm.type, note: "", zoneId: "" });
  }, [nodeForm.type]);

  // ---- 区域 CRUD ----
  const handleZoneSubmit = useCallback(() => {
    if (!zoneForm.name.trim()) return;
    if (editingZoneId) {
      setData((d) => ({
        ...d,
        zones: d.zones.map((z) =>
          z.id === editingZoneId
            ? { ...z, name: zoneForm.name.trim(), color: zoneForm.color, description: zoneForm.description.trim() || undefined }
            : z
        ),
      }));
      setEditingZoneId(null);
    } else {
      const newZone: DiagramZone = {
        id: genId("zone"),
        name: zoneForm.name.trim(),
        color: zoneForm.color,
        description: zoneForm.description.trim() || undefined,
      };
      setData((d) => ({ ...d, zones: [...d.zones, newZone] }));
    }
    setZoneForm({ name: "", color: ZONE_PRESET_COLORS[0], description: "" });
  }, [zoneForm, editingZoneId]);

  const handleEditZone = useCallback((zone: DiagramZone) => {
    setZoneForm({ name: zone.name, color: zone.color, description: zone.description ?? "" });
    setEditingZoneId(zone.id);
  }, []);

  const handleDeleteZone = useCallback((id: string) => {
    setData((d) => ({
      ...d,
      zones: d.zones.filter((z) => z.id !== id),
      // 解除该区域下节点的关联
      nodes: d.nodes.map((n) => (n.zoneId === id ? { ...n, zoneId: undefined } : n)),
    }));
    if (editingZoneId === id) {
      setEditingZoneId(null);
      setZoneForm({ name: "", color: ZONE_PRESET_COLORS[0], description: "" });
    }
  }, [editingZoneId]);

  const handleCancelEditZone = useCallback(() => {
    setEditingZoneId(null);
    setZoneForm({ name: "", color: ZONE_PRESET_COLORS[0], description: "" });
  }, []);

  /** 一键添加预设区域 */
  const handleAddPresetZone = useCallback((preset: { name: string; color: string; description?: string }) => {
    const newZone: DiagramZone = {
      id: genId("zone"),
      name: preset.name,
      color: preset.color,
      description: preset.description,
    };
    setData((d) => ({ ...d, zones: [...d.zones, newZone] }));
  }, []);

  // ---- 节点拖动：写回自定义坐标 ----
  const handleMoveNode = useCallback((id: string, x: number, y: number) => {
    setData((d) => ({
      ...d,
      nodes: d.nodes.map((n) => (n.id === id ? { ...n, x, y } : n)),
    }));
  }, []);

  // ---- 拖拽创建连线 ----
  const handleConnect = useCallback((fromId: string, toId: string) => {
    setData((d) => {
      // 已存在相同连线则不重复添加
      if (d.edges.some((e) => e.fromNodeId === fromId && e.toNodeId === toId)) return d;
      const fromNode = d.nodes.find((n) => n.id === fromId);
      const toNode = d.nodes.find((n) => n.id === toId);
      const newEdge: DiagramEdge = {
        id: genId("edge"),
        from: `${fromNode?.name ?? "?"}→${toNode?.name ?? "?"}`,
        fromNodeId: fromId,
        toNodeId: toId,
      };
      return { ...d, edges: [...d.edges, newEdge] };
    });
  }, []);

  // ---- 重置布局：清除所有节点自定义坐标，恢复自动布局 ----
  const handleResetLayout = useCallback(() => {
    setData((d) => ({
      ...d,
      nodes: d.nodes.map((n) => {
        if (n.x === undefined && n.y === undefined) return n;
        const rest = { ...n };
        delete rest.x;
        delete rest.y;
        return rest;
      }),
    }));
  }, []);

  // ---- 连线 CRUD ----
  const handleEdgeSubmit = useCallback(() => {
    if (!edgeForm.fromNodeId || !edgeForm.toNodeId || edgeForm.fromNodeId === edgeForm.toNodeId) return;
    const edgeStyle = edgeForm.edgeStyle || undefined;
    if (editingEdgeId) {
      setData((d) => ({
        ...d,
        edges: d.edges.map((e) =>
          e.id === editingEdgeId
            ? {
                ...e,
                from: edgeForm.from.trim() || `${getNodeName(d.nodes, edgeForm.fromNodeId)}→${getNodeName(d.nodes, edgeForm.toNodeId)}`,
                fromNodeId: edgeForm.fromNodeId,
                toNodeId: edgeForm.toNodeId,
                label: edgeForm.label.trim() || undefined,
                dashed: edgeForm.dashed,
                edgeStyle,
              }
            : e
        ),
      }));
      setEditingEdgeId(null);
    } else {
      const newEdge: DiagramEdge = {
        id: genId("edge"),
        from: edgeForm.from.trim() || `${getNodeName(data.nodes, edgeForm.fromNodeId)}→${getNodeName(data.nodes, edgeForm.toNodeId)}`,
        fromNodeId: edgeForm.fromNodeId,
        toNodeId: edgeForm.toNodeId,
        label: edgeForm.label.trim() || undefined,
        dashed: edgeForm.dashed,
        edgeStyle,
      };
      setData((d) => ({ ...d, edges: [...d.edges, newEdge] }));
    }
    setEdgeForm({ from: "", fromNodeId: "", toNodeId: "", label: "", dashed: false, edgeStyle: "" });
  }, [edgeForm, editingEdgeId, data.nodes]);

  const handleEditEdge = useCallback((edge: DiagramEdge) => {
    setEdgeForm({
      from: edge.from,
      fromNodeId: edge.fromNodeId,
      toNodeId: edge.toNodeId,
      label: edge.label ?? "",
      dashed: edge.dashed ?? false,
      edgeStyle: edge.edgeStyle ?? "",
    });
    setEditingEdgeId(edge.id);
    setSelectedEdgeId(edge.id);
  }, []);

  const handleDeleteEdge = useCallback((id: string) => {
    setData((d) => ({ ...d, edges: d.edges.filter((e) => e.id !== id) }));
    if (selectedEdgeId === id) setSelectedEdgeId(null);
    if (editingEdgeId === id) {
      setEditingEdgeId(null);
      setEdgeForm({ from: "", fromNodeId: "", toNodeId: "", label: "", dashed: false, edgeStyle: "" });
    }
  }, [selectedEdgeId, editingEdgeId]);

  const handleCancelEditEdge = useCallback(() => {
    setEditingEdgeId(null);
    setEdgeForm({ from: "", fromNodeId: "", toNodeId: "", label: "", dashed: false, edgeStyle: "" });
  }, []);

  // ---- 导出 ----
  const handleExportSVG = useCallback(() => {
    const svgStr = canvasRef.current?.exportSVG();
    if (!svgStr) return;
    const blob = new Blob([svgStr], { type: "image/svg+xml;charset=utf-8" });
    downloadBlob(blob, `${data.title || "diagram"}.svg`);
  }, [data.title]);

  const handleExportJSON = useCallback(() => {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    downloadBlob(blob, `${data.title || "diagram"}.json`);
  }, [data]);

  const handleImportJSON = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string) as Partial<DiagramData>;
        if (parsed.nodes && parsed.edges && (parsed.type === "software" || parsed.type === "network")) {
          // 兼容旧版本无 zones/direction/edgeStyle 字段的 JSON
          setData({
            type: parsed.type,
            title: parsed.title ?? "未命名图表",
            nodes: parsed.nodes,
            edges: parsed.edges,
            zones: parsed.zones ?? [],
            direction: parsed.direction,
            edgeStyle: parsed.edgeStyle,
          });
          setSelectedNodeId(null);
          setSelectedEdgeId(null);
          setEditingZoneId(null);
        } else {
          alert("JSON 格式不正确，请检查文件内容");
        }
      } catch {
        alert("JSON 解析失败，请检查文件内容");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }, []);

  const handleExportMermaid = useCallback(async () => {
    const mermaidStr = toMermaid(data);
    await navigator.clipboard.writeText(mermaidStr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [data]);

  const handleClear = useCallback(() => {
    if (!confirm("确定要清空所有节点和连线吗？")) return;
    setData((d) => ({ ...d, nodes: [], edges: [] }));
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setEditingNodeId(null);
    setEditingEdgeId(null);
    setNodeForm({ name: "", type: availableNodeTypes[0], note: "", zoneId: "" });
    setEdgeForm({ from: "", fromNodeId: "", toNodeId: "", label: "", dashed: false, edgeStyle: "" });
  }, [availableNodeTypes]);

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-950/80">
        <div className="mx-auto max-w-[1600px] px-4 py-4 sm:px-6 lg:px-8">
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
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-sky-600 text-white font-bold text-lg shadow-lg shadow-cyan-500/25">
              📐
            </div>
            <div className="flex-1">
              <h1 className="text-xl font-bold text-slate-900 dark:text-white">绘图工具</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                表单填写 · 自动布局 · 软件施工图与网络拓扑图
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto flex w-full max-w-[1600px] min-h-0 flex-1 gap-4 px-4 py-4 sm:px-6 lg:px-8">
        {/* 左侧表单区 */}
        <aside className="flex w-[380px] shrink-0 flex-col gap-4 overflow-y-auto pb-4">
          {/* 图表类型与标题 */}
          <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
              📋 图表设置
            </h2>
            {/* 类型切换 */}
            <div className="mb-3 grid grid-cols-2 gap-2">
              {(["software", "network"] as DiagramType[]).map((t) => (
                <button
                  key={t}
                  onClick={() => handleTypeChange(t)}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
                    data.type === t
                      ? "border-cyan-500 bg-cyan-50 text-cyan-700 dark:border-cyan-400 dark:bg-cyan-900/30 dark:text-cyan-300"
                      : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-slate-600"
                  }`}
                >
                  {t === "software" ? "🖥 软件施工图" : "🌐 网络拓扑图"}
                </button>
              ))}
            </div>
            {/* 标题 */}
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              图表标题
            </label>
            <input
              type="text"
              value={data.title}
              onChange={(e) => setData((d) => ({ ...d, title: e.target.value }))}
              placeholder="输入图表标题..."
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition-colors focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:focus:border-cyan-400"
            />
            {/* 排版方向 */}
            <label className="mb-1 mt-3 block text-xs font-medium text-slate-500 dark:text-slate-400">
              排版方向
            </label>
            <div className="grid grid-cols-2 gap-2">
              {([
                { v: "TB", label: "↓ 从上到下" },
                { v: "LR", label: "→ 从左到右" },
              ] as { v: LayoutDirection; label: string }[]).map((o) => (
                <button
                  key={o.v}
                  onClick={() => setData((d) => ({ ...d, direction: o.v }))}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                    (data.direction ?? "TB") === o.v
                      ? "border-cyan-500 bg-cyan-50 text-cyan-700 dark:border-cyan-400 dark:bg-cyan-900/30 dark:text-cyan-300"
                      : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-slate-600"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {/* 默认连线样式 */}
            <label className="mb-1 mt-3 block text-xs font-medium text-slate-500 dark:text-slate-400">
              默认连线样式
            </label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { v: "curve", label: "曲线" },
                { v: "line", label: "直线" },
                { v: "orthogonal", label: "直角" },
              ] as { v: EdgeStyle; label: string }[]).map((o) => (
                <button
                  key={o.v}
                  onClick={() => setData((d) => ({ ...d, edgeStyle: o.v }))}
                  className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition-all ${
                    (data.edgeStyle ?? "curve") === o.v
                      ? "border-cyan-500 bg-cyan-50 text-cyan-700 dark:border-cyan-400 dark:bg-cyan-900/30 dark:text-cyan-300"
                      : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-slate-600"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[10px] text-slate-400">
              新建连线默认使用此样式；每条连线也可单独指定
            </p>
          </section>

          {/* 节点表单 */}
          <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                {editingNodeId ? "✏️ 编辑节点" : "➕ 添加节点"}
              </h2>
              {editingNodeId && (
                <button
                  onClick={handleCancelEditNode}
                  className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  取消编辑
                </button>
              )}
            </div>
            <div className="space-y-2.5">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                  节点名称 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={nodeForm.name}
                  onChange={(e) => setNodeForm((f) => ({ ...f, name: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && handleNodeSubmit()}
                  placeholder="如：用户服务"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:focus:border-cyan-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                  节点类型
                </label>
                <select
                  value={nodeForm.type}
                  onChange={(e) => setNodeForm((f) => ({ ...f, type: e.target.value as NodeType }))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:focus:border-cyan-400"
                >
                  {availableNodeTypes.map((t) => (
                    <option key={t} value={t}>
                      {NODE_TYPE_CONFIG[t].label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                  备注（可选）
                </label>
                <input
                  type="text"
                  value={nodeForm.note}
                  onChange={(e) => setNodeForm((f) => ({ ...f, note: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && handleNodeSubmit()}
                  placeholder="如：x2 / 主从"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:focus:border-cyan-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                  所属区域
                </label>
                <select
                  value={nodeForm.zoneId}
                  onChange={(e) => setNodeForm((f) => ({ ...f, zoneId: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:focus:border-cyan-400"
                >
                  <option value="">未分组</option>
                  {data.zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleNodeSubmit}
                disabled={!nodeForm.name.trim()}
                className="w-full rounded-lg bg-gradient-to-r from-cyan-500 to-sky-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-cyan-500/25 transition-all hover:shadow-xl hover:from-cyan-600 hover:to-sky-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {editingNodeId ? "保存修改" : "添加节点"}
              </button>
            </div>

            {/* 节点列表 */}
            {data.nodes.length > 0 && (
              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    节点列表（{data.nodes.length}）
                  </span>
                  <button
                    onClick={handleClear}
                    className="text-xs text-rose-400 hover:text-rose-600 dark:hover:text-rose-300"
                  >
                    清空全部
                  </button>
                </div>
                <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
                  {data.nodes.map((node) => {
                    const config = NODE_TYPE_CONFIG[node.type];
                    const isSelected = node.id === selectedNodeId;
                    const zone = data.zones.find((z) => z.id === node.zoneId);
                    return (
                      <div
                        key={node.id}
                        onClick={() => setSelectedNodeId(node.id)}
                        className={`group flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 transition-all ${
                          isSelected
                            ? "border-cyan-400 bg-cyan-50 dark:border-cyan-500 dark:bg-cyan-900/20"
                            : "border-slate-200 bg-slate-50 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-slate-600"
                        }`}
                      >
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: config.color }}
                        />
                        <span className="flex-1 truncate text-sm font-medium text-slate-700 dark:text-slate-200">
                          {node.name}
                        </span>
                        {zone && (
                          <span
                            className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
                            style={{ backgroundColor: zone.color }}
                          >
                            {zone.name}
                          </span>
                        )}
                        <span className="shrink-0 text-[10px] text-slate-400">
                          {config.label}
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleEditNode(node); }}
                          className="shrink-0 text-slate-400 opacity-0 transition-opacity hover:text-cyan-500 group-hover:opacity-100"
                          title="编辑"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                          </svg>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteNode(node.id); }}
                          className="shrink-0 text-slate-400 opacity-0 transition-opacity hover:text-rose-500 group-hover:opacity-100"
                          title="删除"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </svg>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          {/* 网络区域管理 */}
          <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                {editingZoneId ? "✏️ 编辑区域" : "🗂️ 网络区域"}
              </h2>
              {editingZoneId && (
                <button
                  onClick={handleCancelEditZone}
                  className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  取消编辑
                </button>
              )}
            </div>
            <div className="space-y-2.5">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                  区域名称 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={zoneForm.name}
                  onChange={(e) => setZoneForm((f) => ({ ...f, name: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && handleZoneSubmit()}
                  placeholder="如：DMZ 区 / 办公区"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:focus:border-cyan-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                  颜色
                </label>
                <div className="flex flex-wrap items-center gap-1.5">
                  {ZONE_PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setZoneForm((f) => ({ ...f, color: c }))}
                      className={`h-6 w-6 rounded-full transition-transform hover:scale-110 ${
                        zoneForm.color === c ? "ring-2 ring-offset-2 ring-slate-400 dark:ring-offset-slate-900" : ""
                      }`}
                      style={{ backgroundColor: c }}
                      title={c}
                    />
                  ))}
                  <input
                    type="color"
                    value={zoneForm.color}
                    onChange={(e) => setZoneForm((f) => ({ ...f, color: e.target.value }))}
                    className="h-6 w-6 cursor-pointer rounded-full border-0 bg-transparent p-0"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                  描述（可选）
                </label>
                <input
                  type="text"
                  value={zoneForm.description}
                  onChange={(e) => setZoneForm((f) => ({ ...f, description: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && handleZoneSubmit()}
                  placeholder="如：对外服务隔离区"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:focus:border-cyan-400"
                />
              </div>
              <button
                onClick={handleZoneSubmit}
                disabled={!zoneForm.name.trim()}
                className="w-full rounded-lg bg-gradient-to-r from-violet-500 to-purple-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-violet-500/25 transition-all hover:shadow-xl hover:from-violet-600 hover:to-purple-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {editingZoneId ? "保存修改" : "添加区域"}
              </button>

              {/* 预设快捷添加 */}
              {!editingZoneId && ZONE_PRESETS[data.type].length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {ZONE_PRESETS[data.type].map((p) => (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => handleAddPresetZone(p)}
                      className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400 dark:hover:bg-slate-800"
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: p.color }}
                      />
                      + {p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 区域列表 */}
            {data.zones.length > 0 && (
              <div className="mt-4">
                <span className="mb-2 block text-xs font-medium text-slate-500 dark:text-slate-400">
                  区域列表（{data.zones.length}）
                </span>
                <div className="space-y-1.5">
                  {data.zones.map((zone) => {
                    const zoneNodeCount = data.nodes.filter((n) => n.zoneId === zone.id).length;
                    return (
                      <div
                        key={zone.id}
                        className="group flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 transition-all hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-slate-600"
                      >
                        <span
                          className="h-3 w-3 shrink-0 rounded"
                          style={{ backgroundColor: zone.color }}
                        />
                        <div className="flex-1 truncate">
                          <span className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                            {zone.name}
                          </span>
                          {zone.description && (
                            <span className="block truncate text-[10px] text-slate-400">
                              {zone.description}
                            </span>
                          )}
                        </div>
                        <span className="shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                          {zoneNodeCount} 节点
                        </span>
                        <button
                          onClick={() => handleEditZone(zone)}
                          className="shrink-0 text-slate-400 opacity-0 transition-opacity hover:text-cyan-500 group-hover:opacity-100"
                          title="编辑"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDeleteZone(zone.id)}
                          className="shrink-0 text-slate-400 opacity-0 transition-opacity hover:text-rose-500 group-hover:opacity-100"
                          title="删除"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </svg>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          {/* 连线表单 */}
          <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                {editingEdgeId ? "✏️ 编辑连线" : "🔗 添加连线"}
              </h2>
              {editingEdgeId && (
                <button
                  onClick={handleCancelEditEdge}
                  className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  取消编辑
                </button>
              )}
            </div>
            {data.nodes.length < 2 ? (
              <p className="rounded-lg bg-slate-50 px-3 py-4 text-center text-xs text-slate-400 dark:bg-slate-800/50 dark:text-slate-500">
                至少需要 2 个节点才能添加连线
              </p>
            ) : (
              <div className="space-y-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                      起始节点 <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={edgeForm.fromNodeId}
                      onChange={(e) => setEdgeForm((f) => ({ ...f, fromNodeId: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:focus:border-cyan-400"
                    >
                      <option value="">选择节点</option>
                      {data.nodes.map((n) => (
                        <option key={n.id} value={n.id}>{n.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                      目标节点 <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={edgeForm.toNodeId}
                      onChange={(e) => setEdgeForm((f) => ({ ...f, toNodeId: e.target.value }))}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:focus:border-cyan-400"
                    >
                      <option value="">选择节点</option>
                      {data.nodes.map((n) => (
                        <option key={n.id} value={n.id}>{n.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                    连线标签（可选）
                  </label>
                  <input
                    type="text"
                    value={edgeForm.label}
                    onChange={(e) => setEdgeForm((f) => ({ ...f, label: e.target.value }))}
                    placeholder="如：HTTP / 异步 / VPN"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-cyan-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:focus:border-cyan-400"
                  />
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <input
                    type="checkbox"
                    checked={edgeForm.dashed}
                    onChange={(e) => setEdgeForm((f) => ({ ...f, dashed: e.target.checked }))}
                    className="h-3.5 w-3.5 rounded border-slate-300 text-cyan-500 focus:ring-cyan-400"
                  />
                  虚线样式（用于异步/VPN/逻辑连接）
                </label>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                    连线形状
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {([
                      { v: "", label: "默认" },
                      { v: "curve", label: "曲线" },
                      { v: "line", label: "直线" },
                      { v: "orthogonal", label: "直角" },
                    ] as { v: EdgeStyle | ""; label: string }[]).map((o) => (
                      <button
                        key={o.v || "default"}
                        type="button"
                        onClick={() => setEdgeForm((f) => ({ ...f, edgeStyle: o.v }))}
                        className={`rounded-lg border px-2 py-1.5 text-[11px] font-medium transition-all ${
                          edgeForm.edgeStyle === o.v
                            ? "border-cyan-500 bg-cyan-50 text-cyan-700 dark:border-cyan-400 dark:bg-cyan-900/30 dark:text-cyan-300"
                            : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-slate-600"
                        }`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1 text-[10px] text-slate-400">
                    选择「默认」则跟随图表全局连线样式
                  </p>
                </div>
                <button
                  onClick={handleEdgeSubmit}
                  disabled={!edgeForm.fromNodeId || !edgeForm.toNodeId || edgeForm.fromNodeId === edgeForm.toNodeId}
                  className="w-full rounded-lg bg-gradient-to-r from-cyan-500 to-sky-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-cyan-500/25 transition-all hover:shadow-xl hover:from-cyan-600 hover:to-sky-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {editingEdgeId ? "保存修改" : "添加连线"}
                </button>
              </div>
            )}

            {/* 连线列表 */}
            {data.edges.length > 0 && (
              <div className="mt-4">
                <span className="mb-2 block text-xs font-medium text-slate-500 dark:text-slate-400">
                  连线列表（{data.edges.length}）
                </span>
                <div className="max-h-48 space-y-1.5 overflow-y-auto pr-1">
                  {data.edges.map((edge) => {
                    const fromNode = data.nodes.find((n) => n.id === edge.fromNodeId);
                    const toNode = data.nodes.find((n) => n.id === edge.toNodeId);
                    const isSelected = edge.id === selectedEdgeId;
                    const shapeLabel = edge.edgeStyle
                      ? { curve: "曲", line: "直", orthogonal: "折" }[edge.edgeStyle]
                      : null;
                    return (
                      <div
                        key={edge.id}
                        onClick={() => setSelectedEdgeId(edge.id)}
                        className={`group flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 transition-all ${
                          isSelected
                            ? "border-blue-400 bg-blue-50 dark:border-blue-500 dark:bg-blue-900/20"
                            : "border-slate-200 bg-slate-50 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-slate-600"
                        }`}
                      >
                        <span className="flex-1 truncate text-xs text-slate-600 dark:text-slate-300">
                          <span className="font-medium">{fromNode?.name ?? "?"}</span>
                          <span className="mx-1 text-slate-400">{edge.dashed ? "⇢" : "→"}</span>
                          <span className="font-medium">{toNode?.name ?? "?"}</span>
                          {edge.label && (
                            <span className="ml-1.5 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                              {edge.label}
                            </span>
                          )}
                          {shapeLabel && (
                            <span className="ml-1 rounded bg-cyan-100 px-1.5 py-0.5 text-[10px] text-cyan-600 dark:bg-cyan-900/40 dark:text-cyan-300" title={`连线形状：${edge.edgeStyle}`}>
                              {shapeLabel}
                            </span>
                          )}
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleEditEdge(edge); }}
                          className="shrink-0 text-slate-400 opacity-0 transition-opacity hover:text-cyan-500 group-hover:opacity-100"
                          title="编辑"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                          </svg>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteEdge(edge.id); }}
                          className="shrink-0 text-slate-400 opacity-0 transition-opacity hover:text-rose-500 group-hover:opacity-100"
                          title="删除"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                          </svg>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        </aside>

        {/* 右侧画布区 */}
        <section className="flex min-h-0 flex-1 flex-col gap-3">
          {/* 工具栏 */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 dark:border-slate-700 dark:bg-slate-900">
              <span className="text-xs text-slate-400">节点</span>
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{data.nodes.length}</span>
              <span className="mx-1 text-slate-300 dark:text-slate-600">|</span>
              <span className="text-xs text-slate-400">连线</span>
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{data.edges.length}</span>
              <span className="mx-1 text-slate-300 dark:text-slate-600">|</span>
              <span className="text-xs text-slate-400">区域</span>
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{data.zones.length}</span>
            </div>
            <div className="flex-1" />
            <button
              onClick={handleExportSVG}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-all hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              SVG
            </button>
            <button
              onClick={handleExportMermaid}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-all hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {copied ? "已复制" : "Mermaid"}
            </button>
            <button
              onClick={handleExportJSON}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-all hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              JSON
            </button>
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-all hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v12" />
              </svg>
              导入
              <input type="file" accept=".json" onChange={handleImportJSON} className="hidden" />
            </label>
            <button
              onClick={handleResetLayout}
              title="清除所有节点自定义坐标，恢复自动布局"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-all hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
              重置布局
            </button>
          </div>

          {/* 画布 */}
          <div className="min-h-0 flex-1">
            <DiagramCanvas
              ref={canvasRef}
              data={data}
              selectedNodeId={selectedNodeId}
              selectedEdgeId={selectedEdgeId}
              onSelectNode={setSelectedNodeId}
              onSelectEdge={setSelectedEdgeId}
              onMoveNode={handleMoveNode}
              onConnect={handleConnect}
              onEditNode={(id) => {
                const n = data.nodes.find((x) => x.id === id);
                if (n) handleEditNode(n);
              }}
              onDeleteNode={handleDeleteNode}
              onDeleteEdge={handleDeleteEdge}
            />
          </div>
        </section>
      </main>
    </div>
  );
}

/** 辅助：获取节点名称 */
function getNodeName(nodes: DiagramNode[], id: string): string {
  return nodes.find((n) => n.id === id)?.name ?? "?";
}

/** 辅助：下载 Blob */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** 辅助：转换为 Mermaid flowchart 文本（按区域 subgraph 分组） */
function toMermaid(data: DiagramData): string {
  const dir = data.direction === "LR" ? "LR" : "TD";
  const lines: string[] = [`flowchart ${dir}`];
  const nodeLabel = (n: DiagramNode) =>
    n.note ? `${n.name}<br/>(${n.note})` : n.name;

  // 按区域分组输出 subgraph
  for (const zone of data.zones) {
    const zoneNodes = data.nodes.filter((n) => n.zoneId === zone.id);
    if (zoneNodes.length === 0) continue;
    lines.push(`  subgraph ${zone.id} ["${zone.name}"]`);
    for (const node of zoneNodes) {
      lines.push(`    ${node.id}["${nodeLabel(node)}"]:::${node.type}`);
    }
    lines.push("  end");
  }
  // 输出未分组的节点
  for (const node of data.nodes.filter((n) => !n.zoneId || !data.zones.some((z) => z.id === n.zoneId))) {
    lines.push(`  ${node.id}["${nodeLabel(node)}"]:::${node.type}`);
  }
  // 输出边
  for (const edge of data.edges) {
    const arrow = edge.dashed ? "-." : "-->";
    const label = edge.label ? `|${edge.label}|` : "";
    lines.push(`  ${edge.fromNodeId} ${arrow}${label} ${edge.toNodeId}`);
  }
  // 类型样式 classDef
  lines.push("");
  lines.push("  classDef default fill:#fff,stroke:#94a3b8,stroke-width:1px");
  for (const node of data.nodes) {
    const config = NODE_TYPE_CONFIG[node.type];
    lines.push(`  classDef ${node.type} fill:${config.bgColor},stroke:${config.borderColor},stroke-width:2px,color:${config.textColor}`);
  }
  return lines.join("\n");
}
