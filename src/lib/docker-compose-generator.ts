/**
 * Docker Compose 生成器
 * 解析 `docker run` 命令并生成 docker-compose.yml 配置
 *
 * 支持的 docker run 选项映射到 compose 字段：
 *   IMAGE                          -> image
 *   --name                         -> container_name
 *   -p, --publish                  -> ports
 *   -v, --volume                   -> volumes
 *   -e, --env                      -> environment
 *   --env-file                     -> env_file
 *   --restart                      -> restart
 *   --network                      -> networks
 *   --add-host                     -> extra_hosts
 *   --hostname                     -> hostname
 *   --cap-add / --cap-drop         -> cap_add / cap_drop
 *   --device                       -> devices
 *   --dns                          -> dns
 *   --entrypoint                   -> entrypoint
 *   --expose                       -> expose
 *   -l, --label                    -> labels
 *   --log-driver / --log-opt       -> logging
 *   -m, --memory / --memory-swap   -> mem_limit / memswap_limit
 *   --cpu-shares / --cpus / --cpuset-cpus -> cpu_shares / cpus / cpuset
 *   -u, --user                     -> user
 *   -w, --workdir                  -> working_dir
 *   --privileged                   -> privileged
 *   -i, --interactive              -> stdin_open
 *   -t, --tty                      -> tty
 *   --tmpfs                        -> tmpfs
 *   --ulimit                       -> ulimits
 *   --shm-size                     -> shm_size
 *   --security-opt                 -> security_opt
 *   --sysctl                       -> sysctls
 *   --read-only                    -> read_only
 *   --init                          -> init
 *   --health-cmd / --health-*      -> healthcheck
 *   COMMAND (镜像后的位置参数)        -> command
 */

import YAML from "yaml";

/** 单个 compose 服务 */
export interface DockerService {
  image: string;
  container_name?: string;
  ports?: string[];
  volumes?: string[];
  environment?: Record<string, string | null>;
  env_file?: string[];
  restart?: string;
  networks?: string[];
  extra_hosts?: string[];
  hostname?: string;
  cap_add?: string[];
  cap_drop?: string[];
  devices?: string[];
  dns?: string[];
  entrypoint?: string | string[];
  expose?: string[];
  labels?: Record<string, string | null>;
  logging?: { driver: string; options?: Record<string, string> };
  mem_limit?: string;
  memswap_limit?: string;
  cpu_shares?: string;
  cpus?: string;
  cpuset?: string;
  user?: string;
  working_dir?: string;
  privileged?: boolean;
  stdin_open?: boolean;
  tty?: boolean;
  tmpfs?: string[];
  ulimits?: Record<string, { soft?: number; hard?: number }>;
  shm_size?: string;
  security_opt?: string[];
  sysctls?: Record<string, string>;
  read_only?: boolean;
  init?: boolean;
  healthcheck?: {
    test: string;
    interval?: string;
    timeout?: string;
    retries?: number;
    start_period?: string;
  };
  command?: string | string[];
}

/** 完整的 docker-compose 配置 */
export interface DockerComposeConfig {
  /** compose 文件版本，留空表示不输出 version 字段（现代 compose 规范） */
  version?: string;
  services: Record<string, DockerService>;
  networks?: Record<string, { name?: string }>;
}

/** 解析过程中的警告信息 */
export interface ParseWarning {
  /** 原始命令片段 */
  raw: string;
  /** 警告描述 */
  message: string;
}

/** 单次解析结果 */
export interface ParseResult {
  config: DockerComposeConfig;
  warnings: ParseWarning[];
}

/** 长选项 -> 短选项 / 规范名映射 */
const FLAG_ALIASES: Record<string, string> = {
  "--publish": "-p",
  "--volume": "-v",
  "--env": "-e",
  "--label": "-l",
  "--user": "-u",
  "--workdir": "-w",
  "--workdir=": "-w",
  "--memory": "-m",
  "--detach": "-d",
  "--interactive": "-i",
  "--tty": "-t",
  "--name": "--name",
  "--env-file": "--env-file",
  "--restart": "--restart",
  "--network": "--network",
  "--add-host": "--add-host",
  "--hostname": "--hostname",
  "--cap-add": "--cap-add",
  "--cap-drop": "--cap-drop",
  "--device": "--device",
  "--dns": "--dns",
  "--entrypoint": "--entrypoint",
  "--expose": "--expose",
  "--log-driver": "--log-driver",
  "--log-opt": "--log-opt",
  "--memory-swap": "--memory-swap",
  "--cpu-shares": "--cpu-shares",
  "--cpus": "--cpus",
  "--cpuset-cpus": "--cpuset-cpus",
  "--privileged": "--privileged",
  "--tmpfs": "--tmpfs",
  "--ulimit": "--ulimit",
  "--shm-size": "--shm-size",
  "--security-opt": "--security-opt",
  "--sysctl": "--sysctl",
  "--read-only": "--read-only",
  "--init": "--init",
  "--rm": "--rm",
  "--health-cmd": "--health-cmd",
  "--health-interval": "--health-interval",
  "--health-retries": "--health-retries",
  "--health-timeout": "--health-timeout",
  "--health-start-period": "--health-start-period",
};

