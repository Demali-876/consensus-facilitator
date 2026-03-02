module.exports = {
  apps: [
    {
      name: 'consensus-facilitator',
      script: './dist/index.js',

      instances: 1,
      exec_mode: 'fork',
      env_production: {
        NODE_ENV: 'production',
      },
      out_file:        './logs/out.log',
      error_file:      './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs:      true,

      max_restarts:  10,
      restart_delay: 5000,
      min_uptime:    '10s',
      kill_timeout: 5000,

      watch: false,
    },
  ],
}
