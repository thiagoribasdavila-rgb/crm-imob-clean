# ATLAS AI OS — Fase 187/3000

## Objetivo

Fechar a lacuna entre o handoff de uso único da fase 186 e uma futura reconciliação auditável: o resultado de um consumo já concluído pode agora gerar um recibo local, privado, imutável e idempotente.

## O que foi implementado

- Schema versionado `atlas.named_remote_capture_consumption_receipt.v1`.
- Recibo identificado pelo hash do handoff, sem identificadores remotos crus.
- Persistência opt-in em diretório explicitamente informado e fisicamente contido na raiz.
- Arquivo em modo `0600`, criação exclusiva e publicação por hard link.
- Replay byte a byte tratado como idempotente.
- Conteúdo divergente para o mesmo handoff tratado como conflito imutável.
- Rejeição de diretórios externos, escapes por symlink e destinos inseguros.
- Sanitização dos códigos de resultado e resumo da evidência apenas por schema, contagem e SHA-256.

## Dados deliberadamente ausentes

- captura remota bruta;
- corpos SQL;
- nomes de migrations;
- referência crua do projeto;
- tokens, chaves e credenciais;
- dados pessoais;
- executor remoto.

## Validação direcionada

Os contratos cobrem:

1. persistência privada sem conteúdo sensível;
2. replay idempotente;
3. conflito imutável;
4. bloqueio sem handoff consumido;
5. recibo seguro para captura rejeitada;
6. bloqueio fora da raiz;
7. bloqueio de symlink e destino inseguro;
8. manifesto adulterado e sanitização de texto livre.

## Impacto operacional

Melhora a rastreabilidade futura sem tocar no Supabase atual. O mecanismo não coleta dados, não executa SQL, não reconcilia migrations e não autoriza build, ZIP ou deploy.

## Próxima etapa

Fase 188: verificador local de integridade e replay para um conjunto de recibos, mantendo o mesmo isolamento operacional.
