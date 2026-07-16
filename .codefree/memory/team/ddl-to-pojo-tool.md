---
name: ddl-to-pojo-tool
type: project
scope: team
description: Fox Tool 开发者工具箱项目，首页为工具箱风格的应用卡片网格，DDL to POJO 作为其中一个应用，路由为 /tools/ddl-to-pojo。该工具功能：页面包含 SQL 编辑区，解析 DDL SQL（CREATE TABLE）提取字段信息（字段名、类型、注释、主键、默认值、自增等），...
created: "2026-07-16T09:31:44.485Z"
updated: "2026-07-16T09:31:44.485Z"
---
Fox Tool 开发者工具箱项目，首页为工具箱风格的应用卡片网格，DDL to POJO 作为其中一个应用，路由为 /tools/ddl-to-pojo。该工具功能：页面包含 SQL 编辑区，解析 DDL SQL（CREATE TABLE）提取字段信息（字段名、类型、注释、主键、默认值、自增等），然后生成 Java POJO 代码，支持 Lombok / MyBatis-Plus / Swagger 注解配置。技术栈 Next.js + React + Tailwind CSS，包管理 pnpm。后续可扩展方向：添加更多工具（JSON 格式化、Base64 编解码、正则测试、时间戳转换、颜色转换等），为 /tools/* 添加共享布局，SQL 编辑器语法高亮、下载 .java 文件、批量表生成等增强功能。