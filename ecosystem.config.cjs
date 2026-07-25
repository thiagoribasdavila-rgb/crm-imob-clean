module.exports = {
  apps: [{
    name: "atlas-v3-homolog",
    cwd: __dirname,
    script: "node_modules/next/dist/bin/next",
    // Sem -p fixo: o `next start` lê process.env.PORT nativamente. Na Hostinger
    // a porta vem do painel/ambiente; fixar 3000 aqui fazia o processo ignorar
    // a porta atribuída e o proxy reverso apontar para o lugar errado.
    args: "start",
    instances: 1,
    exec_mode: "fork",
    autorestart: true,
    max_memory_restart: "1G",
    merge_logs: true,
    log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    out_file: "./logs/atlas-v3-out.log",
    error_file: "./logs/atlas-v3-error.log",
    // PORT: usa a do ambiente quando existir; 3000 é só o padrão local. As
    // demais variáveis (credenciais, URLs) vêm do .env do servidor — nunca daqui.
    env: { NODE_ENV: "production", PORT: process.env.PORT || 3000, ATLAS_ENV: "homologation", ATLAS_ENVIRONMENT_ID: "atlas-v3-hostinger-homolog", ATLAS_DATABASE_ENVIRONMENT: "homologation", ATLAS_HOSTING_PROVIDER: "hostinger" },
  }],
};
