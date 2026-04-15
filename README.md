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
