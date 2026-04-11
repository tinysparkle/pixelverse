# Pixelverse 服务器部署

这份文档以 Linux 服务器为目标，默认场景是：

- Ubuntu 22.04+
- Node.js 20+
- MySQL 8+
- Nginx 反向代理
- systemd 守护 Next.js 进程

如果你只准备先部署一台机器，这套方案足够简单，也方便后面扩展。

## 1. 部署架构

当前项目的运行方式是：

- Next.js 应用负责页面、API、登录和笔记功能
- MySQL 保存用户和笔记数据
- 图片不存进 MySQL，而是写入服务器磁盘
- 图片访问路径是 `/uploads/<filename>`

当前图片上传逻辑会把文件写到项目目录下的 `public/uploads`。

这意味着：

- 单机部署可以直接用
- 如果你重装应用目录、切换发布目录或做多机部署，需要单独持久化这个目录
- 后续如果要上 CDN、对象存储或多机部署，建议把上传存储改成 S3 / OSS / COS 一类对象存储

## 2. 服务器准备

先安装基础依赖：

```bash
sudo apt update
sudo apt install -y nginx mysql-server curl git build-essential
```

安装 Node.js 20：

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

建议创建专用运行用户：

```bash
sudo useradd -r -m -d /opt/pixelverse -s /bin/bash pixelverse
```

## 3. 准备 MySQL

进入 MySQL：

```bash
sudo mysql
```

创建库和账号：

```sql
CREATE DATABASE IF NOT EXISTS pixelverse
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'pixelverse'@'127.0.0.1' IDENTIFIED BY '真实强密码';
GRANT ALL PRIVILEGES ON pixelverse.* TO 'pixelverse'@'127.0.0.1';
FLUSH PRIVILEGES;
```

## 4. 拉取项目

切到部署目录：

```bash
sudo mkdir -p /opt/pixelverse/app
sudo chown -R pixelverse:pixelverse /opt/pixelverse
sudo -u pixelverse -H bash
cd /opt/pixelverse/app
git clone <你的仓库地址> .
```

安装依赖：

```bash
npm ci
```

## 5. 配置环境变量

在项目根目录创建 `.env.local`：

```bash
cp .env.example .env.local
```

至少改成下面这些值：

```env
AUTH_SECRET=replace-with-a-long-random-random-string
NEXTAUTH_URL=https://your-domain.com
DATABASE_URL=mysql://pixelverse:真实强密码@127.0.0.1:3306/pixelverse
SEED_ADMIN_EMAIL=admin
SEED_ADMIN_PASSWORD=123456
```

生成随机密钥：

```bash
openssl rand -base64 32
```

## 6. 处理上传目录持久化

因为应用会把图片写到 `public/uploads`，生产环境建议把它单独放到持久化目录，再做软链接。

先创建持久化目录：

```bash
mkdir -p /opt/pixelverse/data/uploads
```

如果项目里原本已经有 `public/uploads`，先删除再创建链接：

```bash
rm -rf /opt/pixelverse/app/public/uploads
ln -s /opt/pixelverse/data/uploads /opt/pixelverse/app/public/uploads
```

这样以后重新部署代码时，图片不会跟着丢。

## 7. 初始化数据库

执行：

```bash
npm run db:setup
```

它会：

- 建表
- 写入默认开发账号

如果你不想继续使用默认账号，可以后续把密码改掉，或者直接修改 `.env.local` 里的种子值再重新执行：

```bash
npm run db:seed
```

## 8. 构建与启动

先构建：

```bash
npm run build
```

先手动验证一次：

```bash
npm start
```

默认会监听 `3000` 端口。确认没问题后，再交给 systemd 管理。

## 9. 配置 systemd

创建服务文件：

```bash
sudo nano /etc/systemd/system/pixelverse.service
```

写入：

```ini
[Unit]
Description=Pixelverse Next.js App
After=network.target mysql.service

[Service]
Type=simple
User=pixelverse
Group=pixelverse
WorkingDirectory=/opt/pixelverse/app
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

启动并设置开机自启：

```bash
sudo systemctl daemon-reload
sudo systemctl enable pixelverse
sudo systemctl start pixelverse
sudo systemctl status pixelverse
```

查看日志：

```bash
sudo journalctl -u pixelverse -f
```

## 10. 配置 Nginx

创建站点配置：

```bash
sudo nano /etc/nginx/sites-available/pixelverse
```

写入：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

启用配置：

```bash
sudo ln -s /etc/nginx/sites-available/pixelverse /etc/nginx/sites-enabled/pixelverse
sudo nginx -t
sudo systemctl reload nginx
```

## 11. 配置 HTTPS

如果域名已经解析到服务器，建议直接用 Certbot：

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

完成后，记得把 `.env.local` 里的 `NEXTAUTH_URL` 改成正式 HTTPS 域名。

## 12. 部署后检查清单

至少检查下面这些点：

1. 首页可以正常打开
2. `/login` 能登录
3. 登录后首页右上角入口会切换成“云笔记”
4. 可以新建笔记、编辑、刷新后仍能回显
5. 上传图片后，请求返回的 URL 形如 `/uploads/xxx.png`
6. 重启 `pixelverse` 服务后，已上传图片仍然能访问

## 13. 更新发布流程

后续更新代码时，可以用这套最简单的流程：

```bash
sudo -u pixelverse -H bash
cd /opt/pixelverse/app
git pull
npm ci
npm run build
sudo systemctl restart pixelverse
```

如果这次更新涉及数据库表结构变化，再补跑：

```bash
npm run db:push
```

## 14. 常见问题

### 1. 上传的图片为什么会丢？

因为当前图片是写在服务器磁盘上的，不是写进数据库。只要你覆盖了项目目录、删了 `public/uploads`，图片就会丢。

解决办法：

- 保持当前应用目录原地部署
- 或者像上面文档那样，把 `public/uploads` 链到持久化目录

### 2. 能不能把图片也存进 MySQL？

可以，但当前项目没有这样做。

现在的实现是：

- 磁盘保存图片文件
- 笔记内容 JSON 里保存图片 URL

对当前这个项目来说，这比把二进制直接塞进 MySQL 更简单，也更适合后续迁移到对象存储。

### 3. 如果以后要多机部署怎么办？

当前上传方案不适合多机共享。要做多机或容器弹性扩容时，优先把上传改成对象存储，不建议继续依赖本地磁盘。