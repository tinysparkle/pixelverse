# Pixelverse

Pixelverse 是一个会继续扩展的像素风创作站点，目前包含：

- 营销首页
- Auth.js 登录
- MySQL 驱动的云笔记
- 图片上传
- 底部像素猫组件

## 本地开发

### 1. 安装依赖

```bash
npm install
```

### 2. 准备环境变量

```bash
cp .env.example .env.local
```

最少需要这三个变量：

```env
AUTH_SECRET=replace-with-a-long-random-string
NEXTAUTH_URL=http://localhost:3000
DATABASE_URL=mysql://pixelverse:pixelverse_dev_password@127.0.0.1:3306/pixelverse
```

生成随机密钥：

```bash
openssl rand -base64 32
```

### 3. 启动 MySQL

macOS 如果还没安装 MySQL，先装客户端和服务端：

```bash
brew install mysql
brew services start mysql
```

如果本机还没有数据库，可以先创建开发库：

```sql
CREATE DATABASE IF NOT EXISTS pixelverse
	CHARACTER SET utf8mb4
	COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'pixelverse'@'127.0.0.1' IDENTIFIED BY 'pixelverse_dev_password';
GRANT ALL PRIVILEGES ON pixelverse.* TO 'pixelverse'@'127.0.0.1';
FLUSH PRIVILEGES;
```

### 4. 初始化数据库

```bash
npm run db:setup
```

它会做两件事：

- `npm run db:push`：执行 [sql/schema.sql](sql/schema.sql)，创建 `users` 和 `notes` 表
- `npm run db:seed`：写入本地开发账号

默认开发账号：

- 账号：admin
- 密码：123456

### 5. 启动项目

```bash
npm run dev
```

打开 http://localhost:3000 。

## 本地如何测试

### 登录测试

1. 打开 /login
2. 使用 admin / 123456
3. 登录成功后回到首页
4. 首页右上角入口会从“登入”切换成“云笔记”

### 笔记测试

1. 点击“新建笔记”
2. 输入标题和正文
3. 刷新页面，确认笔记仍然存在
4. 退出登录后再访问 /notes，应跳回 /login

### 数据库联通测试

直接用 npm 脚本验证一遍即可：

```bash
npm run db:push
npm run db:seed
```

进入后可执行：

```sql
SELECT id, email, created_at FROM users;
SELECT id, user_id, title, deleted_at FROM notes ORDER BY updated_at DESC;
SELECT id, title, updated_at FROM notes ORDER BY updated_at DESC;
```

## 常见报错

### mysql: command not found

这通常表示你的机器还没安装 MySQL 客户端。

先执行：

```bash
brew install mysql
brew services start mysql
```

### Table users doesn't exist

这表示数据库表还没初始化。先执行：

```bash
npm run db:push
```

### DATABASE_URL 未配置

这通常表示 `.env.local` 里没有 `DATABASE_URL`，或者值为空。

先确认：

```bash
cp .env.example .env.local
```

然后在 `.env.local` 里填写真实连接，例如：

```env
DATABASE_URL=mysql://pixelverse:pixelverse_dev_password@127.0.0.1:3306/pixelverse
```

再运行：

```bash
npm run db:push
npm run db:seed
```

## 数据库使用说明

### 图片是怎么存的

当前图片上传不是把二进制直接写进 MySQL。

现在的实现是：

- 上传接口把图片写到项目目录下的 `public/uploads`
- 返回一个可访问路径，例如 `/uploads/abc123.png`
- 编辑器把这个路径写进笔记的富文本 JSON 内容里
- MySQL 里保存的是笔记内容和图片 URL，不是图片文件本身

这套方案在单机部署时最简单，但生产环境一定要注意 `public/uploads` 的持久化，否则重新部署时图片可能丢失。

### 表结构

- users：登录用户，包含邮箱和密码哈希
- notes：笔记内容，使用 user_id 关联到 users.id

建表 SQL 统一记录在 [sql/schema.sql](sql/schema.sql)。后续迁移和维护以这个文件为准。

### 常用命令

```bash
npm run db:push
npm run db:seed
npm run db:setup
```

### 什么时候用哪个命令

1. 第一次拉项目到本地，用 npm run db:setup。
2. 改了 [sql/schema.sql](sql/schema.sql) 后，用 npm run db:push。
3. 想重置本地开发账号密码，用 npm run db:seed。

### 开发阶段的账号逻辑

当前登录不是前端假登录，但也不是完整注册系统：

- 表单提交给 Auth.js credentials provider
- 服务端从 `users` 表按邮箱查人
- 用本地密码哈希校验密码
- 登录成功后把用户 id 放进 session/jwt

所以现在已经是“真实数据库登录”，只是账号创建流程仍然由 seed 脚本提供，而不是开放注册。

## 热点雷达（AI 资讯聚合）

