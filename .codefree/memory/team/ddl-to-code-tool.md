---
name: ddl-to-code-tool
type: project
scope: team
description: Fox Tool 开发者工具箱项目，首页为工具箱风格的应用卡片网格，DDL to Code 作为其中一个应用，路由为 /tools/ddl-to-code。该工具功能：页面包含 SQL 编辑区，解析 DDL SQL（CREATE TABLE）提取字段信息，然后生成多语言代码（目前支持 Java，架构...
created: "2026-07-17T09:34:25.234Z"
updated: "2026-07-17T09:34:25.234Z"
---
Fox Tool 开发者工具箱项目，首页为工具箱风格的应用卡片网格，DDL to Code 作为其中一个应用，路由为 /tools/ddl-to-code。该工具功能：页面包含 SQL 编辑区，解析 DDL SQL（CREATE TABLE）提取字段信息，然后生成多语言代码（目前支持 Java，架构已支持扩展其他语言）。代码架构：ddl-parser.ts（语言无关的 SQL 解析器）→ code-generator.ts（统一调度入口）→ java-generator.ts（Java 代码生成器）。页面包含语言选择器，Java 配置区（包名、Lombok、MyBatis-Plus、Swagger 等）。