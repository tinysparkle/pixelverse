# Pixelverse

像素风创作站点，基于 Next.js App Router 全栈架构。

## 技术栈

- **框架**: Next.js 16 (App Router) + React 19 + TypeScript 5
- **认证**: Auth.js (next-auth 5 beta) Credentials Provider + JWT session
- **数据库**: MySQL (mysql2/promise)，无 ORM，手写 SQL
- **编辑器**: Tiptap 3 (StarterKit + Image + Placeholder)
- **样式**: CSS Modules + Tailwind CSS 4 + CSS 自定义属性
- **测试**: Vitest + Testing Library
- **字体**: Silkscreen (像素标题) + Noto Serif SC (中文正文)

## 项目结构

```
src/
├── app/
│   ├── (marketing)/          # 营销首页 (route group，不影响URL)
│   │   ├── page.tsx          # 服务端入口，渲染 HomePage
│   │   ├── HomePage.tsx      # 客户端组件：英雄区、实时时钟
│   │   └── HomePage.module.css
│   ├── api/
│   │   ├── auth/[...nextauth]/route.ts   # Auth.js 处理器
│   │   ├── notes/route.ts                # GET 列表(支持 ?query= 搜索) / POST 新建
│   │   ├── notes/[id]/route.ts           # GET / PATCH / DELETE 单条笔记
│   │   └── upload/route.ts               # POST 图片上传
│   ├── login/
│   │   ├── page.tsx          # 登录页（已登录则重定向到 /）
│   │   └── LoginForm.tsx     # 客户端登录表单
│   ├── notes/
│   │   └── page.tsx          # 受保护的云笔记工作区入口
│   ├── tasks/
│   │   └── page.tsx          # 受保护的任务队列入口
│   ├── layout.tsx            # 根布局，加载字体
│   └── globals.css           # 全局样式、CSS 变量、动画定义
├── components/
│   ├── notes/
│   │   ├── NotesPage.tsx     # 主编辑器组件 (~660行)：侧栏 + Tiptap 编辑器 + 工具栏
│   │   └── NotesPage.module.css
│   ├── tasks/
│   │   ├── TasksPage.tsx     # 任务管理主组件：筛选栏 + 任务列表 + 内联表单
│   │   ├── tasks.module.css
│   │   ├── ReminderPanel.tsx # 首页侧边提醒面板
│   │   └── reminder.module.css
│   └── pet/
│       ├── PixelCat.tsx      # 底部浮动像素幽灵猫吉祥物
│       └── PixelCat.module.css
├── lib/
│   ├── auth/
│   │   ├── index.ts          # NextAuth 配置 (Credentials provider, JWT callbacks)
│   │   └── password.ts       # scrypt 密码哈希和验证
│   └── db/
│       ├── connection.ts     # MySQL 连接池
│       └── queries.ts        # 所有 SQL 查询函数 (用户/笔记 CRUD)
├── __tests__/                # Vitest 测试
│   ├── setup.ts
│   ├── pixel-cat.test.ts     # 14 个精灵/尺寸测试
│   └── notes-api.test.ts     # 16 个 API/安全测试
├── types/
│   └── next-auth.d.ts        # NextAuth 类型扩展
└── middleware.ts              # 路由保护：/notes/**, /api/notes/**, /api/upload
```

其他关键目录:
- `sql/schema.sql` — 唯一的数据库 DDL 来源
- `scripts/` — db-push.ts (执行 schema.sql)、seed.ts (创建开发账号)
- `public/uploads/` — 用户上传的图片存储目录

## 常用命令

```bash
npm run dev          # 启动开发服务器
npm run build        # 生产构建
npm run test         # 运行测试 (vitest run)
npm run test:watch   # 监听模式测试
npm run lint         # ESLint 检查
npm run db:setup     # 初始化数据库 (push + seed)
npm run db:push      # 执行 sql/schema.sql
npm run db:seed      # 创建开发账号 admin/123456
```

## 架构约定

### 路由与组件

- 使用 Next.js App Router，页面在 `src/app/` 下
- 服务端组件作为页面入口 (`page.tsx`)，交互逻辑放在客户端组件 (`"use client"`)
- 路由组 `(marketing)` 用于首页，不影响 URL 路径
- 受保护路由由 `middleware.ts` 统一拦截，不需要在页面内重复检查

### API 设计

- API 路由在 `src/app/api/` 下，使用 Next.js Route Handlers
- 所有 API 先通过 `auth()` 获取 session，未登录返回 401
- 笔记 API 模式:
  - `GET /api/notes?query=xxx` — 列表 + 搜索
  - `POST /api/notes` — 新建
  - `GET/PATCH/DELETE /api/notes/[id]` — 单条操作