/** 需要接收一个值的选项（短/长） */
const VALUE_FLAGS = new Set([
  "-p", "--publish",
  "-v", "--volume",
  "-e", "--env",
  "-l", "--label",
  "-u", "--user",
  "-w", "--workdir",
  "-m", "--memory",
  "--name",
  "--env-file",
  "--restart",
  "--network",
  "--add-host",
  "--hostname",
  "--cap-add",
  "--cap-drop",
  "--device",
  "--dns",
  "--entrypoint",
  "--expose",
  "--log-driver",
  "--log-opt",
  "--memory-swap",
  "--cpu-shares",
  "--cpus",
  "--cpuset-cpus",
  "--tmpfs",
  "--ulimit",
  "--shm-size",
  "--security-opt",
  "--sysctl",
  "--health-cmd",
  "--health-interval",
  "--health-retries",
  "--health-timeout",
  "--health-start-period",
]);

/** 布尔型选项（不接收值） */
const BOOL_FLAGS = new Set([
  "-d", "--detach",
  "-i", "--interactive",
  "-t", "--tty",
  "--privileged",
  "--read-only",
  "--init",
  "--rm",
]);

/**
 * 将输入文本按行预处理：合并以 `\` 结尾的行续接，去除注释行
 * 支持多行 docker run 命令
 */
function preprocessInput(input: string): string[] {
  // 统一换行
  const normalized = input.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");

  // 合并 `\` 续行
  const merged: string[] = [];
  let buffer = "";
  for (const raw of lines) {
    const trimmedRight = raw.replace(/\s+$/, "");
    if (trimmedRight.endsWith("\\")) {
      // 去掉末尾反斜杠，续接到 buffer
      buffer += " " + trimmedRight.slice(0, -1);
    } else {
      buffer += " " + raw;
      const combined = buffer.trim();
      if (combined) merged.push(combined);
      buffer = "";
    }
  }
  if (buffer.trim()) merged.push(buffer.trim());

  // 过滤空行与注释行（以 # 开头）
  return merged.filter((l) => l.trim() && !l.trim().startsWith("#"));
}

/**
 * Shell 风格分词：尊重单引号、双引号，处理 `key=value` 中的空格
 * 支持 `--flag=value` 与 `--flag value` 两种形式
 */
function tokenize(command: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  const len = command.length;

  while (i < len) {
    // 跳过空白
    while (i < len && /\s/.test(command[i])) i++;
    if (i >= len) break;

    let token = "";
    let inSingle = false;
    let inDouble = false;

    while (i < len) {
      const ch = command[i];

      if (inSingle) {
        if (ch === "'") {
          inSingle = false;
          i++;
        } else {
          token += ch;
          i++;
        }
        continue;
      }

      if (inDouble) {
        if (ch === "\\") {
          // 双引号内反斜杠转义下一个字符
          i++;
          if (i < len) {
            const next = command[i];
            if (next === '"' || next === "\\" || next === "$" || next === "`") {
              token += next;
            } else {
              token += "\\" + next;
            }
            i++;
          }
        } else if (ch === '"') {
          inDouble = false;
          i++;
        } else {
          token += ch;
          i++;
        }
        continue;
      }

      // 非引号状态
      if (ch === "\\") {
        // 反斜杠转义下一个字符
        i++;
        if (i < len) {
          token += command[i];
          i++;
        }
        continue;
      }
      if (ch === "'") {
        inSingle = true;
        i++;
        continue;
      }
      if (ch === '"') {
        inDouble = true;
        i++;
        continue;
      }
      if (/\s/.test(ch)) {
        break;
      }
      token += ch;
      i++;
    }

    if (token !== "" || inSingle || inDouble) {
      tokens.push(token);
    }
  }

  return tokens;
}

/**
 * 将一个 flag token 拆分为 (flagName, inlineValue)
 * 例如 `--name=foo` -> ("--name", "foo")；`-p` -> ("-p", undefined)
 */
function splitFlag(token: string): { flag: string; value?: string } {
  const eqIdx = token.indexOf("=");
  if (eqIdx > 0 && token.startsWith("-")) {
    const flag = token.slice(0, eqIdx);
    const value = token.slice(eqIdx + 1);
    return { flag, value };
  }
  return { flag: token };
}

/**
 * 从服务名候选生成合法的 compose service key
 * 规则：小写、仅含 a-z0-9-_，去除非法字符，必要时追加 -svc
 */
function toServiceName(raw: string, existing: Set<string>): string {
  let base = raw
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  if (!base) base = "service";
  if (/^\d/.test(base)) base = "svc-" + base;

  let name = base;
  let n = 2;
  while (existing.has(name)) {
    name = `${base}-${n}`;
    n++;
  }
  existing.add(name);
  return name;
}

/** 从镜像名推导默认服务名：取最后一层（去 tag），如 nginx:latest -> nginx */
function serviceNameFromImage(image: string): string {
  // 去掉 registry 前缀
  const noRegistry = image.includes("/") && image.split("/").length > 2
    ? image.split("/").slice(1).join("/")
    : image;
  // 去掉 tag
  const noTag = noRegistry.split(":")[0];
  // 取最后一段路径
  const last = noTag.split("/").pop() || noTag;
  return last;
}

