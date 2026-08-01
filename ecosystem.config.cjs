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
  }, {
    /**
     * PONTE DE WHATSAPP — processo de vida longa, separado do Next de propósito.
     *
     * Os workers deste projeto são rotas HTTP acordadas por crontab. Este não
     * cabe nesse molde: mantém um socket ABERTO por corretor conectado, e um
     * socket não sobrevive ao fim de uma requisição. Fechar e reabrir a cada
     * chamada é justamente o padrão que faz o WhatsApp derrubar a conta.
     *
     * NÃO sobe junto com a aplicação. É iniciada explicitamente:
     *   pm2 start ecosystem.config.cjs --only atlas-whatsapp-bridge
     *
     * O motivo é que ela depende de `@whiskeysockets/baileys`, biblioteca não
     * oficial que contraria os termos do WhatsApp. Instalar e ligar é decisão
     * consciente do operador, não efeito colateral de um deploy.
     *
     * As credenciais de sessão ficam em ATLAS_WHATSAPP_SESSION_DIR — no disco
     * do servidor, fora do repositório, nunca no banco e nunca no ZIP.
     */
    name: "atlas-whatsapp-bridge",
    cwd: __dirname,
    script: "workers/whatsapp-bridge.mjs",
    instances: 1,
    exec_mode: "fork",
    autorestart: true,
    // Uma sessão de WhatsApp é cara de restabelecer: cada reinício obriga a
    // reconexão de todos os corretores. Reiniciar em laço também é um sinal
    // que o WhatsApp usa para derrubar contas.
    min_uptime: "60s",
    max_restarts: 5,
    restart_delay: 10000,
    max_memory_restart: "500M",
    merge_logs: true,
    log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    out_file: "./logs/whatsapp-bridge-out.log",
    error_file: "./logs/whatsapp-bridge-error.log",
    // Nenhuma credencial aqui. Segredo, diretório de sessões e URL do CRM vêm
    // do ambiente do servidor.
    env: { NODE_ENV: "production" },
  }],
};
