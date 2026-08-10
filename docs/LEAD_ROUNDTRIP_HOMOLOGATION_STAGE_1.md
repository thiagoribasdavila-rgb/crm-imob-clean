# ATLAS AI OS — homologação de lead ponta a ponta · Etapa 1

## Resultado desta etapa

Foi preparado um contrato seguro para testar uma lead sintética através do percurso comercial completo. A validação cobre oito passos: entrada, deduplicação, resolução da organização, atribuição, atividade comercial, avanço no pipeline, preparação do sinal agregado e limpeza.

O fluxo preserva a regra operacional de um único corretor e um único Copilot por lead. Também exige trilha de auditoria e aprovação humana antes de qualquer ensaio com escrita.

## O que foi bloqueado de propósito

Esta etapa não executa o ensaio real. O modelo padrão:

- não aceita dado pessoal ou cadastro de cliente;
- não escreve no banco;
- não envia evento ao Meta;
- não acessa outro tenant;
- não declara evidência operacional antes da execução;
- não libera produção nem pacote de implantação.

Nenhum banco, ambiente Hostinger, campanha ou conta Meta foi alterado durante esta preparação.

## Próxima execução autorizada

Quando existir autorização e um tenant exclusivo de homologação, o ensaio deverá usar somente dados sintéticos marcados e produzir comprovantes para cada passo. A limpeza deverá ocorrer por rollback transacional ou remoção dos registros identificados pela referência do cenário.

Somente depois do percurso completo, do recebimento do sinal agregado e do teste de limpeza será possível atualizar os gates externos. Até lá, o build e o ZIP continuam bloqueados, evitando distribuir uma versão que ainda não comprovou o fluxo real.
