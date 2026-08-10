# ATLAS ONE — Fase 202: entrada segura de evidências

## Resultado

A fase cria o contrato de entrada entre a coleta externa de provas e a matriz de gates da release. Um recibo bem-formado pode ser aceito **somente para revisão de procedência**. Ele não homologa o runtime, não satisfaz gates, não altera a memória de módulos e não gera pacote.

Estado factual desta fase:

- 2 módulos e 8 gates permanecem no escopo canônico;
- 14 evidências continuam exigidas;
- 0 entradas reais foram recebidas;
- 0 procedências foram verificadas;
- 0 gates foram executados;
- 0 pacotes foram gerados.

## Proteções implementadas

- vínculo exato com a decisão de composição e o plano de evidências;
- lote atômico com até 50 registros;
- canais permitidos explícitos;
- papel do remetente igual ao proprietário exigido pelo gate;
- janela de validade e tolerância máxima de relógio de 300 segundos;
- bloqueio de replay por hash do lote, identificador da evidência e hash do registro;
- bloqueio de referências absolutas, remotas, com travessia de diretório ou byte nulo;
- quarentena integral quando qualquer registro falha;
- promoção automática e execução automática de gates desativadas.

## Estados possíveis

`accepted_for_provenance_review` significa apenas que a estrutura e o escopo passaram na triagem. `quarantined` preserva os motivos de rejeição. Nenhum dos dois estados torna a evidência elegível para a matriz.

## Próxima fase

A Fase 203 deve verificar procedência e autoria por um mecanismo confiável antes de entregar qualquer registro à matriz de gates. Um JSON íntegro por hash ainda não é prova de quem o produziu.