- 任务 API 模式:
  - `GET /api/tasks?tag=&priority=&status=` — 列表 + 筛选
  - `POST /api/tasks` — 新建
  - `GET /api/tasks/upcoming?days=7` — 即将到期的任务
  - `GET/PATCH/DELETE /api/tasks/[id]` — 单条操作
  - `POST /api/tasks/[id]/toggle` — 切换完成状态
- DELETE 是软删除 (设置 `deleted_at` 时间戳)
- 返回格式统一为 JSON，错误使用 `{ error: string }`

### 数据库

- 不使用 ORM，所有查询在 `src/lib/db/queries.ts` 中用 mysql2/promise 手写
- 表结构变更只修改 `sql/schema.sql`，然后 `npm run db:push`
- 主键使用 UUID
- 笔记同时存储 `content_json` (Tiptap JSON，用于渲染) 和 `content_text` (纯文本，用于搜索)
- 软删除: `deleted_at` 为 NULL 表示未删除，查询时 `WHERE deleted_at IS NULL`

### 认证

- Auth.js Credentials Provider，不使用 OAuth
- 密码用 Node.js 原生 `crypto.scrypt` 哈希，带随机 salt
- JWT session，用户 ID 通过 jwt/session callback 注入
- 开发账号: admin / 123456 (由 seed 脚本创建)

### 编辑器 (Tiptap)

- 使用 `@tiptap/react` + StarterKit + Image + Placeholder
- 工具栏支持: 加粗、斜体、删除线、代码、标题(H1-H3)、列表、引用、分隔线、图片
- 自动保存: 编辑后 800ms 防抖保存，窗口失焦立即保存
- 保存状态指示: saved / saving / dirty / error
- 图片上传支持: 按钮选择、粘贴、拖放三种方式
- 图片上传到 `public/uploads/`，返回 `/uploads/hash.ext` 路径
- 上传限制: 客户端 + 服务端双重校验，最大 5MB，仅允许图片 MIME

## 设计系统

### CSS 变量 (定义在 globals.css)

```css
--bg: #0a0a0a          /* 主背景 深黑 */
--bg-soft: #111111     /* 次背景 */
--panel: #1a1a1a       /* 面板背景 */
--panel-strong: #252525
--panel-elevated: #333333
--ink: #f0ece8         /* 主文字 暖白 */
--ink-soft: #c8c4c0    /* 次文字 */
--ink-dim: #807a76     /* 弱文字 */
--accent: #ff3c28      /* 主强调色 红 */
--accent-soft: #ffd54f /* 次强调色 黄 */
--success: #00c853     /* 成功绿 */
--line: rgba(255,255,255,0.06)   /* 分隔线 */
--pixel: 4px           /* 像素单位基数 */
```

### 样式规范

- 每个组件配一个同名 `.module.css` 文件，使用 CSS Modules 作用域隔离
- Tailwind 主要用于全局主题和少量 utility，组件内以手写 CSS Modules 为主
- 暗色主题为唯一主题，不需要亮色模式切换
- 像素风格: 大量使用 `var(--pixel)` 作为间距/圆角基数
- 全局动画: `fadeInUp`、`fadeIn`、`glowPulse`、`subtleFloat`、`scanlines`
- 响应式: 使用 `min()` 实现流式尺寸，支持 `prefers-reduced-motion`
- 字体: 标题/UI 用 Silkscreen (像素体)，正文用 Noto Serif SC (衬线)

## 已实现功能

- [x] 营销首页: 英雄区 + 实时时钟 + 导航
- [x] 认证系统: 登录表单 + Credentials 验证 + JWT session + 中间件保护
- [x] 云笔记: CRUD + 富文本编辑 + 自动保存 + 搜索 + 软删除 + 字符计数
- [x] 图片上传: 拖放/粘贴/按钮 + 客户端&服务端校验 + 本地存储
- [x] 像素猫吉祥物: SVG 像素画 + 浮动动画 + 思考泡泡 + 点击交互 + 闪烁效果
- [x] 任务队列: CRUD + 优先级 + 标签 + 截止日期 + 筛选 + 首页侧边提醒面板

## 规划中的功能

- 热点雷达 (Hot Radar)

## 注意事项

- 图片存储在本地文件系统 `public/uploads/`，生产部署需做持久化
- `.env.local` 不提交到仓库，包含 AUTH_SECRET、DATABASE_URL 等敏感配置
- 表结构变更统一修改 `sql/schema.sql`，不要直接改线上库
- `middleware.ts` 中的 matcher 决定哪些路由受保护，新增受保护路由需更新
- 任务标签使用逗号分隔字符串存储（`tags VARCHAR(500)`），查询时用 `FIND_IN_SET`
- 首页提醒面板的天数阈值存储在 `localStorage`（key: `pixelverse_reminder_days`），默认 7 天
- Path alias: `@/*` 映射到 `./src/*`
