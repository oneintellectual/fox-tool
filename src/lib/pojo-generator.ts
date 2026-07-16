import { TableInfo, ColumnInfo } from "./ddl-parser";

/**
 * Java POJO 生成器配置
 */
export interface PojoConfig {
  packageName: string;
  useLombok: boolean;
  useSwagger: boolean;
  useMybatisPlus: boolean;
  author: string;
}

const DEFAULT_CONFIG: PojoConfig = {
  packageName: "com.example.entity",
  useLombok: true,
  useSwagger: false,
  useMybatisPlus: false,
  author: "",
};

/**
 * 下划线转驼峰
 */
function toCamelCase(name: string): string {
  return name
    .toLowerCase()
    .replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * 下划线转帕斯卡
 */
function toPascalCase(name: string): string {
  const camel = toCamelCase(name);
  return camel.charAt(0).toUpperCase() + camel.slice(1);
}

/**
 * 生成 Java POJO 代码
 */
export function generatePOJO(table: TableInfo, config: Partial<PojoConfig> = {}): string {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const lines: string[] = [];

  // 包声明
  lines.push(`package ${cfg.packageName};`);
  lines.push("");

  // 导入
  const imports = collectImports(table, cfg);
  for (const imp of imports) {
    lines.push(imp);
  }
  if (imports.length > 0) lines.push("");

  // 类注释
  lines.push("/**");
  if (table.comment) {
    lines.push(` * ${table.comment}`);
  }
  lines.push(` * 表名: ${table.tableName}`);
  if (cfg.author) {
    lines.push(` * @author ${cfg.author}`);
  }
  lines.push(` * @date ${new Date().toISOString().split("T")[0]}`);
  lines.push(" */");

  // 类注解
  if (cfg.useMybatisPlus) {
    lines.push(`@TableName("${table.tableName}")`);
  }
  if (cfg.useSwagger) {
    lines.push(`@ApiModel(description = "${table.comment || table.className}")`);
  }
  if (cfg.useLombok) {
    lines.push("@Data");
    lines.push("@NoArgsConstructor");
    lines.push("@AllArgsConstructor");
  }

  lines.push(`public class ${table.className} {`);
  lines.push("");

  // 字段
  for (const column of table.columns) {
    lines.push(generateField(column, cfg));
    lines.push("");
  }

  // Getter/Setter（非 Lombok 时）
  if (!cfg.useLombok) {
    for (const column of table.columns) {
      lines.push(generateGetter(column));
      lines.push("");
      lines.push(generateSetter(column));
      lines.push("");
    }
  }

  lines.push("}");

  return lines.join("\n");
}

/**
 * 收集需要导入的类
 */
function collectImports(table: TableInfo, cfg: PojoConfig): string[] {
  const imports = new Set<string>();

  for (const column of table.columns) {
    switch (column.javaType) {
      case "LocalDate":
        imports.add("import java.time.LocalDate;");
        break;
      case "LocalTime":
        imports.add("import java.time.LocalTime;");
        break;
      case "LocalDateTime":
        imports.add("import java.time.LocalDateTime;");
        break;
      case "BigDecimal":
        imports.add("import java.math.BigDecimal;");
        break;
    }
  }

  if (cfg.useLombok) {
    imports.add("import lombok.Data;");
    imports.add("import lombok.NoArgsConstructor;");
    imports.add("import lombok.AllArgsConstructor;");
  }

  if (cfg.useMybatisPlus) {
    imports.add("import com.baomidou.mybatisplus.annotation.TableName;");
    imports.add("import com.baomidou.mybatisplus.annotation.TableId;");
    imports.add("import com.baomidou.mybatisplus.annotation.TableField;");
    // AutoId
    const hasAutoId = table.columns.some((c) => c.primaryKey && c.autoIncrement);
    if (hasAutoId) {
      imports.add("import com.baomidou.mybatisplus.annotation.IdType;");
    }
  }

  if (cfg.useSwagger) {
    imports.add("import io.swagger.annotations.ApiModel;");
    imports.add("import io.swagger.annotations.ApiModelProperty;");
  }

  return Array.from(imports).sort();
}

/**
 * 生成字段代码
 */
function generateField(column: ColumnInfo, cfg: PojoConfig): string {
  const lines: string[] = [];
  const fieldName = toCamelCase(column.name);

  // 字段注释
  if (column.comment) {
    lines.push(`    /** ${column.comment} */`);
  }

  // 注解
  if (cfg.useMybatisPlus) {
    if (column.primaryKey) {
      if (column.autoIncrement) {
        lines.push(`    @TableId(type = IdType.AUTO)`);
      } else {
        lines.push("    @TableId");
      }
    } else if (fieldName !== column.name.toLowerCase()) {
      lines.push(`    @TableField("${column.name}")`);
    }
  }

  if (cfg.useSwagger) {
    lines.push(`    @ApiModelProperty("${column.comment || fieldName}")`);
  }

  lines.push(`    private ${column.javaType} ${fieldName};`);

  return lines.join("\n");
}

/**
 * 生成 Getter
 */
function generateGetter(column: ColumnInfo): string {
  const fieldName = toCamelCase(column.name);
  const methodName = fieldName.charAt(0).toUpperCase() + fieldName.slice(1);
  return `    public ${column.javaType} get${methodName}() {\n        return ${fieldName};\n    }`;
}

/**
 * 生成 Setter
 */
function generateSetter(column: ColumnInfo): string {
  const fieldName = toCamelCase(column.name);
  const methodName = fieldName.charAt(0).toUpperCase() + fieldName.slice(1);
  return `    public void set${methodName}(${column.javaType} ${fieldName}) {\n        this.${fieldName} = ${fieldName};\n    }`;
}
