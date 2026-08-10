# Fase 39 — medição de eficiência resiliente

## Objetivo

Garantir que uma indisponibilidade temporária da leitura de eficiência não deixe a Sala de Comando em carregamento permanente nem esconda o motivo da ausência de dados.

## Ajuste entregue

- Tratamento explícito para falha de sessão, rede, API e resposta sem dados.
- Estado de indisponibilidade legível, sem erro técnico exposto.
- Botão de nova tentativa sem recarregar a página inteira.
- Mantido o quadro comparativo real quando a API responde normalmente.

## Impacto operacional

A diretoria distingue uma medição temporariamente indisponível de uma operação sem dados e pode recuperar a leitura com uma única ação.

## Limites da fase

Não houve alteração em banco, permissões, eventos, integrações externas ou cálculos analíticos.

## Validação prevista

- Typecheck.
- Lint.
- Contrato de governança da interação assistida.
