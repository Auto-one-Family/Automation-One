/* eslint-env node */
// eslint-disable-next-line no-undef
module.exports = {
  apps: [
    {
      name: 'growy-frontend',
      script: 'npm',
      args: 'run dev',
      cwd: '/home/Robin/growy-frontend/growy-frontend',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development',
        PORT: 5173,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 5173,
      },
      log_file: './logs/combined.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      time: true,
    },
  ],
}
