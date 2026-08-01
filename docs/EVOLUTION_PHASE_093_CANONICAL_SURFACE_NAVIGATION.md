# ATLAS AI OS — Fase 93/3000

## Objetivo

Transformar a navegação do ATLAS em uma superfície de produto clara: trabalho diário, clientes e portfólio, gestão e administração. Rotas internas, experimentais e históricas continuam preservadas, mas deixam de competir com as ações que convertem leads em vendas.

## Problema resolvido

O projeto possui 271 páginas. Parte delas representa operação real; outra parte reúne ferramentas contextuais, laboratórios, auditorias internas, ideias futuras e referências históricas.

Sem um contrato explícito, uma tela tecnicamente existente poderia parecer pronta para operação ou reaparecer no menu. Isso aumentava ruído, duplicidade e risco de o usuário entrar em uma jornada sem dados, permissão ou objetivo comercial definido.

## Alterações realizadas

### Superfícies classificadas

Todos os 271 arquivos de página foram classificados:

- 23 canônicos, incluindo entrada pública, autenticação e os módulos produtivos;
- 103 contextuais, acessados a partir da jornada principal;
- 23 internos, destinados a evolução e homologação;
- 115 experimentais, preservados para pesquisa sem exposição operacional;
- 7 retirados da navegação, mantidos apenas por compatibilidade;
- zero páginas sem classificação.

Nenhuma rota foi apagada e nenhum link profundo foi forçado a mudar nesta fase.

### Navegação por resultado e perfil

O menu produtivo passou a conter 19 módulos em quatro grupos:

1. Operação diária;
2. Clientes e portfólio;
3. Gestão;
4. Administração.

Cada item possui agora:

- resultado comercial esperado;
- uma ação principal;
- domínios de dados necessários;
- papéis e acessos autorizados;
- palavras de busca orientadas à intenção do usuário.

O corretor continua vendo sua rotina. Gerente e superintendente recebem gestão. Administração permanece limitada aos acessos autorizados.

### Interno não é operacional

“Evolução V3” saiu do menu diário. A rota `/atlas-v3` e suas páginas de homologação continuam funcionando por link direto e continuam reconhecidas pelo shell, sem ocupar espaço na navegação comercial.

### Contratos Core V2 completos

Os seis contratos profundos existentes foram preservados e a cobertura foi ampliada para os 19 módulos produtivos. Agenda, atividades, reativação, Copilot, equipe, distribuição, vendas, relatórios, Revenue Engine e administração agora declaram propósito, ação, métrica de decisão, fila prioritária, escopo por papel, dependências de dados, contexto do Copilot e ilhas interativas.

### Busca e ruído

A busca lateral passou a considerar rótulo, grupo, palavras-chave e resultado comercial. Assim, buscar “atender”, “estoque”, “conversão” ou “segurança” encontra a tela correta mesmo sem o usuário conhecer o nome do módulo.

Contadores decorativos de telas por grupo e catálogos antigos comentados foram removidos.

## Impacto operacional

- menos escolhas sem contexto no menu;
- acesso diferente para corretor, gerente, superintendente, diretor e administrador;
- módulos internos não desviam a rotina comercial;
- páginas futuras só entram na navegação quando tiverem contrato de negócio e dados;
- busca encontra trabalho pelo objetivo, não apenas pelo nome técnico;
- compatibilidade com links antigos é preservada durante a transição.

## Riscos identificados

- a classificação não declara que uma rota experimental está pronta; ela apenas impede que seja confundida com produção;
- links profundos antigos continuam acessíveis e precisam de migração explícita antes de qualquer remoção futura;
- a presença de um contrato de dados ainda não comprova que o schema vivo do Supabase o atende;
- a auditoria real de banco, RLS, organização e colunas permanece como gate da Fase 94;
- validação visual completa e build continuam reservados ao fechamento da Fase 100.

## Checklist de validação

- [x] 271 páginas classificadas;
- [x] zero páginas sem superfície;
- [x] 19 módulos produtivos contratados;
- [x] navegação separada em operação, portfólio, gestão e administração;
- [x] “Evolução V3” removida do menu diário;
- [x] rota interna preservada;
- [x] busca orientada à intenção;
- [x] compatibilidade de rotas documentada;
- [x] nenhum dado, schema ou autenticação alterado;
- [x] build e ZIP mantidos para o gate da Fase 100.

## Próxima etapa recomendada

Fase 94: auditar o Supabase vivo em modo somente leitura, comparar tabelas, colunas, RLS e vínculos de organização com os contratos dos 19 módulos e produzir um plano seguro de compatibilidade antes de qualquer migration.
