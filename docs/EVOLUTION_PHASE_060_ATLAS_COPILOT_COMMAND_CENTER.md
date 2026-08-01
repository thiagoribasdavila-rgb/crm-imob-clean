# ATLAS AI OS — Fase 60/3000

## Objetivo da fase

Transformar o Command Center existente na entrada do **ATLAS COPILOT AI**, sem reconstruir o dashboard e sem substituir rotas, dados ou permissões já homologadas.

## O que existia hoje

- Dashboard com dados reais, indicadores e prioridades por papel.
- Painéis próprios para corretor, gerente, superintendente e diretoria.
- Copilot lateral e endpoint governado de inteligência imobiliária.
- Compatibilidade com o banco legado para leads, perfis, tarefas e projetos.
- Um problema de conexão: o Copilot lateral e o Centro de Decisão ainda consultavam `ai_insights`, `tasks.due_at`, `leads.score` e `leads.next_action_at`, estruturas ausentes no banco ativo.

## O que foi alterado

1. O Command Center agora identifica o usuário e apresenta perguntas rápidas específicas para o seu papel.
2. O estado da IA deixou de ser um selo genérico. A interface diferencia:
   - IA generativa online;
   - inteligência local ativa;
   - preparação dos sinais.
3. Foi criada uma barra compacta do Copilot para abrir análises contextuais sem trocar de tela.
4. O Copilot lateral passou a usar o briefing governado e as tarefas reais em `due_date`.
5. O Centro de Decisão passou a usar o contrato real de leads e o mesmo briefing governado.
6. Falhas parciais agora geram orientação amigável, sem expor detalhes técnicos ao usuário.

## Impacto operacional

- O corretor inicia o dia perguntando quais leads priorizar, como organizar a agenda ou como reativar sua carteira.
- O gerente recebe comandos voltados a gargalos, intervenção e coaching.
- A superintendência acompanha desequilíbrio e desempenho entre seus gerentes.
- A diretoria pergunta por risco, VGV e campanhas mais próximas de receita.
- A ausência de crédito ou indisponibilidade do modelo externo não interrompe o CRM: a inteligência local permanece disponível.

## Plano técnico executado

- Preservação do carregamento e da hierarquia existentes no dashboard.
- Reuso de `/api/ai/briefing` como fonte governada de sinais.
- Reuso de `/api/ai/copilot` para respostas com escopo, memória e aprovação humana.
- Compatibilização de tarefas e leads com o banco ativo.
- Evidência automatizada específica da fase.

## Risco identificado

A IA generativa depende de credencial válida, modelo disponível e saldo do provedor. O produto não afirma que essa camada está online quando apenas a inteligência local está ativa.

## Checklist de validação

- [x] Estruturas funcionais preservadas.
- [x] Prompts por papel adicionados.
- [x] Estado de IA honesto.
- [x] Copilot sem consulta a `ai_insights`.
- [x] Tarefas sem consulta a `due_at` no banco ativo.
- [x] Centro de Decisão usando contrato real de leads.
- [x] Nenhuma mutação de dados ou schema.
- [x] Build e ZIP adiados para o gate de release.

## Próxima etapa recomendada

Fase 61: permitir que o Copilot prepare ações dentro de Leads, Clientes 360 e Agenda, sempre mostrando a prévia e exigindo confirmação humana antes de gravar qualquer mudança.
