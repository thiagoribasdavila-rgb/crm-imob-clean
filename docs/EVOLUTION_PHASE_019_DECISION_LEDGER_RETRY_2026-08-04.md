# Fase 19 — Recuperação assistida do Livro Executivo

## Objetivo

Permitir que o gestor recupere o Livro Executivo diretamente pela interface quando a consulta não puder ser atualizada.

## Entregue

- A mensagem de indisponibilidade passa a oferecer a ação `Tentar novamente`.
- O botão informa quando a atualização está em andamento e evita cliques repetidos.
- Uma atualização bem-sucedida remove somente o alerta de indisponibilidade, preservando decisões e resultados que já estavam na tela.
- Mensagens de sucesso de decisão ou resultado não recebem ação de recarga indevida.

## Proteções preservadas

- A recarga é somente leitura e não altera decisões, responsáveis, prazos ou resultados.
- Falhas continuam preservando os registros carregados anteriormente.
- Nenhuma mudança foi feita em banco, RLS, autenticação ou integrações externas.

## Validação esperada

1. Simular indisponibilidade do endpoint do livro.
2. Confirmar a presença de `Tentar novamente` no alerta.
3. Restaurar a conexão e acionar a atualização.
4. Confirmar a remoção do alerta e a preservação do histórico exibido.
