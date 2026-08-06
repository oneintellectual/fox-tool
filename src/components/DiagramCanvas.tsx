"use client";

import { useMemo, useRef, useState, useCallback, forwardRef, useImperativeHandle } from "react";
import { DiagramData, NODE_TYPE_CONFIG } from "@/lib/diagram-types";
import { layoutDiagram, NODE_WIDTH, NODE_HEIGHT, LayoutResult } from "@/lib/diagram-layout";

export interface DiagramCanvasHandle {
  /** 导出当前 SVG 为字符串 */
  exportSVG: () => string;
}

interface DiagramCanvasProps {
  data: DiagramData;
  /** 选中节点 id */
  selectedNodeId?: string | null;
  /** 选中连线 id */
  selectedEdgeId?: string | null;
  onSelectNode?: (id: string | null) => void;
  onSelectEdge?: (id: string | null) => void;
  /** 节点拖动结束，写回自定义坐标 */
  onMoveNode?: (id: string, x: number, y: number) => void;
  /** 从某节点拉线到另一节点，创建连线 */
  onConnect?: (fromId: string, toId: string) => void;
  /** 双击节点触发编辑 */
  onEditNode?: (id: string) => void;
  /** 删除节点 */
  onDeleteNode?: (id: string) => void;
  /** 删除连线 */
  onDeleteEdge?: (id: string) => void;
}

const MIN_SCALE = 0.3;
const MAX_SCALE = 2.5;

