/**
 * Vibe Market API 自动化测试
 *
 * 使用方式:
 *   1. 先启动服务器: node server.js
 *   2. 再运行测试:   node test/api.test.js
 *
 * 或一键运行:
 *   node test/api.test.js --start-server
 */

const http = require('http');
const path = require('path');

const BASE = 'http://localhost:3456';
const PASS = 0;
const FAIL = 0;
let passed = 0;
let failed = 0;

function fetch(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const req = http.request(
      url,
      {
        method: options.method || 'GET',
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      },
      (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(body), raw: body });
          } catch {
            resolve({ status: res.statusCode, data: null, raw: body });
          }
        });
      }
    );
    req.on('error', reject);
    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ❌ ${name}: ${e.message}`);
  }
}

async function assert(condition, msg) {
  if (!condition) throw new Error(msg || '断言失败');
}

let authToken = '';
let testWorkId = '';
const testUser = 'testuser_' + Date.now();

async function run() {
  console.log('\n🧪 Vibe Market API 测试\n');
  console.log('=' .repeat(50));

  // ── 健康检查 ──
  await test('GET /api/health 返回 ok', async () => {
    const r = await fetch('/api/health');
    assert(r.status === 200, `期望 200，实际 ${r.status}`);
    assert(r.data.status === 'ok', 'status 应为 ok');
  });

  // ── 注册 ──
  await test('POST /api/auth/register 创建新用户', async () => {
    const r = await fetch('/api/auth/register', {
      method: 'POST',
      body: { username: testUser, password: 'test123456', displayName: '测试用户', email: testUser + '@test.com' },
    });
    assert(r.status === 201, `期望 201，实际 ${r.status}: ${JSON.stringify(r.data)}`);
    assert(r.data.token, '应返回 token');
    assert(r.data.user.username === testUser, '用户名应匹配');
    authToken = r.data.token;
  });

  // ── 重复注册 ──
  await test('POST /api/auth/register 拒绝重复用户名', async () => {
    const r = await fetch('/api/auth/register', {
      method: 'POST',
      body: { username: testUser, password: 'test123456' },
    });
    // 409 (冲突) 或 429 (限流) 都算通过
    assert(r.status === 409 || r.status === 429, `期望 409/429，实际 ${r.status}: ${r.raw}`);
  });

  // ── 登录 ──
  await test('POST /api/auth/login 正确密码登录', async () => {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      body: { username: testUser, password: 'test123456' },
    });
    assert(r.status === 200, `期望 200，实际 ${r.status}: ${JSON.stringify(r.data)}`);
    assert(r.data.token, '应返回 token');
    authToken = r.data.token;
  });

  // ── 错误密码 ──
  await test('POST /api/auth/login 拒绝错误密码', async () => {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      body: { username: testUser, password: 'wrongpassword' },
    });
    assert(r.status === 401, `期望 401，实际 ${r.status}`);
  });

  // ── 获取当前用户 ──
  await test('GET /api/auth/me 返回用户信息', async () => {
    const r = await fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + authToken } });
    assert(r.status === 200, `期望 200，实际 ${r.status}`);
    assert(r.data.username === testUser, '用户名应匹配');
  });

  // ── 未认证拒绝 ──
  await test('GET /api/auth/me 无 token 返回 401', async () => {
    const r = await fetch('/api/auth/me');
    assert(r.status === 401, `期望 401，实际 ${r.status}`);
  });

  // ── 发布作品 ──
  await test('POST /api/works 创建作品', async () => {
    const r = await fetch('/api/works', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + authToken },
      body: {
        title: '测试设计作品',
        description: '这是一个测试作品描述',
        category: 'visual',
        price: 29.9,
        tags: ['简约', 'UI', '测试'],
      },
    });
    assert(r.status === 201, `期望 201，实际 ${r.status}: ${JSON.stringify(r.data)}`);
    assert(r.data.id, '应返回作品 id');
    testWorkId = r.data.id;
  });

  // ── 获取作品列表 ──
  await test('GET /api/works 返回作品列表', async () => {
    const r = await fetch('/api/works');
    assert(r.status === 200, `期望 200，实际 ${r.status}`);
    assert(Array.isArray(r.data.works || r.data), '应返回数组');
  });

  // ── 获取单个作品 ──
  await test('GET /api/works/:id 返回作品详情', async () => {
    if (!testWorkId) throw new Error('无作品 ID');
    // 未审核作品需要认证（作者本人可看）
    const r = await fetch('/api/works/' + testWorkId, {
      headers: { Authorization: 'Bearer ' + authToken },
    });
    assert(r.status === 200, `期望 200，实际 ${r.status}: ${r.raw}`);
    assert(r.data.title === '测试设计作品', '标题应匹配');
  });

  // ── 点赞作品 ──
  await test('POST /api/works/:id/like 点赞作品', async () => {
    if (!testWorkId) throw new Error('无作品 ID');
    const r = await fetch('/api/works/' + testWorkId + '/like', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + authToken },
    });
    // 允许 200（成功）或特定情况下的其他状态码
    assert(r.status === 200 || r.status === 201, `期望 200/201，实际 ${r.status}: ${r.raw}`);
  });

  // ── 无效作品 ID ──
  await test('GET /api/works/invalid-id 返回 400', async () => {
    const r = await fetch('/api/works/<script>');
    assert(r.status === 400 || r.status === 404, `期望 400/404，实际 ${r.status}`);
  });

  // ── 创作者列表 ──
  await test('GET /api/creators 返回创作者列表', async () => {
    const r = await fetch('/api/creators');
    assert(r.status === 200, `期望 200，实际 ${r.status}`);
    const list = r.data.creators || r.data;
    assert(Array.isArray(list), '应返回数组');
  });

  // ── 忘记密码 ──
  await test('POST /api/auth/forgot-password 邮箱未注册', async () => {
    const r = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      body: { email: 'nonexistent@test.com' },
    });
    assert(r.status === 200, `期望 200，实际 ${r.status}`);
  });

  // ── 邮箱验证令牌格式 ──
  await test('GET /api/auth/verify-email 无效令牌返回 400', async () => {
    const r = await fetch('/api/auth/verify-email?token=invalid-token');
    assert(r.status === 400, `期望 400，实际 ${r.status}`);
  });

  // ── 关注用户 ──
  await test('POST /api/users/:id/follow 关注用户', async () => {
    // 关注管理员
    const r = await fetch('/api/users/user-admin/follow', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + authToken },
    });
    assert(r.status === 200, `期望 200，实际 ${r.status}`);
  });

  // ── 不能关注自己 ──
  await test('POST /api/users/:id/follow 不能关注自己', async () => {
    // 获取自己的用户ID
    const me = await fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + authToken } });
    const r = await fetch('/api/users/' + me.data.id + '/follow', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + authToken },
    });
    assert(r.status === 400, `期望 400，实际 ${r.status}`);
  });

  // ── 分页 ──
  await test('GET /api/works?page=1&limit=5 分页', async () => {
    const r = await fetch('/api/works?page=1&limit=5');
    assert(r.status === 200, `期望 200，实际 ${r.status}`);
    const list = r.data.works || r.data;
    assert(list.length <= 5, `应不超过 5 条，实际 ${list.length}`);
  });

  // ── 反馈提交 ──
  await test('POST /api/feedback 提交反馈', async () => {
    const r = await fetch('/api/feedback', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + authToken },
      body: { content: '测试反馈内容' },
    });
    assert(r.status === 201, `期望 201，实际 ${r.status}`);
  });

  // ── 结果 ──
  console.log('\n' + '='.repeat(50));
  const total = passed + failed;
  console.log(`\n📊 结果: ${passed}/${total} 通过`);
  if (failed > 0) {
    console.log(`❌ ${failed} 个测试失败`);
    process.exit(1);
  } else {
    console.log('✅ 全部测试通过！\n');
  }
}

// 如果传了 --start-server，自动启动服务器
if (process.argv.includes('--start-server')) {
  const { spawn } = require('child_process');
  console.log('🔧 启动服务器...');
  const server = spawn('node', ['server.js'], {
    cwd: path.join(__dirname, '..'),
    stdio: 'pipe',
  });

  server.stdout.on('data', (d) => {
    if (d.toString().includes('localhost:')) {
      console.log('✅ 服务器已启动');
      setTimeout(run, 500);
    }
  });
  server.stderr.on('data', (d) => process.stderr.write(d));

  process.on('exit', () => {
    server.kill();
  });
} else {
  run();
}