热点雷达是 Pixelverse 的 AI 资讯功能模块，自动抓取 HackerNews 等来源的最新 AI 行业动态，经过智能筛选、中文翻译后呈现，并支持每日 AI 摘要生成。

### 功能概览

- **自动同步**：从 Cloudflare Worker 拉取最新新闻并存入数据库
- **AI 筛选**：Worker 内置 Llama 3.1 8B，对每条新闻评分（0–1），过滤与 AI 无关的内容
- **双语展示**：每条新闻提供中文标题 + 摘要，支持一键切换原文
- **每日摘要**：调用智谱 GLM-4-Flash，将当日新闻按主题分组生成中文综述
- **关键词过滤**：用户可添加自定义关键词，仅显示匹配的资讯
- **收藏 & 已读**：逐条标记，刷新后状态保留

访问路径：登录后进入 `/news`。

### 环境变量配置

在 `.env.local` 中追加以下变量：

```env
# Cloudflare Worker — 新闻采集服务
CF_WORKER_URL=https://your-worker.workers.dev
CF_WORKER_SECRET=your-worker-secret

# 智谱 AI — 每日摘要生成
ZHIPU_API_KEY=your-zhipu-api-key

# 出站代理（可选，国内服务器访问 Cloudflare / 智谱 API 时使用）
# 优先级：OUTBOUND_PROXY > HTTPS_PROXY > HTTP_PROXY > ALL_PROXY
OUTBOUND_PROXY=http://127.0.0.1:7890
```

如果请求 Cloudflare Worker 或智谱 API 时提示 `fetch failed`，通常是网络不通，配置 `OUTBOUND_PROXY` 后重启 `npm run dev` 即可。

### Cloudflare Worker 部署

Worker 源码在项目根目录的 `news-collector/` 下。

```bash
cd news-collector
npm install
# 在 wrangler.toml 中填写你的 Cloudflare 账号 / D1 数据库 ID
wrangler deploy
```

部署完成后，Cloudflare 会提供一个 `*.workers.dev` 域名，填入 `CF_WORKER_URL`。

Worker 默认每 6 小时自动触发一次采集，也可以在 Cloudflare Dashboard 手动触发，或通过下方的同步接口主动拉取。

### 数据库表

执行 `npm run db:push` 会自动创建以下表：

| 表名 | 说明 |
|------|------|
| `news_items` | 新闻主表，存储标题、摘要、中文翻译、来源、AI 评分、标签 |
| `news_bookmarks` | 用户收藏记录（user_id + news_id 联合主键） |
| `news_read` | 用户已读记录 |
| `news_keywords` | 用户自定义关键词 |

### API 接口

所有接口需登录（未登录返回 401）。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/news` | 获取新闻列表，支持 `keyword` / `source` / `bookmarked` / `unread` / `limit` / `offset` 参数 |
| PATCH | `/api/news/[id]` | 标记已读 `{"action":"read"}` 或切换收藏 `{"action":"bookmark"}` |
| POST | `/api/news/sync` | 从 Cloudflare Worker 拉取最新新闻存入数据库 |
| POST | `/api/news/digest` | 调用智谱 GLM-4 生成当日 AI 资讯摘要 |
| GET | `/api/news/keywords` | 获取当前用户的关键词列表 |
| POST | `/api/news/keywords` | 添加关键词 `{"keyword":"LLM"}` |
| DELETE | `/api/news/keywords/[id]` | 删除关键词 |

### 常见问题

**同步失败：新闻服务未配置**

`.env.local` 缺少 `CF_WORKER_URL` 或 `CF_WORKER_SECRET`，按上方说明填写后重启。

**同步失败：fetch failed**

网络无法访问 Cloudflare Worker，在 `.env.local` 中配置 `OUTBOUND_PROXY` 后重启。

**摘要生成失败**

检查 `ZHIPU_API_KEY` 是否正确，或同样配置代理。智谱 API Key 可在 [open.bigmodel.cn](https://open.bigmodel.cn) 注册获取。

**新闻列表为空**

先手动触发一次同步：登录后点击页面右上角的 **⟳ Sync** 按钮，或直接调用：

```bash
curl -X POST http://localhost:3000/api/news/sync \
  -H "Cookie: <your-session-cookie>"
```

## 服务器部署

服务器部署文档已单独整理在 [DEPLOY.md](DEPLOY.md)。

如果你准备正式上服务器，建议先按那份文档完成：

1. MySQL 建库和授权
2. `.env.local` 配置
3. `public/uploads` 持久化
4. `npm run db:setup`
5. `npm run build`
6. systemd + Nginx + HTTPS

## 维护建议

1. 不要直接改数据库里的表结构定义说明，统一改 [sql/schema.sql](sql/schema.sql)。
2. 不要把真实生产数据库连接提交到仓库，`.env.local` 只保留在本机。
3. 如果后续要加迁移历史，可以在 schema.sql 稳定后再补 migrations 目录，不建议现在一起上复杂工具链。
