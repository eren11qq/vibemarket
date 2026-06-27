/**
 * Vibe Market 独立后端服务器
 * 纯 Node.js + Express + SQLite (sql.js WASM)
 * 无原生依赖，可在任何平台部署
 */
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const compression = require('compression');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

// ── 配置 (从环境变量读取，敏感信息不再硬编码) ──
const PORT = process.env.PORT || 3456;
const NODE_ENV = process.env.NODE_ENV || 'development';
const JWT_SECRET = process.env.JWT_SECRET || 'vibe-market-dev-only-change-in-production';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'change-me-on-first-run';
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;
const DB_PATH = path.join(__dirname, 'data', 'vibe.db');
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');
const TRUST_PROXY = process.env.TRUST_PROXY === 'true';

// 安全提醒：生产环境必须设置环境变量
if (NODE_ENV === 'production' && JWT_SECRET === 'vibe-market-dev-only-change-in-production') {
  console.error('[安全警告] 生产环境中未设置 JWT_SECRET 环境变量！');
  console.error('[安全警告] 服务器拒绝启动。请设置 JWT_SECRET 环境变量。');
  process.exit(1);
}
if (NODE_ENV === 'production' && ADMIN_PASSWORD === 'change-me-on-first-run') {
  console.error('[安全警告] 生产环境中未设置 ADMIN_PASSWORD 环境变量！');
  console.error('[安全警告] 服务器拒绝启动。请设置 ADMIN_PASSWORD 环境变量。');
  process.exit(1);
}

const app = express();

// ── 安全与生产中间件 ──
if (TRUST_PROXY) app.set('trust proxy', 1);

// Helmet: 安全响应头 (CSP/MIME-sniff/X-Frame/HSTS)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "blob:"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      connectSrc: ["'self'"],
      mediaSrc: ["'self'", "data:", "blob:"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS: 生产环境限制来源
const ALLOWED_ORIGINS = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
  : (NODE_ENV === 'production' ? [] : true);
app.use(cors({
  origin: ALLOWED_ORIGINS === true ? '*' : ALLOWED_ORIGINS,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// 日志
app.use(morgan(NODE_ENV === 'production' ? 'combined' : 'dev'));

// 压缩
app.use(compression());

// Body 解析 — 限制大小防止 abuse
app.use(express.json({ limit: '10mb' }));
app.use(express.static(PUBLIC_DIR, { maxAge: '1h' }));
app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '7d' }));

// ── 速率限制 ──
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 分钟
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '请求过于频繁，请稍后再试' },
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, // 登录/注册更严格
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '登录/注册请求过于频繁，请15分钟后再试' },
});
app.use('/api/', generalLimiter);
app.use('/api/auth/', authLimiter);

// ── 输入验证工具 ──
function sanitize(str) {
  if (typeof str !== 'string') return '';
  return str.trim().slice(0, 5000); // 最大5000字符
}
function isValidId(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(id);
}

// ── 数据库 ──
let db;

