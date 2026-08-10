# Atlas One — Fase 35: movimentação segura entre etapas

## Resultado

O Kanban agora apresenta um único recibo operacional para cada mudança, sempre
com lead, etapa de origem e destino. O recibo diferencia claramente o que está
sendo salvo, o que foi confirmado e o que foi revertido após falha.

## Proteções preservadas

- uma movimentação por vez;
- nenhuma gravação ao selecionar a etapa atual;
- confirmação para ganho, perda e compra externa;
- atualização otimista com rollback;
- histórico na timeline;
- ação de desfazer após confirmação.

## Escopo técnico

Não houve alteração de banco, migration, RLS, autenticação ou integração
externa. O build permanece reservado para o fechamento do pacote.
