# Fase 83 — Memória comercial segura

O Copiloto agora mantém uma memória exclusiva por lead e pelo corretor responsável sem armazenar perguntas, respostas ou conversa bruta. A memória contém apenas intenção, prazo, forma de pagamento, objeções, sinais, etapa e próxima ação em taxonomias controladas.

## Proteções

- unicidade por organização e lead, com RLS hierárquica;
- validação atômica do corretor responsável;
- sincronização auditada quando a lead é transferida;
- estado versionado e eventos imutáveis;
- expiração renovável em 180 dias e contexto expirado fora da IA;
- reinício manual apenas pelo corretor responsável ou diretoria, com justificativa;
- limpeza das antigas perguntas e respostas existentes em `lead_copilots.memory`.

## Homologação

Aplicar a migration da fase, abrir **Memória segura** dentro de uma lead, conversar com o Copiloto e confirmar que só os sinais estruturados aparecem. Testar transferência, reinício, expiração e isolamento com dois tenants e os quatro níveis comerciais.

Gate local: `npm run commercial-memory:check`.
