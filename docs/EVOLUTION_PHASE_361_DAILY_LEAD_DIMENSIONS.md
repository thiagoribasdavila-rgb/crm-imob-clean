# ATLAS ONE — Fase 361 · Dimensões reais da entrada de leads

## Objetivo

Medir, no mesmo contrato operacional já usado pela Sala de Comando, quantas
leads chegaram por dia e como essa entrada se distribui por projeto, origem,
campanha, incorporadora e corretor.

## Alterações funcionais

- O endpoint `GET /api/v1/analytics/lead-intake` enriquece as leads com campanha,
  projeto e incorporadora usando somente relações da organização autenticada.
- A baseline operacional ganhou os recortes `byCampaign` e `byDeveloper`, além
  dos recortes existentes de projeto, origem e corretor.
- A Sala de Comando mostra os três recortes comerciais em um detalhamento
  compacto, fechado por padrão, para preservar a leitura diária sem ruído.
- Importações históricas e registros de origem ambígua continuam fora das
  métricas operacionais e não melhoram artificialmente os indicadores.

## Segurança e limites de dados

- Consulta feita pelo cliente Supabase autenticado, respeitando RLS e hierarquia.
- Nenhuma chave administrativa ou `service_role` é usada no endpoint.
- O contrato agregado não devolve telefone, e-mail ou conteúdo de conversa.
- Relações legadas ausentes geram avisos e fallback controlado; não viram dados
  inventados.

## Validação

```bash
node --experimental-strip-types --test tests/contracts/lead-intake-analytics.test.mjs
npm run typecheck
npx eslint lib/analytics/lead-intake.ts app/api/v1/analytics/lead-intake/route.ts app/\(crm\)/dashboard/page.tsx scripts/capture-phase-361-lead-intake-dimensions.mjs tests/contracts/lead-intake-analytics.test.mjs --max-warnings=0
npm run capture:phase-361:after
```

A evidência autenticada, quando o ambiente de homologação estiver configurado,
é gravada em:

`artifacts/runtime/phase-361/lead-intake-dimensions.json`

O artefato contém apenas contagens agregadas e prova a reconciliação de cada
dimensão com a amostra operacional.

## Critério de conclusão

- dimensões somam exatamente a baseline operacional;
- campanhas distintas não são mescladas;
- projetos da mesma incorporadora podem ser consolidados no recorte executivo;
- isolamento por organização e hierarquia permanece ativo;
- nenhum build completo ou ZIP é gerado antes do fechamento do ciclo.

## Estado da homologação

- Implementação local concluída.
- Contratos: 14/14 aprovados.
- TypeScript: aprovado sem erros.
- ESLint dos arquivos alterados: aprovado sem erros.
- Evidência autenticada da interface publicada: aprovada para sessão, perfil de
  gestão, dados reais e painel atual de entrada/distribuição.
- Paridade da release publicada: reprovada para os novos recortes. O dashboard
  remoto ainda não apresenta os blocos `Projetos` e `Incorporadoras` com o
  subtítulo `Entrada operacional no período` presentes na implementação local.
- Evidência autenticada direta do contrato: pendente da configuração local da
  URL, chave pública do Supabase e conta exclusiva de teste
  (`ATLAS_TEST_EMAIL` e `ATLAS_TEST_PASSWORD`).
- Nenhuma credencial foi exibida, persistida em artefato ou adicionada ao
  projeto.
- O coletor de evidência foi corrigido para validar `scope.organizationId` e ler
  avisos do envelope de dados real.
- O verificador histórico completo (`npm run evolution-3000:check`) foi
  reexecutado e aprovado. Quatro validadores antigos foram compatibilizados com
  a evolução já consolidada do projeto: fundação SQL executável (fase 19),
  cadência governada em ciclos de cinco fases (fases 48 e 49) e validação
  equivalente de organização no SQL da fase 99.
- Essa manutenção alterou somente os verificadores. Nenhuma migration, tabela,
  policy, dado operacional ou configuração remota foi modificada.
- Até a nova implementação ser publicada e a captura autenticada do contrato
  reconciliar todas as dimensões, a fase 361 permanece implementada, mas não
  promovida no marcador oficial de evolução.