/**
 * 解析单个 docker run 命令为 DockerService
 */
export function parseDockerRun(command: string): { service: DockerService; name: string; warnings: ParseWarning[] } {
  const warnings: ParseWarning[] = [];

  // 去掉前导 `docker run` / `docker container run` / `sudo docker run`
  let cmd = command.trim();
  const runMatch = cmd.match(/^(?:sudo\s+)?docker\s+(?:container\s+)?run\s+/i);
  if (!runMatch) {
    // 即便没有 docker run 前缀也尝试解析
    cmd = cmd.replace(/^(?:sudo\s+)?docker\s+/i, "");
  } else {
    cmd = cmd.slice(runMatch[0].length);
  }

  const tokens = tokenize(cmd);
  const service: DockerService = { image: "" };

  let imageName = "";
  const commandArgs: string[] = [];
  let commandStarted = false;

  let containerName: string | undefined;
  let logDriver: string | undefined;
  const logOptions: Record<string, string> = {};

  const pushList = (arr: string[] | undefined, value: string): string[] => {
    if (!arr) return [value];
    arr.push(value);
    return arr;
  };

  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];

    // 已进入 command 区域（镜像名之后的位置参数）
    if (commandStarted) {
      commandArgs.push(token);
      i++;
      continue;
    }

    // 非选项 token：第一个视为镜像名，之后视为 command
    if (!token.startsWith("-")) {
      if (!imageName) {
        imageName = token;
      } else {
        commandStarted = true;
        commandArgs.push(token);
      }
      i++;
      continue;
    }

    // 处理 `--` 分隔符，后续全部视为 command
    if (token === "--") {
      commandStarted = true;
      i++;
      continue;
    }

    const { flag: rawFlag, value: inlineValue } = splitFlag(token);
    const flag = FLAG_ALIASES[rawFlag] || rawFlag;

    // 取值：优先使用内联值（--flag=value），否则从下一个 token 取
    const consumeValue = (): string | undefined => {
      if (inlineValue !== undefined) return inlineValue;
      if (i + 1 < tokens.length) {
        i++;
        return tokens[i];
      }
      return undefined;
    };

    if (BOOL_FLAGS.has(flag)) {
      switch (flag) {
        case "-i":
        case "--interactive":
          service.stdin_open = true;
          break;
        case "-t":
        case "--tty":
          service.tty = true;
          break;
        case "--privileged":
          service.privileged = true;
          break;
        case "--read-only":
          service.read_only = true;
          break;
        case "--init":
          service.init = true;
          break;
        case "-d":
        case "--detach":
          // compose 默认后台运行，忽略
          break;
        case "--rm":
          warnings.push({ raw: token, message: "--rm 在 docker-compose 中无对应项，已忽略（compose 不支持容器自动删除）" });
          break;
      }
      i++;
      continue;
    }

    if (VALUE_FLAGS.has(flag)) {
      const value = consumeValue();
      if (value === undefined) {
        warnings.push({ raw: token, message: `选项 ${rawFlag} 缺少值，已忽略` });
        i++;
        continue;
      }

      switch (flag) {
        case "--name":
          containerName = value;
          break;
        case "-p":
        case "--publish":
          service.ports = pushList(service.ports, value);
          break;
        case "-v":
        case "--volume":
          service.volumes = pushList(service.volumes, value);
          break;
        case "-e":
        case "--env": {
          const env = parseEnvVar(value);
          if (!service.environment) service.environment = {};
          service.environment[env.key] = env.value;
          break;
        }
        case "--env-file":
          service.env_file = pushList(service.env_file, value);
          break;
        case "--restart":
          service.restart = value;
          break;
        case "--network":
          service.networks = pushList(service.networks, value);
          break;
        case "--add-host":
          service.extra_hosts = pushList(service.extra_hosts, value);
          break;
        case "--hostname":
          service.hostname = value;
          break;
        case "--cap-add":
          service.cap_add = pushList(service.cap_add, value);
          break;
        case "--cap-drop":
          service.cap_drop = pushList(service.cap_drop, value);
          break;
        case "--device":
          service.devices = pushList(service.devices, value);
          break;
        case "--dns":
          service.dns = pushList(service.dns, value);
          break;
        case "--entrypoint":
          service.entrypoint = value;
          break;
        case "--expose":
          service.expose = pushList(service.expose, value);
          break;
        case "-l":
        case "--label": {
          const lbl = parseEnvVar(value);
          if (!service.labels) service.labels = {};
          service.labels[lbl.key] = lbl.value;
          break;
        }
        case "--log-driver":
          logDriver = value;
          break;
        case "--log-opt": {
          const opt = parseEnvVar(value);
          logOptions[opt.key] = opt.value || "";
          break;
        }
        case "-m":
        case "--memory":
          service.mem_limit = value;
          break;
        case "--memory-swap":
          service.memswap_limit = value;
          break;
        case "--cpu-shares":
          service.cpu_shares = value;
          break;
        case "--cpus":
          service.cpus = value;
          break;
        case "--cpuset-cpus":
          service.cpuset = value;
          break;
        case "-u":
        case "--user":
          service.user = value;
          break;
        case "-w":
        case "--workdir":
          service.working_dir = value;
          break;
        case "--tmpfs":
          service.tmpfs = pushList(service.tmpfs, value);
          break;
        case "--ulimit": {
          const ul = parseUlimit(value);
          if (ul) {
            if (!service.ulimits) service.ulimits = {};
            service.ulimits[ul.name] = ul.limit;
          }
          break;
        }
        case "--shm-size":
          service.shm_size = value;
          break;
        case "--security-opt":
          service.security_opt = pushList(service.security_opt, value);
          break;
        case "--sysctl": {
          const sys = parseEnvVar(value);
          if (!service.sysctls) service.sysctls = {};
          service.sysctls[sys.key] = sys.value || "";
          break;
        }
        case "--health-cmd":
          service.healthcheck = {
            ...(service.healthcheck || { test: "" }),
            test: value,
          };
          break;
        case "--health-interval":
          if (!service.healthcheck) service.healthcheck = { test: "" };
          service.healthcheck.interval = value;
          break;
        case "--health-timeout":
          if (!service.healthcheck) service.healthcheck = { test: "" };
          service.healthcheck.timeout = value;
          break;
        case "--health-retries": {
          if (!service.healthcheck) service.healthcheck = { test: "" };
          const n = parseInt(value, 10);
          if (!Number.isNaN(n)) service.healthcheck.retries = n;
          break;
        }
        case "--health-start-period":
          if (!service.healthcheck) service.healthcheck = { test: "" };
          service.healthcheck.start_period = value;
          break;
        default:
          warnings.push({ raw: token, message: `未识别的选项 ${rawFlag}=${value}，已忽略` });
      }
      i++;
      continue;
    }

    // 未识别的 flag
    warnings.push({ raw: token, message: `未识别的选项 ${rawFlag}，已忽略` });
    // 若它带有内联值，已包含在 token 中；否则也跳过下一个 token（可能是值）
    if (inlineValue === undefined && i + 1 < tokens.length && !tokens[i + 1].startsWith("-")) {
      i++;
    }
    i++;
  }

  // 组装 logging
  if (logDriver || Object.keys(logOptions).length > 0) {
    service.logging = {
      driver: logDriver || "json-file",
      ...(Object.keys(logOptions).length > 0 ? { options: logOptions } : {}),
    };
  }

  // 镜像名
  service.image = imageName;

  // command
  if (commandArgs.length > 0) {
    service.command = commandArgs.length === 1 ? commandArgs[0] : commandArgs;
  }

  // container_name
  if (containerName) {
    service.container_name = containerName;
  }

  // 服务名优先用 --name，否则从镜像推导
  const serviceName = containerName || serviceNameFromImage(imageName);

  if (!imageName) {
    warnings.push({ raw: command, message: "未识别到镜像名" });
  }

  return { service, name: serviceName, warnings };
}

