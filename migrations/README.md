# Database Migrations

这个目录用于存放数据库增量迁移文件。

## 使用方式

- 初始化新库：先执行 `npm run db:push`
- 老库升级或部署时：执行 `npm run db:migrate`

## 命名规范

- 文件名格式：`YYYYMMDD_序号_动作_对象.sql`
- 示例：`20260415_002_drop_news_tables.sql`

## 编写规则

- 每个迁移文件只做一件事情，尽量保持小而清晰。
- 迁移应尽量可重复执行，避免在已存在字段或索引时报错。
- 新增表结构时：
  - `sql/schema.sql` 表示当前完整最新结构
  - `migrations/*.sql` 表示老库如何一步步升级到最新结构

## 部署建议

- 推荐在服务器部署脚本中加入：

```bash
npm run db:migrate
```

- 这样已执行过的迁移会自动跳过，新迁移会按文件名顺序执行。
