# Checklist final — Atlas One V1000

## Pacote

- [x] Código-fonte incluído;
- [x] dependências travadas por `package-lock.json`;
- [x] arquivos reais `.env*` excluídos;
- [x] senhas, chaves, planilhas, PDFs, vídeos e ZIPs internos excluídos;
- [x] documentação de instalação incluída;
- [x] checksum SHA-256 externo e inventário interno incluídos.

## Banco

- [x] ambiente Supabase gratuito atual mantido;
- [x] nenhuma branch paga criada;
- [x] tabelas, relacionamentos, migrations, RLS e RBAC preservados;
- [x] tabelas comerciais do ambiente de homologação confirmadas sem registros;
- [x] somente catálogos estruturais de papéis e permissões preservados;
- [x] seed local vazio e determinístico;
- [ ] exportação lógica atualizada antes de qualquer futura troca de projeto Supabase.

## Primeiro acesso

- [x] onboarding em `/setup`;
- [x] criação da primeira organização;
- [x] criação do primeiro administrador;
- [x] papel administrativo gravado no Auth e no perfil;
- [x] senha forte obrigatória;
- [x] ativação bloqueada em produção;
- [x] ativação bloqueada depois do primeiro perfil;
- [x] rollback do usuário e da organização em falha parcial;
- [ ] primeiro acesso real executado pelo responsável da homologação;
- [ ] `ATLAS_BOOTSTRAP_SECRET` removido depois da ativação.

## CRM

- [x] funil canônico preservado;
- [x] instalação sem leads fictícios;
- [x] instalação sem tarefas, mensagens ou projetos fictícios;
- [x] hierarquia Diretor, Gerente e Corretor preservada;
- [x] estados vazios e falhas amigáveis preservados;
- [ ] criar um lead real controlado;
- [ ] editar o lead;
- [ ] mover entre etapas;
- [ ] criar e concluir uma tarefa;
- [ ] remover o registro controlado ao terminar a validação.

## Acesso e segurança

- [x] login, logout, recuperação e sessão cobertos por contratos locais;
- [x] rotas protegidas e contexto multi-tenant preservados;
- [x] RLS ativo nas tabelas públicas auditadas;
- [x] service role restrita ao servidor;
- [x] scanner de segredos aplicado;
- [ ] repetir a consulta pública de vulnerabilidades do npm quando o registro estiver acessível;
- [ ] testar recuperação com o e-mail real do administrador;
- [ ] validar Diretor, Gerente e Corretor com contas reais distintas.

## Integrações

- [x] estruturas de Meta, WhatsApp, IA, e-mail e calendários preservadas;
- [x] operação principal preparada para funcionar sem provedores externos;
- [x] nenhuma integração promovida como ativa sem teste real;
- [ ] inserir credenciais no servidor;
- [ ] executar teste supervisionado de cada integração;
- [ ] registrar aprovação humana antes de automatizar ações.

## Critério de entrada em uso

A homologação pode começar quando o administrador real entrar, `ATLAS_BOOTSTRAP_SECRET` for removido e as jornadas marcadas como pendentes acima forem executadas sem erro.
