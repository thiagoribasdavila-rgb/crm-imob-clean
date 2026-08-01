# ATLAS AI OS — FASE 48/3000

## Objetivo da fase

Unificar login, sessão, organização e identidade hierárquica em uma única validação oficial, permitindo que Administrador, Diretor, Gerente e Corretor cheguem ao espaço correto sem travamento pós-login.

## Problema resolvido

O servidor já validava usuário, perfil, organização ativa e RBAC por `/api/v1/auth/me`. Depois disso, o navegador repetia outra consulta diretamente em `profiles` e exigia `organization_id` físico. Em homologação, um contexto válido com organização padrão podia ser aceito pelo servidor e rejeitado pelo navegador, encerrando a sessão e gerando o ciclo “autentica, mas o painel não abre”.

## Alterações realizadas

- criado um contrato cliente único para ler, validar e armazenar o contexto devolvido por `/api/v1/auth/me`;
- a proteção das telas deixou de usar `getSession()` e uma segunda consulta a `profiles` como autorização;
- falhas temporárias do servidor preservam a sessão e oferecem nova tentativa;
- respostas 401/403 continuam encerrando o acesso local com segurança;
- o shell deixou de consultar `profiles` e `organizations` diretamente para reconstruir identidade;
- o contexto oficial passou a incluir o nome de exibição;
- o rótulo do Gerente não aparece mais como Diretor comercial;
- logout limpa os dois caches locais de identidade;
- registrada a governança diária de 3.000 fases e o gate único do ZIP final.

## Impacto operacional

O usuário passa por uma única decisão de acesso, validada no servidor. A mesma organização, função e hierarquia orientam proteção de rota, sidebar, cabeçalho e ações. Isso reduz loops pós-login, inconsistência de menu e perda de trabalho causada por encerramento indevido de sessão.

## Riscos identificados

- os testes desta fase são estruturais e locais; a matriz real com as quatro contas ainda precisa ser executada no ambiente Hostinger;
- o fallback de organização continua permitido somente em homologação e não substitui o vínculo definitivo do perfil;
- a tela de evolução ainda mantém a taxonomia visual histórica de 2.000 fases; a migração visual para a governança de 3.000 deve ocorrer sem fabricar fases concluídas;
- o gate externo da antiga Fase 20 permanece bloqueado até evidência de restauração, smoke real e aceite de perfis.

## Checklist de validação

- [x] uma única fonte oficial para perfil e organização;
- [x] autorização confirmada no servidor;
- [x] erro transitório não encerra sessão válida;
- [x] 401/403 encerram acesso local;
- [x] Administrador, Diretor, Gerente e Corretor possuem rótulo coerente;
- [x] nenhuma alteração de schema ou dado de produção;
- [x] typecheck aprovado;
- [ ] login real com as quatro contas na Hostinger;
- [ ] isolamento entre duas organizações em ambiente real;
- [ ] smoke autenticado pós-deploy.

## Próxima etapa recomendada

**Fase 49/3000 — CRM mínimo ponta a ponta por perfil:** provar, com as rotas atuais, que cada perfil consegue executar sua jornada permitida de lead, pipeline, tarefa e histórico, sem dados fictícios e sem enxergar o que está fora de seu escopo.

## ZIP

Nenhum novo ZIP foi gerado. O release permanece bloqueado até os critérios definidos em `config/evolution-program-3000.json` estarem aprovados.
