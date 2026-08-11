# V3000 — Fase 10: prova do artefato

## Objetivo

Provar que o arquivo destinado à Hostinger é instalável, íntegro e contém o
mesmo piloto V3000 que foi validado no workspace.

## Provas obrigatórias

1. checksum SHA-256 externo e inventário SHA-256 interno;
2. fingerprint determinístico do snapshot;
3. presença de `/notifications`, da superfície e do template V3000;
4. presença de Next.js, React, Tailwind, PostCSS e TypeScript em
   `dependencies` e no lockfile;
5. ausência de `.env` real, chaves, mídias e diretórios de build;
6. instalação limpa com `npm ci`;
7. build de produção executado a partir do próprio ZIP.

## Limite da fase

Esta fase gera um candidato de homologação. Ela não publica na Hostinger, não
executa migrations e não modifica a operação real. A confirmação visual
autenticada em produção continua sendo um gate posterior ao deploy autorizado.
