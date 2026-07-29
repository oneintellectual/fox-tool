/**
 * SSH 监控 - 指标分析模块
 *
 * 纯函数实现，不依赖任何 Node.js / SSH 专有模块，
 * 可被客户端组件安全导入。
 *
 * 输入 MonitorMetrics，输出健康评分、告警项和优化建议。
 */

import type {
  MonitorMetrics,
  CpuInfo,
  MemoryInfo,
  DiskPartition,
  ProcessInfo,
} from "./ssh-monitor-types";

/** 严重程度 */
export type Severity = "info" | "success" | "warning" | "critical";

/** 整体健康状态 */
export type HealthStatus = "excellent" | "good" | "warning" | "critical";

/** 单条分析项 */
export interface AnalysisItem {
  /** 所属维度 */
  category: "system" | "cpu" | "memory" | "disk" | "network" | "process";
  /** 严重程度 */
  severity: Severity;
  /** 标题 */
  title: string;
  /** 详细说明 */
  detail: string;
  /** 建议操作（可选） */
  suggestion?: string;
}

/** 维度评分（0-100） */
export interface CategoryScore {
  category: AnalysisItem["category"];
  score: number;
  label: string;
}

/** 完整的分析报告 */
export interface AnalysisReport {
  /** 整体健康评分 0-100 */
  overallScore: number;
  /** 整体状态 */
  status: HealthStatus;
  /** 状态文案 */
  statusText: string;
  /** 各维度评分 */
  scores: CategoryScore[];
  /** 告警/建议项（按严重程度排序） */
  items: AnalysisItem[];
  /** 关键风险摘要（最多 3 条） */
  topRisks: AnalysisItem[];
  /** 报告生成时间戳 */
  generatedAt: number;
}

/** 阈值配置 */
export interface AnalysisThresholds {
  cpuWarning: number; // CPU 使用率告警阈值
  cpuCritical: number;
  memWarning: number;
  memCritical: number;
  diskWarning: number;
  diskCritical: number;
  swapWarning: number; // Swap 使用率告警阈值
  loadPerCoreWarning: number; // 单核负载均衡告警阈值
  loadPerCoreCritical: number;
  processCpuWarning: number; // 单进程 CPU 告警阈值
  processMemWarning: number; // 单进程内存告警阈值
}

/** 默认阈值 */
export const DEFAULT_THRESHOLDS: AnalysisThresholds = {
  cpuWarning: 70,
  cpuCritical: 90,
  memWarning: 70,
  memCritical: 90,
  diskWarning: 80,
  diskCritical: 90,
  swapWarning: 50,
  loadPerCoreWarning: 1.0,
  loadPerCoreCritical: 2.0,
  processCpuWarning: 50,
  processMemWarning: 30,
};

/** 严重程度权重（用于排序） */
const SEVERITY_WEIGHT: Record<Severity, number> = {
  info: 0,
  success: 1,
  warning: 2,
  critical: 3,
};

/** 状态文案 */
const STATUS_TEXT: Record<HealthStatus, string> = {
  excellent: "优秀",
  good: "良好",
  warning: "需关注",
  critical: "存在风险",
};

/** 根据分数推导整体状态 */
function scoreToStatus(score: number): HealthStatus {
  if (score >= 90) return "excellent";
  if (score >= 75) return "good";
  if (score >= 60) return "warning";
  return "critical";
}

/** 将 0-1 区间映射为 0-100 分，越低越扣分 */
function usageToScore(usagePercent: number, warning: number, critical: number): number {
  if (usagePercent >= critical) {
    // 严重区间：从 50 线性下降到 0
    const t = Math.min(1, (usagePercent - critical) / (100 - critical || 1));
    return Math.round(50 * (1 - t));
  }
  if (usagePercent >= warning) {
    // 告警区间：从 90 线性下降到 50
    const t = (usagePercent - warning) / (critical - warning || 1);
    return Math.round(90 - 40 * t);
  }
  // 正常区间：90-100
  return Math.round(100 - (usagePercent / warning) * 10);
}

