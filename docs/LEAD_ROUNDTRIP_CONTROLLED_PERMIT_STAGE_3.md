# ATLAS AI OS — homologação de lead ponta a ponta · Etapa 3

## Gate de execução controlada

Foi criado o permit formal para o primeiro ensaio com escrita em homologação. O contrato exige 11 gates antes de permitir qualquer execução:

1. autorização humana explícita;
2. tenant exclusivo de homologação;
3. banco identificado como homologação;
4. revisão do conjunto sintético;
5. operador responsável;
6. observador independente;
7. janela de teste aprovada;
8. monitoramento preparado;
9. responsável pela limpeza;
10. rollback e prazo de limpeza revisados;
11. habilitação explícita da execução.

## Comprovante obrigatório

Também foi preparado um recibo vazio para preservar as oito evidências do percurso. Ele não aceita aprovação de produção ou ZIP e somente poderá registrar resultado depois do ensaio controlado.

Esta etapa não executa nenhuma escrita. O template continua bloqueado, sem autorização, tenant, operador ou janela preenchidos. Nenhum banco, ambiente Hostinger, campanha ou conta Meta foi alterado.

## Próximo passo

Preencher os responsáveis e a janela somente quando houver autorização consciente para usar um tenant isolado com dados sintéticos. Depois disso, rodar o preflight novamente e executar o ensaio acompanhado, preservando todos os comprovantes e realizando a limpeza no mesmo ciclo.
