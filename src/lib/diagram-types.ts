/**
 * 绘图模块类型定义与节点配置
 */

/** 图表类型：软件施工图 / 网络拓扑图 */
export type DiagramType = "software" | "network";

/** 排版方向：TB 从上到下 / LR 从左到右 */
export type LayoutDirection = "TB" | "LR";

/** 连线样式：curve 曲线 / line 直线 / orthogonal 直角线 */
export type EdgeStyle = "curve" | "line" | "orthogonal";

/** 节点类型（涵盖软件与网络两类场景） */
export type NodeType =
  // 软件施工图
  | "frontend"
  | "backend"
  | "database"
  | "cache"
  | "queue"
  | "gateway"
  | "service"
  | "external"
  // 网络拓扑图
  | "router"
  | "switch"
  | "firewall"
  | "server"
  | "loadbalancer"
  | "internet"
  | "client"
  | "cloud";

/** 节点定义 */
export interface DiagramNode {
  id: string;
  name: string;
  type: NodeType;
  note?: string;
  /** 所属网络区域 id */
  zoneId?: string;
  /** 自定义坐标（用户拖动后写入，脱离自动布局） */
  x?: number;
  y?: number;
}

/** 连线定义 */
export interface DiagramEdge {
  id: string;
  from: string;
  fromNodeId: string;
  toNodeId: string;
  label?: string;
  /** 连线样式：实线 / 虚线 */
  dashed?: boolean;
  /** 连线形状：曲线 / 直线 / 直角（缺省时取图表全局 edgeStyle） */
  edgeStyle?: EdgeStyle;
}

/** 网络区域定义（用于把节点分组到 DMZ、内网、办公区等） */
export interface DiagramZone {
  id: string;
  name: string;
  /** 区域主色（十六进制） */
  color: string;
  /** 区域描述（可选） */
  description?: string;
}

/** 完整图表数据 */
export interface DiagramData {
  type: DiagramType;
  title: string;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  /** 网络区域列表 */
  zones: DiagramZone[];
  /** 排版方向，默认从上到下 */
  direction?: LayoutDirection;
  /** 连线样式，默认曲线 */
  edgeStyle?: EdgeStyle;
}

/** 节点类型配置：展示名、主色、图标路径、所属分类 */
export interface NodeTypeConfig {
  label: string;
  color: string;
  /** 浅色背景（用于节点底色） */
  bgColor: string;
  /** 边框色 */
  borderColor: string;
  /** 文字色 */
  textColor: string;
  /** SVG 图标 path（24x24 viewBox） */
  icon: string;
  category: "software" | "network";
}

