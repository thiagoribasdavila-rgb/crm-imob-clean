# Atlas V3 — Auth e RBAC oficial

## Perfis iniciais

- **Administrador Atlas:** plataforma, usuários, permissões, configurações, integrações e logs.
- **Thiago — Diretor decisor:** visão executiva, organização inteira, projetos, leads, estratégia, metas e indicadores.
- **Senna — Diretor comercial:** corretores diretos, distribuição, pipeline, vendas e relatórios operacionais.
- **Diego, Luciano e Adolfo — Corretores:** somente suas leads, atendimento, tarefas, agenda, clientes e propostas.

O escopo comercial usa a cadeia compacta Thiago → Senna → corretores. A permissão canônica fica em `profiles.access_role` sob RLS. `app_metadata` é apenas um espelho escrito pelo servidor; `user_metadata` nunca autoriza acesso.

## Reset seguro

`npm run auth:official:reset` executa apenas uma simulação. O modo de aplicação exige confirmação explícita. Contas antigas são bloqueadas no Auth e seus perfis são desativados, mas não são apagados: leads, tarefas, vendas e auditoria continuam referenciáveis. As seis contas oficiais recebem convite ou recuperação de senha; nenhuma senha fica no código, log ou ZIP.

Antes de aplicar: use homologação, aplique a migration `official_auth_rbac`, registre backup restaurável, preencha a organização e os seis e-mails, execute a simulação e somente então confirme com `--confirm=RESET_AND_INVITE_OFFICIAL_USERS`. Remova as variáveis temporárias após o primeiro acesso.

## Login

O login confirma a sessão no servidor antes de abrir a operação. Admin segue para usuários e acessos; diretorias seguem para o Command Center; corretores seguem para suas leads. Rotas e APIs revalidam perfil ativo, organização e escopo, sem depender apenas do proxy.
