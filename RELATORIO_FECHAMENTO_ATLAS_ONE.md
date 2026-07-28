# RELATÓRIO DE FECHAMENTO — ATLAS ONE

Data: 2026-07-28 · Branch: `claude/atlas-v3-entregas` · Commit base: `4c81510e`
Banco de homologação: Supabase `pozbrcsfthnhmnebfoxv`

Este relatório separa, item a item, o que está **CONCLUÍDO** (código pronto e
verificado), **PRONTO PARA HOMOLOGAÇÃO** (funciona e espera o teste com gente
real), **BLOQUEADO POR AÇÃO EXTERNA** (nenhuma linha de código resolve) e
**NÃO TESTADO** (declarado como tal, sem disfarce).

---

## 1. Estado por área

### CRM / Kanban — ✅ CONCLUÍDO
- Pular etapas, descarte com motivo obrigatório, desfazer (corrigido: procurava
  o movimento na tabela errada e devolvia 409 sempre), painel de "comprou em
  outro lugar" (era `window.prompt`), caminho de volta em toda recusa.
- Piso de tentativas desligado por decisão do dono (`ATLAS_TENTATIVAS_MINIMAS`
  religa em uma linha; contrato prova que volta inteiro).
- Prova: 41/41 na bateria viva com o login real do corretor.

