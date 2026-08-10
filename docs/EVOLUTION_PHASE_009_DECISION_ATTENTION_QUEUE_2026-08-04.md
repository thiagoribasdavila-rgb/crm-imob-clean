# Fase 9 — Fila de atenção do Livro Executivo

## Objetivo

Reduzir a procura manual dentro do Livro Executivo: compromissos com prazo vencido ficam no topo, seguidos por resultados pendentes e pelo histórico encerrado.

## O que mudou

- A ordenação ocorre somente na tela e não grava nenhuma alteração.
- Itens vencidos recebem o selo **Prazo vencido**.
- Compromissos abertos recebem o selo **Resultado pendente**.
- O histórico aprovado, encerrado ou rejeitado continua acessível abaixo das pendências.

## Limites

O Atlas não altera prazo, responsável, decisão, lead, etapa, contato ou campanha. A fila somente reorganiza fatos que já pertencem ao escopo autorizado do usuário.

## Validação manual

1. Abra `/decision-center` como liderança.
2. Crie uma decisão com prazo futuro e confirme o selo de resultado pendente.
3. Após o prazo passar, recarregue a tela e confirme que ela aparece antes das demais com selo de prazo vencido.
4. Registre o resultado; confirme que ela sai da prioridade e permanece no histórico.
