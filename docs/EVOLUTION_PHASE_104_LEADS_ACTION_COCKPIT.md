# ATLAS AI OS — Fase 104

## Leads action cockpit

### Objetivo

Deixar a tela de Leads mais direta para operação comercial: antes de lista, filtros e detalhes, o usuário recebe uma decisão principal sobre o que precisa fazer agora.

### Problema resolvido

A carteira já tinha filtros, métricas, fila de ação e transferência segura, mas ainda exigia que o usuário interpretasse vários blocos para descobrir a prioridade.

Na prática, isso atrasava a resposta para:

- follow-ups vencidos;
- leads quentes sem abordagem rápida;
- leads sem responsável;
- filtros que escondem oportunidades;
- carteira vazia ou em sincronização.

### Alterações realizadas

- Criada a camada `104-leads-action-cockpit` na tela de Leads.
- A decisão principal agora segue ordem operacional:
  1. erro de leitura da carteira;
  2. sincronização;
  3. carteira vazia;
  4. filtros sem resultado;
  5. follow-ups atrasados;
  6. leads sem responsável;
  7. leads quentes;
  8. próxima melhor ação;
  9. carteira saudável.
- Adicionados blocos compactos:
  - Evidência;
  - Próximo passo;
  - Carteira;
  - IA.
- Adicionados botões contextuais:
  - abrir lead prioritário;
  - ver atrasados;
  - ver sem responsável;
  - ver quentes;
  - limpar filtros;
  - pedir orientação ao Copilot.
- Aplicado visual mais premium, compacto e responsivo.

### Impacto operacional

O corretor, gerente ou diretor entra em Leads e recebe uma resposta prática:

> "Qual é a próxima ação que protege conversão agora?"

Isso aproxima a tela do objetivo central do Atlas: transformar leads em vendas com menos ruído e mais velocidade.

### Segurança de operação

- Nenhuma alteração no banco.
- Nenhuma automação executa ação sem confirmação humana.
- A IA apenas orienta e prepara decisão.
- A estrutura existente de filtros, transferência e Lead 360 foi preservada.

### Validação

Rodar:

```bash
npm run evolution:phase-104:check
npm run typecheck
npm run lint
```

### Próxima fase recomendada

Aplicar o mesmo padrão de clareza no Clientes 360:

- painel lateral com próxima melhor ação;
- leitura de relacionamento;
- histórico resumido;
- proposta de contato por IA;
- menos colunas e mais decisão.
