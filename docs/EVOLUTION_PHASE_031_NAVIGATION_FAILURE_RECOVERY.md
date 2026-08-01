# Fase 031 — Recuperação de falhas na navegação

## Resultado

O ATLAS passou a tratar falhas locais como estados recuperáveis, sem derrubar o restante da tela e sem repetir automaticamente uma ação comercial. Pipeline, Tarefas, Clientes, Vendas e Distribuição aderiram ao mesmo contrato já usado por Agenda e Projetos.

## Linha de base estrutural

Antes desta fase, somente dois dos oito módulos comerciais críticos usavam o componente compartilhado. Cinco ainda mostravam um banner vermelho sem uma nova tentativa local consistente; Leads possuía uma recuperação própria por limpeza de filtros.

Depois da mudança:

- sete módulos críticos usam `AtlasRecoverableError`;
- os cinco banners locais antigos foram removidos do recorte crítico;
- Leads preserva sua recuperação explícita, totalizando oito superfícies com um próximo passo;
- o limite geral da área CRM passou a usar o mesmo contrato;
- nenhuma taxa de sucesso de recuperação foi inventada.

## Contrato recuperável

Cada falha apresenta:

1. título em linguagem simples;
2. confirmação de que os dados permanecem protegidos;
3. descrição contextual sem detalhes de banco, schema ou stack;
4. botão nativo de nova tentativa;
5. estado ocupado que desabilita repetição enquanto a leitura está em curso.

O contrato declara o escopo (`module`, `page` ou `action`) e a estratégia `safe-read-retry`, permitindo inspeção estática sem prometer um resultado não medido.

## Retentativa sem duplicar trabalho

Os botões recuperam somente a leitura atual. Eles não repetem movimentação de lead, atualização de comissão, distribuição, criação de tarefa ou qualquer outra escrita. Isso evita que uma falha de resposta produza uma segunda operação comercial.

Em Distribuição, falhas de rede que antes poderiam terminar como promessa rejeitada agora viram um estado local recuperável. Dados já carregados nos módulos irmãos continuam visíveis.

## Limite completo da área CRM

Uma falha inesperada de renderização continua contida dentro do shell autenticado. A pessoa pode:

- tentar renderizar novamente;
- registrar o diagnóstico;
- voltar ao Command Center.

O identificador técnico permanece somente no registro operacional e não aparece na interface.

## Acessibilidade e privacidade

- O estado usa semântica de alerta.
- Ações são botões e links nativos com alvo mínimo de 44 pixels.
- O texto informa o problema sem depender apenas de cor.
- Mensagens conhecidas de schema, Postgres, PGRST, Prisma ou stack são substituídas por texto seguro.
- Nenhum dado pessoal, segredo, permissão ou registro comercial foi consultado ou alterado.

## Limite de evidência

A cobertura é estrutural. Tempo de recuperação, taxa de sucesso e abandono dependem de telemetria real e homologação por perfil em ambiente separado. O bloqueio da Fase 020 permanece ativo.

## Próxima fase

Fase 032 — **Arquitetura de navegação · Otimizar desktop**.

O próximo avanço deve aproveitar melhor o espaço amplo, reduzir rolagem desnecessária e preservar hierarquia, toque e responsividade.
