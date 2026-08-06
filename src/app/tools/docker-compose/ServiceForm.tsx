"use client";

import { useCallback, useMemo } from "react";
import {
  DockerService,
  DockerComposeConfig,
  generateDockerComposeYAML,
} from "@/lib/docker-compose-generator";

/**
 * 表单字段类型
 */
type FieldType = "text" | "textarea" | "list" | "kv" | "select" | "boolean";

/**
 * 单个表单字段定义
 */
interface FieldDef {
  /** 表单数据中的 key（ServiceForm 的字段名） */
  key: keyof ServiceForm;
  /** 字段标签 */
  label: string;
  /** 是否必填 */
  required?: boolean;
  /** 字段说明（解释含义与格式） */
  description: string;
  /** 字段类型 */
  type: FieldType;
  /** 占位符 */
  placeholder?: string;
  /** select 类型的可选值 */
  options?: { value: string; label: string }[];
}

/**
 * 字段分组（用于 UI 折叠展示）
 */
interface SectionDef {
  title: string;
  icon: string;
  /** 分组简介 */
  summary: string;
  fields: FieldDef[];
}

/**
 * 表单数据结构（全部为字符串/布尔，便于受控输入）
 * 列表类字段以换行分隔，KV 类字段以 KEY=VALUE 每行一条
 */
export interface ServiceForm {
  // —— 必填 ——
  /** 服务名（compose 中 services 下的 key） */
  serviceName: string;
  /** 镜像名 */
  image: string;

  // —— 基本 ——
  container_name: string;
  hostname: string;
  restart: string;
  user: string;
  working_dir: string;
  entrypoint: string;
  command: string;

  // —— 网络与端口 ——
  ports: string; // 每行一条 host:container
  expose: string; // 每行一条 port
  networks: string; // 每行一条 network 名
  extra_hosts: string; // 每行一条 host:ip
  dns: string; // 每行一条 ip

  // —— 存储与环境 ——
  volumes: string; // 每行一条 src:dst[:mode]
  environment: string; // 每行一条 KEY=VALUE
  env_file: string; // 每行一条 文件路径
  tmpfs: string; // 每行一条 路径
  devices: string; // 每行一条 src:dst
  shm_size: string; // 例如 64m

  // —— 资源限制 ——
  mem_limit: string; // 例如 512m
  memswap_limit: string;
  cpus: string; // 例如 1.5
  cpu_shares: string; // 数值
  cpuset: string; // 例如 0-3

  // —— 安全与权限 ——
  cap_add: string; // 每行一条 CAP
  cap_drop: string;
  security_opt: string; // 每行一条 例如 seccomp:unconfined
  sysctls: string; // 每行一条 KEY=VALUE
  ulimits: string; // 每行一条 name=soft:hard
  privileged: boolean;
  read_only: boolean;
  init: boolean;
  stdin_open: boolean;
  tty: boolean;

  // —— 日志 ——
  log_driver: string;
  log_options: string; // 每行一条 KEY=VALUE

  // —— 健康检查 ——
  health_test: string;
  health_interval: string;
  health_timeout: string;
  health_retries: string;
  health_start_period: string;

  // —— 标签 ——
  labels: string; // 每行一条 KEY=VALUE
}

/**
 * 字段分组定义（声明式配置，含必填标记与说明）
 */
