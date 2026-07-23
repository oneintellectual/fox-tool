/**
 * SQL Diff 核心逻辑
 * 对比两组建表 SQL（源表 vs 目标表），生成 ALTER TABLE 相关 SQL
 */

import { parseDDL, TableInfo, ColumnInfo } from "./ddl-parser";

/** 差异类型 */
export type DiffType =
  | "table-added"
  | "table-removed"
  | "column-added"
  | "column-removed"
  | "column-modified";

/** 列级差异详情 */
export interface ColumnDiff {
  type: "column-added" | "column-removed" | "column-modified";
  tableName: string;
  columnName: string;
  sourceColumn?: ColumnInfo;
  targetColumn?: ColumnInfo;
  /** 修改时具体变化的属性 */
  changes?: {
    field: string;
    oldValue: string;
    newValue: string;
  }[];
}

/** 表级差异 */
export interface TableDiff {
  type: "table-added" | "table-removed";
  tableName: string;
  table?: TableInfo;
}

/** 完整的 Diff 结果 */
export interface DiffResult {
  tableDiffs: TableDiff[];
  columnDiffs: ColumnDiff[];
  alterSql: string;
  hasChanges: boolean;
}

/**
 * 对比两组 SQL 并生成 ALTER SQL
 * @param sourceSql 源端 SQL（旧版本）
 * @param targetSql 目标端 SQL（新版本）
 * @returns Diff 结果
 */
export function diffSQL(sourceSql: string, targetSql: string): DiffResult {
  const sourceTables = parseDDL(sourceSql);
  const targetTables = parseDDL(targetSql);

  const tableDiffs: TableDiff[] = [];
  const columnDiffs: ColumnDiff[] = [];
  const alterStatements: string[] = [];

  // 构建表名 -> TableInfo 的映射
  const sourceMap = new Map<string, TableInfo>();
  const targetMap = new Map<string, TableInfo>();

  for (const t of sourceTables) sourceMap.set(t.tableName, t);
  for (const t of targetTables) targetMap.set(t.tableName, t);

  // 1. 检测新增的表
  for (const [name, table] of targetMap) {
    if (!sourceMap.has(name)) {
      tableDiffs.push({ type: "table-added", tableName: name, table });
      alterStatements.push(generateCreateTableSQL(table));
    }
  }

  // 2. 检测删除的表
  for (const [name, table] of sourceMap) {
    if (!targetMap.has(name)) {
      tableDiffs.push({ type: "table-removed", tableName: name, table });
      alterStatements.push(`DROP TABLE IF EXISTS \`${name}\`;`);
    }
  }

  // 3. 对比共有的表
  for (const [name, targetTable] of targetMap) {
    const sourceTable = sourceMap.get(name);
    if (!sourceTable) continue;

    const sourceColMap = new Map<string, ColumnInfo>();
    const targetColMap = new Map<string, ColumnInfo>();

    for (const c of sourceTable.columns) sourceColMap.set(c.name, c);
    for (const c of targetTable.columns) targetColMap.set(c.name, c);

    // 3a. 新增的列
    for (const [colName, col] of targetColMap) {
      if (!sourceColMap.has(colName)) {
        columnDiffs.push({
          type: "column-added",
          tableName: name,
          columnName: colName,
          targetColumn: col,
        });
        alterStatements.push(
          generateAddColumnSQL(name, col)
        );
      }
    }

    // 3b. 删除的列
    for (const [colName, col] of sourceColMap) {
      if (!targetColMap.has(colName)) {
        columnDiffs.push({
          type: "column-removed",
          tableName: name,
          columnName: colName,
          sourceColumn: col,
        });
        alterStatements.push(
          `ALTER TABLE \`${name}\` DROP COLUMN \`${colName}\`;`
        );
      }
    }

    // 3c. 修改的列
    for (const [colName, targetCol] of targetColMap) {
      const sourceCol = sourceColMap.get(colName);
      if (!sourceCol) continue;

      const changes = compareColumns(sourceCol, targetCol);
      if (changes.length > 0) {
        columnDiffs.push({
          type: "column-modified",
          tableName: name,
          columnName: colName,
          sourceColumn: sourceCol,
          targetColumn: targetCol,
          changes,
        });
        alterStatements.push(
          generateModifyColumnSQL(name, targetCol)
        );
      }
    }

    // 3d. 表注释变化
    if (targetTable.comment !== sourceTable.comment) {
      const commentSQL = targetTable.comment
        ? ` COMMENT='${targetTable.comment}'`
        : " COMMENT=''";
      alterStatements.push(
        `ALTER TABLE \`${name}\`${commentSQL};`
      );
    }
  }

  const alterSql = alterStatements.join("\n\n");
  const hasChanges = alterStatements.length > 0;

  return { tableDiffs, columnDiffs, alterSql, hasChanges };
}

