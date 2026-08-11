# V3000 — Fase 9: release controlada

## Objetivo

Eliminar a diferença silenciosa entre o workspace validado e o ZIP enviado à
Hostinger.

## Correções

- o empacotamento ganhou a origem explícita `ATLAS_PACKAGE_SOURCE=workspace`;
- o snapshot de workspace recebe `sourceMode=workspace-content-hash`;
- `/notifications` deixou de ser removida como rota legada;
- rota, superfície, template, documentação e contratos V3000 tornaram-se
  obrigatórios no pacote;
- a referência Git continua no manifesto como proveniência, enquanto o
  fingerprint SHA-256 prova o conteúdo real do snapshot.

## Segurança

O modo workspace mantém a mesma lista fechada de pastas, remove ambientes
reais, artefatos privados, mídia e saídas de build. Ele não publica, não toca no
Supabase e não altera dados.

## Gate

Uma release V3000 só avança quando o verificador encontra a rota piloto e todos
os contratos dentro do ZIP, não apenas no diretório local.
