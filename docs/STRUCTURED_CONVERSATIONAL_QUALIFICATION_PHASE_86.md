# Fase 86 — Qualificação conversacional estruturada

O Atlas sugere uma pergunta por vez conforme as lacunas da lead. O corretor conversa naturalmente e confirma apenas uma resposta controlada. Transcrição, áudio, mensagem, resposta livre e inferência automática não são armazenados.

São qualificados propósito, prazo, forma de pagamento, prontidão de orçamento, prontidão de região, perfil de unidade, papel na decisão e canal preferido. O progresso e a prontidão para apresentação são determinísticos. O Copiloto recebe somente esses sinais confirmados.

## Homologação

Aplicar a migration, abrir **Qualificar agora** em uma lead e validar oito perguntas, alteração de resposta, progresso, próxima pergunta, prontidão, transferência de corretor, bloqueio de outro corretor, visibilidade hierárquica e isolamento entre tenants.

Gate: `npm run conversational-qualification:check`.
