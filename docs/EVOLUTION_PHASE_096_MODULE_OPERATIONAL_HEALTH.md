# ATLAS AI OS — Fase 96/3000

## Objetivo

Transformar o Command Center em uma leitura operacional confiável: uma única fronteira protegida carrega os dados permitidos e informa, separadamente, a saúde de Leads, Pipeline, Tarefas e Agenda, Clientes 360 e Projetos.

## Problema resolvido

O Command Center ainda consultava tabelas físicas diretamente no navegador. Isso repetia compatibilidade já centralizada na Fase 95, misturava falhas independentes e podia apresentar uma indisponibilidade geral quando apenas um domínio falhava.

Também havia uma ambiguidade importante: módulo vazio podia parecer quebrado. Nesta fase, zero registros significa ambiente pronto e operacional; indisponibilidade significa falha real de leitura.

## Alterações realizadas

- criada a leitura `readOperationalModuleHealth` sobre os repositórios compatíveis da Fase 95;
- criada a rota autenticada `/api/v1/core-v2/module-health`;
- aplicado `organization_id` explicitamente em todas as leituras físicas adicionais;
- preservadas as regras RLS do usuário autenticado;
- removidas do Command Center as leituras diretas de `leads`, `tasks`, `crm_projects` e `profiles`;
- adicionados cinco semáforos independentes, com contagem e texto operacional seguro;
- isolados os estados `operational`, `degraded` e `unavailable`;
- mantidos insights determinísticos locais para leads quentes, ausência de responsável e tarefas vencidas, sem custo de modelo externo;
- substituída a mensagem genérica de pane por um aviso de atualização parcial.

## Impacto operacional

- uma falha em Projetos não impede o uso de Leads, Agenda ou Pipeline;
- o diretor identifica imediatamente qual área precisa de atenção;
- ambientes recém-configurados e sem dados aparecem como prontos, não como quebrados;
- o corretor recebe informação útil mesmo quando um complemento do Cliente 360 está em atualização;
- a interface usa exatamente os mesmos contratos canônicos das rotas operacionais.

## Segurança e Supabase

- nenhuma migration foi executada;
- nenhuma conta, sessão ou permissão foi alterada;
- nenhuma chave administrativa foi adicionada ao serviço;
- a rota exige sessão válida e organização ativa;
- as leituras utilizam o cliente autenticado, RLS e filtro explícito de tenant;
- erros internos do banco não são devolvidos à tela.

## Riscos identificados

- a saúde atual é uma fotografia da requisição, ainda não um histórico de disponibilidade;
- o Cliente 360 continua apoiado em leads enquanto o cadastro canônico de clientes não é homologado;
- mudanças em tempo real ainda recarregam o snapshot protegido completo;
- a capacidade de gravar dados por módulo será tratada na Fase 97.

## Checklist de validação

- [x] cinco módulos possuem estado independente;
- [x] zero registros é tratado como operação saudável;
- [x] Command Center não consulta tabelas prioritárias diretamente;
- [x] rota protegida exige contexto de acesso;
- [x] filtro explícito de organização foi preservado;
- [x] falha parcial não apaga módulos saudáveis;
- [x] nenhum erro técnico bruto aparece para o usuário;
- [x] nenhuma alteração de banco, Auth ou dados reais;
- [x] build e ZIP seguem reservados ao checkpoint da Fase 100.

## Próxima etapa recomendada

Fase 97: acrescentar a prontidão de escrita de cada módulo, mostrando bloqueios reais e a ação segura necessária para liberar criação, atualização e movimentação sem criar migrations destrutivas.
