# VALIDAÇÃO PÓS-DEPLOY

**Na ordem.** Cada item tem um sinal objetivo — o comando ter rodado nunca é a prova.

> **HTTP 200 na home não prova nada.** Ela vem do cache do CDN
> (`x-hcdn-cache-status: HIT`) e pode ser de um build de meses atrás. As rotas
> `/api/*` respondem `cache-control: no-store` — só elas dizem a verdade.

## 1. QUAL VERSÃO ESTÁ NO AR

```bash
curl -s https://atlasaios.com.br/api/version
```

✅ `"commit": "41ebf2fc…"` e `"identidadeConfiavel": true`
❌ `"commit": null` → faltou `ATLAS_BUILD_COMMIT`. **Ninguém sabe o que está rodando.**

## 2. A APLICAÇÃO ALCANÇA O BANCO

```bash
curl -s https://atlasaios.com.br/api/v1/ready | head -c 300
```

✅ `"status":"ready"` com `"database":{"ok":true,...}`
❌ `"estado":"banco_fora"` → a resposta **lista as variáveis ausentes**.

## 3. O LOGIN FUNCIONA — o teste que mais importa

Abra `https://atlasaios.com.br/login` numa **aba anônima**.

✅ formulário com **campo de senha**
❌ tela *"Esta instalação ainda não foi configurada"* → o build saiu sem as
variáveis públicas. **Cadastre e reconstrua** — reiniciar não resolve.

Depois: entre com um usuário real e confirme que o painel carrega.

## 4. O SMOKE COMPLETO

```bash
bash scripts/production/smoke-test.sh https://atlasaios.com.br
```

Verifica alcance, vida (rota não cacheável que toca o banco), identidade da
versão, cabeçalhos de segurança e ausência de segredo no HTML.

✅ **SMOKE APROVADO** ❌ qualquer falha → considere rollback.

## 5. NENHUM SEGREDO NO NAVEGADOR

```bash
curl -s https://atlasaios.com.br/login | grep -cE 'service_role|sk-[A-Za-z0-9]{20,}'
```

✅ `0`. Qualquer outro número é **incidente de segurança** — rollback imediato.

## 6. AS ROTAS CRÍTICAS

```bash
for r in /api/v1/auth/me /api/v1/crm/leads /api/v1/analytics/sala-de-comando; do
  echo "$r → $(curl -s -o /dev/null -w '%{http_code}' https://atlasaios.com.br$r)"
done
```

✅ **401** (sem sessão — correto) ❌ **500** → o servidor não alcança o banco.

## 7. O AGENDAMENTO

Na Node.js App gerenciada **não há cron do sistema**. Os 19 workers só rodam se
algo os chamar — agendador externo fazendo POST com `authorization: Bearer
$ATLAS_CRON_SECRET`. **Sem isso a fila não drena sozinha** (um evento já ficou
44h49m parado).

## QUADRO DE DECISÃO

| resultado | ação |
|---|---|
| 1 a 6 verdes | publicado com sucesso |
| 3 falha (sem campo de senha) | **rollback**, cadastre as variáveis, reconstrua |
| 5 falha (segredo no HTML) | **rollback imediato** |
| 2 ou 6 falha | cadastre `SUPABASE_SERVICE_ROLE_KEY` e reinicie |
| 1 falha, resto verde | cadastre `ATLAS_BUILD_COMMIT` e reconstrua |
| 7 pendente | não bloqueia o login; a fila não drena até resolver |