/** 分析 CPU 维度 */
function analyzeCpu(cpu: CpuInfo, thresholds: AnalysisThresholds): { score: number; items: AnalysisItem[] } {
  const items: AnalysisItem[] = [];
  const loadPerCore = cpu.cores > 0 ? cpu.loadAvg1 / cpu.cores : cpu.loadAvg1;

  // CPU 使用率
  if (cpu.usagePercent >= thresholds.cpuCritical) {
    items.push({
      category: "cpu",
      severity: "critical",
      title: "CPU 使用率严重过高",
      detail: `当前 CPU 使用率 ${cpu.usagePercent.toFixed(1)}%，已超过临界阈值 ${thresholds.cpuCritical}%`,
      suggestion: "立即排查高 CPU 进程，考虑扩容或重启相关服务",
    });
  } else if (cpu.usagePercent >= thresholds.cpuWarning) {
    items.push({
      category: "cpu",
      severity: "warning",
      title: "CPU 使用率偏高",
      detail: `当前 CPU 使用率 ${cpu.usagePercent.toFixed(1)}%，超过告警阈值 ${thresholds.cpuWarning}%`,
      suggestion: "关注 CPU 使用趋势，定位高负载进程",
    });
  } else {
    items.push({
      category: "cpu",
      severity: "success",
      title: "CPU 使用率正常",
      detail: `当前 CPU 使用率 ${cpu.usagePercent.toFixed(1)}%，运行平稳`,
    });
  }

  // 负载均衡
  if (loadPerCore >= thresholds.loadPerCoreCritical) {
    items.push({
      category: "cpu",
      severity: "critical",
      title: "系统负载严重过高",
      detail: `1 分钟平均负载 ${cpu.loadAvg1.toFixed(2)}，相对 ${cpu.cores} 核心的负载密度 ${loadPerCore.toFixed(2)}，超过临界阈值 ${thresholds.loadPerCoreCritical}`,
      suggestion: "系统已过载，可能存在进程卡死或资源争抢，建议立即处理",
    });
  } else if (loadPerCore >= thresholds.loadPerCoreWarning) {
    items.push({
      category: "cpu",
      severity: "warning",
      title: "系统负载偏高",
      detail: `1 分钟平均负载 ${cpu.loadAvg1.toFixed(2)}，相对核心数的负载密度 ${loadPerCore.toFixed(2)}`,
      suggestion: "关注负载变化，排查是否存在 CPU 密集型任务",
    });
  }

  // 负载趋势（1/5/15 分钟对比）
  if (cpu.loadAvg1 > cpu.loadAvg15 * 1.5 && cpu.loadAvg15 > 0) {
    items.push({
      category: "cpu",
      severity: "warning",
      title: "CPU 负载近期上升",
      detail: `1 分钟负载 ${cpu.loadAvg1.toFixed(2)} 明显高于 15 分钟负载 ${cpu.loadAvg15.toFixed(2)}，负载正在快速上升`,
      suggestion: "排查近期启动的高负载任务",
    });
  } else if (cpu.loadAvg1 < cpu.loadAvg15 * 0.5 && cpu.loadAvg1 > 0) {
    items.push({
      category: "cpu",
      severity: "info",
      title: "CPU 负载近期下降",
      detail: `1 分钟负载 ${cpu.loadAvg1.toFixed(2)} 低于 15 分钟负载 ${cpu.loadAvg15.toFixed(2)}，负载正在回落`,
    });
  }

  const score = usageToScore(cpu.usagePercent, thresholds.cpuWarning, thresholds.cpuCritical);
  return { score, items };
}

