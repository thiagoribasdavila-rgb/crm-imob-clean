# Fase 52 — Fila de leads sem responsável

A liderança visualiza até 100 registros ordenados do mais antigo para o mais novo. A resposta contém somente ID parcial, projeto, origem, etapa, criação e tempo de espera; nome, telefone, e-mail, CPF, notas e metadata ficam fora.

“Distribuir próxima” exige projeto, lead pendente e corretor elegível. O comando chama o RPC atômico da Fase 51, que reconfirma `assigned_to is null`. Não existe atribuição silenciosa.

Homologar gerente, superintendente e diretor, dois tenants, projeto sem corretor, fila maior que 100, concorrência e inspeção de rede para PII. Execute `npm run unassigned-queue:check`.