/** 解析 KEY=VALUE 形式的环境变量 / label */
function parseEnvVar(raw: string): { key: string; value: string | null } {
  const eq = raw.indexOf("=");
  if (eq < 0) return { key: raw, value: null };
  return { key: raw.slice(0, eq), value: raw.slice(eq + 1) };
}

/** 解析 ulimit 字符串，如 `nofile=65535:65535` 或 `nofile=65535` */
function parseUlimit(raw: string): { name: string; limit: { soft?: number; hard?: number } } | null {
  const eq = raw.indexOf("=");
  if (eq < 0) return null;
  const name = raw.slice(0, eq);
  const rest = raw.slice(eq + 1);
  const parts = rest.split(":");
  const soft = parseInt(parts[0], 10);
  const hard = parts[1] !== undefined ? parseInt(parts[1], 10) : undefined;
  if (Number.isNaN(soft)) return null;
  return {
    name,
    limit: {
      soft,
      ...(hard !== undefined && !Number.isNaN(hard) ? { hard } : {}),
    },
  };
}

/**
 * 解析多行 docker run 命令，生成完整 compose 配置
 */
export function parseDockerCommands(input: string): ParseResult {
  const lines = preprocessInput(input);
  const config: DockerComposeConfig = { services: {} };
  const warnings: ParseWarning[] = [];
  const usedNames = new Set<string>();
  const allNetworks = new Set<string>();

  for (const line of lines) {
    // 仅处理 docker run 命令，其他命令给出提示
    if (!/^(\s*)?(sudo\s+)?docker\s+(container\s+)?run\b/i.test(line)) {
      // 可能是 docker compose up 等其他命令
      if (/^(\s*)?(sudo\s+)?docker\s+/i.test(line)) {
        warnings.push({ raw: line, message: "仅支持 `docker run` 命令，已忽略该行" });
      }
      continue;
    }

    const { service, name, warnings: w } = parseDockerRun(line);
    warnings.push(...w);
    if (!service.image) continue;

    const serviceName = toServiceName(name, usedNames);
    config.services[serviceName] = service;

    if (service.networks) {
      for (const n of service.networks) allNetworks.add(n);
    }
  }

  // 顶层 networks 声明（保留引用的网络名）
  if (allNetworks.size > 0) {
    config.networks = {};
    for (const n of allNetworks) {
      config.networks[n] = {};
    }
  }

  return { config, warnings };
}

