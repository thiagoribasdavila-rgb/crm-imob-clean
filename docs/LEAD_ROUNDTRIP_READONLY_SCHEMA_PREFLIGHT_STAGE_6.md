# Homologação do lead real — Etapa 6

## Resultado

Foi preparado um preflight **somente leitura** para confirmar se o banco de homologação possui o contrato mínimo necessário ao primeiro lead supervisionado.

O preflight consulta exclusivamente o catálogo do Postgres. Ele confirma existência de objetos, colunas, RLS e quantidade de políticas. Ele **não consulta leads**, perfis, clientes, telefones, e-mails ou qualquer linha comercial.

## Contrato mínimo

São avaliados oito objetos obrigatórios:

- organizações e perfis;
- leads e identidade única;
- atribuição de origem;
- histórico do pipeline;
- atividades e tarefas.

Também é exigido ao menos um cadastro de projetos compatível: `developments` ou `projects`.

## Segurança

- RLS é obrigatória nas tabelas expostas;
- o SQL contém uma única instrução de leitura de catálogo;
- o avaliador funciona sobre um snapshot JSON e não possui cliente Supabase;
- nenhuma credencial é recebida pelo avaliador;
- o processo não aplica migration nem tenta corrigir o banco automaticamente;
- falha de tabela, coluna, RLS ou política mantém a execução bloqueada.

O desenho segue a separação oficial do Supabase: privilégios determinam se a tabela pode ser alcançada e RLS limita as linhas visíveis. A aprovação deste preflight não substitui o teste autenticado de isolamento entre tenants.

## Próximo gate

Depois de preencher privadamente o ambiente e obter 11/11 na Etapa 4, um operador autorizado poderá executar o SQL em homologação, salvar somente o JSON do catálogo e avaliá-lo localmente. O permit humano da Etapa 3 continua obrigatório antes de qualquer escrita.

## Declaração de não execução

Nenhum banco, ambiente Hostinger, campanha ou conta Meta foi alterado. Nenhuma conexão externa, autenticação, consulta de dados comerciais, migration ou escrita foi executada nesta etapa.
