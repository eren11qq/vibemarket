/**
 * PM2 进程管理配置
 * 使用方式:
 *   pm2 start ecosystem.config.js
 *   pm2 save      # 保存进程列表，重启后自动恢复
 *   pm2 startup   # 设置开机自启
 */
module.exports = {
  apps: [{
    name: 'vibe-market',
    script: 'server.js',
    instances: 1,
    exec_mode: 'fork',
    max_memory_restart: '500M',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    error_file: 'logs/pm2-error.log',
    out_file: 'logs/pm2-out.log',
    merge_logs: true,
    autorestart: true,
    watch: false,
    // 生产环境变量
    env: {
      NODE_ENV: 'production',
    },
    // 开发环境（pm2 start ecosystem.config.js --env development）
    env_development: {
      NODE_ENV: 'development',
    },
  }],
};