/** 分析内存维度 */
function analyzeMemory(
  mem: MemoryInfo,
  thresholds: AnalysisThresholds
): { score: number; items: AnalysisItem[] } {
  const items: AnalysisItem[] = [];

  // 内存使用率
  if (mem.usagePercent >= thresholds.memCritical) {
    items.push({
      category: "memory",
      severity: "critical",
      title: "内存使用率严重过高",
      detail: `内存使用率 ${mem.usagePercent.toFixed(1)}%，已用 ${(mem.used / 1024 / 1024).toFixed(2)} GB / 共 ${(mem.total / 1024 / 1024).toFixed(2)} GB`,
      suggestion: "立即排查高内存进程，考虑重启服务或扩容内存",
    });
  } else if (mem.usagePercent >= thresholds.memWarning) {
    items.push({
      category: "memory",
      severity: "warning",
      title: "内存使用率偏高",
      detail: `内存使用率 ${mem.usagePercent.toFixed(1)}%，已用 ${(mem.used / 1024 / 1024).toFixed(2)} GB`,
      suggestion: "关注内存使用趋势，定位高内存占用进程",
    });
  } else {
    items.push({
      category: "memory",
      severity: "success",
      title: "内存使用率正常",
      detail: `内存使用率 ${mem.usagePercent.toFixed(1)}%，可用 ${(mem.available / 1024 / 1024).toFixed(2)} GB`,
    });
  }

  // Swap 使用情况
  if (mem.swapTotal > 0) {
    const swapUsage = mem.swapTotal > 0 ? (mem.swapUsed / mem.swapTotal) * 100 : 0;
    if (swapUsage >= thresholds.swapWarning) {
      items.push({
        category: "memory",
        severity: swapUsage >= 80 ? "critical" : "warning",
        title: "Swap 正在被大量使用",
        detail: `Swap 已用 ${(mem.swapUsed / 1024 / 1024).toFixed(2)} GB / 共 ${(mem.swapTotal / 1024 / 1024).toFixed(2)} GB（${swapUsage.toFixed(1)}%）`,
        suggestion: "Swap 频繁使用会显著降低性能，说明物理内存不足，建议扩容或优化内存使用",
      });
    } else if (mem.swapUsed > 0) {
      items.push({
        category: "memory",
        severity: "info",
        title: "Swap 少量使用",
        detail: `Swap 已用 ${(mem.swapUsed / 1024 / 1024).toFixed(2)} GB（${swapUsage.toFixed(1)}%）`,
      });
    }
  }

  const score = usageToScore(mem.usagePercent, thresholds.memWarning, thresholds.memCritical);
  return { score, items };
}

/** 分析磁盘维度 */
function analyzeDisk(
  disks: DiskPartition[],
  thresholds: AnalysisThresholds
): { score: number; items: AnalysisItem[] } {
  const items: AnalysisItem[] = [];

  if (disks.length === 0) {
    return { score: 100, items: [{ category: "disk", severity: "info", title: "未检测到磁盘分区", detail: "无磁盘数据可供分析" }] };
  }

  let totalScore = 0;
  for (const disk of disks) {
    if (disk.usagePercent >= thresholds.diskCritical) {
      items.push({
        category: "disk",
        severity: "critical",
        title: `磁盘 ${disk.mount} 空间严重不足`,
        detail: `${disk.mount} 使用率 ${disk.usagePercent.toFixed(1)}%，剩余空间即将耗尽`,
        suggestion: `立即清理 ${disk.mount} 分区的大文件或日志，避免服务异常`,
      });
    } else if (disk.usagePercent >= thresholds.diskWarning) {
      items.push({
        category: "disk",
        severity: "warning",
        title: `磁盘 ${disk.mount} 空间偏紧`,
        detail: `${disk.mount} 使用率 ${disk.usagePercent.toFixed(1)}%`,
        suggestion: `定期清理 ${disk.mount} 分区，关注空间增长趋势`,
      });
    }
    totalScore += usageToScore(disk.usagePercent, thresholds.diskWarning, thresholds.diskCritical);
  }

  // 整体磁盘健康（取平均）
  const avgScore = Math.round(totalScore / disks.length);

  if (!items.some((i) => i.severity === "critical" || i.severity === "warning")) {
    items.push({
      category: "disk",
      severity: "success",
      title: "磁盘空间充足",
      detail: `共 ${disks.length} 个分区，使用率均在告警阈值以下`,
    });
  }

  return { score: avgScore, items };
}

