# Fase 92 — Loop Meta/Andromeda governado

## Entrega

O Atlas consolida, a cada ciclo de 30 dias, a qualidade dos sinais consentidos enviados pela Conversions API: entrega, identificação, profundidade do funil, atribuição, duplicidade e atualidade. O resultado vira um registro imutável com bloqueadores e hipóteses de teste.

O ciclo aprovado não altera campanha. A aprovação registra que a diretoria aceitou analisar ou planejar um experimento controlado. Público, criativo e orçamento continuam exigindo execução explícita no canal oficial e evidência posterior.

Como os indicadores cobrem toda a organização, diretoria e superintendência podem consultar; gerentes não recebem uma visão global fora do próprio escopo. A decisão permanece exclusiva do diretor.

## Gates

- pelo menos 50 leads consentidas;
- entrega mínima de 95%;
- feedback profundo mínimo de 35%;
- atribuição mínima de 80%;
- duplicidade máxima de 2%;
- sinal com no máximo 48 horas;
- sinais negativos permanecem internos.

## Homologação externa

1. aplicar a migration;
2. manter Meta CAPI em `test` e confirmar `events_received`;
3. gerar ciclo com menos de 50 leads e validar bloqueio;
4. testar consentimento revogado, evento duplicado, falha e atraso;
5. aprovar e rejeitar como diretor, e confirmar bloqueio aos demais perfis;
6. comprovar que nenhuma decisão alterou público, verba ou campanha;
7. somente depois planejar um experimento Meta controlado, com grupo de comparação e critério de parada.

Credenciais, dataset e ensaio oficial continuam pendências externas. A fase não declara uma conexão real sem essas evidências.
