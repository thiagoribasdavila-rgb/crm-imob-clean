module.exports = {
  apps: [{
    name: "atlas-v3-homolog",
    cwd: __dirname,
    script: "node_modules/next/dist/bin/next",
    args: "start -p 3000",
    instances: 1,
    exec_mode: "fork",
    autorestart: true,
    max_memory_restart: "1G",
    merge_logs: true,
    log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    out_file: "./logs/atlas-v3-out.log",
    error_file: "./logs/atlas-v3-error.log",
    env: { NODE_ENV: "production", ATLAS_ENV: "homologation", ATLAS_HOSTING_PROVIDER: "hostinger" },
  }],
};
