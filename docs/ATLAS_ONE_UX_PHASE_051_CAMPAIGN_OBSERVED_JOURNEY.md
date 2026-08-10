# Atlas One — Fase 51: campanha até resultado observado

## Objetivo

Permitir que a diretoria leia, em uma única sequência, a campanha registrada, as leads captadas, o atendimento realizado e o resultado comercial confirmado no CRM.

## Alterações

- A leitura semanal ganhou uma jornada compacta por campanha: **campanha → lead → atendimento → avanço → resultado**.
- Volume de leads, contatos, qualificações, visitas, propostas e vendas continuam vindo das fontes canônicas já consolidadas.
- Investimento ausente permanece como **não conectado**; o Atlas não transforma ausência em zero.
- As tabelas completas de campanha e execução por corretor permanecem disponíveis sob demanda.
- A interface declara que a sequência representa associação observada, não causalidade comprovada.

## Preservado

- API de aquisição semanal, banco, RLS, hierarquia e cálculos existentes.
- Detalhamento por incorporadora, campanha e corretor.
- Nenhuma campanha, orçamento, lead ou atribuição foi alterada automaticamente.

Não houve migration, alteração de API, build, ZIP ou deploy.
