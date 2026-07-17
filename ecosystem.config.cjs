module.exports = {
  apps: [
    {
      name: 'trueid-office',
      cwd: __dirname,
      script: 'npm',
      // HTTP Vite — Tailscale Funnel on the host already terminates public HTTPS.
      args: 'run dev:funnel',
      interpreter: 'none',
      instances: 1,
      autorestart: true,
      watch: false,
      max_restarts: 20,
      min_uptime: '5s',
      env: {
        NODE_ENV: 'development',
        VITE_DEV_HTTPS: '0',
      },
    },
  ],
}