/**
 * 对比两个列的差异
 */
function compareColumns(
  source: ColumnInfo,
  target: ColumnInfo
): { field: string; oldValue: string; newValue: string }[] {
  const changes: { field: string; oldValue: string; newValue: string }[] = [];

  if (source.type !== target.type) {
    changes.push({
      field: "类型",
      oldValue: source.type,
      newValue: target.type,
    });
  }
  if (source.nullable !== target.nullable) {
    changes.push({
      field: "可空",
      oldValue: source.nullable ? "YES" : "NO",
      newValue: target.nullable ? "YES" : "NO",
    });
  }
  if (source.defaultValue !== target.defaultValue) {
    changes.push({
      field: "默认值",
      oldValue: source.defaultValue ?? "无",
      newValue: target.defaultValue ?? "无",
    });
  }
  if (source.comment !== target.comment) {
    changes.push({
      field: "注释",
      oldValue: source.comment || "无",
      newValue: target.comment || "无",
    });
  }
  if (source.autoIncrement !== target.autoIncrement) {
    changes.push({
      field: "自增",
      oldValue: source.autoIncrement ? "是" : "否",
      newValue: target.autoIncrement ? "是" : "否",
    });
  }

  return changes;
}

/**
 * 生成 ADD COLUMN SQL
 */
function generateAddColumnSQL(tableName: string, col: ColumnInfo): string {
  const parts: string[] = [`\`${col.name}\` ${col.type}`];

  if (!col.nullable) parts.push("NOT NULL");
  if (col.autoIncrement) parts.push("AUTO_INCREMENT");
  if (col.defaultValue !== null) {
    parts.push(`DEFAULT ${col.defaultValue}`);
  }
  if (col.comment) {
    parts.push(`COMMENT '${col.comment.replace(/'/g, "\\'")}'`);
  }

  return `ALTER TABLE \`${tableName}\` ADD COLUMN ${parts.join(" ")};`;
}

/**
 * 生成 MODIFY COLUMN SQL
 */
function generateModifyColumnSQL(tableName: string, col: ColumnInfo): string {
  const parts: string[] = [`\`${col.name}\` ${col.type}`];

  if (!col.nullable) parts.push("NOT NULL");
  else parts.push("NULL");
  if (col.autoIncrement) parts.push("AUTO_INCREMENT");
  if (col.defaultValue !== null) {
    parts.push(`DEFAULT ${col.defaultValue}`);
  }
  if (col.primaryKey) parts.push("PRIMARY KEY");
  if (col.comment) {
    parts.push(`COMMENT '${col.comment.replace(/'/g, "\\'")}'`);
  }

  return `ALTER TABLE \`${tableName}\` MODIFY COLUMN ${parts.join(" ")};`;
}

/**
 * 生成完整的 CREATE TABLE SQL
 */
function generateCreateTableSQL(table: TableInfo): string {
  const lines: string[] = [];

  for (const col of table.columns) {
    const parts: string[] = [`  \`${col.name}\` ${col.type}`];
    if (!col.nullable) parts.push("NOT NULL");
    if (col.autoIncrement) parts.push("AUTO_INCREMENT");
    if (col.defaultValue !== null) {
      parts.push(`DEFAULT ${col.defaultValue}`);
    }
    if (col.comment) {
      parts.push(`COMMENT '${col.comment.replace(/'/g, "\\'")}'`);
    }
    lines.push(parts.join(" "));
  }

  // 主键
  const pks = table.columns.filter((c) => c.primaryKey).map((c) => `\`${c.name}\``);
  if (pks.length > 0) {
    lines.push(`  PRIMARY KEY (${pks.join(", ")})`);
  }

  const commentSQL = table.comment ? ` COMMENT='${table.comment.replace(/'/g, "\\'")}'` : "";

  return `CREATE TABLE \`${table.tableName}\` (\n${lines.join(",\n")}\n)${commentSQL};`;
}
