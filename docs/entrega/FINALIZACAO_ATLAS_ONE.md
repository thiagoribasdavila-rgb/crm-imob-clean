# Finalização — Atlas One

Índice da entrega. Cada documento tem um propósito e nenhum repete o outro.

| documento | responde a |
|---|---|
| [RELATORIO_FINAL_DE_ENTREGA.md](RELATORIO_FINAL_DE_ENTREGA.md) | **o que funciona, o que falta e por quê** |
| [ERROS_ENCONTRADOS_E_CORRIGIDOS.md](ERROS_ENCONTRADOS_E_CORRIGIDOS.md) | 13 defeitos medidos, com causa e correção |
| [CHECKLIST_TESTE_REAL.md](CHECKLIST_TESTE_REAL.md) | evidências de teste — e o que **não** foi testado |
| [VARIAVEIS_DE_AMBIENTE.md](VARIAVEIS_DE_AMBIENTE.md) | as 134 variáveis, 9 obrigatórias |
| [GUIA_IMPLANTACAO_HOSTINGER.md](GUIA_IMPLANTACAO_HOSTINGER.md) | passo a passo do deploy |

## Stack

Next.js 16.2.11 · React 19 · TypeScript · Supabase · npm · Node >= 20.9 < 21

## Comandos que importam

```bash
npm ci                      # instala reproduzindo o lock
npm run validate            # 84 portões + typecheck + lint + build
npm run verify              # portões sem o build (rápido)
npm run test                # 46 testes de contrato
npm run build               # build de produção
npm run start               # sobe em produção (usa PORT)

npm run smoke:ciclo         # ciclo operacional ponta a ponta, dados reais
npm run integrations:health # estado real de cada credencial
npm run workers:crontab     # gera as linhas de cron
```

## A lição desta entrega

Nove dos treze defeitos eram do mesmo tipo: **código correto e desconectado**.
Rota sem chamador, RPC sem quem a invoque, indicador cravado em zero, lista vazia
por definição, contrato apontando para arquivo esvaziado.

Nenhum produzia erro. Todos produziam ausência — e ausência se lê como "está
tudo bem".

A pergunta de revisão que fica: não *"isso está implementado?"*, mas
**"quem chama isso, e o que aparece na tela quando chama?"**

---

## Estado em 26/07/2026

| | |
|---|---|
| Portões | 86 / 87 verdes |
| Testes de contrato | 139 asserções em 19 arquivos |
| Smoke do ciclo operacional | 45 / 45 contra dados reais |
| Build | 199 rotas |
| Vulnerabilidades de produção | 0 |

### Entregue desde a versão anterior

- **Relatório semanal do incorporador parceiro**, com book de envio pronto e
  worker de domingo que PREPARA a tarefa — não dispara e-mail ao parceiro.
- **Stop loss → /approvals**: a decisão da IA vira proposta com um clique; o
  servidor remede antes de aceitar e recusa decisão vencida com 409.
- **Robô da IA no canto**, ligado a todos os chamadores de IA, mostrando
  trabalho real — não animação perpétua.
- **Teto de requisição unificado**: era duas implementações com mapas separados,
  e a das rotas de IA perdia a contagem a cada bundle do Next.
- **48 páginas-casca removidas** (247 → 199 páginas).
- **Onze defeitos corrigidos** na auditoria página por página — detalhe em
  `ERROS_ENCONTRADOS_E_CORRIGIDOS.md`.

### O que continua aberto

1. `ai:calibration` — 71 controles, nunca esteve verde. Afere comportamentos de
   fases nunca construídas. É escopo de produto, não defeito.
2. Quatro integrações externas bloqueadas por credencial, saldo ou permissão.
3. A agenda é somente leitura: não dá para reagendar de dentro dela.
