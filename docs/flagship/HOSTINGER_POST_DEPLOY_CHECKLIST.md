# CHECKLIST PÓS-IMPLANTAÇÃO

**2026-07-31.** Na ordem. **Cada item tem um sinal objetivo** — o comando ter
rodado nunca é a prova.

## 1. A APLICAÇÃO SUBIU?

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://SEU-DOMINIO/login
```
→ **200**. Qualquer outra coisa: `pm2 logs` antes de seguir.

## 2. ELA FALA COM O BANCO?

```bash
curl -s https://SEU-DOMINIO/api/v1/ready | head -c 400
```
→ **não** pode conter `"estado":"banco_fora"`. Se contiver, a resposta lista as
variáveis ausentes.

## 3. ⚠️ O CÓDIGO NO AR É O APROVADO?

```bash
npm run commit-publicado:check
```
→ verde. **Este é o passo que falhou em toda auditoria desta linha de trabalho.**
Correção publicada no git e ausente do servidor é correção que todo mundo *acha*
que existe.

## 4. O AGENDAMENTO ESTÁ INSTALADO?

```bash
crontab -l | grep -c atlas     # esperado: 13
```
Sem cron no plano, confira o caminho escolhido em `HOSTINGER_DEPLOY.md`.

## 5. ELE RODA SOZINHO? — o único sinal que importa

```bash
bash scripts/operations/verify-after-5-minutes.sh
```
→ um evento da fila precisa sair de `attempts=1` **sozinho**. Um evento ficou
**44h49m** parado antes desta verificação existir.

## 6. O WEBHOOK DA META AUTENTICA?

Envie o payload de teste assinado (procedimento em `docs/`). → **200** com o
segredo real; **401** com placeholder. Os dois resultados são informação.

## 7. A ROTA RENOMEADA REDIRECIONA?

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://SEU-DOMINIO/properties/mtching
```
→ **308**.

## 8. SOBREVIVE A REINÍCIO?

```bash
pm2 save && sudo reboot
```
Depois: repita 1, 2 e 5. Deploy que não sobrevive a reboot é deploy que dura até
a próxima manutenção da hospedagem.

## O QUE **NÃO** FAZER NA PRIMEIRA SEMANA

Não ligue `ATLAS_SLA_AUTO_REASSIGN`. Não tire `redistribuir_lead` das ações
retidas. Não recarregue verba antes de a página Meta estar compartilhada.
Não rode `supabase db push` — com 179 migrations contra o schema vivo, não é
reconstrução, é roleta.