async function initDb() {
  const SQL = await initSqlJs();
  let buffer;
  try {
    buffer = fs.readFileSync(DB_PATH);
  } catch {
    buffer = null;
  }
  db = buffer ? new SQL.Database(buffer) : new SQL.Database();

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      displayName TEXT NOT NULL,
      email TEXT DEFAULT '',
      password TEXT NOT NULL,
      isAdmin INTEGER DEFAULT 0,
      createdAt TEXT DEFAULT (datetime('now'))
    )
  `);
  // 迁移: 为旧数据库添加 email 列
  try { db.run("ALTER TABLE users ADD COLUMN email TEXT DEFAULT ''"); } catch {}
  // 迁移: 添加邮箱验证状态列
  try { db.run("ALTER TABLE users ADD COLUMN emailVerified INTEGER DEFAULT 0"); } catch {}
  db.run(`
    CREATE TABLE IF NOT EXISTS follows (
      id TEXT PRIMARY KEY,
      followerId TEXT NOT NULL,
      followingId TEXT NOT NULL,
      createdAt TEXT DEFAULT (datetime('now')),
      UNIQUE(followerId, followingId)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS reset_tokens (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      token TEXT UNIQUE NOT NULL,
      expiresAt TEXT NOT NULL,
      used INTEGER DEFAULT 0,
      createdAt TEXT DEFAULT (datetime('now'))
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS verify_tokens (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      token TEXT UNIQUE NOT NULL,
      expiresAt TEXT NOT NULL,
      createdAt TEXT DEFAULT (datetime('now'))
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS works (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      category TEXT DEFAULT 'visual',
      mediaType TEXT DEFAULT '',
      mediaUrl TEXT DEFAULT '',
      price REAL DEFAULT 0,
      xianyuUrl TEXT DEFAULT '',
      tags TEXT DEFAULT '[]',
      creatorId TEXT NOT NULL,
      createdAt TEXT DEFAULT (datetime('now')),
      likes INTEGER DEFAULT 0,
      isApproved INTEGER DEFAULT 0,
      isFeatured INTEGER DEFAULT 0,
      status TEXT DEFAULT 'pending'
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS codes (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      tier TEXT NOT NULL,
      used INTEGER DEFAULT 0,
      usedBy TEXT DEFAULT '',
      usedAt TEXT,
      createdAt TEXT DEFAULT (datetime('now'))
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS feedbacks (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      content TEXT NOT NULL,
      createdAt TEXT DEFAULT (datetime('now'))
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS likes (
      id TEXT PRIMARY KEY,
      workId TEXT NOT NULL,
      userId TEXT NOT NULL,
      createdAt TEXT DEFAULT (datetime('now')),
      UNIQUE(workId, userId)
    )
  `);

    // Vercel 环境下使用内存数据库
  if (process.env.VERCEL) {
    console.log('[Vercel] 使用内存数据库（数据在冷启动时重置）');
    // Vercel 环境下不写文件
    globalThis.__isVercel = true;
  }

  // 创建默认管理员账号 (从环境变量读取)
  const existingAdmin = db.exec(`SELECT id FROM users WHERE username = ?`, [ADMIN_USERNAME]);
  if (!existingAdmin.length) {
    const hash = bcrypt.hashSync(ADMIN_PASSWORD, 12);
    db.run("INSERT INTO users (id, username, displayName, password, isAdmin) VALUES (?, ?, ?, ?, 1)",
      ['user-admin', ADMIN_USERNAME, '管理员', hash]);
  } else if (NODE_ENV === 'production') {
    // 生产环境下，若管理员密码仍是默认值，更新密码
    const adminRow = db.exec("SELECT password FROM users WHERE username = ?", [ADMIN_USERNAME]);
    if (adminRow.length) {
      const currentHash = adminRow[0].values[0][0];
      if (!bcrypt.compareSync(ADMIN_PASSWORD, currentHash) && ADMIN_PASSWORD !== 'change-me-on-first-run') {
        const newHash = bcrypt.hashSync(ADMIN_PASSWORD, 12);
        db.run("UPDATE users SET password = ? WHERE username = ?", [newHash, ADMIN_USERNAME]);
      }
    }
  }

  saveDb();
}

function saveDb() {
  // Vercel 环境：不写文件，数据在内存中
  if (globalThis.__isVercel) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    // 先写临时文件，再原子重命名，防止写入中断导致数据库损坏
    const tmpPath = DB_PATH + '.tmp';
    fs.writeFileSync(tmpPath, buffer);
    fs.renameSync(tmpPath, DB_PATH);
  } catch (e) {
    console.error('[数据库] 保存失败:', e.message);
    // 不崩溃，下次操作会重试
  }
}

// ── 数据库自动备份 ──
const BACKUP_DIR = path.join(__dirname, 'data', 'backups');
const MAX_BACKUPS = 7;       // 最多保留 7 份备份
const BACKUP_INTERVAL = 6 * 60 * 60 * 1000; // 每 6 小时备份一次

function backupDb() {
  // Vercel 环境：不备份
  if (globalThis.__isVercel) return;
  try {
    if (!fs.existsSync(DB_PATH)) return;
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `vibe-${ts}.db`);
    fs.copyFileSync(DB_PATH, backupPath);
    console.log('[备份] 数据库已备份:', backupPath);

    // 清理旧备份：只保留最近 MAX_BACKUPS 份
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('vibe-') && f.endsWith('.db'))
      .sort(); // 按文件名（时间戳）排序，旧的在前
    while (files.length > MAX_BACKUPS) {
      const old = files.shift();
      fs.unlinkSync(path.join(BACKUP_DIR, old));
      console.log('[备份] 清理旧备份:', old);
    }
  } catch (e) {
    console.error('[备份] 失败:', e.message);
  }
}

// ── 媒体文件存储 (base64 → 本地文件，避免数据库膨胀) ──
const UPLOADS_WORKS_DIR = path.join(UPLOADS_DIR, 'works');

function saveMediaFile(base64DataUrl) {
  // 仅处理 data: URL，非 data: URL 原样返回
  if (!base64DataUrl || !base64DataUrl.startsWith('data:')) {
    return base64DataUrl;
  }

  try {
    // 解析 data:[<mime>][;base64],<data>
    const match = base64DataUrl.match(/^data:([^;]*)(;base64)?,(.*)$/);
    if (!match) return base64DataUrl;

    const mime = match[1] || 'application/octet-stream';
    const isBase64 = match[2] === ';base64';
    const data = match[3];

    // 确定文件扩展名
    const extMap = {
      'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif',
      'image/webp': '.webp', 'image/svg+xml': '.svg', 'image/bmp': '.bmp',
      'video/mp4': '.mp4', 'video/webm': '.webm',
    };
    if (!extMap[mime]) {
      console.warn('[文件上传] 不支持的文件类型:', mime);
      return ''; // 拒绝未知类型
    }
    const ext = extMap[mime];

    // 确保目录存在
    if (!fs.existsSync(UPLOADS_WORKS_DIR)) {
      fs.mkdirSync(UPLOADS_WORKS_DIR, { recursive: true });
    }

    // 写入文件
    const filename = 'work-' + uuidv4().slice(0, 8) + '-' + Date.now() + ext;
    const filePath = path.join(UPLOADS_WORKS_DIR, filename);
    const buffer = isBase64 ? Buffer.from(data, 'base64') : Buffer.from(data, 'utf-8');
    fs.writeFileSync(filePath, buffer);

    // 返回可访问的 URL 路径
    return '/uploads/works/' + filename;
  } catch (e) {
    console.error('[媒体存储] 保存失败:', e.message);
    return base64DataUrl; // 失败时保留原始数据，不丢失
  }
}

// ── 邮件发送 (nodemailer — 可选依赖) ──
let nodemailer = null;
try {
  nodemailer = require('nodemailer');
} catch (e) {
  console.log('[邮件] nodemailer 未安装，验证令牌将输出到控制台。安装: npm install nodemailer');
}

const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = parseInt(process.env.SMTP_PORT, 10) || 587;
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || 'noreply@vibemarket.com';

function canSendEmail() {
  return !!(nodemailer && SMTP_HOST && SMTP_USER && SMTP_PASS);
}

async function sendVerificationEmail(toEmail, token) {
  const verifyUrl = `${BASE_URL}/api/auth/verify-email?token=${encodeURIComponent(token)}`;

  if (canSendEmail()) {
    try {
      const transporter = nodemailer.createTransport({
        host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_PORT === 465,
        auth: { user: SMTP_USER, pass: SMTP_PASS },
      });
      await transporter.sendMail({
        from: SMTP_FROM,
        to: toEmail,
        subject: 'Vibe Market — 验证你的邮箱',
        text: `欢迎加入 Vibe Market！\n\n请点击以下链接验证你的邮箱：\n${verifyUrl}\n\n此链接 24 小时内有效。`,
        html: `<div style="max-width:480px;margin:0 auto;font-family:sans-serif">
          <h2 style="color:#1a1a1a">🎨 Vibe Market</h2>
          <p>欢迎加入！请点击下方按钮验证你的邮箱：</p>
          <a href="${verifyUrl}" style="display:inline-block;padding:12px 32px;background:#CFFF55;color:#1a1a1a;border-radius:8px;text-decoration:none;font-weight:600">验证邮箱</a>
          <p style="color:#999;font-size:13px;margin-top:24px">此链接 24 小时内有效。如非本人操作，请忽略此邮件。</p>
        </div>`,
      });
      console.log('[邮件] 验证邮件已发送至:', toEmail);
    } catch (e) {
      console.error('[邮件] 发送失败:', e.message);
    }
  } else {
    // 开发环境：输出到控制台
    console.log('');
    console.log('📧 ──────────── 邮箱验证令牌 (仅开发环境可见) ────────────');
    console.log(`   收件人: ${toEmail}`);
    console.log(`   验证链接: ${verifyUrl}`);
    console.log('📧 ────────────────────────────────────────────────────');
    console.log('');
  }
}

// ── JWT 中间件 ──
function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录' });
  }
  try {
    const token = header.slice(7);
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: '登录已过期' });
  }
}

function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    try {
      const token = header.slice(7);
      req.user = jwt.verify(token, JWT_SECRET);
    } catch { /* ignore */ }
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ error: '需要管理员权限' });
  }
  next();
}

// ── 健康检查 ──
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    env: NODE_ENV,
  });
});

// ── API: 认证 ──

// 注册
app.post('/api/auth/register', async (req, res) => {
  try {
    const username = sanitize(req.body.username);
    const password = req.body.password;
    const displayName = sanitize(req.body.displayName || '');
    const email = sanitize(req.body.email || '');

    if (!username || !password) {
      return res.status(400).json({ error: '请填写用户名和密码' });
    }
    if (username.length < 2 || username.length > 30) {
      return res.status(400).json({ error: '用户名长度应为2-30个字符' });
    }
    if (!/^[a-zA-Z0-9_一-龥]+$/.test(username)) {
      return res.status(400).json({ error: '用户名只能包含中英文、数字和下划线' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: '密码至少6位' });
    }
    // 邮箱格式校验 (可选填)
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: '邮箱格式不正确' });
    }

    const existing = db.exec("SELECT id FROM users WHERE username = ?", [username]);
    if (existing.length) {
      return res.status(409).json({ error: '用户名已存在' });
    }

    const id = 'user-' + uuidv4().slice(0, 8);
    const hash = bcrypt.hashSync(password, 12);
    const name = displayName || username;

    db.run("INSERT INTO users (id, username, displayName, email, password, emailVerified) VALUES (?, ?, ?, ?, ?, 0)",
      [id, username, name, email, hash]);
    saveDb();

    // 如果用户提供了邮箱，生成验证令牌并发送
    if (email) {
      const verifyToken = uuidv4() + '-' + uuidv4(); // 长随机令牌
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24小时有效
      const vtId = 'vt-' + uuidv4().slice(0, 8);
      db.run("INSERT INTO verify_tokens (id, userId, token, expiresAt) VALUES (?, ?, ?, ?)",
        [vtId, id, verifyToken, expiresAt]);
      saveDb();
      // 异步发送验证邮件（不阻塞注册响应）
      sendVerificationEmail(email, verifyToken).catch(e =>
        console.error('[邮件] 发送验证邮件失败:', e.message));
    }

    const token = jwt.sign(
      { id, username, displayName: name, isAdmin: false, emailVerified: false },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      token,
      user: { id, username, displayName: name, email, emailVerified: false }
    });
  } catch (e) {
    console.error('[注册] 失败:', e.message);
    res.status(500).json({ error: '服务器内部错误，请稍后重试' });
  }
});

// 登录
app.post('/api/auth/login', async (req, res) => {
  try {
    const username = sanitize(req.body.username);
    const password = req.body.password;

    if (!username || !password) {
      return res.status(400).json({ error: '请填写用户名和密码' });
    }

    const rows = db.exec("SELECT id, username, displayName, email, password, isAdmin, emailVerified FROM users WHERE username = ?", [username]);
    if (!rows.length) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    const row = rows[0].values[0];
    const user = {
      id: row[0],
      username: row[1],
      displayName: row[2],
      email: row[3] || '',
      password: row[4],
      isAdmin: row[5] === 1,
      emailVerified: row[6] === 1
    };

    if (!bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, displayName: user.displayName, isAdmin: user.isAdmin, emailVerified: user.emailVerified },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: { id: user.id, username: user.username, displayName: user.displayName, email: user.email, emailVerified: user.emailVerified },
      isAdmin: user.isAdmin
    });
  } catch (e) {
    console.error('[登录] 失败:', e.message);
    res.status(500).json({ error: '服务器内部错误，请稍后重试' });
  }
});

// 获取当前用户信息
app.get('/api/auth/me', authenticate, (req, res) => {
  try {
    const rows = db.exec("SELECT id, username, displayName, email, isAdmin, emailVerified FROM users WHERE id = ?", [req.user.id]);
    if (!rows.length) {
      return res.status(404).json({ error: '用户不存在' });
    }
    const u = rows[0].values[0];
    res.json({
      id: u[0], username: u[1], displayName: u[2], email: u[3] || '', isAdmin: u[4] === 1,
      emailVerified: u[5] === 1
    });
  } catch (e) {
    console.error('[用户信息] 失败:', e.message);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 忘记密码 — 生成重置令牌
app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const email = sanitize(req.body.email);
    if (!email) {
      return res.status(400).json({ error: '请输入注册邮箱' });
    }

    const rows = db.exec("SELECT id, username FROM users WHERE email = ?", [email]);
    if (!rows.length) {
      // 不泄露邮箱是否已注册，统一返回成功
      return res.json({ message: '如果该邮箱已注册，重置链接将发送到你的邮箱' });
    }

    const userId = rows[0].values[0][0];
    const token = uuidv4().slice(0, 16);
    const expiresAt = new Date(Date.now() + 3600000).toISOString(); // 1小时有效

    db.run("INSERT INTO reset_tokens (id, userId, token, expiresAt) VALUES (?, ?, ?, ?)",
      ['rt-' + uuidv4().slice(0, 8), userId, token, expiresAt]);
    saveDb();

    // 生产环境通过邮件发送令牌，不在日志中输出
    if (NODE_ENV === 'development') {
      console.log(`[密码重置] 用户: ${rows[0].values[0][1]}, 令牌: ${token}`);
    }
    res.json({
      message: '如果该邮箱已注册，重置链接将发送到你的邮箱',
      // 开发环境返回 token (生产环境应移除)
      ...(NODE_ENV === 'development' ? { devToken: token } : {})
    });
  } catch (e) {
    console.error('[忘记密码] 失败:', e.message);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 重置密码
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ error: '请提供重置令牌和新密码' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: '新密码至少6位' });
    }

    const rows = db.exec(
      "SELECT id, userId, expiresAt FROM reset_tokens WHERE token = ? AND used = 0",
      [token]
    );
    if (!rows.length) {
      return res.status(400).json({ error: '无效的重置令牌' });
    }

    const rt = rows[0].values[0];
    if (new Date(rt[2]) < new Date()) {
      return res.status(400).json({ error: '重置令牌已过期' });
    }

    const hash = bcrypt.hashSync(newPassword, 12);
    db.run("UPDATE users SET password = ? WHERE id = ?", [hash, rt[1]]);
    db.run("UPDATE reset_tokens SET used = 1 WHERE id = ?", [rt[0]]);
    saveDb();

    res.json({ message: '密码重置成功，请重新登录' });
  } catch (e) {
    console.error('[重置密码] 失败:', e.message);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// ── API: 邮箱验证 ──

app.get('/api/auth/verify-email', async (req, res) => {
  try {
    const token = sanitize(req.query.token || '');

    if (!token) {
      return res.status(400).json({ error: '缺少验证令牌' });
    }

    // 查找令牌
    const rows = db.exec(
      "SELECT id, userId, expiresAt FROM verify_tokens WHERE token = ?",
      [token]
    );
    if (!rows.length || !rows[0].values.length) {
      return res.status(400).json({ error: '无效的验证令牌' });
    }

    const [vtId, userId, expiresAt] = rows[0].values[0];

    if (new Date(expiresAt) < new Date()) {
      return res.status(400).json({ error: '验证令牌已过期，请重新注册获取新令牌' });
    }

    // 更新用户邮箱验证状态
    db.run("UPDATE users SET emailVerified = 1 WHERE id = ?", [userId]);
    // 删除已使用的令牌
    db.run("DELETE FROM verify_tokens WHERE id = ?", [vtId]);
    saveDb();

    // 返回友好的 HTML 页面
    res.send(`<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>邮箱验证成功 — Vibe Market</title>
<style>body{font-family:Inter,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f5f5f5}.card{background:#fff;padding:48px;border-radius:16px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.08);max-width:420px}h1{font-size:24px;color:#1a1a1a}p{color:#666;line-height:1.6}a{color:#1a1a1a;font-weight:600}</style></head>
<body><div class="card"><h1>✅ 邮箱验证成功</h1><p>你的邮箱已验证通过。现在可以正常使用 Vibe Market 的全部功能。</p><p><a href="/">返回首页</a></p></div></body></html>`);
  } catch (e) {
    console.error('[邮箱验证] 失败:', e.message);
    res.status(500).send('服务器内部错误，请稍后重试');
  }
});

// ── API: 关注 ──

// 关注/取消关注用户
app.post('/api/users/:id/follow', authenticate, (req, res) => {
  try {
    const followingId = req.params.id;
    const followerId = req.user.id;

    if (!isValidId(followingId)) return res.status(400).json({ error: '无效的用户ID' });
    if (followerId === followingId) return res.status(400).json({ error: '不能关注自己' });

    // 检查目标用户是否存在
    const userExists = db.exec("SELECT id FROM users WHERE id = ?", [followingId]);
    if (!userExists.length) return res.status(404).json({ error: '用户不存在' });

    const existing = db.exec(
      "SELECT id FROM follows WHERE followerId = ? AND followingId = ?",
      [followerId, followingId]
    );

    if (existing.length) {
      // 取消关注
      db.run("DELETE FROM follows WHERE followerId = ? AND followingId = ?",
        [followerId, followingId]);
      saveDb();
      return res.json({ following: false });
    } else {
      const id = 'follow-' + uuidv4().slice(0, 8);
      db.run("INSERT INTO follows (id, followerId, followingId) VALUES (?, ?, ?)",
        [id, followerId, followingId]);
      saveDb();
      return res.json({ following: true });
    }
  } catch (e) {
    console.error('[关注] 失败:', e.message);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 获取用户的关注状态和数量
app.get('/api/users/:id/follow', optionalAuth, (req, res) => {
  try {
    const userId = req.params.id;
    if (!isValidId(userId)) return res.status(400).json({ error: '无效的用户ID' });

    const followers = db.exec("SELECT COUNT(*) FROM follows WHERE followingId = ?", [userId]);
    const following = db.exec("SELECT COUNT(*) FROM follows WHERE followerId = ?", [userId]);
    const followerCount = followers.length ? followers[0].values[0][0] : 0;
    const followingCount = following.length ? following[0].values[0][0] : 0;

    let isFollowing = false;
    if (req.user) {
      const check = db.exec(
        "SELECT id FROM follows WHERE followerId = ? AND followingId = ?",
        [req.user.id, userId]
      );
      isFollowing = check.length > 0;
    }

    res.json({ followerCount, followingCount, isFollowing });
  } catch (e) {
    console.error('[关注状态] 失败:', e.message);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 获取当前用户的关注列表
app.get('/api/users/me/following', authenticate, (req, res) => {
  try {
    const result = db.exec(
      `SELECT u.id, u.username, u.displayName
       FROM follows f JOIN users u ON f.followingId = u.id
       WHERE f.followerId = ?
       ORDER BY f.createdAt DESC`,
      [req.user.id]
    );
    const users = result.length ? result[0].values.map(row => ({
      id: row[0], username: row[1], displayName: row[2]
    })) : [];
    res.json(users);
  } catch (e) {
    console.error('[关注列表] 失败:', e.message);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// ── API: 作品 ──

// 获取作品列表 (支持分页)
app.get('/api/works', optionalAuth, (req, res) => {
  try {
    const { category, search, sort, page, limit } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(limit) || 50));
    const offset = (pageNum - 1) * pageSize;

    let sql = "SELECT * FROM works WHERE 1=1";
    let countSql = "SELECT COUNT(*) as total FROM works WHERE 1=1";
    const params = [];

    if (category && category !== 'all') {
      const clause = " AND category = ?";
      sql += clause;
      countSql += clause;
      params.push(category);
    }
    if (search) {
      const clause = " AND (title LIKE ? OR description LIKE ?)";
      sql += clause;
      countSql += clause;
      params.push(`%${search}%`, `%${search}%`);
    }

    // 非管理员只看已审核
    if (!req.user || !req.user.isAdmin) {
      sql += " AND (isApproved = 1 OR status = 'published')";
      countSql += " AND (isApproved = 1 OR status = 'published')";
    }

    // 排序
    if (sort === 'oldest') sql += " ORDER BY createdAt ASC";
    else if (sort === 'popular') sql += " ORDER BY likes DESC";
    else if (sort === 'price_asc') sql += " ORDER BY price ASC";
    else if (sort === 'price_desc') sql += " ORDER BY price DESC";
    else sql += " ORDER BY createdAt DESC";

    sql += " LIMIT ? OFFSET ?";

    // 查询总数
    const countResult = db.exec(countSql, params);
    const total = countResult.length ? countResult[0].values[0][0] : 0;

    // 查询数据
    const dataParams = [...params, pageSize, offset];
    const result = db.exec(sql, dataParams);
    const works = result.length ? result[0].values.map(row => ({
      id: row[0],
      title: row[1],
      description: row[2],
      category: row[3],
      mediaType: row[4],
      mediaUrl: row[5],
      price: row[6],
      xianyuUrl: row[7],
      tags: safeJsonParse(row[8], []),
      creatorId: row[9],
      createdAt: row[10],
      likes: row[11],
      isApproved: row[12] === 1,
      isFeatured: row[13] === 1,
      status: row[14]
    })) : [];

    res.json({
      works,
      pagination: {
        page: pageNum,
        limit: pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      }
    });
  } catch (e) {
    console.error('[作品列表] 失败:', e.message);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 获取单个作品
app.get('/api/works/:id', optionalAuth, (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ error: '无效的作品ID' });

    const result = db.exec("SELECT * FROM works WHERE id = ?", [id]);
    if (!result.length || !result[0].values.length) {
      return res.status(404).json({ error: '作品不存在' });
    }
    const row = result[0].values[0];
    const work = {
      id: row[0], title: row[1], description: row[2], category: row[3],
      mediaType: row[4], mediaUrl: row[5], price: row[6], xianyuUrl: row[7],
      tags: safeJsonParse(row[8], []), creatorId: row[9], createdAt: row[10],
      likes: row[11], isApproved: row[12] === 1, isFeatured: row[13] === 1, status: row[14]
    };

    // 非管理员不能看未审核作品
    if (!work.isApproved && work.status !== 'published') {
      if (!req.user || (!req.user.isAdmin && req.user.id !== work.creatorId)) {
        return res.status(404).json({ error: '作品不存在' });
      }
    }

    res.json(work);
  } catch (e) {
    console.error('[作品详情] 失败:', e.message);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 创建作品
app.post('/api/works', authenticate, (req, res) => {
  try {
    const title = sanitize(req.body.title);
    const description = sanitize(req.body.description || '');
    const category = ['visual', 'digital', 'inspiration'].includes(req.body.category)
      ? req.body.category : 'visual';
    const mediaType = sanitize(req.body.mediaType || '');
    const rawMediaUrl = req.body.mediaUrl || '';
    // 限制上传文件大小（base64 编码后不超过 10MB）
    if (rawMediaUrl && rawMediaUrl.length > 10 * 1024 * 1024) {
      return res.status(413).json({ error: '文件大小不能超过 10MB' });
    }
    // 将 base64 媒体数据转为本地文件存储，避免数据库膨胀
    const mediaUrl = saveMediaFile(rawMediaUrl);
    const price = Math.max(0, Math.min(999999, Number(req.body.price) || 0));
    const xianyuUrl = sanitize(req.body.xianyuUrl || '');
    const tags = Array.isArray(req.body.tags) ? req.body.tags.slice(0, 20).map(t => sanitize(String(t))) : [];

    if (!title) {
      return res.status(400).json({ error: '请输入作品标题' });
    }
    if (title.length > 200) {
      return res.status(400).json({ error: '标题不能超过200个字符' });
    }

    const id = 'work-' + uuidv4().slice(0, 8);
    db.run(
      `INSERT INTO works (id, title, description, category, mediaType, mediaUrl, price, xianyuUrl, tags, creatorId)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, title, description, category, mediaType, mediaUrl,
       price, xianyuUrl, JSON.stringify(tags), req.user.id]
    );
    saveDb();

    res.status(201).json({ id, message: '发布成功' });
  } catch (e) {
    console.error('[创建作品] 失败:', e.message);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 更新作品 — 【修复权限绕过】只有作品作者或管理员可以编辑
app.patch('/api/works/:id', authenticate, (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ error: '无效的作品ID' });

    // 查询作品归属
    const workRows = db.exec("SELECT creatorId FROM works WHERE id = ?", [id]);
    if (!workRows.length || !workRows[0].values.length) {
      return res.status(404).json({ error: '作品不存在' });
    }
    const ownerId = workRows[0].values[0][0];

    // 权限检查：只有作者或管理员可以编辑
    if (req.user.id !== ownerId && !req.user.isAdmin) {
      return res.status(403).json({ error: '无权操作此作品' });
    }

    const { isApproved, title, description, price } = req.body;
    let sets = [];
    let params = [];

    // 管理员可以审核
    if (isApproved !== undefined && req.user.isAdmin) {
      sets.push("isApproved = ?");
      params.push(isApproved ? 1 : 0);
      sets.push("status = ?");
      params.push(isApproved ? 'published' : 'rejected');
    }
    // 作者可以编辑基本信息
    if (title !== undefined) {
      const cleanTitle = sanitize(title);
      if (!cleanTitle) return res.status(400).json({ error: '标题不能为空' });
      if (cleanTitle.length > 200) return res.status(400).json({ error: '标题不能超过200个字符' });
      sets.push("title = ?");
      params.push(cleanTitle);
    }
    if (description !== undefined) {
      sets.push("description = ?");
      params.push(sanitize(description));
    }
    if (price !== undefined) {
      sets.push("price = ?");
      params.push(Math.max(0, Math.min(999999, Number(price) || 0)));
    }

    if (!sets.length) {
      return res.status(400).json({ error: '没有需要更新的字段' });
    }

    params.push(id);
    db.run(`UPDATE works SET ${sets.join(', ')} WHERE id = ?`, params);
    saveDb();

    res.json({ message: '更新成功' });
  } catch (e) {
    console.error('[更新作品] 失败:', e.message);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 删除作品 — 只有作者或管理员可操作
app.delete('/api/works/:id', authenticate, (req, res) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return res.status(400).json({ error: '无效的作品ID' });

    // 查询作品归属
    const workRows = db.exec("SELECT creatorId FROM works WHERE id = ?", [id]);
    if (!workRows.length || !workRows[0].values.length) {
      return res.status(404).json({ error: '作品不存在' });
    }
    const ownerId = workRows[0].values[0][0];

    // 权限检查
    if (req.user.id !== ownerId && !req.user.isAdmin) {
      return res.status(403).json({ error: '无权操作此作品' });
    }

    // 删除关联点赞
    db.run("DELETE FROM likes WHERE workId = ?", [id]);
    // 删除作品
    db.run("DELETE FROM works WHERE id = ?", [id]);
    saveDb();

    res.json({ message: '已删除' });
  } catch (e) {
    console.error('[删除作品] 失败:', e.message);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// ── API: 点赞 ──

app.post('/api/works/:id/like', authenticate, (req, res) => {
  try {
    const workId = req.params.id;
    const userId = req.user.id;

    if (!isValidId(workId)) return res.status(400).json({ error: '无效的作品ID' });

    // 检查作品是否存在
    const workExists = db.exec("SELECT id FROM works WHERE id = ?", [workId]);
    if (!workExists.length) {
      return res.status(404).json({ error: '作品不存在' });
    }

    // 检查是否已点赞
    const existing = db.exec(
      "SELECT id FROM likes WHERE workId = ? AND userId = ?",
      [workId, userId]
    );

    // 仍已点赞 → 取消；否则 → 新增点赞
    const liked = !existing.length;
    if (liked) {
      const id = 'like-' + uuidv4().slice(0, 8);
      db.run("INSERT INTO likes (id, workId, userId) VALUES (?, ?, ?)", [id, workId, userId]);
      db.run("UPDATE works SET likes = likes + 1 WHERE id = ?", [workId]);
    } else {
      db.run("DELETE FROM likes WHERE workId = ? AND userId = ?", [workId, userId]);
      db.run("UPDATE works SET likes = MAX(0, likes - 1) WHERE id = ?", [workId]);
    }
    saveDb();

    // 返回数据库真实点赞数，确保前端显示与列表页一致（避免字段与 likes 表脱节）
    const likeRow = db.exec("SELECT likes FROM works WHERE id = ?", [workId]);
    const likeCount = (likeRow.length && likeRow[0].values.length) ? likeRow[0].values[0][0] : 0;
    res.json({ liked, likeCount });
  } catch (e) {
    console.error('[点赞] 失败:', e.message);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 获取用户点赞状态
app.get('/api/works/:id/like', authenticate, (req, res) => {
  try {
    const workId = req.params.id;
    const userId = req.user.id;
    if (!isValidId(workId)) return res.status(400).json({ error: '无效的作品ID' });

    const existing = db.exec(
      "SELECT id FROM likes WHERE workId = ? AND userId = ?",
      [workId, userId]
    );
    res.json({ liked: existing.length > 0 });
  } catch (e) {
    console.error('[点赞查询] 失败:', e.message);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// ── API: 创作者 ──

app.get('/api/creators', (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));

    const countResult = db.exec(`
      SELECT COUNT(DISTINCT u.id) as total
      FROM users u
      WHERE EXISTS (SELECT 1 FROM works w WHERE w.creatorId = u.id AND (w.isApproved = 1 OR w.status = 'published'))
    `);
    const total = countResult.length ? countResult[0].values[0][0] : 0;

    const result = db.exec(`
      SELECT u.id, u.username, u.displayName,
        (SELECT COUNT(*) FROM works w WHERE w.creatorId = u.id AND (w.isApproved = 1 OR w.status = 'published')) as workCount,
        (SELECT COALESCE(SUM(w.likes), 0) FROM works w WHERE w.creatorId = u.id) as totalLikes
      FROM users u
      WHERE EXISTS (SELECT 1 FROM works w WHERE w.creatorId = u.id AND (w.isApproved = 1 OR w.status = 'published'))
      ORDER BY totalLikes DESC
      LIMIT ? OFFSET ?
    `, [pageSize, (page - 1) * pageSize]);

    const creators = result.length ? result[0].values.map(row => ({
      id: row[0],
      name: row[2] || row[1],
      role: '创作者',
      works: row[3] || 0,
      likes: row[4] || 0,
    })) : [];

    res.json({
      creators,
      pagination: { page, limit: pageSize, total, totalPages: Math.ceil(total / pageSize) }
    });
  } catch (e) {
    console.error('[创作者] 失败:', e.message);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// ── API: 验证码 ──

const CODE_TIERS = {
  'SPRT-1': { name: '入门', price: 9.9, count: 5 },
  'SPRT-2': { name: '进阶', price: 29.9, count: 20 },
  'SPRT-3': { name: '专业', price: 69.9, count: 60 }
};

// 获取所有验证码
app.get('/api/codes', authenticate, requireAdmin, (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(req.query.limit) || 100));
    const offset = (page - 1) * pageSize;

    const countResult = db.exec("SELECT COUNT(*) as total FROM codes");
    const total = countResult.length ? countResult[0].values[0][0] : 0;

    const result = db.exec(
      "SELECT * FROM codes ORDER BY createdAt DESC LIMIT ? OFFSET ?",
      [pageSize, offset]
    );
    const codes = result.length ? result[0].values.map(row => ({
      id: row[0], code: row[1], tier: row[2],
      used: row[3] === 1, usedBy: row[4], usedAt: row[5], createdAt: row[6]
    })) : [];

    res.json({ codes, pagination: { page, limit: pageSize, total, totalPages: Math.ceil(total / pageSize) } });
  } catch (e) {
    console.error('[验证码列表] 失败:', e.message);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 生成验证码 (限制批量大小)
app.post('/api/codes', authenticate, requireAdmin, (req, res) => {
  try {
    const { action, prefix, batch } = req.body;
    if (action !== 'generate' || !prefix) {
      return res.status(400).json({ error: '参数错误' });
    }

    const tier = CODE_TIERS[prefix];
    if (!tier) {
      return res.status(400).json({ error: '无效的档位' });
    }

    const count = Math.min(50, Math.max(1, batch || 20)); // 限制每次最多50个
    const codes = [];
    for (let i = 0; i < count; i++) {
      const id = 'code-' + uuidv4().slice(0, 8);
      const code = `${prefix}-${uuidv4().slice(0, 8).toUpperCase()}`;
      db.run("INSERT INTO codes (id, code, tier) VALUES (?, ?, ?)", [id, code, prefix]);
      codes.push({ id, code, tier: prefix });
    }
    saveDb();

    res.status(201).json({ message: '生成成功', count: codes.length, codes });
  } catch (e) {
    console.error('[生成验证码] 失败:', e.message);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// ── API: 统计 ──

app.get('/api/stats', authenticate, requireAdmin, (req, res) => {
  try {
    const workCount = db.exec("SELECT COUNT(*) FROM works")[0]?.values[0][0] || 0;
    const likeCount = db.exec("SELECT COALESCE(SUM(likes), 0) FROM works")[0]?.values[0][0] || 0;
    const codeCount = db.exec("SELECT COUNT(*) FROM codes")[0]?.values[0][0] || 0;
    const usedCount = db.exec("SELECT COUNT(*) FROM codes WHERE used = 1")[0]?.values[0][0] || 0;

    res.json({
      totalWorks: workCount,
      totalLikes: likeCount,
      codesUsed: usedCount,
      codesRemain: codeCount - usedCount
    });
  } catch (e) {
    console.error('[统计] 失败:', e.message);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// ── API: 反馈 ──

app.post('/api/feedback', authenticate, (req, res) => {
  try {
    const content = sanitize(req.body.content);
    if (!content) return res.status(400).json({ error: '请输入反馈内容' });
    if (content.length > 2000) return res.status(400).json({ error: '反馈内容不能超过2000字' });

    const id = 'fb-' + uuidv4().slice(0, 8);
    db.run("INSERT INTO feedbacks (id, userId, content) VALUES (?, ?, ?)",
      [id, req.user.id, content]);
    saveDb();

    res.status(201).json({ id, message: '感谢你的反馈！' });
  } catch (e) {
    console.error('[反馈] 失败:', e.message);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 查看反馈列表（仅管理员）
app.get('/api/feedbacks', authenticate, requireAdmin, (req, res) => {
  try {
    const rows = db.exec(
      "SELECT f.id, f.content, f.createdAt, u.username, u.displayName FROM feedbacks f LEFT JOIN users u ON f.userId = u.id ORDER BY f.createdAt DESC LIMIT 50"
    );
    const feedbacks = (rows[0] ? rows[0].values : []).map(row => ({
      id: row[0],
      content: row[1],
      createdAt: row[2],
      username: row[3] || '匿名',
      displayName: row[4] || row[3] || '匿名',
    }));
    res.json(feedbacks);
  } catch (e) {
    console.error('[反馈列表] 失败:', e.message);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// ── 全局错误处理 ──
app.use((err, req, res, next) => {
  console.error('[未捕获错误]', err.stack || err.message);
  res.status(err.status || 500).json({
    error: NODE_ENV === 'development' ? err.message : '服务器内部错误'
  });
});

// ── SPA Fallback ──

app.get('*', (req, res) => {
  const indexPath = path.join(PUBLIC_DIR, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).json({ error: '页面不存在' });
  }
});

// ── 工具函数 ──
function safeJsonParse(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

// ── 启动与优雅关闭 ──

// 初始化（不启动 HTTP 服务器），Vercel 使用此函数
async function init() {
  await initDb();
}

// 完整启动（含 HTTP 服务器），本地开发使用
async function start() {
  await initDb();

  // 确保上传目录存在
  if (!globalThis.__isVercel && !fs.existsSync(UPLOADS_WORKS_DIR)) {
    fs.mkdirSync(UPLOADS_WORKS_DIR, { recursive: true });
  }

  // 启动后立即备份一次，之后定时备份
  backupDb();
  const backupTimer = setInterval(backupDb, BACKUP_INTERVAL);
  // 确保定时器不阻止进程退出
  if (backupTimer && backupTimer.unref) backupTimer.unref();

  const server = app.listen(PORT, () => {
    console.log('');
    console.log('╔══════════════════════════════════════════════╗');
    console.log('║          Vibe Market 独立服务器              ║');
    console.log('╠══════════════════════════════════════════════╣');
    console.log(`║  地址: http://localhost:${PORT}                ║`);
    console.log(`║  环境: ${NODE_ENV}                              ║`);
    console.log('║  按 Ctrl+C 停止                              ║');
    console.log('╚══════════════════════════════════════════════╝');
    console.log('');
  });

  // 优雅关闭
  function gracefulShutdown(signal) {
    console.log(`\n[${signal}] 正在关闭服务器...`);
    server.close(() => {
      console.log('[服务器] 已停止');
      process.exit(0);
    });
    // 强制退出超时
    setTimeout(() => {
      console.error('[服务器] 强制退出');
      process.exit(1);
    }, 10000);
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // 未捕获异常处理
  process.on('uncaughtException', (err) => {
    console.error('[未捕获异常]', err.stack || err.message);
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    console.error('[未处理的Promise拒绝]', reason);
  });
}

// ── 导出 ──
module.exports = { init, start, app };

// 直接运行时启动服务器，被 require 时不自动启动（Vercel 用）
if (require.main === module) {
  start().catch(e => {
    console.error('启动失败:', e);
    process.exit(1);
  });
}
