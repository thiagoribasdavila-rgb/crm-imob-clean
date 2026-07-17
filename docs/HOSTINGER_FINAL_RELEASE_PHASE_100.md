# Fase 100 — Pacote final Hostinger e encerramento do V3

## Artefato

`npm run package:hostinger` cria e verifica:

- `dist/hostinger/atlas-v3-hostinger-final.zip`;
- `dist/hostinger/atlas-v3-hostinger-final.zip.sha256`;
- manifesto interno `HOSTINGER_PACKAGE.json`;
- inventário interno `RELEASE_FILES.sha256`.

O conteúdo nasce exclusivamente do commit Git atual. Segredos, `.env.local`, dados pessoais, planilhas, PDFs, dependências, caches e arquivos temporários não entram no pacote.

## Aceite obrigatório antes da produção

O ZIP é um candidato técnico, não uma autorização de publicação. A promoção exige um ciclo da Fase 99 com GO, quatro assinaturas, backup restaurado, rollback aprovado, integrações saudáveis, Hostinger e HTTPS.

## Instalação limpa

1. Conferir o SHA-256 local e o exibido após o upload.
2. Extrair em uma nova pasta na Hostinger; não misturar com instalação anterior.
3. Criar `.env.local` no servidor a partir de `.env.example`, preenchendo segredos somente no ambiente protegido.
4. Usar Node.js 24 e executar `npm ci` e `npm run prisma:generate`.
5. Aplicar as migrations pendentes no Supabase correto e executar `npm run preflight:production`.
6. Criar `logs/`, iniciar com `pm2 start ecosystem.config.cjs` e configurar rotação.
7. Configurar workers e relatórios no cron conforme `docs/HOSTINGER_DEPLOYMENT.md`.

## Verificação do artefato

Execute `npm run package:hostinger`. O verificador confere checksum, manifesto, inventário, caminhos inseguros, arquivos obrigatórios e conteúdo proibido. Após publicar:

```text
ATLAS_SMOKE_BASE_URL=https://seu-dominio npm run smoke:hostinger
```

Depois, validar login real, recuperação por e-mail, quatro perfis, dois tenants, lead, pipeline, WhatsApp e Meta.

## Retorno seguro

1. Pausar novas entradas e workers, sem apagar banco ou storage.
2. Registrar horário, release atual e backup restaurável.
3. Restaurar o ZIP e as variáveis da última release V3 aprovada.
4. Executar `npm ci`, reiniciar o PM2 e rodar o smoke HTTPS.
5. Reabrir entradas somente após login, banco, leads e pipeline passarem.
6. Registrar a decisão e a evidência no ciclo executivo.

O processo nunca faz deploy automático, nunca altera DNS e nunca inclui chaves no ZIP.