export const NODE_TYPE_CONFIG: Record<NodeType, NodeTypeConfig> = {
  // ---- 软件施工图 ----
  frontend: {
    label: "前端",
    color: "#3b82f6",
    bgColor: "#eff6ff",
    borderColor: "#3b82f6",
    textColor: "#1e3a8a",
    category: "software",
    icon: "M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25",
  },
  backend: {
    label: "后端服务",
    color: "#6366f1",
    bgColor: "#eef2ff",
    borderColor: "#6366f1",
    textColor: "#312e81",
    category: "software",
    icon: "M21.75 17.25v-.228a4.5 4.5 0 00-.12-1.03l-2.268-9.64a3.375 3.375 0 00-3.285-2.602H7.923a3.375 3.375 0 00-3.285 2.602l-2.268 9.64a4.5 4.5 0 00-.12 1.03v.228m19.5 0a3 3 0 01-3 3H5.25a3 3 0 01-3-3m19.5 0a3 3 0 00-3-3H5.25a3 3 0 00-3 3m16.5 0h.008v.008h-.008v-.008zm-3 0h.008v.008h-.008v-.008z",
  },
  database: {
    label: "数据库",
    color: "#f59e0b",
    bgColor: "#fffbeb",
    borderColor: "#f59e0b",
    textColor: "#78350f",
    category: "software",
    icon: "M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75",
  },
  cache: {
    label: "缓存",
    color: "#f43f5e",
    bgColor: "#fff1f2",
    borderColor: "#f43f5e",
    textColor: "#881337",
    category: "software",
    icon: "M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z",
  },
  queue: {
    label: "消息队列",
    color: "#8b5cf6",
    bgColor: "#f5f3ff",
    borderColor: "#8b5cf6",
    textColor: "#4c1d95",
    category: "software",
    icon: "M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5",
  },
  gateway: {
    label: "网关",
    color: "#06b6d4",
    bgColor: "#ecfeff",
    borderColor: "#06b6d4",
    textColor: "#155e75",
    category: "software",
    icon: "M12 21a9 9 0 100-18 9 9 0 000 18zm0 0V3m-9 9h18M3.6 9h16.8M3.6 15h16.8",
  },
  service: {
    label: "微服务",
    color: "#14b8a6",
    bgColor: "#f0fdfa",
    borderColor: "#14b8a6",
    textColor: "#134e4a",
    category: "software",
    icon: "M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L21.75 12l-4.179 2.25m0 0l4.179 2.25L12 21.75 2.25 16.5l4.179-2.25m11.142 0l-5.571 3-5.571-3",
  },
  external: {
    label: "外部服务",
    color: "#64748b",
    bgColor: "#f8fafc",
    borderColor: "#64748b",
    textColor: "#334155",
    category: "software",
    icon: "M12 21a9 9 0 100-18 9 9 0 000 18zm9-9H3m9-9a13.5 13.5 0 010 18m0-18a13.5 13.5 0 000 18",
  },

  // ---- 网络拓扑图 ----
  router: {
    label: "路由器",
    color: "#3b82f6",
    bgColor: "#eff6ff",
    borderColor: "#3b82f6",
    textColor: "#1e3a8a",
    category: "network",
    icon: "M3.75 6.75h16.5v10.5H3.75V6.75zM6 12h.01M9 12h.01M15 12h.01M18 12h.01M6 9.75h.01M9 9.75h.01M12 9.75h.01M15 9.75h.01M18 9.75h.01",
  },
  switch: {
    label: "交换机",
    color: "#14b8a6",
    bgColor: "#f0fdfa",
    borderColor: "#14b8a6",
    textColor: "#134e4a",
    category: "network",
    icon: "M3.75 4.5h16.5v6H3.75v-6zm0 9h16.5v6H3.75v-6zM7.5 7.5v.01M7.5 16.5v.01",
  },
  firewall: {
    label: "防火墙",
    color: "#ef4444",
    bgColor: "#fef2f2",
    borderColor: "#ef4444",
    textColor: "#7f1d1d",
    category: "network",
    icon: "M12 2.25l8.25 3v6.75c0 4.97-3.69 8.97-8.25 9.75-4.56-.78-8.25-4.78-8.25-9.75V5.25l8.25-3zM12 8.25v7.5M8.25 12h7.5",
  },
  server: {
    label: "服务器",
    color: "#64748b",
    bgColor: "#f8fafc",
    borderColor: "#64748b",
    textColor: "#334155",
    category: "network",
    icon: "M21.75 17.25v-.228a4.5 4.5 0 00-.12-1.03l-2.268-9.64a3.375 3.375 0 00-3.285-2.602H7.923a3.375 3.375 0 00-3.285 2.602l-2.268 9.64a4.5 4.5 0 00-.12 1.03v.228m19.5 0a3 3 0 01-3 3H5.25a3 3 0 01-3-3m19.5 0a3 3 0 00-3-3H5.25a3 3 0 00-3 3m16.5 0h.008v.008h-.008v-.008zm-3 0h.008v.008h-.008v-.008z",
  },
  loadbalancer: {
    label: "负载均衡",
    color: "#f97316",
    bgColor: "#fff7ed",
    borderColor: "#f97316",
    textColor: "#7c2d12",
    category: "network",
    icon: "M12 6v6m0 0l-3 3m3-3l3 3M3 12a9 9 0 1118 0 9 9 0 01-18 0z",
  },
  internet: {
    label: "互联网",
    color: "#0ea5e9",
    bgColor: "#f0f9ff",
    borderColor: "#0ea5e9",
    textColor: "#075985",
    category: "network",
    icon: "M12 21a9 9 0 100-18 9 9 0 000 18zm0 0V3m-9 9h18M3.6 9h16.8M3.6 15h16.8",
  },
  client: {
    label: "客户端",
    color: "#22c55e",
    bgColor: "#f0fdf4",
    borderColor: "#22c55e",
    textColor: "#14532d",
    category: "network",
    icon: "M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25",
  },
  cloud: {
    label: "云服务",
    color: "#8b5cf6",
    bgColor: "#f5f3ff",
    borderColor: "#8b5cf6",
    textColor: "#4c1d95",
    category: "network",
    icon: "M2.25 15a4.5 4.5 0 004.5 4.5H18a3.75 3.75 0 001.332-7.257 3 3 0 00-3.758-3.848 5.25 5.25 0 00-10.233 2.33A4.502 4.502 0 002.25 15z",
  },
};

/** 按图表类型过滤可选节点类型 */
export function getNodeTypesByDiagram(type: DiagramType): NodeType[] {
  return (Object.keys(NODE_TYPE_CONFIG) as NodeType[]).filter(
    (t) => NODE_TYPE_CONFIG[t].category === type
  );
}

/** 生成唯一 ID */
export function genId(prefix = "id"): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/** 网络区域预设颜色（用于新建区域时的色板） */
export const ZONE_PRESET_COLORS: string[] = [
  "#f97316", // 橙（DMZ）
  "#3b82f6", // 蓝（核心）
  "#22c55e", // 绿（内网）
  "#8b5cf6", // 紫（办公）
  "#ef4444", // 红（高危）
  "#06b6d4", // 青（数据）
  "#f59e0b", // 琥珀（管理）
  "#64748b", // 灰（外部）
];

/** 网络区域预设模板（按图表类型提供常用区域） */
export const ZONE_PRESETS: Record<DiagramType, { name: string; color: string; description?: string }[]> = {
  network: [
    { name: "互联网区", color: "#64748b", description: "不可信外部网络" },
    { name: "DMZ 区", color: "#f97316", description: "对外服务隔离区" },
    { name: "核心区", color: "#3b82f6", description: "核心业务网络" },
    { name: "数据区", color: "#06b6d4", description: "数据库与存储" },
    { name: "办公区", color: "#8b5cf6", description: "内部办公终端" },
  ],
  software: [
    { name: "接入层", color: "#06b6d4", description: "前端与网关" },
    { name: "应用层", color: "#3b82f6", description: "业务服务" },
    { name: "数据层", color: "#f59e0b", description: "数据库与缓存" },
    { name: "外部依赖", color: "#64748b", description: "第三方服务" },
  ],
};
