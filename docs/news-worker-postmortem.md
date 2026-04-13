# AI 资讯功能接入复盘

## 背景

Pixelverse 新增了 AI 资讯聚合功能，架构为：

- Cloudflare Worker 负责访问外网新闻源并写入 D1
- Pixelverse 通过 `/api/news/sync` 从 Worker 拉取数据并写入 MySQL
- 前端 `/news` 页面展示 MySQL 中的新闻数据

本次联调过程中，出现了本地同步失败、Worker 返回异常、Cloudflare D1 读写不一致等问题。

## 现象

### 问题 1：本地 `/api/news/sync` 返回 500

表现：

- 页面点击“同步”后提示：`同步失败: fetch failed`
- 本地服务端无法访问 `CF_WORKER_URL`

### 问题 2：Worker 根路径显示 Not Found

表现：

- 打开 `https://news-collector.pixelverse-news.workers.dev/` 显示 Not Found

### 问题 3：手动调用 `/api/collect` 返回 1101 或超时

表现：

- `curl -X POST ... /api/collect` 早期返回 `error code: 1101`
- 后续即使不报 1101，也会出现长时间无响应后超时

### 问题 4：Worker `/api/news` 返回 1101

表现：

- `GET /api/news` 带鉴权后返回 Cloudflare 1101 错误

## 根因

### 根因 1：本地 Node.js 不走系统代理

浏览器能访问 `workers.dev`，但 Next.js 服务端和终端中的 Node `fetch` 默认不读取 macOS 系统代理设置。

结果：

- 浏览器访问 Worker 正常
- 本地 Next API Route 访问 Worker 失败
- `/api/news/sync` 返回 `fetch failed`

### 根因 2：Worker 根路径未实现

Worker 仅实现了：

- `GET /api/news`
- `POST /api/collect`

没有处理 `/` 或 `/health`，因此直接打开域名只能看到 Not Found。

### 根因 3：远程 D1 未初始化

最初执行的 D1 SQL 是本地实例，不是远程实例。

结果：

- 本地 `.wrangler/state` 下有 `news_items`
- Cloudflare 线上 D1 没有 `news_items`
- Worker 线上查询 `news_items` 时触发 1101

### 根因 4：手动 `/api/collect` 同步执行整套抓取流程，HTTP 请求易超时

`/api/collect` 早期实现是同步执行：

- 抓取 HN
- 抓取多个 RSS
- 分批调用 Workers AI 过滤和翻译
- 写入 D1

整个请求路径过长，HTTP 调用很容易超时。

### 根因 5：单次抓取规模过大

早期配置：

- HN 抓 30 条
- 每个 RSS 最多解析 20 条

总量偏大，进一步放大了 AI 处理时长和超时风险。

## 解决方式

### 1. 增加服务端代理支持

新增文件：

- [src/lib/net/fetch.ts](src/lib/net/fetch.ts)

做法：

- 服务端请求自动读取 `OUTBOUND_PROXY`、`HTTPS_PROXY`、`HTTP_PROXY` 等环境变量
- `src/app/api/news/sync/route.ts` 和 `src/lib/ai/zhipu.ts` 改为通过该 helper 发起请求

本地开发环境新增：

```env
OUTBOUND_PROXY=http://127.0.0.1:7890
```

### 2. 增加 Worker 健康检查

修改：

- [news-collector/src/index.ts](../news-collector/src/index.ts)

新增：

- `GET /`
- `GET /health`

现在直接打开 Worker 地址会返回 JSON，方便判断是否在线。

### 3. 初始化远程 D1

修改：

- [news-collector/package.json](../news-collector/package.json)

将：

- `wrangler d1 execute news-collector-db --file=./schema.sql`

改为：

- `wrangler d1 execute news-collector-db --remote --file=./schema.sql`

并执行：

```bash
cd news-collector
npm run db:init
```

确保线上 Worker 绑定的 D1 已真正创建 `news_items` 表。