const SECTIONS: SectionDef[] = [
  {
    title: "基本",
    icon: "📋",
    summary: "服务标识与镜像",
    fields: [
      {
        key: "serviceName",
        label: "服务名",
        required: true,
        type: "text",
        description:
          "docker-compose.yml 中 services 节点下的服务标识名。仅允许小写字母、数字、中划线、下划线，不能以数字开头。例如 nginx、mysql-db",
        placeholder: "nginx",
      },
      {
        key: "image",
        label: "镜像",
        required: true,
        type: "text",
        description:
          "要使用的镜像名，可含 tag 或 digest。例如 nginx:1.25-alpine、mysql:8.0、registry.example.com/app:latest",
        placeholder: "nginx:1.25-alpine",
      },
      {
        key: "container_name",
        label: "容器名",
        type: "text",
        description:
          "对应 docker run --name。指定后容器名固定，多个 compose 项目可能冲突；不填则 compose 自动生成 形如 <项目>-<服务>-1",
        placeholder: "nginx-web",
      },
      {
        key: "hostname",
        label: "主机名",
        type: "text",
        description: "对应 docker run --hostname，设置容器内的 hostname，便于容器间通过主机名互访",
        placeholder: "nginx",
      },
      {
        key: "restart",
        label: "重启策略",
        type: "select",
        description:
          "对应 docker run --restart。容器退出后的处理策略：no=不重启（默认）、always=总是重启、unless-stopped=除非手动停止否则重启、on-failure=仅异常退出时重启",
        options: [
          { value: "", label: "不指定（默认 no）" },
          { value: "no", label: "no · 不重启" },
          { value: "always", label: "always · 总是重启" },
          { value: "unless-stopped", label: "unless-stopped · 除非手动停止" },
          { value: "on-failure", label: "on-failure · 异常退出时重启" },
        ],
      },
      {
        key: "user",
        label: "运行用户",
        type: "text",
        description: "对应 docker run --user。容器内运行进程的 UID[:GID]，例如 1000、1000:1000、nginx",
        placeholder: "1000:1000",
      },
      {
        key: "working_dir",
        label: "工作目录",
        type: "text",
        description: "对应 docker run --workdir。容器内进程的 cwd",
        placeholder: "/app",
      },
      {
        key: "entrypoint",
        label: "入口点",
        type: "text",
        description: "对应 docker run --entrypoint。覆盖镜像 ENTRYPOINT，例如 /docker-entrypoint.sh",
        placeholder: "/docker-entrypoint.sh",
      },
      {
        key: "command",
        label: "启动命令",
        type: "text",
        description:
          "镜像名之后的位置参数，覆盖镜像 CMD。例如 redis-server --appendonly yes；多个参数用空格分隔（支持引号）",
        placeholder: "redis-server --appendonly yes",
      },
    ],
  },
  {
    title: "网络与端口",
    icon: "🔌",
    summary: "端口映射、网络、主机名解析",
    fields: [
      {
        key: "ports",
        label: "端口映射",
        type: "list",
        description:
          "对应 docker run -p。每行一条，格式 host:container 或 host:container/protocol 或 ip:host:container。例如 80:80、443:443/tcp、127.0.0.1:3306:3306",
        placeholder: "80:80\n443:443",
      },
      {
        key: "expose",
        label: "内部暴露端口",
        type: "list",
        description:
          "对应 docker run --expose。仅对同一网络内的其他容器可见，不发布到宿主机。每行一条端口号",
        placeholder: "9000",
      },
      {
        key: "networks",
        label: "加入的网络",
        type: "list",
        description:
          "对应 docker run --network。每行一条网络名；引用的网络会自动归集到顶层 networks 声明",
        placeholder: "frontend\nbackend",
      },
      {
        key: "extra_hosts",
        label: "主机名解析",
        type: "list",
        description: "对应 docker run --add-host。每行一条 host:ip，相当于容器内 /etc/hosts 追加",
        placeholder: "db.local:10.0.0.5",
      },
      {
        key: "dns",
        label: "DNS 服务器",
        type: "list",
        description: "对应 docker run --dns。每行一条 DNS 服务器 IP",
        placeholder: "8.8.8.8\n8.8.4.4",
      },
    ],
  },
  {
    title: "存储与环境",
    icon: "💾",
    summary: "卷、环境变量、设备",
    fields: [
      {
        key: "volumes",
        label: "卷挂载",
        type: "list",
        description:
          "对应 docker run -v。每行一条，格式 src:dst[:mode]，src 可为宿主路径或命名卷；:ro 只读、:rw 读写（默认）",
        placeholder: "/data/nginx/html:/usr/share/nginx/html:ro\nmysql-data:/var/lib/mysql",
      },
      {
        key: "environment",
        label: "环境变量",
        type: "kv",
        description:
          "对应 docker run -e。每行一条 KEY=VALUE；仅写 KEY 表示从宿主同名变量继承",
        placeholder: "TZ=Asia/Shanghai\nMYSQL_ROOT_PASSWORD=secret",
      },
      {
        key: "env_file",
        label: "环境变量文件",
        type: "list",
        description: "对应 docker run --env-file。每行一个文件路径，文件内为 KEY=VALUE",
        placeholder: ".env\n./common.env",
      },
      {
        key: "tmpfs",
        label: "临时文件系统",
        type: "list",
        description: "对应 docker run --tmpfs。每行一条挂载点，数据写入内存不落盘",
        placeholder: "/tmp\n/run",
      },
      {
        key: "devices",
        label: "设备挂载",
        type: "list",
        description: "对应 docker run --device。每行一条 src:dst，将宿主设备映射进容器",
        placeholder: "/dev/ttyUSB0:/dev/ttyUSB0",
      },
      {
        key: "shm_size",
        label: "/dev/shm 大小",
        type: "text",
        description: "对应 docker run --shm-size。例如 64m、2g，提升共享内存上限（默认 64m）",
        placeholder: "256m",
      },
    ],
  },
  {
    title: "资源限制",
    icon: "📈",
    summary: "内存、CPU 限制",
    fields: [
      {
        key: "mem_limit",
        label: "内存上限",
        type: "text",
        description: "对应 docker run -m。例如 512m、2g。容器最大可使用内存",
        placeholder: "512m",
      },
      {
        key: "memswap_limit",
        label: "内存+交换上限",
        type: "text",
        description:
          "对应 docker run --memory-swap。mem + swap 的总和上限；-1 表示无限；通常应大于 mem_limit",
        placeholder: "1g",
      },
      {
        key: "cpus",
        label: "CPU 数量",
        type: "text",
        description: "对应 docker run --cpus。可使用小数，例如 1.5 表示最多 1.5 个 CPU",
        placeholder: "1.5",
      },
      {
        key: "cpu_shares",
        label: "CPU 权重",
        type: "text",
        description: "对应 docker run --cpu-shares。相对权重（默认 1024），CPU 竞争时按比例分配",
        placeholder: "512",
      },
      {
        key: "cpuset",
        label: "绑定 CPU",
        type: "text",
        description: "对应 docker run --cpuset-cpus。例如 0-3 表示仅使用第 0~3 号 CPU 核心",
        placeholder: "0-3",
      },
    ],
  },
  {
    title: "安全与权限",
    icon: "🛡️",
    summary: "能力、内核参数、特权",
    fields: [
      {
        key: "cap_add",
        label: "添加能力",
        type: "list",
        description: "对应 docker run --cap-add。每行一条 Linux capability，例如 SYS_NICE、NET_ADMIN",
        placeholder: "SYS_NICE",
      },
      {
        key: "cap_drop",
        label: "删除能力",
        type: "list",
        description: "对应 docker run --cap-drop。每行一条，移除默认授予的能力以最小化权限",
        placeholder: "ALL",
      },
      {
        key: "security_opt",
        label: "安全选项",
        type: "list",
        description: "对应 docker run --security-opt。每行一条，例如 seccomp:unconfined、apparmor:unconfined",
        placeholder: "seccomp:unconfined",
      },
      {
        key: "sysctls",
        label: "内核参数",
        type: "kv",
        description: "对应 docker run --sysctl。每行一条 KEY=VALUE，运行时修改容器内核参数",
        placeholder: "net.core.somaxconn=1024",
      },
      {
        key: "ulimits",
        label: "资源限制(ulimit)",
        type: "list",
        description:
          "对应 docker run --ulimit。每行一条 name=soft 或 name=soft:hard，例如 nofile=65535:65535",
        placeholder: "nofile=65535:65535",
      },
      {
        key: "privileged",
        label: "特权模式",
        type: "boolean",
        description: "对应 docker run --privileged。赋予容器几乎等同于宿主的权限，慎用（默认关闭）",
      },
      {
        key: "read_only",
        label: "只读根文件系统",
        type: "boolean",
        description: "对应 docker run --read-only。容器根文件系统只读，写入需通过 volumes/tmpfs",
      },
      {
        key: "init",
        label: "使用 init 进程",
        type: "boolean",
        description: "对应 docker run --init。在容器内运行轻量 init（tini），回收僵尸进程并转发信号",
      },
      {
        key: "stdin_open",
        label: "保持 stdin 打开",
        type: "boolean",
        description: "对应 docker run -i。通常用于交互式场景，配合 tty 使用",
      },
      {
        key: "tty",
        label: "分配 TTY",
        type: "boolean",
        description: "对应 docker run -t。为容器分配伪终端，便于输出彩色与交互",
      },
    ],
  },
  {
    title: "日志",
    icon: "📜",
    summary: "日志驱动与选项",
    fields: [
      {
        key: "log_driver",
        label: "日志驱动",
        type: "select",
        description: "对应 docker run --log-driver。默认 json-file，可选 syslog、journald、fluentd、gelf 等",
        options: [
          { value: "", label: "不指定（默认 json-file）" },
          { value: "json-file", label: "json-file" },
          { value: "syslog", label: "syslog" },
          { value: "journald", label: "journald" },
          { value: "fluentd", label: "fluentd" },
          { value: "gelf", label: "gelf" },
          { value: "none", label: "none · 不收集日志" },
        ],
      },
      {
        key: "log_options",
        label: "日志选项",
        type: "kv",
        description:
          "对应 docker run --log-opt。每行一条 KEY=VALUE，常用 max-size、max-file 控制日志轮转",
        placeholder: "max-size=10m\nmax-file=3",
      },
    ],
  },
  {
    title: "健康检查",
    icon: "❤️",
    summary: "容器存活探针",
    fields: [
      {
        key: "health_test",
        label: "检查命令",
        type: "text",
        description:
          "对应 docker run --health-cmd。在容器内周期执行的命令，退出码 0 视为健康。例如 curl -f http://localhost/ || exit 1",
        placeholder: "curl -f http://localhost/ || exit 1",
      },
      {
        key: "health_interval",
        label: "检查间隔",
        type: "text",
        description: "对应 docker run --health-interval。例如 30s、1m，两次检查之间的时间",
        placeholder: "30s",
      },
      {
        key: "health_timeout",
        label: "超时时间",
        type: "text",
        description: "对应 docker run --health-timeout。单次检查最长执行时间，超时视为失败",
        placeholder: "5s",
      },
      {
        key: "health_retries",
        label: "重试次数",
        type: "text",
        description: "对应 docker run --health-retries。连续失败次数达到该值后标记为 unhealthy",
        placeholder: "3",
      },
      {
        key: "health_start_period",
        label: "启动宽限期",
        type: "text",
        description: "对应 docker run --health-start-period。例如 40s，容器启动初期失败不计入重试",
        placeholder: "40s",
      },
    ],
  },
  {
    title: "标签",
    icon: "🏷️",
    summary: "容器元数据标签",
    fields: [
      {
        key: "labels",
        label: "标签",
        type: "kv",
        description: "对应 docker run -l。每行一条 KEY=VALUE，附加到容器的元数据，便于编排或过滤",
        placeholder: "com.example.role=web\ncom.example.env=prod",
      },
    ],
  },
];

