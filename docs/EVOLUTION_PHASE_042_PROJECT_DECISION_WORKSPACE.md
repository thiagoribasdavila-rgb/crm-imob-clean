# Fase 042 — Projetos orientados à decisão

## Resultado

A área de Projetos deixou de depender do sucesso simultâneo de todas as tabelas avançadas. O portfólio principal continua visível quando estoque, campanhas, reservas, inteligência ou materiais ainda não estiverem configurados, desde que exista uma fonte de projetos autorizada.

A primeira leitura agora responde a quatro perguntas comerciais:

1. Quantos projetos estão visíveis no escopo do usuário?
2. Quantas unidades disponíveis estão conectadas?
3. Quantos projetos possuem o kit comercial essencial vigente e verificado?
4. Quais projetos exigem revisão humana?

## Compatibilidade segura

- `developments` permanece como fonte canônica.
- `projects` é aceito como fonte legada, sempre filtrada pela organização autenticada.
- `opportunities` pode usar `leads` como adaptação legada.
- módulos opcionais são isolados e recebem estado individual.
- leituras usam o cliente autenticado e as políticas RLS; o cliente administrativo não lê o portfólio.
- nenhum fallback remove o filtro de organização.

## Materiais comerciais

O kit essencial é composto por:

- book;
- tabela de preços;
- espelho de vendas.

Somente uma versão `is_current`, com `review_status = verified` e dentro da vigência entra na cobertura. Material vencido, pendente ou rejeitado não aparece como pronto para uso comercial.

## Prioridades explicáveis

A tela apresenta no máximo três situações, nesta ordem:

1. material vencido;
2. kit essencial incompleto;
3. material aguardando validação;
4. estoque não conectado;
5. cadastro essencial incompleto.

Essa ordenação é uma regra observável, não previsão de venda. Nada é homologado, aprovado, alterado ou enviado automaticamente.

## Experiência

- a ação principal continua sendo cadastrar um empreendimento;
- a busca de materiais permanece direta;
- ações administrativas ficam em “Mais gestão”;
- busca e filtros por situação ficam junto da lista;
- a saúde das conexões é progressivamente revelada;
- os valores financeiros continuam disponíveis sem ocupar a primeira leitura;
- toque mínimo de 44 px, estado pressionado e movimento reduzido foram preservados.

## Segurança e limites

- nenhuma escrita em produção;
- nenhuma migration;
- nenhum dado fictício;
- nenhuma alegação de aumento de conversão ou produtividade;
- erros técnicos não são devolvidos ao usuário;
- RBAC, tenant e RLS permanecem ativos;
- o gate de homologação da Fase 020 continua bloqueado.

## Checkpoints ZIP

O novo ciclo de 2.000 fases abre um checkpoint excepcional na Fase 047. Depois dele, os artefatos serão gerados a cada 100 fases. O primeiro pacote terá o nome `atlas-v3-phase-047-hostinger.zip`, somente depois de passar:

- verificação da fase;
- verificação do programa de 2.000 fases;
- TypeScript;
- lint;
- build;
- integridade interna e SHA-256 do ZIP.

Pacotes anteriores serão preservados. `.env.local`, chaves, planilhas, PDFs e dados de clientes ficam fora do pacote; a Hostinger recebe as variáveis pelo ambiente seguro e o ZIP contém apenas `.env.example`.

## Próxima fase

Fase 043 — melhorar Reativação sem misturar a base fria com a carteira ativa e sem iniciar contatos automáticos sem consentimento e aprovação.