// ============== YAML 生成 ==============

/** YAML 缩进单位 */
const INDENT = "  ";

/** 判断字符串是否需要加引号 */
function needsQuote(value: string): boolean {
  if (value === "") return true;
  // 含有特殊字符或以特殊字符开头
  if (/[:\#\[\]\{\}\,\&\*\!\|\>\'\"\%\@\`]/.test(value)) return true;
  if (/^\s|\s$/.test(value)) return true;
  // 以特殊形式开头
  if (/^(?:true|false|null|yes|no|on|off|y|n)$/i.test(value)) return true;
  if (/^[\-?:]/.test(value)) return true;
  if (/^\d/.test(value) && !/^\d+$/.test(value)) return true;
  return false;
}

/** 转义为 YAML 字符串（必要时加引号） */
function yamlString(value: string): string {
  if (value === "") return '""';
  if (needsQuote(value)) {
    // 使用双引号并对内部双引号转义
    const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return `"${escaped}"`;
  }
  return value;
}

/** 缩进辅助 */
function indent(level: number): string {
  return INDENT.repeat(level);
}

/** 生成 YAML 行 */
function emitList(lines: string[], key: string, items: string[], level: number): void {
  if (items.length === 0) return;
  lines.push(`${indent(level)}${key}:`);
  for (const item of items) {
    lines.push(`${indent(level + 1)}- ${yamlString(item)}`);
  }
}

function emitMap(
  lines: string[],
  key: string,
  map: Record<string, string | null>,
  level: number
): void {
  const entries = Object.entries(map);
  if (entries.length === 0) return;
  lines.push(`${indent(level)}${key}:`);
  for (const [k, v] of entries) {
    if (v === null || v === undefined) {
      lines.push(`${indent(level + 1)}${yamlString(k)}:`);
    } else {
      lines.push(`${indent(level + 1)}${yamlString(k)}: ${yamlString(v)}`);
    }
  }
}

/**
 * 生成单个服务的 YAML 片段
 */
function emitService(lines: string[], name: string, svc: DockerService): void {
  lines.push(`${indent(1)}${name}:`);

  // image 必须存在
  lines.push(`${indent(2)}image: ${yamlString(svc.image)}`);

  if (svc.container_name) {
    lines.push(`${indent(2)}container_name: ${yamlString(svc.container_name)}`);
  }
  if (svc.hostname) {
    lines.push(`${indent(2)}hostname: ${yamlString(svc.hostname)}`);
  }
  if (svc.restart) {
    lines.push(`${indent(2)}restart: ${yamlString(svc.restart)}`);
  }
  if (svc.user) {
    lines.push(`${indent(2)}user: ${yamlString(svc.user)}`);
  }
  if (svc.working_dir) {
    lines.push(`${indent(2)}working_dir: ${yamlString(svc.working_dir)}`);
  }
  if (svc.entrypoint !== undefined) {
    if (Array.isArray(svc.entrypoint)) {
      emitList(lines, "entrypoint", svc.entrypoint, 2);
    } else {
      lines.push(`${indent(2)}entrypoint: ${yamlString(svc.entrypoint)}`);
    }
  }
  if (svc.command !== undefined) {
    if (Array.isArray(svc.command)) {
      emitList(lines, "command", svc.command, 2);
    } else {
      lines.push(`${indent(2)}command: ${yamlString(svc.command)}`);
    }
  }

  if (svc.ports && svc.ports.length > 0) {
    emitList(lines, "ports", svc.ports, 2);
  }
  if (svc.expose && svc.expose.length > 0) {
    emitList(lines, "expose", svc.expose, 2);
  }
  if (svc.volumes && svc.volumes.length > 0) {
    emitList(lines, "volumes", svc.volumes, 2);
  }
  if (svc.tmpfs && svc.tmpfs.length > 0) {
    emitList(lines, "tmpfs", svc.tmpfs, 2);
  }
  if (svc.devices && svc.devices.length > 0) {
    emitList(lines, "devices", svc.devices, 2);
  }
  if (svc.dns && svc.dns.length > 0) {
    emitList(lines, "dns", svc.dns, 2);
  }
  if (svc.extra_hosts && svc.extra_hosts.length > 0) {
    emitList(lines, "extra_hosts", svc.extra_hosts, 2);
  }
  if (svc.cap_add && svc.cap_add.length > 0) {
    emitList(lines, "cap_add", svc.cap_add, 2);
  }
  if (svc.cap_drop && svc.cap_drop.length > 0) {
    emitList(lines, "cap_drop", svc.cap_drop, 2);
  }
  if (svc.security_opt && svc.security_opt.length > 0) {
    emitList(lines, "security_opt", svc.security_opt, 2);
  }
  if (svc.env_file && svc.env_file.length > 0) {
    emitList(lines, "env_file", svc.env_file, 2);
  }

  if (svc.environment && Object.keys(svc.environment).length > 0) {
    emitMap(lines, "environment", svc.environment, 2);
  }
  if (svc.labels && Object.keys(svc.labels).length > 0) {
    emitMap(lines, "labels", svc.labels, 2);
  }
  if (svc.sysctls && Object.keys(svc.sysctls).length > 0) {
    emitMap(lines, "sysctls", svc.sysctls, 2);
  }

  if (svc.ulimits && Object.keys(svc.ulimits).length > 0) {
    lines.push(`${indent(2)}ulimits:`);
    for (const [k, v] of Object.entries(svc.ulimits)) {
      if (v.hard !== undefined && v.soft !== undefined) {
        lines.push(`${indent(3)}${k}: ${v.soft}:${v.hard}`);
      } else if (v.soft !== undefined) {
        lines.push(`${indent(3)}${k}: ${v.soft}`);
      }
    }
  }

  if (svc.logging) {
    lines.push(`${indent(2)}logging:`);
    lines.push(`${indent(3)}driver: ${yamlString(svc.logging.driver)}`);
    if (svc.logging.options && Object.keys(svc.logging.options).length > 0) {
      lines.push(`${indent(3)}options:`);
      for (const [k, v] of Object.entries(svc.logging.options)) {
        lines.push(`${indent(4)}${yamlString(k)}: ${yamlString(v)}`);
      }
    }
  }

  if (svc.networks && svc.networks.length > 0) {
    if (svc.networks.length === 1) {
      lines.push(`${indent(2)}networks:`);
      lines.push(`${indent(3)}- ${yamlString(svc.networks[0])}`);
    } else {
      emitList(lines, "networks", svc.networks, 2);
    }
  }

  if (svc.healthcheck) {
    lines.push(`${indent(2)}healthcheck:`);
    const test = svc.healthcheck.test;
    // 若是单条 shell 命令，用 CMD-SHELL 形式更标准
    if (/^(?:CMD|CMD-SHELL|NONE)\b/i.test(test)) {
      lines.push(`${indent(3)}test: ${test}`);
    } else {
      lines.push(`${indent(3)}test: ["CMD-SHELL", "${test.replace(/"/g, '\\"')}"]`);
    }
    if (svc.healthcheck.interval) {
      lines.push(`${indent(3)}interval: ${yamlString(svc.healthcheck.interval)}`);
    }
    if (svc.healthcheck.timeout) {
      lines.push(`${indent(3)}timeout: ${yamlString(svc.healthcheck.timeout)}`);
    }
    if (svc.healthcheck.retries !== undefined) {
      lines.push(`${indent(3)}retries: ${svc.healthcheck.retries}`);
    }
    if (svc.healthcheck.start_period) {
      lines.push(`${indent(3)}start_period: ${yamlString(svc.healthcheck.start_period)}`);
    }
  }

  // 资源限制
  if (svc.mem_limit) {
    lines.push(`${indent(2)}mem_limit: ${yamlString(svc.mem_limit)}`);
  }
  if (svc.memswap_limit) {
    lines.push(`${indent(2)}memswap_limit: ${yamlString(svc.memswap_limit)}`);
  }
  if (svc.cpus) {
    lines.push(`${indent(2)}cpus: ${yamlString(svc.cpus)}`);
  }
  if (svc.cpu_shares) {
    lines.push(`${indent(2)}cpu_shares: ${yamlString(svc.cpu_shares)}`);
  }
  if (svc.cpuset) {
    lines.push(`${indent(2)}cpuset: ${yamlString(svc.cpuset)}`);
  }
  if (svc.shm_size) {
    lines.push(`${indent(2)}shm_size: ${yamlString(svc.shm_size)}`);
  }

  // 布尔开关
  if (svc.privileged) lines.push(`${indent(2)}privileged: true`);
  if (svc.stdin_open) lines.push(`${indent(2)}stdin_open: true`);
  if (svc.tty) lines.push(`${indent(2)}tty: true`);
  if (svc.read_only) lines.push(`${indent(2)}read_only: true`);
  if (svc.init) lines.push(`${indent(2)}init: true`);
}

/**
 * 生成 docker-compose.yml 文本
 */
export function generateDockerComposeYAML(config: DockerComposeConfig): string {
  const lines: string[] = [];

  if (config.version) {
    lines.push(`version: "${config.version}"`);
    lines.push("");
  }

  lines.push("services:");
  for (const [name, svc] of Object.entries(config.services)) {
    emitService(lines, name, svc);
  }

  if (config.networks && Object.keys(config.networks).length > 0) {
    lines.push("");
    lines.push("networks:");
    for (const name of Object.keys(config.networks)) {
      lines.push(`${indent(1)}${name}:`);
    }
  }

  return lines.join("\n") + "\n";
}

/**
 * 一站式：从 docker run 文本生成 docker-compose.yml
 */
export function convertDockerCommandsToCompose(input: string): {
  yaml: string;
  warnings: ParseWarning[];
  serviceCount: number;
} {
  const { config, warnings } = parseDockerCommands(input);
  const yaml = generateDockerComposeYAML(config);
  return {
    yaml,
    warnings,
    serviceCount: Object.keys(config.services).length,
  };
}

// ============== YAML 解析（docker-compose.yml → DockerComposeConfig） ==============

/** 将任意 YAML 值规范化为字符串 */
function normalizeScalar(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "object") return YAML.stringify(v).trim();
  return String(v);
}

/** 将任意 YAML 值规范化为字符串数组 */
function normalizeList(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v.map((item) => normalizeScalar(item)).filter((s) => s !== "");
  }
  if (typeof v === "string") return [v];
  if (typeof v === "number") return [String(v)];
  return [];
}

