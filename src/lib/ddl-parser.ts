/**
 * DDL SQL 解析器
 * 解析 CREATE TABLE 语句，提取表名、字段名、类型、注释等信息
 */

export interface ColumnInfo {
  name: string;
  type: string;
  comment: string;
  nullable: boolean;
  primaryKey: boolean;
  defaultValue: string | null;
  autoIncrement: boolean;
}

export interface TableInfo {
  tableName: string;
  className: string;
  comment: string;
  columns: ColumnInfo[];
}

/**
 * 下划线转驼峰
 */
function toCamelCase(name: string): string {
  return name
    .toLowerCase()
    .replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * 下划线转帕斯卡（大驼峰）
 */
function toPascalCase(name: string): string {
  const camel = toCamelCase(name);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

/**
 * 提取括号内的内容，处理嵌套括号
 */
function extractParenthesesContent(str: string, startIndex: number): { content: string; endIndex: number } | null {
  if (str[startIndex] !== "(") return null;
  let depth = 0;
  let i = startIndex;
  while (i < str.length) {
    if (str[i] === "(") depth++;
    else if (str[i] === ")") {
      depth--;
      if (depth === 0) {
        return {
          content: str.substring(startIndex + 1, i),
          endIndex: i,
        };
      }
    }
    i++;
  }
  return null;
}

/**
 * 解析 DDL SQL 语句
 */
export function parseDDL(sql: string): TableInfo[] {
  const tables: TableInfo[] = [];

  // 标准化 SQL：移除多余空白，统一换行
  const normalizedSQL = sql
    .replace(/\/\*[\s\S]*?\*\//g, "") // 移除块注释
    .replace(/--.*$/gm, "") // 移除行注释
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");

  // 匹配 CREATE TABLE 语句
  const createTableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?(\w+)`?\s*\(/gi;
  let match: RegExpExecArray | null;

  while ((match = createTableRegex.exec(normalizedSQL)) !== null) {
    const tableName = match[1];
    const parenthesesStart = match.index + match[0].length - 1;

    const result = extractParenthesesContent(normalizedSQL, parenthesesStart);
    if (!result) continue;

    const bodyContent = result.content;
    const tableComment = extractTableComment(normalizedSQL, result.endIndex);

    const columns = parseColumns(bodyContent);

    tables.push({
      tableName,
      className: toPascalCase(tableName),
      comment: tableComment,
      columns,
    });
  }

  return tables;
}

/**
 * 解析列定义
 */
function parseColumns(bodyContent: string): ColumnInfo[] {
  const columns: ColumnInfo[] = [];
  const primaryKeys: string[] = [];

  // 按逗号分割列定义，但需要考虑嵌套括号
  const parts = splitByTopLevelComma(bodyContent);

  // 第一遍：收集主键信息
  for (const part of parts) {
    const trimmed = part.trim();
    const pkMatch = trimmed.match(
      /PRIMARY\s+KEY\s*\(([^)]+)\)/i
    );
    if (pkMatch) {
      const pkColumns = pkMatch[1].split(",").map((c) => c.trim().replace(/`/g, ""));
      primaryKeys.push(...pkColumns);
    }
  }

  // 第二遍：解析列
  for (const part of parts) {
    const trimmed = part.trim();

    // 跳过约束定义
    if (
      /^(PRIMARY\s+KEY|KEY|INDEX|UNIQUE|CONSTRAINT|FOREIGN|CHECK|FULLTEXT|SPATIAL)\s/i.test(
        trimmed
      )
    ) {
      continue;
    }

    const column = parseColumnDefinition(trimmed, primaryKeys);
    if (column) {
      columns.push(column);
    }
  }

  return columns;
}

/**
 * 按顶层逗号分割字符串（忽略括号内的逗号）
 */
function splitByTopLevelComma(str: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  let inSingleQuote = false;

  for (let i = 0; i < str.length; i++) {
    const char = str[i];

    if (char === "'" && (i === 0 || str[i - 1] !== "\\")) {
      inSingleQuote = !inSingleQuote;
    }

    if (!inSingleQuote) {
      if (char === "(") depth++;
      else if (char === ")") depth--;
      else if (char === "," && depth === 0) {
        parts.push(current);
        current = "";
        continue;
      }
    }

    current += char;
  }

  if (current.trim()) {
    parts.push(current);
  }

  return parts;
}

/**
 * 解析单个列定义
 */
function parseColumnDefinition(
  definition: string,
  primaryKeys: string[]
): ColumnInfo | null {
  // 移除行首的反引号
  const cleaned = definition.replace(/^`/, "").replace(/`$/, "");

  // 匹配列名和类型
  const columnMatch = cleaned.match(
    /^(\w+)\s+([A-Z]+(?:\s*\([^)]*\))?(?:\s+(?:UNSIGNED|SIGNED|ZEROFILL))*)/i
  );

  if (!columnMatch) return null;

  const name = columnMatch[1];
  const type = columnMatch[2].trim();

  const upperDef = definition.toUpperCase();

  // 提取注释
  const commentMatch = definition.match(
    /COMMENT\s+'((?:[^'\\]|\\.)*)'/i
  );
  const comment = commentMatch ? commentMatch[1].replace(/\\'/g, "'") : "";

  // 是否可空
  const notNull = /NOT\s+NULL/i.test(upperDef);
  const nullable = !notNull;

  // 是否主键
  const primaryKey =
    primaryKeys.includes(name) || /PRIMARY\s+KEY/i.test(upperDef);

  // 默认值
  const defaultMatch = definition.match(
    /DEFAULT\s+('(?:[^'\\]|\\.)*'|NULL|\w+)/i
  );
  const defaultValue = defaultMatch ? defaultMatch[1] : null;

  // 自增
  const autoIncrement = /AUTO_INCREMENT/i.test(upperDef);

  return {
    name,
    type,
    comment,
    nullable,
    primaryKey,
    defaultValue,
    autoIncrement,
  };
}

/**
 * 提取表注释
 */
function extractTableComment(
  sql: string,
  afterParenthesesIndex: number
): string {
  const afterTable = sql.substring(afterParenthesesIndex + 1, afterParenthesesIndex + 500);
  const commentMatch = afterTable.match(/COMMENT\s*=?\s*'((?:[^'\\]|\\.)*)'/i);
  return commentMatch ? commentMatch[1].replace(/\\'/g, "'") : "";
}