/** 创建空白服务表单（提供默认服务名） */
export function createEmptyService(existingNames: Set<string>): ServiceForm {
  const base = "service";
  let n = 1;
  let name = base;
  while (existingNames.has(name)) {
    n++;
    name = `${base}-${n}`;
  }
  return {
    serviceName: name,
    image: "",
    container_name: "",
    hostname: "",
    restart: "",
    user: "",
    working_dir: "",
    entrypoint: "",
    command: "",
    ports: "",
    expose: "",
    networks: "",
    extra_hosts: "",
    dns: "",
    volumes: "",
    environment: "",
    env_file: "",
    tmpfs: "",
    devices: "",
    shm_size: "",
    mem_limit: "",
    memswap_limit: "",
    cpus: "",
    cpu_shares: "",
    cpuset: "",
    cap_add: "",
    cap_drop: "",
    security_opt: "",
    sysctls: "",
    ulimits: "",
    privileged: false,
    read_only: false,
    init: false,
    stdin_open: false,
    tty: false,
    log_driver: "",
    log_options: "",
    health_test: "",
    health_interval: "",
    health_timeout: "",
    health_retries: "",
    health_start_period: "",
    labels: "",
  };
}

/** 把多行文本切分为非空行数组 */
function splitLines(s: string): string[] {
  return s
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/** 把多行 KEY=VALUE 切分为键值对象 */
function parseKV(s: string): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const line of splitLines(s)) {
    const eq = line.indexOf("=");
    if (eq < 0) {
      out[line] = null;
    } else {
      out[line.slice(0, eq)] = line.slice(eq + 1);
    }
  }
  return out;
}