/** 将任意 YAML 值规范化为键值对 */
function normalizeMap(v: unknown): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  if (v && typeof v === "object" && !Array.isArray(v)) {
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (val === null || val === undefined) {
        out[k] = null;
      } else {
        out[k] = normalizeScalar(val);
      }
    }
  }
  return out;
}

/** 解析单个服务配置对象 */
function parseServiceNode(node: unknown): DockerService {
  const svc: DockerService = { image: "" };
  if (!node || typeof node !== "object" || Array.isArray(node)) return svc;

  const s = node as Record<string, unknown>;

  if (typeof s.image === "string") svc.image = s.image;
  else if (s.image !== undefined) svc.image = normalizeScalar(s.image);

  if (s.container_name) svc.container_name = normalizeScalar(s.container_name);
  if (s.hostname) svc.hostname = normalizeScalar(s.hostname);
  if (s.restart) svc.restart = normalizeScalar(s.restart);
  if (s.user) svc.user = normalizeScalar(s.user);
  if (s.working_dir) svc.working_dir = normalizeScalar(s.working_dir);
  if (s.working_dir) svc.working_dir = normalizeScalar(s.working_dir);

  if (s.entrypoint !== undefined) {
    if (Array.isArray(s.entrypoint)) {
      svc.entrypoint = normalizeList(s.entrypoint);
    } else {
      svc.entrypoint = normalizeScalar(s.entrypoint);
    }
  }
  if (s.command !== undefined) {
    if (Array.isArray(s.command)) {
      svc.command = normalizeList(s.command);
    } else {
      svc.command = normalizeScalar(s.command);
    }
  }

  if (s.ports) svc.ports = normalizeList(s.ports);
  if (s.expose) svc.expose = normalizeList(s.expose);
  if (s.volumes) svc.volumes = normalizeList(s.volumes);
  if (s.tmpfs) svc.tmpfs = normalizeList(s.tmpfs);
  if (s.devices) svc.devices = normalizeList(s.devices);
  if (s.dns) svc.dns = normalizeList(s.dns);
  if (s.extra_hosts) svc.extra_hosts = normalizeList(s.extra_hosts);
  if (s.cap_add) svc.cap_add = normalizeList(s.cap_add);
  if (s.cap_drop) svc.cap_drop = normalizeList(s.cap_drop);
  if (s.security_opt) svc.security_opt = normalizeList(s.security_opt);
  if (s.env_file) svc.env_file = normalizeList(s.env_file);

  if (s.environment) svc.environment = normalizeMap(s.environment);
  if (s.labels) svc.labels = normalizeMap(s.labels);
  if (s.sysctls) svc.sysctls = normalizeMap(s.sysctls) as Record<string, string>;

  if (s.ulimits && typeof s.ulimits === "object") {
    const ul: Record<string, { soft?: number; hard?: number }> = {};
    for (const [k, v] of Object.entries(s.ulimits as Record<string, unknown>)) {
      if (typeof v === "number") {
        ul[k] = { soft: v };
      } else if (typeof v === "string") {
        // soft:hard 简写
        const parts = v.split(":");
        const soft = parseInt(parts[0], 10);
        const hard = parts[1] !== undefined ? parseInt(parts[1], 10) : undefined;
        if (!Number.isNaN(soft)) {
          ul[k] = {
            soft,
            ...(hard !== undefined && !Number.isNaN(hard) ? { hard } : {}),
          };
        }
      } else if (v && typeof v === "object") {
        const obj = v as Record<string, unknown>;
        const soft = obj.soft !== undefined ? parseInt(String(obj.soft), 10) : undefined;
        const hard = obj.hard !== undefined ? parseInt(String(obj.hard), 10) : undefined;
        if (soft !== undefined && !Number.isNaN(soft)) {
          ul[k] = {
            soft,
            ...(hard !== undefined && !Number.isNaN(hard) ? { hard } : {}),
          };
        }
      }
    }
    if (Object.keys(ul).length > 0) svc.ulimits = ul;
  }

  if (s.logging && typeof s.logging === "object") {
    const log = s.logging as Record<string, unknown>;
    svc.logging = {
      driver: typeof log.driver === "string" ? log.driver : "json-file",
      ...(log.options ? { options: normalizeMap(log.options) as Record<string, string> } : {}),
    };
  }

  if (s.networks) {
    if (Array.isArray(s.networks)) {
      svc.networks = normalizeList(s.networks);
    } else if (typeof s.networks === "object") {
      // networks 可以是 map 形式 { net1: { aliases: [...] } }
      svc.networks = Object.keys(s.networks as Record<string, unknown>);
    }
  }

  if (s.healthcheck && typeof s.healthcheck === "object") {
    const hc = s.healthcheck as Record<string, unknown>;
    let test = "";
    if (Array.isArray(hc.test)) {
      const parts = normalizeList(hc.test);
      // 数组形式：["CMD-SHELL", "..."] / ["CMD", "curl", "-f", ...] / ["NONE"]
      if (parts.length === 0) {
        test = "";
      } else if (parts[0].toUpperCase() === "NONE") {
        test = "NONE";
      } else if (parts[0].toUpperCase() === "CMD-SHELL" && parts.length >= 2) {
        test = parts.slice(1).join(" ");
      } else if (parts[0].toUpperCase() === "CMD" && parts.length >= 2) {
        test = parts.slice(1).join(" ");
      } else {
        test = parts.join(" ");
      }
    } else if (typeof hc.test === "string") {
      test = hc.test;
    }
    if (test) {
      svc.healthcheck = {
        test,
        ...(hc.interval ? { interval: normalizeScalar(hc.interval) } : {}),
        ...(hc.timeout ? { timeout: normalizeScalar(hc.timeout) } : {}),
        ...(hc.retries !== undefined
          ? { retries: parseInt(String(hc.retries), 10) || undefined }
          : {}),
        ...(hc.start_period ? { start_period: normalizeScalar(hc.start_period) } : {}),
      };
    }
  }

  if (s.mem_limit) svc.mem_limit = normalizeScalar(s.mem_limit);
  if (s.memswap_limit) svc.memswap_limit = normalizeScalar(s.memswap_limit);
  if (s.cpus) svc.cpus = normalizeScalar(s.cpus);
  if (s.cpu_shares) svc.cpu_shares = normalizeScalar(s.cpu_shares);
  if (s.cpuset) svc.cpuset = normalizeScalar(s.cpuset);
  if (s.shm_size) svc.shm_size = normalizeScalar(s.shm_size);

  if (s.privileged === true) svc.privileged = true;
  if (s.stdin_open === true) svc.stdin_open = true;
  if (s.tty === true) svc.tty = true;
  if (s.read_only === true) svc.read_only = true;
  if (s.init === true) svc.init = true;

  return svc;
}

