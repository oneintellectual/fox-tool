/**
 * 图表自动布局引擎（简化版 Sugiyama 分层布局）
 *
 * 流程：
 *  1. 去除环边（仅用于布局，渲染时仍保留原始边）
 *  2. 分层：基于最长路径为每个节点分配层级
 *  3. 同层节点排序：尽量减少交叉
 *  4. 坐标赋值：按层居中分布
 */

import { DiagramNode, DiagramEdge, DiagramZone, LayoutDirection, EdgeStyle } from "./diagram-types";

/** 节点尺寸常量 */
export const NODE_WIDTH = 150;
export const NODE_HEIGHT = 64;
/** 层间距 */
export const LAYER_GAP = 90;
/** 同层节点间距 */
export const NODE_GAP = 40;
/** 画布内边距 */
export const PADDING = 40;
/** 区域背景框内边距 */
export const ZONE_PADDING = 24;
/** 区域标签条高度 */
export const ZONE_LABEL_HEIGHT = 22;
/** 不同区域之间的额外横向间距 */
export const ZONE_GAP = 30;

/**
 * 计算从矩形中心朝目标点方向、与矩形边框的交点（用于自由布局连线起止点）
 * @param cx 矩形中心 x
 * @param cy 矩形中心 y
 * @param tx 目标点 x
 * @param ty 目标点 y
 * @param hw 矩形半宽
 * @param hh 矩形半高
 */
function rectEdgePoint(cx: number, cy: number, tx: number, ty: number, hw: number, hh: number) {
  const dx = tx - cx;
  const dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  // 到各边的参数（取最小正值即先碰到的边）
  const tx_ = dx !== 0 ? hw / Math.abs(dx) : Infinity;
  const ty_ = dy !== 0 ? hh / Math.abs(dy) : Infinity;
  const t = Math.min(tx_, ty_);
  return { x: cx + dx * t, y: cy + dy * t };
}

/**
 * 根据起止点与样式生成路径（自由布局通用，方向无关）
 */
function buildPath(fromX: number, fromY: number, toX: number, toY: number, style: EdgeStyle) {
  if (style === "line") {
    return `M ${fromX} ${fromY} L ${toX} ${toY}`;
  }
  if (style === "orthogonal") {
    const midX = (fromX + toX) / 2;
    return `M ${fromX} ${fromY} L ${midX} ${fromY} L ${midX} ${toY} L ${toX} ${toY}`;
  }
  // 曲线：按主方向给控制点偏移
  const adx = Math.abs(toX - fromX);
  const ady = Math.abs(toY - fromY);
  if (adx >= ady) {
    const dx = Math.max(adx / 2, 30);
    return `M ${fromX} ${fromY} C ${fromX + dx} ${fromY}, ${toX - dx} ${toY}, ${toX} ${toY}`;
  }
  const dy = Math.max(ady / 2, 30);
  return `M ${fromX} ${fromY} C ${fromX} ${fromY + dy}, ${toX} ${toY - dy}, ${toX} ${toY}`;
}

/** 带坐标的节点 */
export interface PositionedNode extends DiagramNode {
  x: number;
  y: number;
  layer: number;
}

/** 带路径的连线 */
export interface PositionedEdge extends DiagramEdge {
  /** 贝塞尔路径 d 属性 */
  path: string;
  /** 标签中点坐标 */
  labelX: number;
  labelY: number;
}

/** 区域边界框（用于渲染背景矩形） */
export interface ZoneBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** 标签条 y 坐标（位于框顶部） */
  labelY: number;
}

/** 布局结果 */
export interface LayoutResult {
  nodes: PositionedNode[];
  edges: PositionedEdge[];
  zones: ZoneBox[];
  width: number;
  height: number;
}

/**
 * 对图进行分层布局
 * @param direction 排版方向：TB 从上到下（默认）/ LR 从左到右
 * @param edgeStyle 连线样式：curve 曲线（默认）/ line 直线 / orthogonal 直角线
 */
