# Fase 041 — Customer 360 orientado a relacionamento

## Resultado

A área **Clientes 360** deixou de ser uma tabela que tentava consultar `customers` diretamente no navegador e passou a ser uma leitura protegida da fonte comercial que já existe: `public.leads`.

A primeira visão agora responde quatro perguntas objetivas:

1. quantos relacionamentos estão visíveis dentro do escopo do usuário;
2. quantos continuam em atendimento;
3. quantos estão sem próxima ação ou com prazo vencido;
4. quantas compras foram registradas no Atlas ou em outra empresa.

Nenhum desses números é apresentado como previsão da IA.

## Experiência entregue

- hero compacto com quatro sinais comerciais observados;
- até três relacionamentos que pedem revisão humana;
- busca por nome, contato, origem ou status;
- segmentos separados para atendimento, compra própria, compra externa e encerramento;
- contexto compacto de projeto, objetivo, responsável, faixa e próxima ação;
- acesso direto ao Lead 360, sem criar um segundo cadastro;
- paginação de 25 registros e adaptação completa para celular;
- explicação progressiva sobre fonte única, hierarquia e cobertura.

## Fonte única e compatibilidade

A nova rota `GET /api/v1/customers`:

- exige sessão e perfil válidos;
- usa a organização resolvida pelo contexto de acesso;
- lê com o cliente autenticado, preservando RLS e hierarquia comercial;
- usa `public.leads` como fonte canônica do relacionamento;
- enriquece apenas a página e as três revisões com responsáveis e projetos;
- aceita a estrutura legada sem devolver `metadata` ou detalhes técnicos;
- permanece somente leitura.

Não foi criada tabela, migration, cópia de cliente ou rotina automática.

## Base fria protegida

A base de reativação não é misturada à carteira ativa. Clientes 360 consulta somente os relacionamentos já presentes em `public.leads`; registros frios permanecem governados pela central de reativação até aprovação e vínculo comercial explícito.

Isso evita que mais de 16 mil contatos históricos poluam a rotina do corretor ou sejam apresentados como oportunidades ativas.

## Ordem explicável

As três revisões usam somente fatos observados:

1. prazo de próxima ação vencido;
2. ausência de próximo passo;
3. ausência de responsável;
4. dois ou mais campos essenciais incompletos.

O sistema **não publica alegação de produtividade**, não prevê conversão e não decide quem deve ser contatado. Abrir o Lead 360 e agir continua sendo uma decisão humana.

## Segurança preservada

- RBAC, organização, hierarquia e RLS permanecem ativos;
- nenhuma chave ou segredo é enviado ao navegador;
- erros técnicos continuam redigidos;
- nenhuma transferência, mensagem, pontuação ou reativação automática foi adicionada;
- nenhuma alteração de dados de produção foi executada.

## Validações

- lint;
- verificação de tipos;
- verificador dedicado da Fase 041;
- programa acumulado de 1.000 fases;
- build de produção.

## Próxima fase

**Fase 042 — Melhorar Projetos:** reorganizar o portfólio por operação, material vigente, estoque e próxima decisão, mantendo incorporadoras e projetos em uma única fonte confiável.
