# ATLAS ONE — Fase 358: gate de provisionamento do clone local

## Objetivo

Eliminar a ambiguidade entre “CLI instalada” e “clone isolado executável”. Esta
fase verifica runtime, daemon, portas, configuração PostgreSQL e ausência de
vínculo remoto antes que qualquer contêiner seja iniciado.

A auditoria segue o modelo de segurança do Supabase para RLS: nenhuma prova
dinâmica pode usar o projeto de homologação ou um workspace ligado a ele.

## Resultado factual em 09/08/2026

| Controle | Estado |
|---|---|
| Supabase CLI | disponível, versão atual do projeto |
| `supabase start --workdir` | suportado |
| Docker Desktop, OrbStack, Podman Desktop ou Rancher Desktop | não detectados |
| Docker, Podman ou Colima prontos | não |
| portas locais 54320–54329 | livres |
| `supabase/config.toml` | presente, PostgreSQL 17 |
| marcador de projeto remoto no workspace | ausente |

O estado real é `blocked_without_runtime`. Isso não reprova RLS; apenas prova
que o Mac ainda não consegue subir o banco isolado. Nenhuma instalação de
software, migration, DDL, ZIP, build ou deploy foi realizada.

## Novo controle

- `npm run atlas:phase358:assess` produz evidência sanitizada.
- `npm run atlas:phase358:check` testa os mutantes: runtime ausente, workspace
  ligado ao remoto e porta ocupada.
- um workspace ligado ao remoto é sempre recusado;
- somente PostgreSQL 17 e as portas locais canônicas são aceitos;
- o comando nunca imprime caminhos de credenciais, URL de banco ou Project ID;
- o comando não inicia contêineres e não executa SQL.

## Próxima ação segura

Disponibilizar um runtime local de contêineres. Depois, repetir o preflight e,
somente quando o estado for `ready_to_provision_local_clone`, iniciar o
Supabase em um workdir isolado e sem vínculo remoto. A captura ACL e o pgTAP da
fase 8 continuam condicionados a esse gate.

## Release

O marcador oficial permanece na fase **349**. Os gates dinâmicos das fases
350, 353 e 354 continuam pendentes; portanto esta fase não autoriza novo ZIP ou
deploy.
