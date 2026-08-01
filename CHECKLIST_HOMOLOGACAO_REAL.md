# CHECKLIST DE HOMOLOGAÇÃO REAL — ATLAS ONE

Roteiro para provar o sistema com GENTE e DADO reais, na ordem que destrava
valor mais cedo. Cada item diz o comando ou gesto que prova — nada se declara
pronto por parecer pronto.

## Fase 0 — antes de subir (máquina de deploy)

- [ ] `unzip` do pacote de homologação e conferência do SHA-256 (arquivo `.sha256` acompanha o ZIP)
- [ ] `.env` preenchido A PARTIR de `.env.production.example` (nunca copiar o ZIP com segredos; o exemplo explica variável por variável)
- [ ] `npm run database:target:check` — prova que as credenciais apontam para o banco certo (risco R-01: existem DOIS projetos Supabase)
- [ ] Migrations pendentes aplicadas — no mínimo `20260727050000` (Kanban) e `20260728010000` (ponte de empreendimento); sem a primeira o Kanban não move lead
- [ ] Crontab instalado conforme `config/workers-schedule.json` (etapa OBRIGATÓRIA: sem ela outbox, SLA e recorrências não rodam)
- [ ] `npm run build && pm2 start` conforme GUIA_INSTALACAO_HOSTINGER.md

## Fase 1 — sanidade da instalação (10 min, sem tocar em lead)

- [ ] `GET /api/health` → 200
- [ ] `GET /api/ready` → integrações refletem o `.env` real (o que está sem chave aparece DESLIGADO com recusa explícita — verde falso aqui é defeito)
- [ ] `npm run meta:diagnostico` — aceitar o que ele disser; os bloqueios esperados estão em BLOQUEIOS_EXTERNOS_META.md
- [ ] `npm run ia:diagnostico` — idem (esperado hoje: só Perplexity viva)
- [ ] Login do diretor funciona; `npm run teste:varredura` contra a URL de homologação (TESTE_BASE_URL) → 0 quedas

## Fase 2 — o corretor real entra (dia 1)

- [ ] Diego loga com `ddcorretorsp@gmail.com` e TROCA a senha inicial
- [ ] Recuperação de senha ponta a ponta (exige Site URL/Redirect URLs no Supabase Auth apontando para o domínio real)
- [ ] Kanban abre com as 199 leads; etapas vazias escondidas por padrão
- [ ] Mover lead: arrastar, seletor e Alt+setas; descarte pede motivo; desfazer funciona
- [ ] Ficha da lead abre; produto e origem visíveis nos cards
- [ ] Lista de Leads: seleção múltipla + "Mover para etapa" (diretor/gerente)

## Fase 3 — canais (depende dos bloqueios externos)

- [ ] Número do WhatsApp verificado + Cloud API (BLOQUEIOS §3) → `meta:diagnostico` ✔
- [ ] 1 template aprovado; ensaio de template pela tela de integrações (só diretoria; destinatário de teste mascarado)
- [ ] Anúncios apontados para os formulários v8/v6 (BLOQUEIOS §4)
- [ ] **Primeira lead real**: preencher o formulário do anúncio com um telefone próprio → a lead aparece no CRM com consentimento `formulario_meta`, respostas de qualificação, dono, produto (project_id E development_id preenchidos — é a prova da ponte)
- [ ] Se ninguém estiver conectado no WhatsApp: a lead cai em REPRESADAS (comportamento correto da regra, não defeito) e o diretor distribui pelo Command Center

## Fase 4 — ciclo fechado (depois do token do CAPI)

- [ ] Token novo do System User no `.env` (BLOQUEIOS §1) → `meta:diagnostico` ✔
- [ ] `ATLAS_META_CAPI_ENABLED=true` com `mode='test'` e `test_event_code` do Gerenciador de Eventos
- [ ] Evento de teste aparece no Events Manager; só então `mode='live'`
- [ ] Conta de anúncios certa no `.env` (BLOQUEIOS §2); campanha pausada de R$100/dia criada e conferida no Ads Manager

## Fase 5 — critérios de aceite da semana

- [ ] Diego trabalhou as 199 leads (mover/descartar/anotar) sem abrir chamado de erro
- [ ] Nenhum 5xx nos logs do PM2 em uso normal
- [ ] `pipeline_stage_moves` registra cada movimentação; represadas esvaziando pelo Command Center
- [ ] Primeira lead qualificada pelo formulário novo virou conversa
