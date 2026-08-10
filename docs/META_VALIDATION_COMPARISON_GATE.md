# ATLAS AI OS — Fase 19/100

## Controle de qualidade do payload Meta

### Resultado

O Atlas ganhou um comparador local e binário para verificar a qualidade estrutural e comercial de um evento antes de qualquer teste oficial. Ele não atribui nota inventada, não estima `Event Match Quality` e não promete melhora de campanha sem resultado observado.

A prova local continua bloqueada para execução real porque ainda não existe evidência aprovada da Fase 17 no branch Supabase isolado.

### O que é comparado

- isolamento de organização e RLS comprovados pela Fase 17;
- contrato comercial e privacidade aprovados pela Fase 18;
- exatamente um evento canônico;
- `event_id` estável e sem dados pessoais;
- evidências comerciais completas;
- consentimento aplicável;
- `external_id` e ao menos e-mail ou telefone normalizado e hasheado;
- `custom_data` limitada à lista aprovada;
- ausência de CPF, endereço, renda, texto livre e atributo sensível;
- payload e valores de correspondência nunca persistidos;
- nenhuma chamada de rede executada.

### Presença não é qualidade comprovada

O Atlas registra apenas quais chaves existem — por exemplo `em`, `ph`, `external_id`, `fbc` ou `fbp`. A presença dessas chaves não é apresentada como nota de correspondência da Meta. A nota oficial só poderá vir da superfície oficial de testes e diagnóstico da Meta.

O mesmo vale para resultado: o sistema não declara ganho de conversão, redução de CPL ou melhoria do público antes de observar dados reais e comparáveis.

### Valor financeiro

`currency` e `value` somente são permitidos em proposta ou venda confirmada. Se não houver valor confiável, o Atlas não estima nem fabrica. Quando presentes, a moeda deve usar três letras maiúsculas e o valor precisa ser numérico e não negativo.

### Comparação oficial

A comparação no Meta Test Events ou superfície oficial equivalente permanece **pendente**. Ela exigirá:

- evidências aprovadas das Fases 17 a 19;
- autorização explícita;
- código de evento de teste não persistido;
- registro sintético ou teste previamente aprovado;
- nenhuma mudança de campanha, orçamento ou público.

### Estado da fase

- contrato de comparação local: **aprovado**;
- governança contra alegações sem prova: **aprovada**;
- autotestes sintéticos: **aprovados**;
- evidência do branch isolado: **pendente**;
- comparação oficial Meta: **pendente**;
- evento Meta de teste: **bloqueado**;
- produção: **bloqueada**;
- build: **não executado**.

### Referências atuais

- Meta, [About Conversions API](https://www.facebook.com/business/help/AboutConversionsAPI).
- Meta, [Lead ads with forms](https://www.facebook.com/business/ads/ad-objectives/lead-generation/lead-ads-with-forms).
- Supabase, [Tables not exposed to Data and GraphQL API automatically](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically).

### Próxima fase

A Fase 20 preparará o roteiro de um ensaio manual e governado na área oficial de Test Events. O roteiro não transmitirá nada automaticamente e continuará exigindo a aprovação do diretor e todas as evidências anteriores.