/** 分析进程维度 */
function analyzeProcesses(
  processes: ProcessInfo[],
  thresholds: AnalysisThresholds
): { score: number; items: AnalysisItem[] } {
  const items: AnalysisItem[] = [];

  if (processes.length === 0) {
    return { score: 100, items: [{ category: "process", severity: "info", title: "无进程数据", detail: "未获取到进程信息" }] };
  }

  const highCpuProcs = processes.filter((p) => p.cpu >= thresholds.processCpuWarning);
  const highMemProcs = processes.filter((p) => p.mem >= thresholds.processMemWarning);

  if (highCpuProcs.length > 0) {
    const top = highCpuProcs[0];
    items.push({
      category: "process",
      severity: top.cpu >= 90 ? "critical" : "warning",
      title: `高 CPU 进程: ${top.command}`,
      detail: `进程 ${top.command}（PID ${top.pid}）占用 CPU ${top.cpu.toFixed(1)}%${
        highCpuProcs.length > 1 ? `，另有 ${highCpuProcs.length - 1} 个高 CPU 进程` : ""
      }`,
      suggestion: "检查该进程是否正常运行，必要时重启或优化",
    });
  }

  if (highMemProcs.length > 0) {
    const top = highMemProcs[0];
    items.push({
      category: "process",
      severity: top.mem >= 50 ? "critical" : "warning",
      title: `高内存进程: ${top.command}`,
      detail: `进程 ${top.command}（PID ${top.pid}）占用内存 ${top.mem.toFixed(1)}%${
        highMemProcs.length > 1 ? `，另有 ${highMemProcs.length - 1} 个高内存进程` : ""
      }`,
      suggestion: "检查该进程是否存在内存泄漏，必要时重启服务",
    });
  }

  if (items.length === 0) {
    items.push({
      category: "process",
      severity: "success",
      title: "进程运行正常",
      detail: `Top ${processes.length} 进程中未发现异常高资源占用`,
    });
  }

  // 进程评分：根据最重进程的 CPU/内存使用情况
  const maxCpu = Math.max(...processes.map((p) => p.cpu));
  const maxMem = Math.max(...processes.map((p) => p.mem));
  const cpuScore = usageToScore(maxCpu, thresholds.processCpuWarning, 100);
  const memScore = usageToScore(maxMem, thresholds.processMemWarning, 100);
  const score = Math.round((cpuScore + memScore) / 2);

  return { score, items };
}

/** 分析网络维度 */
function analyzeNetwork(metrics: MonitorMetrics): { score: number; items: AnalysisItem[] } {
  const items: AnalysisItem[] = [];
  const networks = metrics.networks;

  if (networks.length === 0) {
    return { score: 100, items: [{ category: "network", severity: "info", title: "无网络接口数据", detail: "未获取到网络接口信息" }] };
  }

  const upInterfaces = networks.filter((n) => n.rxBytes > 0 || n.txBytes > 0);
  const noIpInterfaces = networks.filter((n) => n.name !== "lo" && !n.ip);

  if (upInterfaces.length === 0) {
    items.push({
      category: "network",
      severity: "warning",
      title: "未检测到网络流量",
      detail: `共 ${networks.length} 个接口，但均未收发数据`,
      suggestion: "检查网络配置和服务状态",
    });
  } else {
    items.push({
      category: "network",
      severity: "success",
      title: "网络接口正常",
      detail: `共 ${networks.length} 个接口，其中 ${upInterfaces.length} 个有流量`,
    });
  }

  if (noIpInterfaces.length > 0) {
    items.push({
      category: "network",
      severity: "info",
      title: "部分接口未配置 IP",
      detail: `接口 ${noIpInterfaces.map((n) => n.name).join(", ")} 未检测到 IPv4 地址`,
    });
  }

  return { score: 95, items };
}

/** 分析系统维度 */
function analyzeSystem(metrics: MonitorMetrics): { score: number; items: AnalysisItem[] } {
  const items: AnalysisItem[] = [];
  const uptime = metrics.system.uptime;

  if (uptime < 300) {
    // 5 分钟内
    items.push({
      category: "system",
      severity: "warning",
      title: "系统刚刚重启",
      detail: `系统运行时长仅 ${metrics.system.uptimeStr}，可能刚刚发生重启`,
      suggestion: "排查重启原因，检查关键服务是否已正常启动",
    });
  } else if (uptime > 90 * 86400) {
    // 超过 90 天
    items.push({
      category: "system",
      severity: "info",
      title: "系统长期未重启",
      detail: `系统已连续运行 ${metrics.system.uptimeStr}（${Math.floor(uptime / 86400)} 天）`,
      suggestion: "建议在维护窗口期内安排重启，应用内核更新",
    });
  } else {
    items.push({
      category: "system",
      severity: "success",
      title: "系统运行稳定",
      detail: `已连续运行 ${metrics.system.uptimeStr}`,
    });
  }

  return { score: 100, items };
}

/**
 * 主分析函数：根据监控数据生成完整的分析报告
 */
