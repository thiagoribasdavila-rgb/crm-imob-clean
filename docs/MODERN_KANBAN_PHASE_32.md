# Fase 32 — Kanban moderno

## Resultado

O Kanban mantém visão ampla no desktop e passa a mostrar uma etapa por vez no celular. Abas exibem contagem, cabeçalhos permanecem visíveis durante a rolagem e cards oferecem atalhos de perfil, mensagem, ligação e WhatsApp.

## Experiência

- densidade confortável ou compacta;
- ocultação de etapas vazias;
- ordenação por prioridade, score, valor ou atualização;
- skeletons durante carregamento;
- scroll horizontal com encaixe no desktop;
- etapa única e navegável no celular;
- foco visual acessível;
- movimentação por arrastar, seletor ou `Alt + seta`;
- opção de desfazer a última movimentação.

## Homologação

Testar desktop, tablet e celular; teclado sem mouse; cards longos; etapa vazia; sete colunas; atalhos de contato; carregamento lento; filtros; densidade; ocultação e desfazer. Movimentações continuam usando a API autenticada e gerando timeline.

Execute `npm run modern-kanban:check`. Aferição em aparelhos reais e teste com carteira volumosa permanecem necessários.
