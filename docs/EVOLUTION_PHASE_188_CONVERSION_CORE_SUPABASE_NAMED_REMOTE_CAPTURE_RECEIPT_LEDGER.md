# ATLAS AI OS — Fase 188/3000

## Objetivo

Verificar localmente a integridade de todos os recibos privados da fase 187 e permitir replay determinístico por hash, sem consultar ou alterar o Supabase operacional.

## O que foi implementado

- Schema versionado `atlas.named_remote_capture_receipt_ledger.v1`.
- Descoberta estrita apenas de recibos nomeados por SHA-256.
- Bloqueio de arquivos inesperados, symlinks e escapes físicos do diretório privado.
- Leitura com `O_NOFOLLOW`, limite de 64 KiB e exigência de modo `0600` por recibo.
- Revalidação completa do envelope, handoff, resultado, privacidade e ausência de efeitos remotos.
- Recálculo do hash interno de cada recibo.
- Detecção de handoffs e hashes de recibo duplicados.
- Hash canônico e determinístico do ledger ordenado.
- Replay opcional contra hash esperado, com falha fechada em divergência.

## Saída segura

O verificador retorna somente:

- quantidade total, aceita e rejeitada;
- primeiro e último horário registrado;
- SHA-256 do ledger;
- estado de integridade e replay.

Capturas brutas, SQL, nomes de migrations, referência crua do projeto, credenciais e dados pessoais permanecem ausentes.

## Validação direcionada

Os contratos cobrem:

1. ledger íntegro com recibos aceitos e rejeitados;
2. replay determinístico;
3. divergência após inclusão posterior;
4. adulteração do conteúdo;
5. permissão de arquivo insegura;
6. arquivo inesperado e symlink;
7. diretório externo e escape físico;
8. limites e hash esperado inválido.

## Impacto operacional

A trilha local passa a ser verificável antes de qualquer futura reconciliação. O mecanismo não coleta evidência remota, não executa SQL, não aplica migrations e não autoriza build, ZIP ou deploy.

## Próxima etapa

Fase 189: checkpoint local imutável do hash do ledger, permitindo comparar execuções sucessivas sem introduzir capacidade remota.