/**
 * 解析 docker-compose.yml 文本为 DockerComposeConfig
 */
export function parseDockerComposeYAML(yaml: string): ParseResult {
  const warnings: ParseWarning[] = [];
  const config: DockerComposeConfig = { services: {} };

  let doc: unknown;
  try {
    doc = YAML.parse(yaml);
  } catch (e) {
    warnings.push({
      raw: yaml.slice(0, 80),
      message: `YAML 解析失败：${e instanceof Error ? e.message : String(e)}`,
    });
    return { config, warnings };
  }

  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    warnings.push({ raw: "", message: "YAML 顶层不是对象，无法解析" });
    return { config, warnings };
  }

  const root = doc as Record<string, unknown>;

  if (root.version !== undefined) {
    config.version = normalizeScalar(root.version);
  }

  const allNetworks = new Set<string>();

  if (root.services && typeof root.services === "object") {
    const services = root.services as Record<string, unknown>;
    for (const [name, node] of Object.entries(services)) {
      const svc = parseServiceNode(node);
      if (!svc.image) {
        warnings.push({
          raw: name,
          message: `服务 "${name}" 未识别到 image 字段`,
        });
      }
      config.services[name] = svc;
      if (svc.networks) {
        for (const n of svc.networks) allNetworks.add(n);
      }
    }
  } else {
    warnings.push({ raw: "", message: "未找到 services 节点" });
  }

  // 顶层 networks
  if (root.networks && typeof root.networks === "object") {
    config.networks = {};
    for (const name of Object.keys(root.networks as Record<string, unknown>)) {
      config.networks[name] = {};
      allNetworks.add(name);
    }
  } else if (allNetworks.size > 0) {
    config.networks = {};
    for (const n of allNetworks) config.networks[n] = {};
  }

  return { config, warnings };
}

/**
 * 从多个服务构建合并后的 compose 配置
 * @param services 服务列表（含名称）
 * @param includeNetworks 是否收集引用的网络到顶层
 */
export function buildComposeFromServices(
  services: { name: string; service: DockerService }[],
  includeNetworks = true
): DockerComposeConfig {
  const config: DockerComposeConfig = { services: {} };
  const usedNames = new Set<string>();
  const allNetworks = new Set<string>();

  for (const { name, service } of services) {
    const finalName = toServiceName(name, usedNames);
    config.services[finalName] = service;
    if (service.networks) {
      for (const n of service.networks) allNetworks.add(n);
    }
  }

  if (includeNetworks && allNetworks.size > 0) {
    config.networks = {};
    for (const n of allNetworks) config.networks[n] = {};
  }

  return config;
}