/** 把 ulimits 多行解析为对象 */
function parseUlimits(s: string): Record<string, { soft?: number; hard?: number }> {
  const out: Record<string, { soft?: number; hard?: number }> = {};
  for (const line of splitLines(s)) {
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const name = line.slice(0, eq);
    const rest = line.slice(eq + 1);
    const parts = rest.split(":");
    const soft = parseInt(parts[0], 10);
    const hard = parts[1] !== undefined ? parseInt(parts[1], 10) : undefined;
    if (Number.isNaN(soft)) continue;
    out[name] = {
      soft,
      ...(hard !== undefined && !Number.isNaN(hard) ? { hard } : {}),
    };
  }
  return out;
}

/**
 * 将单个表单转换为 DockerService（仅包含非空字段）
 */
export function formToService(form: ServiceForm): DockerService {
  const svc: DockerService = { image: form.image };

  if (form.container_name) svc.container_name = form.container_name;
  if (form.hostname) svc.hostname = form.hostname;
  if (form.restart) svc.restart = form.restart;
  if (form.user) svc.user = form.user;
  if (form.working_dir) svc.working_dir = form.working_dir;
  if (form.entrypoint) svc.entrypoint = form.entrypoint;
  if (form.command) svc.command = form.command;

  const ports = splitLines(form.ports);
  if (ports.length) svc.ports = ports;
  const expose = splitLines(form.expose);
  if (expose.length) svc.expose = expose;
  const networks = splitLines(form.networks);
  if (networks.length) svc.networks = networks;
  const extra_hosts = splitLines(form.extra_hosts);
  if (extra_hosts.length) svc.extra_hosts = extra_hosts;
  const dns = splitLines(form.dns);
  if (dns.length) svc.dns = dns;

  const volumes = splitLines(form.volumes);
  if (volumes.length) svc.volumes = volumes;
  const env = parseKV(form.environment);
  if (Object.keys(env).length) svc.environment = env;
  const env_file = splitLines(form.env_file);
  if (env_file.length) svc.env_file = env_file;
  const tmpfs = splitLines(form.tmpfs);
  if (tmpfs.length) svc.tmpfs = tmpfs;
  const devices = splitLines(form.devices);
  if (devices.length) svc.devices = devices;
  if (form.shm_size) svc.shm_size = form.shm_size;

  if (form.mem_limit) svc.mem_limit = form.mem_limit;
  if (form.memswap_limit) svc.memswap_limit = form.memswap_limit;
  if (form.cpus) svc.cpus = form.cpus;
  if (form.cpu_shares) svc.cpu_shares = form.cpu_shares;
  if (form.cpuset) svc.cpuset = form.cpuset;

  const cap_add = splitLines(form.cap_add);
  if (cap_add.length) svc.cap_add = cap_add;
  const cap_drop = splitLines(form.cap_drop);
  if (cap_drop.length) svc.cap_drop = cap_drop;
  const security_opt = splitLines(form.security_opt);
  if (security_opt.length) svc.security_opt = security_opt;
  const sysctls = parseKV(form.sysctls);
  if (Object.keys(sysctls).length) svc.sysctls = sysctls as Record<string, string>;
  const ulimits = parseUlimits(form.ulimits);
  if (Object.keys(ulimits).length) svc.ulimits = ulimits;
  if (form.privileged) svc.privileged = true;
  if (form.read_only) svc.read_only = true;
  if (form.init) svc.init = true;
  if (form.stdin_open) svc.stdin_open = true;
  if (form.tty) svc.tty = true;

  if (form.log_driver || form.log_options.trim()) {
    svc.logging = {
      driver: form.log_driver || "json-file",
      ...(form.log_options.trim()
        ? { options: parseKV(form.log_options) as Record<string, string> }
        : {}),
    };
  }

  if (form.health_test) {
    svc.healthcheck = {
      test: form.health_test,
      ...(form.health_interval ? { interval: form.health_interval } : {}),
      ...(form.health_timeout ? { timeout: form.health_timeout } : {}),
      ...(form.health_retries
        ? { retries: parseInt(form.health_retries, 10) || undefined }
        : {}),
      ...(form.health_start_period
        ? { start_period: form.health_start_period }
        : {}),
    };
  }

  const labels = parseKV(form.labels);
  if (Object.keys(labels).length) svc.labels = labels;

  return svc;
}