### 4. 把 `/api/collect` 改为后台执行

修改：

- [news-collector/src/index.ts](../news-collector/src/index.ts)

做法：

- 从同步 `await collectNews(env)`
- 改为 `ctx.waitUntil(collectNews(env))`
- HTTP 立即返回 accepted，避免手动触发时超时

### 5. 收缩单次抓取规模

修改：

- [news-collector/src/fetchers/hackernews.ts](../news-collector/src/fetchers/hackernews.ts)
- [news-collector/src/fetchers/rss.ts](../news-collector/src/fetchers/rss.ts)

调整为：

- HN 从 30 条降到 12 条
- 每个 RSS 从 20 条降到 5 条

目的：降低单次 AI 处理时长，减少超时和长尾失败。

### 6. 简化 `/api/news` 的 D1 查询

修改：

- [news-collector/src/index.ts](../news-collector/src/index.ts)

做法：

- 移除复杂且易出错的动态 bind 逻辑
- 简化为单一 SQL + 可选 `since` 参数绑定

## 最终状态

目前已验证：

- Worker 根路径可正常返回健康检查 JSON
- `POST /api/collect` 可正常返回 accepted
- 远程 D1 已创建 `news_items` 表
- Worker `GET /api/news` 可正常返回新闻数据
- 远程 D1 中已有采集到的新闻记录

## 正确的联调顺序

### 本地开发

1. 配置 `.env.local`
2. 设置 `OUTBOUND_PROXY`
3. 重启 Next.js 开发服务
4. 先触发一次 Worker `POST /api/collect`
5. 再调用 Pixelverse 的 `/api/news/sync`
6. 打开 `/news` 页面验证展示

### Worker 初始化

```bash
cd news-collector
npm install
npm run db:init
npm run deploy
```

### 手动触发采集

```bash
curl -X POST \
  -H "Authorization: Bearer <CF_WORKER_SECRET>" \
  https://news-collector.pixelverse-news.workers.dev/api/collect
```

### 读取 Worker 数据

```bash
curl -H "Authorization: Bearer <CF_WORKER_SECRET>" \
  "https://news-collector.pixelverse-news.workers.dev/api/news?limit=5"
```

## 部署建议

### 应提交到 Git 的内容

- Pixelverse 应用代码
- `news-collector/` 源码
- `news-collector/package-lock.json`
- 文档和 schema

### 不应提交到 Git 的内容

- `.env.local`
- `node_modules/`
- `news-collector/.wrangler/`
- 任意 secret、token、账号密钥

## 风险与后续建议

### 1. 线上服务器若无法访问 `workers.dev`

当前方案依赖 Pixelverse 服务器主动拉取 Worker 数据。

如果线上服务器无法访问 `workers.dev`，建议改为：

- Worker 采集完成后主动 push 到 Pixelverse 服务器

即从 pull 模式切换为 push 模式。

### 2. 当前 schema 推送方式是幂等的，但不等于正式 migration

当前 `db:push` 基于 `CREATE TABLE IF NOT EXISTS`，短期安全。

但后续若涉及：

- `ALTER TABLE`
- 数据迁移
- 索引调整

建议引入正式 migration 流程，而不是每次部署都无脑执行 schema 脚本。

### 3. Secret 已暴露，必须轮换

联调过程中曾在命令和配置里直接使用：

- `CF_WORKER_SECRET`
- `ZHIPU_API_KEY`

建议立即轮换：

1. 重置 Cloudflare Worker secret
2. 重置智谱 API key
3. 更新本地、服务器、Cloudflare 三处配置

## 本次结论

这次问题不是“功能方案错误”，而是联调期常见的三类问题叠加：

- 本地代理与 Node 外呼不一致
- Cloudflare 本地 D1 与远程 D1 混用
- 手动触发接口把长耗时任务做成了同步请求

修正后，这条链路已经可以跑通，AI 资讯功能具备继续完善和上线验证的基础。