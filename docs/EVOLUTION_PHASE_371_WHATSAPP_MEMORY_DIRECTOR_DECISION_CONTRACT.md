# Fase 371 — Contrato da decisão do diretor

## Objetivo

Definir, sem gravar no banco, as condições obrigatórias para a futura decisão humana sobre a memória estruturada do WhatsApp.

## Entrega

- contrato local e determinístico;
- papéis permitidos: `admin` e `director`;
- decisões permitidas: `approve` e `reject`;
- sessão autenticada e organização compatível obrigatórias;
- justificativa mínima de 20 caracteres;
- duas confirmações humanas;
- idempotência e evento de auditoria obrigatórios;
- bloqueio quando a prova técnica da fase 369 estiver incompleta.

## Limites preservados

- nenhuma migration criada ou aplicada;
- nenhuma chamada de escrita ao Supabase;
- nenhuma decisão persistida ou executada;
- nenhuma leitura de conteúdo bruto, telefone, e-mail ou identidade pessoal;
- nenhuma alegação de ganho de vendas ou precisão preditiva.

## Próximo gate

Implementar o endpoint autenticado e idempotente, com autorização real por organização, persistência auditável e testes de isolamento. Até lá, a interface não oferece botão de aprovação.