export const DiagramCanvas = forwardRef<DiagramCanvasHandle, DiagramCanvasProps>(
  function DiagramCanvas(props, ref) {
    const { data, selectedNodeId, selectedEdgeId, onSelectNode, onSelectEdge, onMoveNode, onConnect, onEditNode, onDeleteNode, onDeleteEdge } = props;
    const [scale, setScale] = useState(1);
    const [tx, setTx] = useState(0);
    const [ty, setTy] = useState(0);
    const svgRef = useRef<SVGSVGElement>(null);
    const dragRef = useRef<{ startX: number; startY: number; startTx: number; startTy: number } | null>(null);

    // 节点拖动状态：dragNode.id + 起点（屏幕）+ 节点起点坐标（布局）+ 实时偏移
    const nodeDragRef = useRef<{
      id: string;
      startClientX: number;
      startClientY: number;
      originX: number;
      originY: number;
      moved: boolean;
      dx: number; // 最新布局坐标偏移（ref 同步，避免 mouseup 读到陈旧 state）
      dy: number;
    } | null>(null);
    const [dragOffset, setDragOffset] = useState<{ id: string; dx: number; dy: number } | null>(null);
    // 拖动对齐辅助线
    const [alignLines, setAlignLines] = useState<{ x?: number; y?: number } | null>(null);
    const ALIGN_THRESHOLD = 5;

    // 连线拖拽状态
    const connectRef = useRef<{ fromId: string; fromX: number; fromY: number } | null>(null);
    const [connecting, setConnecting] = useState<{ fromId: string; fromX: number; fromY: number; toX: number; toY: number; hoverId: string | null } | null>(null);

    // hover 节点（用于显示连线锚点）
    const [hoverNodeId, setHoverNodeId] = useState<string | null>(null);

    /** 屏幕坐标 → 布局坐标 */
    const toLayoutPoint = useCallback((clientX: number, clientY: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: (clientX - rect.left - tx) / scale,
        y: (clientY - rect.top - ty) / scale,
      };
    }, [tx, ty, scale]);

    /** 排版方向：TB 锚点在底部，LR 锚点在右侧 */
    const isLR = (data.direction ?? "TB") === "LR";
    const anchorPos = isLR
      ? { cx: NODE_WIDTH, cy: NODE_HEIGHT / 2 }
      : { cx: NODE_WIDTH / 2, cy: NODE_HEIGHT };

    const layout: LayoutResult = useMemo(
      () => layoutDiagram(data.nodes, data.edges, data.zones, data.direction ?? "TB", data.edgeStyle ?? "curve"),
      [data.nodes, data.edges, data.zones, data.direction, data.edgeStyle]
    );

    /** 区域信息映射（用于渲染颜色与名称） */
    const zoneMap = useMemo(
      () => new Map(data.zones.map((z) => [z.id, z])),
      [data.zones]
    );

    const handleExport = useCallback((): string => {
      if (!svgRef.current) return "";
      const clone = svgRef.current.cloneNode(true) as SVGSVGElement;
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
      // 设置显式尺寸与 viewBox，确保导出文件独立打开时有正确画幅
      const w = Math.max(layout.width, 100);
      const h = Math.max(layout.height, 100);
      clone.setAttribute("width", String(w));
      clone.setAttribute("height", String(h));
      clone.setAttribute("viewBox", `0 0 ${w} ${h}`);
      // 重置变换，导出原始布局坐标
      const inner = clone.querySelector("[data-transform-group]") as SVGGElement | null;
      if (inner) inner.removeAttribute("transform");
      const serializer = new XMLSerializer();
      return `<?xml version="1.0" encoding="UTF-8"?>\n` + serializer.serializeToString(clone);
    }, [layout.width, layout.height]);

    useImperativeHandle(ref, () => ({ exportSVG: handleExport }), [handleExport]);

    // ---- 交互：画布平移 ----
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
      if (e.button !== 0) return;
      // 点击空白处取消选中
      if (e.target === e.currentTarget || ((e.target as Element).tagName === "rect" && (e.target as Element).getAttribute("data-bg") === "true")) {
        onSelectNode?.(null);
        onSelectEdge?.(null);
      }
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        startTx: tx,
        startTy: ty,
      };
    }, [tx, ty, onSelectNode, onSelectEdge]);

    // ---- 交互：节点拖动 ----
    const handleNodeMouseDown = useCallback((e: React.MouseEvent, nodeId: string, nx: number, ny: number) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      nodeDragRef.current = {
        id: nodeId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        originX: nx,
        originY: ny,
        moved: false,
        dx: 0,
        dy: 0,
      };
      setDragOffset({ id: nodeId, dx: 0, dy: 0 });
    }, []);

    // ---- 交互：连线锚点拖拽 ----
    const handleConnectMouseDown = useCallback((e: React.MouseEvent, nodeId: string, anchorX: number, anchorY: number) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      connectRef.current = { fromId: nodeId, fromX: anchorX, fromY: anchorY };
      setConnecting({ fromId: nodeId, fromX: anchorX, fromY: anchorY, toX: anchorX, toY: anchorY, hoverId: null });
    }, []);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
      // 画布平移
      if (dragRef.current) {
        const dx = e.clientX - dragRef.current.startX;
        const dy = e.clientY - dragRef.current.startY;
        setTx(dragRef.current.startTx + dx);
        setTy(dragRef.current.startTy + dy);
        return;
      }
      // 节点拖动
      if (nodeDragRef.current) {
        let dx = (e.clientX - nodeDragRef.current.startClientX) / scale;
        let dy = (e.clientY - nodeDragRef.current.startClientY) / scale;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) nodeDragRef.current.moved = true;
        // 对齐辅助线 + 吸附：检测与其他节点的左/中/右、顶/中/底对齐
        const nd = nodeDragRef.current;
        const movingLeft = nd.originX + dx;
        const movingTop = nd.originY + dy;
        const movingRight = movingLeft + NODE_WIDTH;
        const movingBottom = movingTop + NODE_HEIGHT;
        const movingCx = movingLeft + NODE_WIDTH / 2;
        const movingCy = movingTop + NODE_HEIGHT / 2;
        let snapX: number | undefined;
        let snapY: number | undefined;
        let lineX: number | undefined;
        let lineY: number | undefined;
        for (const other of layout.nodes) {
          if (other.id === nd.id) continue;
          const oLeft = other.x;
          const oRight = other.x + NODE_WIDTH;
          const oCx = other.x + NODE_WIDTH / 2;
          const oTop = other.y;
          const oBottom = other.y + NODE_HEIGHT;
          const oCy = other.y + NODE_HEIGHT / 2;
          // 横向对齐：左/中/右
          if (snapX === undefined) {
            for (const [mv, ov] of [[movingLeft, oLeft], [movingCx, oCx], [movingRight, oRight]] as number[][]) {
              if (Math.abs(mv - ov) < ALIGN_THRESHOLD) {
                snapX = ov - (mv - movingLeft);
                lineX = ov;
                break;
              }
            }
          }
          // 纵向对齐：顶/中/底
          if (snapY === undefined) {
            for (const [mv, ov] of [[movingTop, oTop], [movingCy, oCy], [movingBottom, oBottom]] as number[][]) {
              if (Math.abs(mv - ov) < ALIGN_THRESHOLD) {
                snapY = ov - (mv - movingTop);
                lineY = ov;
                break;
              }
            }
          }
          if (snapX !== undefined && snapY !== undefined) break;
        }
        if (snapX !== undefined) dx = snapX - nd.originX;
        if (snapY !== undefined) dy = snapY - nd.originY;
        setAlignLines(snapX !== undefined || snapY !== undefined ? { x: lineX, y: lineY } : null);
        // 同步写入 ref
        nd.dx = dx;
        nd.dy = dy;
        setDragOffset({ id: nd.id, dx, dy });
        return;
      }
      // 连线拖拽
      if (connectRef.current) {
        const p = toLayoutPoint(e.clientX, e.clientY);
        // 检测 hover 目标节点
        const target = (e.target as Element)?.closest?.("[data-node-id]") as Element | null;
        const hoverId = target?.getAttribute("data-node-id") ?? null;
        setConnecting({
          fromId: connectRef.current.fromId,
          fromX: connectRef.current.fromX,
          fromY: connectRef.current.fromY,
          toX: p.x,
          toY: p.y,
          hoverId: hoverId !== connectRef.current.fromId ? hoverId : null,
        });
      }
    }, [scale, toLayoutPoint, layout.nodes]);

    const handleMouseUp = useCallback(() => {
      dragRef.current = null;
      // 节点拖动收尾
      if (nodeDragRef.current) {
        const nd = nodeDragRef.current;
        if (nd.moved) {
          // 从 ref 读最新偏移，避免 state 闭包陈旧导致回弹
          onMoveNode?.(nd.id, Math.round(nd.originX + nd.dx), Math.round(nd.originY + nd.dy));
        } else {
          // 未移动视为点击 → 选中
          onSelectNode?.(nd.id);
          onSelectEdge?.(null);
        }
        nodeDragRef.current = null;
        setDragOffset(null);
        setAlignLines(null);
        return;
      }
      // 连线收尾
      if (connectRef.current) {
        const fromId = connectRef.current.fromId;
        const toId = connecting?.hoverId ?? null;
        if (toId && toId !== fromId) {
          onConnect?.(fromId, toId);
        }
        connectRef.current = null;
        setConnecting(null);
      }
    }, [connecting, onMoveNode, onConnect, onSelectNode, onSelectEdge]);

    // 滚轮缩放：以鼠标位置为中心（保持鼠标点对应的布局坐标不变）
    const handleWheel = useCallback((e: React.WheelEvent) => {
      e.preventDefault();
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      // 鼠标相对画布的屏幕坐标
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const delta = e.deltaY > 0 ? -0.1 : 0.1;
      setScale((s) => {
        const ns = Math.min(MAX_SCALE, Math.max(MIN_SCALE, +(s + delta).toFixed(2)));
        if (ns === s) return s;
        // 缩放前鼠标对应的布局坐标 = (mx - tx) / s；缩放后需保持不变 → tx' = mx - layoutX * ns
        const layoutX = (mx - tx) / s;
        const layoutY = (my - ty) / s;
        setTx(mx - layoutX * ns);
        setTy(my - layoutY * ns);
        return ns;
      });
    }, [tx, ty]);

    // 按钮缩放：以画布中心为基准
    const zoomAtCenter = useCallback((delta: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      setScale((s) => {
        const ns = Math.min(MAX_SCALE, Math.max(MIN_SCALE, +(s + delta).toFixed(2)));
        if (ns === s) return s;
        const layoutX = (cx - tx) / s;
        const layoutY = (cy - ty) / s;
        setTx(cx - layoutX * ns);
        setTy(cy - layoutY * ns);
        return ns;
      });
    }, [tx, ty]);

    const zoomIn = () => zoomAtCenter(0.15);
    const zoomOut = () => zoomAtCenter(-0.15);
    const resetView = () => { setScale(1); setTx(0); setTy(0); };

    // 键盘快捷键：Delete 删除选中，Escape 取消选中/连线拖拽
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        if (connectRef.current) {
          connectRef.current = null;
          setConnecting(null);
        } else {
          onSelectNode?.(null);
          onSelectEdge?.(null);
        }
        return;
      }
      // 删除：忽略输入框中的按键
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedEdgeId) {
          e.preventDefault();
          onDeleteEdge?.(selectedEdgeId);
        } else if (selectedNodeId) {
          e.preventDefault();
          onDeleteNode?.(selectedNodeId);
        }
      }
    }, [selectedNodeId, selectedEdgeId, onSelectNode, onSelectEdge, onDeleteNode, onDeleteEdge]);

    return (
      <div
        className="relative h-full w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50 outline-none dark:border-slate-700 dark:bg-slate-900"
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        {/* 工具栏 */}
        <div className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-lg border border-slate-200 bg-white/90 px-1.5 py-1 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-800/90">
          <button
            onClick={zoomOut}
            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
            title="缩小"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
            </svg>
          </button>
          <span className="w-12 text-center text-xs font-medium text-slate-500 dark:text-slate-400">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={zoomIn}
            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
            title="放大"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
            </svg>
          </button>
          <button
            onClick={resetView}
            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
            title="重置视图"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          style={{ cursor: connecting ? "crosshair" : dragOffset ? "grabbing" : "grab" }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
        >
          <defs>
            {/* 箭头标记 */}
            <marker
              id="arrow-default"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
            </marker>
            <marker
              id="arrow-selected"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#3b82f6" />
            </marker>
          </defs>

          {/* 背景网格 */}
          <rect
            data-bg="true"
            x={0}
            y={0}
            width="100%"
            height="100%"
            fill="transparent"
          />
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="#cbd5e1" opacity="0.4" />
          </pattern>
          <rect data-bg="true" width="100%" height="100%" fill="url(#grid)" />

          <g data-transform-group transform={`translate(${tx} ${ty}) scale(${scale})`}>
            {/* 网络区域背景框（最底层） */}
            {layout.zones.map((box) => {
              const zone = zoneMap.get(box.id);
              if (!zone) return null;
              const labelText = zone.name;
              const labelWidth = labelText.length * 12 + 24;
              return (
                <g key={box.id}>
                  {/* 区域背景 */}
                  <rect
                    data-bg="true"
                    x={box.x}
                    y={box.y}
                    width={box.width}
                    height={box.height}
                    rx={12}
                    fill={zone.color}
                    fillOpacity={0.06}
                    stroke={zone.color}
                    strokeOpacity={0.45}
                    strokeWidth={1.5}
                    strokeDasharray="6 4"
                  />
                  {/* 区域标签条 */}
                  <rect
                    x={box.x}
                    y={box.y}
                    width={labelWidth}
                    height={20}
                    rx={6}
                    fill={zone.color}
                  />
                  <text
                    x={box.x + 12}
                    y={box.y + 14}
                    fontSize={11}
                    fontWeight={600}
                    fill="white"
                  >
                    {labelText}
                  </text>
                  {/* 区域描述（可选） */}
                  {zone.description && (
                    <text
                      x={box.x + labelWidth + 8}
                      y={box.y + 14}
                      fontSize={10}
                      fill={zone.color}
                      opacity={0.8}
                    >
                      {zone.description}
                    </text>
                  )}
                </g>
              );
            })}

            {/* 连线 */}
            {layout.edges.map((edge) => {
              const isSelected = edge.id === selectedEdgeId;
              const fromNode = layout.nodes.find((n) => n.id === edge.fromNodeId);
              const fromColor = fromNode ? NODE_TYPE_CONFIG[fromNode.type].color : "#94a3b8";
              return (
                <g
                  key={edge.id}
                  className="cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectEdge?.(edge.id);
                    onSelectNode?.(null);
                  }}
                >
                  <path
                    d={edge.path}
                    fill="none"
                    stroke={isSelected ? "#3b82f6" : fromColor}
                    strokeWidth={isSelected ? 2.5 : 1.8}
                    strokeOpacity={isSelected ? 1 : 0.55}
                    strokeDasharray={edge.dashed ? "6 4" : undefined}
                    markerEnd={isSelected ? "url(#arrow-selected)" : "url(#arrow-default)"}
                  />
                  {/* 透明加粗命中区 */}
                  <path
                    d={edge.path}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={12}
                  />
                  {/* 连线标签 */}
                  {edge.label && (
                    <g>
                      <rect
                        x={edge.labelX - edge.label.length * 6 - 6}
                        y={edge.labelY - 9}
                        width={edge.label.length * 12 + 12}
                        height={18}
                        rx={4}
                        fill="white"
                        stroke="#e2e8f0"
                        strokeWidth={1}
                      />
                      <text
                        x={edge.labelX}
                        y={edge.labelY + 4}
                        textAnchor="middle"
                        className="text-[11px]"
                        fill="#475569"
                      >
                        {edge.label}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* 拖动对齐辅助线 */}
            {alignLines && (alignLines.x !== undefined || alignLines.y !== undefined) && (
              <g pointerEvents="none">
                {alignLines.x !== undefined && (
                  <line
                    x1={alignLines.x}
                    y1={-9999}
                    x2={alignLines.x}
                    y2={9999}
                    stroke="#ec4899"
                    strokeWidth={1}
                    strokeDasharray="4 3"
                  />
                )}
                {alignLines.y !== undefined && (
                  <line
                    x1={-9999}
                    y1={alignLines.y}
                    x2={9999}
                    y2={alignLines.y}
                    stroke="#ec4899"
                    strokeWidth={1}
                    strokeDasharray="4 3"
                  />
                )}
              </g>
            )}

            {/* 节点 */}
            {layout.nodes.map((node) => {
              const config = NODE_TYPE_CONFIG[node.type];
              const isSelected = node.id === selectedNodeId;
              const off = dragOffset?.id === node.id ? dragOffset : null;
              const isHover = hoverNodeId === node.id;
              const isConnectTarget = connecting?.hoverId === node.id;
              return (
                <g
                  key={node.id}
                  data-node-id={node.id}
                  style={{ cursor: dragOffset?.id === node.id ? "grabbing" : "move" }}
                  transform={`translate(${node.x + (off?.dx ?? 0)} ${node.y + (off?.dy ?? 0)})`}
                  onMouseDown={(e) => handleNodeMouseDown(e, node.id, node.x, node.y)}
                  onMouseEnter={() => setHoverNodeId(node.id)}
                  onMouseLeave={() => setHoverNodeId((h) => (h === node.id ? null : h))}
                  onDoubleClick={() => onEditNode?.(node.id)}
                >
                  {/* 原生 tooltip：节点名超长截断时显示完整内容 */}
                  <title>{node.name}{node.note ? `（${node.note}）` : ""}</title>
                  {/* 选中高亮 */}
                  {isSelected && (
                    <rect
                      x={-3}
                      y={-3}
                      width={NODE_WIDTH + 6}
                      height={NODE_HEIGHT + 6}
                      rx={12}
                      fill="none"
                      stroke="#3b82f6"
                      strokeWidth={2}
                    />
                  )}
                  {/* 节点底色 */}
                  <rect
                    width={NODE_WIDTH}
                    height={NODE_HEIGHT}
                    rx={10}
                    fill={config.bgColor}
                    stroke={config.borderColor}
                    strokeWidth={isSelected ? 2.5 : 1.8}
                    filter="drop-shadow(0 1px 2px rgb(0 0 0 / 0.06))"
                  />
                  {/* 左侧色条 */}
                  <rect
                    width={5}
                    height={NODE_HEIGHT}
                    rx={2.5}
                    fill={config.color}
                  />
                  {/* 图标 */}
                  <g transform={`translate(14 ${(NODE_HEIGHT - 28) / 2})`}>
                    <rect width={28} height={28} rx={6} fill={config.color} opacity={0.12} />
                    <svg x={4} y={4} width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={config.color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                      <path d={config.icon} />
                    </svg>
                  </g>
                  {/* 名称 */}
                  <text
                    x={52}
                    y={NODE_HEIGHT / 2 - 2}
                    className="font-semibold"
                    fontSize={13}
                    fill={config.textColor}
                  >
                    {node.name.length > 12 ? node.name.slice(0, 11) + "…" : node.name}
                  </text>
                  {/* 类型标签 */}
                  <text
                    x={52}
                    y={NODE_HEIGHT / 2 + 14}
                    fontSize={10}
                    fill={config.color}
                    opacity={0.75}
                  >
                    {config.label}
                  </text>
                  {/* 备注 */}
                  {node.note && (
                    <text
                      x={NODE_WIDTH - 10}
                      y={14}
                      textAnchor="end"
                      fontSize={9}
                      fill="#94a3b8"
                    >
                      {node.note.length > 8 ? node.note.slice(0, 7) + "…" : node.note}
                    </text>
                  )}
                  {/* 连线目标高亮 */}
                  {isConnectTarget && (
                    <rect
                      x={-3}
                      y={-3}
                      width={NODE_WIDTH + 6}
                      height={NODE_HEIGHT + 6}
                      rx={12}
                      fill="none"
                      stroke="#10b981"
                      strokeWidth={2.5}
                      strokeDasharray="4 3"
                    />
                  )}
                  {/* 连线锚点（hover 时显示，位置随排版方向） */}
                  {isHover && !connecting && (
                    <circle
                      cx={anchorPos.cx}
                      cy={anchorPos.cy}
                      r={6}
                      fill="#3b82f6"
                      stroke="white"
                      strokeWidth={2}
                      style={{ cursor: "crosshair" }}
                      onMouseDown={(e) =>
                        handleConnectMouseDown(e, node.id, node.x + anchorPos.cx, node.y + anchorPos.cy)
                      }
                    >
                      <title>拖拽到其他节点创建连线</title>
                    </circle>
                  )}
                </g>
              );
            })}

            {/* 连线拖拽临时线 */}
            {connecting && (
              <g pointerEvents="none">
                <path
                  d={`M ${connecting.fromX} ${connecting.fromY} L ${connecting.toX} ${connecting.toY}`}
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  strokeDasharray="5 4"
                  opacity={0.7}
                />
                <circle cx={connecting.toX} cy={connecting.toY} r={4} fill="#3b82f6" />
              </g>
            )}

            {/* 空状态提示 */}
            {layout.nodes.length === 0 && (
              <text
                x={layout.width / 2}
                y={80}
                textAnchor="middle"
                fontSize={14}
                fill="#94a3b8"
              >
                在左侧表单添加节点后，图表将自动生成
              </text>
            )}
          </g>
        </svg>
      </div>
    );
  }
);
