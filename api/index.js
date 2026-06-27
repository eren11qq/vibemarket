/**
 * Vibe Market — Vercel Serverless 入口
 * 首次请求时初始化内存数据库，后续复用
 */
let initialized = false;
let app;

async function handler(req, res) {
  if (!initialized) {
    const server = require('../server');
    await server.init();
    app = server.app;
    initialized = true;
    console.log('[Vercel] 应用初始化完成');
  }
  return app(req, res);
}

module.exports = handler;