### Acesso / RBAC — ✅ CONCLUÍDO (com uma decisão adiada de propósito)
- Falta de autorização devolvia HTTP 500 em dezenas de rotas ("Perfil
  inativo.", "Organização inativa."); agora 401/403 com o passo que falta.
- `/api/v1/rbac/me` dizia `backendEnforced: true` — mentira. Agora diz a
  verdade (`enforcement.matrizAplicada: false`) e explica que a lista de
  permissões orienta a interface; quem barra é a checagem por rota (medida:
  403 para corretor em /team, /director-daily, /approvals).
- ADIADO de propósito: aplicar a matriz `ROLE_PERMISSIONS` de fato. É mudança
  de controle de acesso na véspera da operação; a matriz ainda usa chaves em
  português (`corretor`) enquanto os perfis usam inglês (`broker`).

### Ingestão de leads / empreendimento — ✅ CONCLUÍDO
- Defeito ativo de PERDA DE LEAD corrigido: a ingestão copiava o id da fonte
  (crm_projects) para as duas colunas da lead; na FK de developments estourava
  23503 e a lead se perdia. Armado desde que os formulários com qualificação
  foram vinculados.
- Ponte `crm_projects.development_id` criada (migration `20260728010000`),
  idempotente, reversível, 4/4 mapeados, 0 ambíguos.
- Prova no banco vivo: par correto aceito; par errado recusado pela FK.
- Consentimento: webhook e importação usam a MESMA função
  (`consentimentoDaFonte`); importação não nasce mais sem metadata.

### Formulários Meta — ✅ CONCLUÍDO (apontar anúncio é ação externa)
- Criados pela API e ativos: `Spin Mood (v8)` `1571460868037960` e
  `Arvo (v6)` `1601751148056662`, com as 3 perguntas de qualificação
  (objetivo, prazo, forma de pagamento — nenhuma toca atributo protegido).
- Registrados em `meta_lead_sources` com consentimento
  (`conversion_sharing_enabled`), dono padrão e empreendimento vinculado.

### Meta CAPI — 🔒 BLOQUEADO POR AÇÃO EXTERNA (código pronto)
- Flag `ATLAS_META_CAPI_ENABLED` permanece DESLIGADA — estado correto.
- Preflight no remetente: credencial errada é recusada ANTES do envio, com
  causa real e responsável (190/465 = app errado; 100 = permissão; rede ≠
  credencial). Nada falha em silêncio; nada simula sucesso.
- Bloqueio externo: `META_CONVERSIONS_ACCESS_TOKEN` é de um app que não
  pertence ao Business do dataset (inválido até no `/me`).

### Conta de anúncios — 🔒 BLOQUEADO POR AÇÃO EXTERNA
- A conta configurada (`act_361228…`) é alcançável mas está PARADA (campanha
  mais recente: 577 dias). As campanhas de Arvo/Spin rodam na
  `act_893242765778454` (D'Avila–Senna), onde o token devolve 403 e o teto de
  gastos está atingido.
- O diagnóstico marca "⚠ suspeita" com o número de dias — não finge verde.

### WhatsApp oficial — 🔒 BLOQUEADO POR AÇÃO EXTERNA (código pronto)
- `WHATSAPP_PHONE_NUMBER_ID=527541623768288` e token corrigidos no ambiente
  (o anterior era de outro app).
- Preflight no ponto único de envio (`deliverWhatsApp`): número NOT_VERIFIED
  ou fora da Cloud API → envio recusado com o passo que falta e quem resolve.
  Cache de 5 min; token nunca aparece em erro. Canal NÃO é marcado operacional.
- Bloqueio externo: o número `+55 11 99928-6902` NUNCA completou a verificação
  por código (`NOT_VERIFIED`, `DISCONNECTED`, plataforma `ON_PREMISE`).
- Ponte não oficial (Baileys) continua disponível como alternativa consciente;
  desativada sem `ATLAS_WHATSAPP_BRIDGE_SECRET`.

### IA — ✅ CONCLUÍDO no código · 🔒 crédito é externo
- Modelos aposentados trocados (`gpt-5-mini`/`gpt-5.2` → `gpt-5.6-luna` em
  todos os tiers, decisão do dono); vocabulário de `effort` se autocorrige pela
  resposta da API; portão de tarifas pergunta ao código em vez de raspar fonte.
- Cadeia reordenada para quem responde: Perplexity primeiro (única com saldo);
  OpenAI/Anthropic voltam sozinhas quando houver crédito.
- Dado pessoal NÃO vai para a Perplexity (trava de privacidade proposital):
  redigir mensagem, apresentação e leitura de conversas ficam paradas até
  haver crédito em OpenAI/Anthropic.

### Tema claro — ✅ CONCLUÍDO (estrutura) · ⚠ NÃO TESTADO (aparência)
- 1.972 utilitários de cor fixa mapeados; superfícies, bordas e texto
  secundário cobertos por regra de tema verificada NO CSS COMPILADO.
- `text-white` (300 ocorrências) deixado de fora DE PROPÓSITO: parte é rótulo
  de botão que deve continuar branco; distinguir exige olhar a tela.

---

## 2. Verificação executada (resultados reais)

| Verificação | Resultado |
|---|---|
| Contratos (`npm run test:contracts`) | **434/434** |
| Mutation testing (`npm run teste:mutacoes`) | **18/18** quebras detectadas (última execução 2026-07-27) |
| TypeScript (`npm run typecheck`) | limpo |
| Lint (`npm run lint`, `--max-warnings=0`) | limpo |
| Build de produção (`npm run build`) | ok |
| Kanban vivo (login real do corretor) | **41/41** |
| Varredura como diretor | **200 páginas + 271 chamadas, 0 quedas** |
| Varredura como corretor (login real) | **200 páginas + 274 chamadas, 0 quedas** |
| Segredos no repositório (`security:secrets`) | 0 em 2352 arquivos |
| VALORES de segredo no bundle do navegador | nenhum (comparação por valor, não por padrão) |
| `service_role` em código de navegador | nenhum |
| Migration nova reexecutada (prova de idempotência) | no-op; 4 mapeados, 0 sem ponte |
| FK do empreendimento (banco vivo) | par correto aceito; par errado recusado (23503) |

### NÃO TESTADO (declarado, não disfarçado)
- **Recebimento de lead real** pelos formulários novos — exige submissão real
  na Meta (bloqueio: anúncios ainda apontam para os formulários antigos).
- **Nível gerente** — não há credencial de gerente disponível nesta sessão
  (varredura cobriu diretor e corretor com logins reais).
- **Envio real de WhatsApp** — bloqueado pelo preflight até o número ser
  verificado (o bloqueio em si está testado por contrato).
- **CAPI com evento real** — flag desligada até o token certo existir (o
  dry-run/export e a recusa de credencial estão testados).
- **Instalação limpa `npm ci` do zero** — o pacote é verificado por
  `verify-hostinger-package` (inventário + SHA); instalação limpa completa em
  máquina virgem não foi executada nesta sessão.
- **Aparência do tema claro** — painel de navegador indisponível na sessão.

---

## 3. Arquivos alterados nesta etapa (commit `4c81510e`)

- `supabase/migrations/20260728010000_mapeia_crm_projects_para_developments.sql` — nova (aplicada à homologação)
- `app/api/v2/outbox/process/route.ts` — ingestão grava cada id na sua FK + preflight do número de WhatsApp
- `scripts/meta-diagnostico.mjs` — inspeção de tokens (tipo/app/expiração) via debug_token
- `tests/contracts/empreendimento-duas-identidades.test.mjs` — nova
- `tests/contracts/whatsapp-nao-envia-sem-numero-ativo.test.mjs` — nova

Histórico completo da frente de fechamento: `git log --oneline` de `625ee25d`
até `HEAD` (Kanban, RBAC, CAPI, IA, tema, varreduras — um assunto por commit).

## 4. Migrations aplicadas na homologação nesta frente

- `20260727050000_corrige_move_pipeline_lead.sql` (RPC do Kanban — remove coluna inexistente)
- `20260728010000_mapeia_crm_projects_para_developments.sql` (ponte de empreendimento)

Ambas precisam ser aplicadas em produção no deploy (ver GUIA_INSTALACAO_HOSTINGER.md).
