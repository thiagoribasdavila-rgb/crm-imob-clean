# ATLAS AI OS — Fase 103

## Command Center decision layer

### Objetivo

Tornar o Command Center mais decisivo e menos ruidoso, concentrando a leitura principal em uma faixa única:

- o que exige ação agora;
- por que isso importa;
- qual evidência sustenta a decisão;
- qual próximo passo deve ser executado;
- como está a IA e a saúde dos módulos.

### Problema resolvido

Antes, o Command Center já exibia bons sinais operacionais, mas a decisão ficava distribuída em vários blocos. Isso aumentava o tempo até o usuário entender se deveria agir em:

- follow-ups atrasados;
- leads sem responsável;
- oportunidades quentes;
- módulos parcialmente indisponíveis;
- operação em dia.

### Alterações realizadas

- Criada a camada `103-command-center-decision-layer` na tela do Command Center.
- A prioridade passa a ser calculada por ordem operacional:
  1. ações atrasadas;
  2. leads sem responsável;
  3. leads quentes;
  4. módulos indisponíveis;
  5. operação em dia.
- Adicionados blocos compactos de evidência:
  - Evidência;
  - Próximo passo;
  - IA;
  - Módulos.
- Adicionado botão para abrir a prioridade e botão para pedir um plano ao Copilot.
- Aplicado layout responsivo, premium e mais limpo.

### Impacto operacional

O usuário deixa de procurar a prioridade em várias áreas e passa a entrar no Command Center com uma pergunta respondida:

> "O que eu devo fazer agora para proteger conversão?"

### Segurança de operação

- Nenhuma alteração no banco.
- Nenhuma automação executa ações sem aprovação humana.
- O Copilot apenas gera plano e explicação.
- Não expõe erro técnico para o usuário final.

### Validação

Rodar:

```bash
npm run evolution:phase-103:check
npm run typecheck
npm run lint
```

### Próxima fase recomendada

Aplicar o mesmo padrão de decisão enxuta na área de Leads/Clientes 360, conectando:

- prioridade comercial;
- histórico do cliente;
- próxima melhor ação;
- abertura rápida de WhatsApp, ligação, tarefa e proposta.