export function analyzeMetrics(
  metrics: MonitorMetrics,
  thresholds: AnalysisThresholds = DEFAULT_THRESHOLDS
): AnalysisReport {
  const cpuResult = analyzeCpu(metrics.cpu, thresholds);
  const memResult = analyzeMemory(metrics.memory, thresholds);
  const diskResult = analyzeDisk(metrics.disks, thresholds);
  const procResult = analyzeProcesses(metrics.processes, thresholds);
  const netResult = analyzeNetwork(metrics);
  const sysResult = analyzeSystem(metrics);

  const scores: CategoryScore[] = [
    { category: "system", score: sysResult.score, label: "系统" },
    { category: "cpu", score: cpuResult.score, label: "CPU" },
    { category: "memory", score: memResult.score, label: "内存" },
    { category: "disk", score: diskResult.score, label: "磁盘" },
    { category: "network", score: netResult.score, label: "网络" },
    { category: "process", score: procResult.score, label: "进程" },
  ];

  const allItems: AnalysisItem[] = [
    ...sysResult.items,
    ...cpuResult.items,
    ...memResult.items,
    ...diskResult.items,
    ...netResult.items,
    ...procResult.items,
  ].sort((a, b) => SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity]);

  // 加权平均得分：CPU/内存/磁盘权重更高
  const weights: Record<CategoryScore["category"], number> = {
    system: 1,
    cpu: 3,
    memory: 3,
    disk: 2,
    network: 1,
    process: 2,
  };
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  const weightedSum = scores.reduce(
    (sum, s) => sum + s.score * weights[s.category],
    0
  );
  const overallScore = Math.round(weightedSum / totalWeight);
  const status = scoreToStatus(overallScore);

  // 提取关键风险（前 3 条 critical/warning）
  const topRisks = allItems
    .filter((i) => i.severity === "critical" || i.severity === "warning")
    .slice(0, 3);

  return {
    overallScore,
    status,
    statusText: STATUS_TEXT[status],
    scores,
    items: allItems,
    topRisks,
    generatedAt: Date.now(),
  };
}

/** 严重程度对应的颜色类（Tailwind） */
export function severityColor(severity: Severity): {
  text: string;
  bg: string;
  border: string;
  dot: string;
  label: string;
} {
  switch (severity) {
    case "critical":
      return {
        text: "text-red-700 dark:text-red-300",
        bg: "bg-red-50 dark:bg-red-900/20",
        border: "border-red-200 dark:border-red-900/50",
        dot: "bg-red-500",
        label: "严重",
      };
    case "warning":
      return {
        text: "text-amber-700 dark:text-amber-300",
        bg: "bg-amber-50 dark:bg-amber-900/20",
        border: "border-amber-200 dark:border-amber-900/50",
        dot: "bg-amber-500",
        label: "告警",
      };
    case "success":
      return {
        text: "text-emerald-700 dark:text-emerald-300",
        bg: "bg-emerald-50 dark:bg-emerald-900/20",
        border: "border-emerald-200 dark:border-emerald-900/50",
        dot: "bg-emerald-500",
        label: "正常",
      };
    case "info":
    default:
      return {
        text: "text-sky-700 dark:text-sky-300",
        bg: "bg-sky-50 dark:bg-sky-900/20",
        border: "border-sky-200 dark:border-sky-900/50",
        dot: "bg-sky-500",
        label: "提示",
      };
  }
}

/** 整体状态对应的颜色 */
export function statusColor(status: HealthStatus): {
  text: string;
  bg: string;
  border: string;
  gradient: string;
} {
  switch (status) {
    case "excellent":
      return {
        text: "text-emerald-700 dark:text-emerald-300",
        bg: "bg-emerald-50 dark:bg-emerald-900/20",
        border: "border-emerald-200 dark:border-emerald-900/50",
        gradient: "from-emerald-500 to-teal-600",
      };
    case "good":
      return {
        text: "text-sky-700 dark:text-sky-300",
        bg: "bg-sky-50 dark:bg-sky-900/20",
        border: "border-sky-200 dark:border-sky-900/50",
        gradient: "from-sky-500 to-blue-600",
      };
    case "warning":
      return {
        text: "text-amber-700 dark:text-amber-300",
        bg: "bg-amber-50 dark:bg-amber-900/20",
        border: "border-amber-200 dark:border-amber-900/50",
        gradient: "from-amber-500 to-orange-600",
      };
    case "critical":
    default:
      return {
        text: "text-red-700 dark:text-red-300",
        bg: "bg-red-50 dark:bg-red-900/20",
        border: "border-red-200 dark:border-red-900/50",
        gradient: "from-red-500 to-rose-600",
      };
  }
}