export function layoutDiagram(
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  zones: DiagramZone[] = [],
  direction: LayoutDirection = "TB",
  edgeStyle: EdgeStyle = "curve"
): LayoutResult {
  if (nodes.length === 0) {
    return { nodes: [], edges: [], zones: [], width: PADDING * 2, height: PADDING * 2 };
  }
  const isLR = direction === "LR";

  // 区域顺序映射（用于同层节点按 zone 分组排序）
  const zoneOrder = new Map<string, number>();
  zones.forEach((z, i) => zoneOrder.set(z.id, i));

  const nodeIds = new Set(nodes.map((n) => n.id));

  // 仅保留有效边的引用
  const validEdges = edges.filter(
    (e) => nodeIds.has(e.fromNodeId) && nodeIds.has(e.toNodeId)
  );

  // 1. 构建邻接表
  const outAdj = new Map<string, string[]>();
  const inAdj = new Map<string, string[]>();
  for (const id of nodeIds) {
    outAdj.set(id, []);
    inAdj.set(id, []);
  }
  for (const e of validEdges) {
    outAdj.get(e.fromNodeId)!.push(e.toNodeId);
    inAdj.get(e.toNodeId)!.push(e.fromNodeId);
  }

  // 2. 去环：检测回边并移除（Tarjan DFS）
  const removedBackEdges = new Set<string>();
  const edgeKey = (from: string, to: string) => `${from}->${to}`;
  {
    const state = new Map<string, 0 | 1 | 2>(); // 0=未访问 1=访问中 2=已完成
    for (const id of nodeIds) state.set(id, 0);
    const stack: string[] = [];
    const visit = (u: string) => {
      state.set(u, 1);
      stack.push(u);
      for (const v of outAdj.get(u)!) {
        if (removedBackEdges.has(edgeKey(u, v))) continue;
        const s = state.get(v)!;
        if (s === 1) {
          // 回边，移除
          removedBackEdges.add(edgeKey(u, v));
        } else if (s === 0) {
          visit(v);
        }
      }
      state.set(u, 2);
      stack.pop();
    };
    for (const id of nodeIds) {
      if (state.get(id) === 0) visit(id);
    }
  }

  // 构建去环后的邻接表
  const dagOut = new Map<string, string[]>();
  const dagIn = new Map<string, string[]>();
  for (const id of nodeIds) {
    dagOut.set(id, []);
    dagIn.set(id, []);
  }
  for (const e of validEdges) {
    if (removedBackEdges.has(edgeKey(e.fromNodeId, e.toNodeId))) continue;
    dagOut.get(e.fromNodeId)!.push(e.toNodeId);
    dagIn.get(e.toNodeId)!.push(e.fromNodeId);
  }

  // 3. 分层：最长路径（自底向上）
  //    层级 = max(前驱层级 + 1)，无前驱则为 0
  const layer = new Map<string, number>();
  for (const id of nodeIds) layer.set(id, 0);

  // 拓扑序处理（基于入度）
  const inDeg = new Map<string, number>();
  for (const id of nodeIds) inDeg.set(id, dagIn.get(id)!.length);
  const queue: string[] = [];
  for (const id of nodeIds) {
    if (inDeg.get(id) === 0) queue.push(id);
  }
  const topoOrder: string[] = [];
  while (queue.length > 0) {
    const u = queue.shift()!;
    topoOrder.push(u);
    for (const v of dagOut.get(u)!) {
      layer.set(v, Math.max(layer.get(v)!, layer.get(u)! + 1));
      inDeg.set(v, inDeg.get(v)! - 1);
      if (inDeg.get(v) === 0) queue.push(v);
    }
  }
  // 处理环中节点（拓扑序未覆盖），赋予最大层级
  for (const id of nodeIds) {
    if (!topoOrder.includes(id)) layer.set(id, 0);
  }

  // 4. 按层分组
  const maxLayer = Math.max(...layer.values());
  const layers: string[][] = Array.from({ length: maxLayer + 1 }, () => []);
  for (const id of nodeIds) {
    layers[layer.get(id)!].push(id);
  }

  // 5. 同层排序：优先按区域分组，组内按上层邻居平均位置排序
  //    这样同区域的节点会相邻，便于绘制区域背景框
  const nodeZone = new Map<string, string | undefined>();
  for (const n of nodes) nodeZone.set(n.id, n.zoneId);

  const zoneRank = (id: string) => {
    const z = nodeZone.get(id);
    return z ? zoneOrder.get(z) ?? 9999 : 10000;
  };

  // 先初始化每层顺序（稳定初始排序）
  for (let l = 0; l <= maxLayer; l++) {
    layers[l].sort((a, b) => a.localeCompare(b));
  }

  // 从上往下排序：主键区域，次键上层邻居平均位置
  const positionIndex = new Map<string, number>(); // 节点在所在层的序号
  for (let l = 0; l <= maxLayer; l++) {
    if (l === 0) {
      layers[l].sort((a, b) => zoneRank(a) - zoneRank(b) || a.localeCompare(b));
      layers[l].forEach((id, i) => positionIndex.set(id, i));
      continue;
    }
    layers[l].sort((a, b) => {
      const za = zoneRank(a);
      const zb = zoneRank(b);
      if (za !== zb) return za - zb;
      const neighborsA = dagIn.get(a)!.map((p) => positionIndex.get(p) ?? 0);
      const neighborsB = dagIn.get(b)!.map((p) => positionIndex.get(p) ?? 0);
      const avgA =
        neighborsA.length > 0
          ? neighborsA.reduce((s, v) => s + v, 0) / neighborsA.length
          : 9999;
      const avgB =
        neighborsB.length > 0
          ? neighborsB.reduce((s, v) => s + v, 0) / neighborsB.length
          : 9999;
      return avgA - avgB;
    });
    layers[l].forEach((id, i) => positionIndex.set(id, i));
  }

  // 6. 坐标赋值：同层节点沿 primary 轴居中分布，层沿 layer 轴递进
  //    TB: primary=x（节点宽 NODE_WIDTH），layer=y（节点高 NODE_HEIGHT）
  //    LR: primary=y（节点高 NODE_HEIGHT），layer=x（节点宽 NODE_WIDTH）
  const primarySize = isLR ? NODE_HEIGHT : NODE_WIDTH;
  const layerSize = isLR ? NODE_WIDTH : NODE_HEIGHT;
  const layerStep = layerSize + LAYER_GAP;

  // 6.1 计算每层沿 primary 轴的实际长度（不含区域间距，同层节点间距统一 NODE_GAP）
  //    区域为泳道式，横向（TB 模式下 primary=x）全宽，节点在层内居中排列
  const layerWidths = layers.map((layerNodes) => {
    if (layerNodes.length === 0) return 0;
    return layerNodes.length * primarySize + (layerNodes.length - 1) * NODE_GAP;
  });
  const primaryAxisLen = Math.max(...layerWidths, 0);

  // primaryMap 记录每个节点沿 primary 轴的坐标（从 PADDING 起算，整体居中于区域框）
  const primaryMap = new Map<string, number>();
  for (let l = 0; l <= maxLayer; l++) {
    const layerNodes = layers[l];
    const w = layerWidths[l];
    const startP = PADDING + (primaryAxisLen - w) / 2;
    for (let i = 0; i < layerNodes.length; i++) {
      primaryMap.set(layerNodes[i], startP + i * (primarySize + NODE_GAP));
    }
  }

  // 6.2 泳道式区域布局：把每一层分配给该层多数节点所属的区域；
  //     区域沿 layer 轴分段（TB 时是横向长条，LR 时是纵向长条），primary 轴铺满全宽/全高
  // layerZoneMap: layerIdx -> 该层所属 zoneId（按该层节点 zoneId 最多的那个，未归类留空）
  const layerZoneMap = new Map<number, string | undefined>();
  for (let l = 0; l <= maxLayer; l++) {
    const count = new Map<string, number>();
    for (const id of layers[l]) {
      const z = nodeZone.get(id);
      if (z) count.set(z, (count.get(z) ?? 0) + 1);
    }
    let bestZone: string | undefined;
    let bestCount = 0;
    for (const [z, c] of count) {
      if (c > bestCount) { bestZone = z; bestCount = c; }
    }
    layerZoneMap.set(l, bestZone);
  }

  // 计算层沿 layer 轴的起始坐标（每层高度固定 layerStep，但区域分隔处需留 ZONE_GAP）
  const layerLayerStart = new Map<number, number>();
  {
    let cursor = PADDING;
    let prevZone: string | undefined;
    for (let l = 0; l <= maxLayer; l++) {
      const z = layerZoneMap.get(l);
      if (l > 0 && z !== prevZone) cursor += ZONE_GAP;
      layerLayerStart.set(l, cursor);
      cursor += layerStep;
      prevZone = z;
    }
  }

  // 计算区域沿 layer 轴的起止位置（用于画背景框）
  const zoneLayerRange = new Map<string, { start: number; end: number }>();
  for (let l = 0; l <= maxLayer; l++) {
    const z = layerZoneMap.get(l);
    if (!z) continue;
    const start = layerLayerStart.get(l)!;
    const end = start + layerSize;
    const prev = zoneLayerRange.get(z);
    if (prev) {
      zoneLayerRange.set(z, {
        start: Math.min(prev.start, start),
        end: Math.max(prev.end, end),
      });
    } else {
      zoneLayerRange.set(z, { start, end });
    }
  }

  const hasManual = nodes.some((n) => typeof n.x === "number" && typeof n.y === "number");

  // 7. 构造结果节点
  const positionedNodes: PositionedNode[] = nodes.map((n) => {
    const l = layer.get(n.id) ?? 0;
    if (typeof n.x === "number" && typeof n.y === "number") {
      return { ...n, x: n.x, y: n.y, layer: l };
    }
    const p = primaryMap.get(n.id) ?? PADDING;
    const layerPos = layerLayerStart.get(l) ?? PADDING + l * layerStep;
    return {
      ...n,
      x: isLR ? layerPos : p,
      y: isLR ? p : layerPos,
      layer: l,
    };
  });

  // 8. 构造结果连线：自由布局用矩形边交点；自动布局按方向选固定边
  //    每条边可单独指定 edgeStyle，缺省时使用全局 edgeStyle
  const nodeMap = new Map(positionedNodes.map((n) => [n.id, n]));
  const positionedEdges: PositionedEdge[] = validEdges.map((e) => {
    const from = nodeMap.get(e.fromNodeId)!;
    const to = nodeMap.get(e.toNodeId)!;
    const style: EdgeStyle = e.edgeStyle ?? edgeStyle;

    let fromX: number, fromY: number, toX: number, toY: number;
    if (hasManual) {
      // 自由布局：计算两节点矩形边交点
      const fcx = from.x + NODE_WIDTH / 2;
      const fcy = from.y + NODE_HEIGHT / 2;
      const tcx = to.x + NODE_WIDTH / 2;
      const tcy = to.y + NODE_HEIGHT / 2;
      const p1 = rectEdgePoint(fcx, fcy, tcx, tcy, NODE_WIDTH / 2, NODE_HEIGHT / 2);
      const p2 = rectEdgePoint(tcx, tcy, fcx, fcy, NODE_WIDTH / 2, NODE_HEIGHT / 2);
      fromX = p1.x; fromY = p1.y; toX = p2.x; toY = p2.y;
    } else {
      // 自动布局：TB 从底中→顶中，LR 从右中→左中
      fromX = isLR ? from.x + NODE_WIDTH : from.x + NODE_WIDTH / 2;
      fromY = isLR ? from.y + NODE_HEIGHT / 2 : from.y + NODE_HEIGHT;
      toX = isLR ? to.x : to.x + NODE_WIDTH / 2;
      toY = isLR ? to.y + NODE_HEIGHT / 2 : to.y;
    }

    let path: string;
    if (hasManual) {
      path = buildPath(fromX, fromY, toX, toY, style);
    } else if (style === "line") {
      path = `M ${fromX} ${fromY} L ${toX} ${toY}`;
    } else if (style === "orthogonal") {
      if (isLR) {
        const midX = (fromX + toX) / 2;
        path = `M ${fromX} ${fromY} L ${midX} ${fromY} L ${midX} ${toY} L ${toX} ${toY}`;
      } else {
        const midY = (fromY + toY) / 2;
        path = `M ${fromX} ${fromY} L ${fromX} ${midY} L ${toX} ${midY} L ${toX} ${toY}`;
      }
    } else {
      if (isLR) {
        const dx = Math.max(Math.abs(toX - fromX) / 2, 30);
        path = `M ${fromX} ${fromY} C ${fromX + dx} ${fromY}, ${toX - dx} ${toY}, ${toX} ${toY}`;
      } else {
        const dy = Math.max(Math.abs(toY - fromY) / 2, 30);
        path = `M ${fromX} ${fromY} C ${fromX} ${fromY + dy}, ${toX} ${toY - dy}, ${toX} ${toY}`;
      }
    }
    return {
      ...e,
      path,
      labelX: (fromX + toX) / 2,
      labelY: (fromY + toY) / 2,
    };
  });

  // 9. 计算区域边界框与画布尺寸
  let zoneBoxes: ZoneBox[];
  let totalWidth: number;
  let totalHeight: number;

  if (hasManual) {
    // 自由布局：每个区域按自身节点实际边界计算框，画布取所有节点边界
    zoneBoxes = zones
      .map((zone) => {
        const zoneNodes = positionedNodes.filter((n) => n.zoneId === zone.id);
        if (zoneNodes.length === 0) return null;
        const minX = Math.min(...zoneNodes.map((n) => n.x));
        const minY = Math.min(...zoneNodes.map((n) => n.y));
        const maxX = Math.max(...zoneNodes.map((n) => n.x)) + NODE_WIDTH;
        const maxY = Math.max(...zoneNodes.map((n) => n.y)) + NODE_HEIGHT;
        return {
          id: zone.id,
          x: minX - ZONE_PADDING,
          y: minY - ZONE_PADDING - ZONE_LABEL_HEIGHT,
          width: maxX - minX + ZONE_PADDING * 2,
          height: maxY - minY + ZONE_PADDING * 2 + ZONE_LABEL_HEIGHT,
          labelY: minY - ZONE_PADDING - ZONE_LABEL_HEIGHT + ZONE_LABEL_HEIGHT / 2 + 4,
        };
      })
      .filter((b): b is ZoneBox => b !== null);

    const allMinX = Math.min(PADDING, ...positionedNodes.map((n) => n.x), ...zoneBoxes.map((b) => b.x));
    const allMinY = Math.min(PADDING, ...positionedNodes.map((n) => n.y), ...zoneBoxes.map((b) => b.y));
    const allMaxX = Math.max(PADDING + NODE_WIDTH, ...positionedNodes.map((n) => n.x + NODE_WIDTH), ...zoneBoxes.map((b) => b.x + b.width));
    const allMaxY = Math.max(PADDING + NODE_HEIGHT, ...positionedNodes.map((n) => n.y + NODE_HEIGHT), ...zoneBoxes.map((b) => b.y + b.height));
    totalWidth = allMaxX - allMinX + PADDING * 2;
    totalHeight = allMaxY - allMinY + PADDING * 2;
  } else {
    // 自动布局泳道式：区域沿 layer 轴分段（TB 时横向条、LR 时纵向条），primary 轴全宽/全高
    // primary 轴：从 PADDING 起算，内容居中
    const primaryStart = PADDING;
    const primaryEnd = PADDING + primaryAxisLen;
    const boxPrimaryStart = primaryStart - ZONE_PADDING;
    const boxPrimaryLen = primaryEnd - primaryStart + ZONE_PADDING * 2;

    // 计算最末层沿 layer 轴的结束位置
    const lastLayerStart = layerLayerStart.get(maxLayer) ?? PADDING + maxLayer * layerStep;
    const layerAxisEnd = lastLayerStart + layerSize;

    zoneBoxes = zones
      .map((zone) => {
        const range = zoneLayerRange.get(zone.id);
        if (!range) return null;
        const layerStart = range.start;
        const layerEnd = range.end;
        const boxLayerStart = layerStart - ZONE_PADDING - ZONE_LABEL_HEIGHT;
        const boxLayerLen = layerEnd - layerStart + ZONE_PADDING * 2 + ZONE_LABEL_HEIGHT;
        const labelLayerPos = layerStart - ZONE_PADDING - ZONE_LABEL_HEIGHT / 2 + 4;
        return {
          id: zone.id,
          x: isLR ? boxLayerStart : boxPrimaryStart,
          y: isLR ? boxPrimaryStart : boxLayerStart,
          width: isLR ? boxLayerLen : boxPrimaryLen,
          height: isLR ? boxPrimaryLen : boxLayerLen,
          labelY: isLR ? PADDING + 14 : labelLayerPos,
        };
      })
      .filter((b): b is ZoneBox => b !== null);

    const layerAxisTotal = layerAxisEnd + ZONE_PADDING;
    const primaryAxisTotal = primaryAxisLen + ZONE_PADDING * 2;
    totalWidth = isLR ? layerAxisTotal : primaryAxisTotal;
    totalHeight = isLR ? primaryAxisTotal : layerAxisTotal;
  }

  return {
    nodes: positionedNodes,
    edges: positionedEdges,
    zones: zoneBoxes,
    width: totalWidth,
    height: totalHeight,
  };
}
