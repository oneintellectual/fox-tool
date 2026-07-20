import { TableInfo } from "./ddl-parser";
import { generateJava, JavaConfig, SupportedLanguage } from "./java-generator";

/**
 * 代码生成器统一入口
 * 根据目标语言调度对应的生成器
 */

export type { SupportedLanguage };
export type { JavaConfig };

/**
 * 语言配置映射
 */
export interface LanguageOption {
  value: SupportedLanguage;
  label: string;
  icon: string;
}

/**
 * 支持的语言列表
 */
export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { value: "java", label: "Java", icon: "☕" },
];

/**
 * 代码生成配置（联合所有语言的配置）
 */
export interface CodeGenerateConfig {
  language: SupportedLanguage;
  // Java 配置
  packageName: string;
  useLombok: boolean;
  useSwagger: boolean;
  useMybatisPlus: boolean;
  author: string;
}

/**
 * 生成代码
 */
export function generateCode(table: TableInfo, config: CodeGenerateConfig): string {
  switch (config.language) {
    case "java":
      return generateJava(table, {
        packageName: config.packageName,
        useLombok: config.useLombok,
        useSwagger: config.useSwagger,
        useMybatisPlus: config.useMybatisPlus,
        author: config.author,
      });
    default:
      throw new Error(`Unsupported language: ${config.language}`);
  }
}

/**
 * 获取语言对应的类型映射（用于字段表格展示）
 */
export function getTargetType(sqlType: string, language: SupportedLanguage): string {
  switch (language) {
    case "java":
      return getJavaTypeFromSql(sqlType);
    default:
      return sqlType;
  }
}

/**
 * Java 类型映射（从 java-generator 中复用逻辑）
 */
function getJavaTypeFromSql(sqlType: string): string {
  const SQL_TO_JAVA_TYPE: Record<string, string> = {
    TINYINT: "Integer",
    SMALLINT: "Integer",
    MEDIUMINT: "Integer",
    INT: "Integer",
    INTEGER: "Integer",
    BIGINT: "Long",
    FLOAT: "Float",
    DOUBLE: "Double",
    DECIMAL: "BigDecimal",
    NUMERIC: "BigDecimal",
    CHAR: "String",
    VARCHAR: "String",
    TINYTEXT: "String",
    TEXT: "String",
    MEDIUMTEXT: "String",
    LONGTEXT: "String",
    ENUM: "String",
    SET: "String",
    DATE: "LocalDate",
    TIME: "LocalTime",
    DATETIME: "LocalDateTime",
    TIMESTAMP: "LocalDateTime",
    YEAR: "Integer",
    BINARY: "byte[]",
    VARBINARY: "byte[]",
    TINYBLOB: "byte[]",
    BLOB: "byte[]",
    MEDIUMBLOB: "byte[]",
    LONGBLOB: "byte[]",
    BOOLEAN: "Boolean",
    BOOL: "Boolean",
    JSON: "String",
  };
  const upperType = sqlType.toUpperCase().split("(")[0].trim();
  return SQL_TO_JAVA_TYPE[upperType] || "String";
}
