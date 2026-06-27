# Vibe Market — 发现最好的 Vibe 设计

设计作品交易平台，支持作品发布、创作者关注、闲鱼安全交易。

## 技术栈

| 层级 | 技术 |
|------|------|
| 运行时 | Node.js 18+ |
| 后端框架 | Express.js 4.x |
| 数据库 | SQLite (sql.js WASM — 无需原生依赖，跨平台零配置) |
| 认证 | JWT + bcryptjs |
| 前端 | 原生 HTML/CSS/JS (无框架) |

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量（复制并编辑 .env）
# 生产环境务必修改 JWT_SECRET 和 ADMIN_PASSWORD

# 3. 启动开发服务器
npm start

# 4. 打开浏览器
# http://localhost:3456
```

## 环境变量 (.env)

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `NODE_ENV` | 运行环境 | `development` |
| `PORT` | 服务器端口 | `3456` |
| `JWT_SECRET` | JWT 签名密钥 | **生产环境必须修改** |
| `ADMIN_USERNAME` | 管理员用户名 | `admin` |
| `ADMIN_PASSWORD` | 管理员密码 | **生产环境必须修改** |
| `CORS_ORIGIN` | 允许的跨域来源 | 开发环境允许全部 |

## 生产部署

```bash
# 1. 设置环境变量
export NODE_ENV=production
export JWT_SECRET=$(openssl rand -hex 32)
export ADMIN_PASSWORD=<强密码>
export CORS_ORIGIN=https://yourdomain.com

# 2. 使用 PM2 管理进程（推荐）
npm install -g pm2
pm2 start server.js --name vibe-market
pm2 save
pm2 startup

# 3. Nginx 反向代理（HTTPS 终止）
# 配置 SSL 证书后将请求代理到 localhost:3456
```

## API 概览

| 端点 | 方法 | 认证 | 说明 |
|------|------|------|------|
| `/api/health` | GET | - | 健康检查 |
| `/api/auth/register` | POST | - | 注册 |
| `/api/auth/login` | POST | - | 登录 |
| `/api/auth/me` | GET | Bearer | 当前用户 |
| `/api/auth/forgot-password` | POST | - | 忘记密码 |
| `/api/auth/reset-password` | POST | - | 重置密码 |
| `/api/works` | GET | - | 作品列表 (支持分页) |
| `/api/works/:id` | GET | - | 作品详情 |
| `/api/works` | POST | Bearer | 发布作品 |
| `/api/works/:id` | PATCH | Bearer | 编辑作品 |
| `/api/works/:id/like` | POST | Bearer | 点赞/取消 |
| `/api/creators` | GET | - | 创作者列表 |
| `/api/users/:id/follow` | POST | Bearer | 关注/取消 |
| `/api/codes` | GET | Admin | 验证码列表 |
| `/api/codes` | POST | Admin | 生成验证码 |
| `/api/stats` | GET | Admin | 统计数据 |
| `/api/feedback` | POST | Bearer | 提交反馈 |

## 项目结构

```
VibeMarket/
├── server.js          # Express 后端服务
├── package.json
├── .env               # 环境变量配置
├── .gitignore
├── data/
│   └── vibe.db        # SQLite 数据库
├── public/
│   ├── index.html     # SPA 页面
│   ├── style.css      # 样式表
│   └── app.js         # 前端逻辑
└── 启动.bat            # Windows 启动脚本
```

## 安全清单

- [x] Helmet 安全头 (CSP / HSTS / X-Frame)
- [x] 速率限制 (认证接口 20次/15min, 通用 200次/15min)
- [x] bcrypt 密码哈希 (12 轮)
- [x] JWT 认证 (7天过期)
- [x] 输入验证与清理
- [x] 权限检查 (作品编辑/审核)
- [x] 原子化数据库写入 (防损坏)
- [x] HTML 转义 (XSS 防护) — 所有 innerHTML 渲染点已套用 escapeHtml()
- [ ] HTTPS (需 nginx/CDN 配置)
- [ ] 生产环境 self-host 字体文件
