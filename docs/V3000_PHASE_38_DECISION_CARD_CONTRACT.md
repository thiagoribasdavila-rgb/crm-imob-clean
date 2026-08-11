# V3000 — Fase 38: contrato único do card de decisão

## Resultado

A Fase 38 transforma o inventário factual da Fase 37 em uma gramática única
para cards que ajudam alguém a decidir. A primitiva canônica continua em
`components/ui/AtlasCard.tsx`; nenhuma segunda biblioteca foi criada.

## As sete camadas

1. **Identidade** — quem ou o que exige atenção.
2. **Evidência** — fatos observáveis que sustentam a leitura.
3. **Relevância** — impacto comercial para o usuário atual.
4. **Urgência** — quando agir: agora, hoje, monitorar ou sem urgência.
5. **Ação primária** — uma ação principal, fornecida pela tela operacional.
6. **Explicação** — por que a recomendação existe.
7. **Atualização** — recência, fonte e confiança temporal do dado.

O contrato está exposto no HTML por `data-decision-contract` e por um
`data-decision-layer` para cada camada. Isso permite testes, telemetria e
evoluções visuais futuras sem depender do texto exibido.

## Primitiva canônica

`AtlasDecisionCard` é um componente de apresentação server-safe. Ele não busca
dados, não conhece Supabase, não altera o CRM e não implementa eventos. A ação
interativa entra por `primaryAction.control`, preservando a responsabilidade e
as permissões de cada tela.

## Adoção sem risco operacional

As superfícies já operacionais declaram o mesmo contrato sem substituição de
seus fluxos atuais:

- Sala de Comando: prioridade decisiva em `/dashboard`;
- Leads: fila de ação em `/leads`;
- Pipeline: card da oportunidade em `/pipeline`.

Nesta fase não houve mudança de consulta, API, regra de prioridade, drag and
drop, persistência, autenticação, RLS ou banco.

## Validação

```bash
npm run v3000:phase-38:check
npm run v3000:phase-38:test
```

O verificador exige a ordem exata das sete camadas, a adoção nas três
superfícies e a ausência de fronteira client-side na primitiva.

## Próxima fase

A Fase 39 aplicará hierarquia progressiva: decisão em três segundos, contexto
sob demanda e histórico completo apenas no Lead 360. Ela poderá refinar a
densidade dos cards usando este contrato, sem reinventar componentes.