/**
 * 多服务表单 → docker-compose.yml
 */
export function formsToComposeYAML(
  forms: ServiceForm[]
): { yaml: string; serviceCount: number; errors: string[] } {
  const errors: string[] = [];
  const usedNames = new Set<string>();
  const config: DockerComposeConfig = { services: {} };
  const allNetworks = new Set<string>();

  for (let i = 0; i < forms.length; i++) {
    const f = forms[i];
    const name = f.serviceName.trim();
    if (!name) {
      errors.push(`第 ${i + 1} 个服务：服务名为空`);
      continue;
    }
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(name)) {
      errors.push(
        `第 ${i + 1} 个服务：服务名 "${name}" 不合法（需以小写字母/数字开头，仅含 a-z0-9_-）`
      );
      continue;
    }
    if (usedNames.has(name)) {
      errors.push(`第 ${i + 1} 个服务：服务名 "${name}" 重复`);
      continue;
    }
    if (!f.image.trim()) {
      errors.push(`第 ${i + 1} 个服务 "${name}"：镜像为空`);
      continue;
    }
    usedNames.add(name);
    const svc = formToService(f);
    // 用 trim 过的 image 覆盖
    svc.image = f.image.trim();
    config.services[name] = svc;
    if (svc.networks) {
      for (const n of svc.networks) allNetworks.add(n);
    }
  }

  if (allNetworks.size > 0) {
    config.networks = {};
    for (const n of allNetworks) config.networks[n] = {};
  }

  const yaml = generateDockerComposeYAML(config);
  return { yaml, serviceCount: Object.keys(config.services).length, errors };
}

