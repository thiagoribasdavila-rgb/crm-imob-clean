# V3000 — Fase 42: identidade comercial inequívoca

## Resultado

O primeiro nível de cada card do Pipeline agora identifica a oportunidade sem
exigir a abertura do Lead 360. A leitura reúne:

- nome do lead;
- projeto ou a indicação explícita `Projeto não vinculado`;
- etapa atual;
- origem ou a indicação explícita `Origem não informada`;
- responsável ou o estado de distribuição correspondente;
- última interação real ou `Sem interação registrada`.

## Integração segura

A API existente de Pipeline passou a resolver o nome dos responsáveis visíveis
na mesma organização. A consulta reaproveita o contrato de perfis legado, não
altera banco, RLS ou regra comercial e não bloqueia o Kanban se essa referência
auxiliar estiver temporariamente indisponível.

## Ganho operacional

O corretor reconhece projeto, etapa e contexto de atendimento em um olhar. O
gestor diferencia oportunidade distribuída, não distribuída e referência
temporariamente indisponível sem confundir ausência de dado com erro.

## Validação

O gate da fase verifica os seis sinais obrigatórios, os fallbacks explícitos, a
resolução de responsável dentro da organização e a ausência de mutação de
banco ou duplicação de API.