interface ServiceFormProps {
  form: ServiceForm;
  onChange: (next: ServiceForm) => void;
  /** 当前所有服务名（用于服务名校验重复） */
  allNames: string[];
}

export default function ServiceFormEditor({ form, onChange, allNames }: ServiceFormProps) {
  const updateField = useCallback(
    <K extends keyof ServiceForm>(key: K, value: ServiceForm[K]) => {
      onChange({ ...form, [key]: value });
    },
    [form, onChange]
  );

  const nameDuplicate = useMemo(
    () => allNames.filter((n) => n === form.serviceName.trim()).length > 1,
    [allNames, form.serviceName]
  );

  return (
    <div className="space-y-3">
      {SECTIONS.map((section, idx) => (
        <details
          key={section.title}
          open={idx === 0}
          className="group rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
        >
          <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-semibold text-slate-700 dark:text-slate-200 select-none">
            <span className="text-base">{section.icon}</span>
            <span>{section.title}</span>
            <span className="text-xs font-normal text-slate-400 dark:text-slate-500">
              · {section.summary}
            </span>
            <svg
              className="ml-auto h-4 w-4 text-slate-400 transition-transform group-open:rotate-90"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </summary>
          <div className="space-y-4 border-t border-slate-100 px-4 py-4 dark:border-slate-800">
            {section.fields.map((field) => (
              <FieldRow
                key={field.key}
                field={field}
                value={form[field.key]}
                onChange={(v) => updateField(field.key, v as ServiceForm[typeof field.key])}
                invalid={
                  field.key === "serviceName" && nameDuplicate
                    ? "服务名重复"
                    : undefined
                }
              />
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}

interface FieldRowProps {
  field: FieldDef;
  value: string | boolean;
  onChange: (v: string | boolean) => void;
  invalid?: string;
}

function FieldRow({ field, value, onChange, invalid }: FieldRowProps) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-1.5">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
          {field.label}
        </label>
        {field.required ? (
          <span className="text-red-500" title="必填">
            *
          </span>
        ) : (
          <span
            className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-400 dark:bg-slate-800 dark:text-slate-500"
            title="选填"
          >
            选填
          </span>
        )}
      </div>
      <FieldControl field={field} value={value} onChange={onChange} invalid={invalid} />
      <p className="mt-1 text-xs leading-relaxed text-slate-400 dark:text-slate-500">
        {field.description}
      </p>
      {invalid && (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400">{invalid}</p>
      )}
    </div>
  );
}

function FieldControl({
  field,
  value,
  onChange,
  invalid,
}: {
  field: FieldDef;
  value: string | boolean;
  onChange: (v: string | boolean) => void;
  invalid?: string;
}) {
  const baseInput =
    "w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:ring-2 focus:ring-orange-400/20 dark:bg-slate-800 dark:text-slate-100 " +
    (invalid
      ? "border-red-400 focus:border-red-500"
      : "border-slate-200 focus:border-orange-400 dark:border-slate-700");

  switch (field.type) {
    case "text":
      return (
        <input
          type="text"
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          className={baseInput}
        />
      );
    case "select":
      return (
        <select
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          className={baseInput}
        >
          {field.options?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );
    case "boolean":
      return (
        <label className="inline-flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={value as boolean}
            onChange={(e) => onChange(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-400/30 dark:border-slate-600 dark:bg-slate-800"
          />
          <span className="text-sm text-slate-600 dark:text-slate-400">
            {value ? "已启用" : "未启用"}
          </span>
        </label>
      );
    case "textarea":
    case "list":
    case "kv":
      return (
        <textarea
          value={value as string}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={field.type === "textarea" ? 3 : Math.max(2, (value as string).split("\n").length)}
          spellCheck={false}
          className={
            baseInput +
            " resize-y font-mono text-[13px] leading-relaxed " +
            (field.type !== "textarea" ? "min-h-[60px]" : "")
          }
        />
      );
    default:
      return null;
  }
}
