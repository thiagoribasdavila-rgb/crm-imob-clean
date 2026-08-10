# ATLAS V3 — Auditoria da fonte oficial do projeto

Data da auditoria: 23/07/2026

## Conclusão executiva

O código mais recente e versionado do ATLAS V3 está em:

`/Users/thiagoribasdavila/atlas-v3`

A pasta atualmente aberta:

`/Users/thiagoribasdavila/Documents/Aplas v 3`

é um snapshot sem repositório Git próprio. Ela contém uma camada extensa de auditoria e homologação que ainda não está integrada ao projeto oficial.

Não é seguro continuar o desenvolvimento, gerar release ou substituir arquivos em massa a partir do snapshot. A evolução deve continuar no repositório Git, reaproveitando seletivamente as validações úteis do snapshot.

## Evidências

| Verificação | Projeto Git | Snapshot aberto |
| --- | --- | --- |
| Caminho | `/Users/thiagoribasdavila/atlas-v3` | `/Users/thiagoribasdavila/Documents/Aplas v 3` |
| Repositório Git | Sim | Não |
| Branch | `claude/atlas-v3-entregas` | Não se aplica |
| Commit identificado | `b3d268df41663c687e531a0b5c2c2a3838678692` | Não identificado |
| Pacote Hostinger | 4.754.520 bytes | 4.712.852 bytes |
| SHA-256 do pacote | `da0b645a620653c804583a5a1b136ea6d33fbd239e613c3231a0b53220115d51` | `b2e71c2fcce4d02e10d1aeafb1034bc3e0034a6c151f62ea80bd392d44a46089` |
| Arquivos no pacote | 1.599 | 1.974 |
| Manifesto de commit | `b3d268df...` | `workspace-snapshot` |

## Divergência medida entre os pacotes

- 1.365 arquivos existem nos dois pacotes.
- 1.146 arquivos compartilhados são idênticos.
- 219 arquivos compartilhados possuem conteúdo diferente.
- 234 arquivos existem apenas no pacote do projeto Git.
- 609 arquivos existem apenas no pacote do snapshot.

As diferenças atingem páginas, APIs, componentes, scripts, configurações, documentação e Supabase. Portanto, copiar uma pasta sobre a outra causaria perda de funcionalidades ou regressões difíceis de detectar.

## Estado do projeto Git

O repositório oficial possui alterações locais ainda não consolidadas:

- `app/(crm)/pipeline/page.tsx`
- `app/globals.css`
- `package.json`
- `docs/LIGHT_LAYOUT_EVOLUTION.md`
- `scripts/check-light-layout-foundation.mjs`

Esses arquivos devem ser preservados. Nenhuma limpeza, descarte ou substituição automática foi executada.

## Validação concluída no snapshot

A cadeia local de homologação das fases F02 a F24 foi executada com sucesso:

- 23 de 23 verificações aprovadas.
- ESLint aprovado.
- TypeScript aprovado.
- F23: 61 de 61 controles aprovados.
- F24: 58 de 58 controles aprovados.

A validação F09 também foi corrigida para reconhecer dinamicamente a presença de `supabase/config.toml`, mantendo como bloqueios reais apenas as evidências ausentes de infraestrutura e migração.

Essas validações são candidatas a migração seletiva para o repositório oficial.

## Riscos bloqueados por esta auditoria

1. Publicar um ZIP mais antigo como se fosse o release mais atual.
2. Sobrescrever o pipeline e o layout que possuem mudanças locais no Git.
3. Perder APIs e telas que só existem no projeto Git.
4. Levar arquivos gerados e controles duplicados do snapshot para produção.
5. Executar migrations sem backup, histórico remoto e ensaio controlado.
6. Criar um release sem vínculo verificável com um commit.

## Plano seguro de reconciliação

1. Abrir `/Users/thiagoribasdavila/atlas-v3` como workspace principal no Codex.
2. Preservar e revisar as cinco alterações locais já existentes.
3. Criar um checkpoint Git antes da reconciliação.
4. Inventariar somente os controles F02–F24 e arquivos Supabase exclusivos do snapshot.
5. Migrar esses controles por patches pequenos e revisáveis.
6. Validar integração por módulo: autenticação, tenant, leads, pipeline, Meta/CAPI, IA, projetos e Hostinger.
7. Executar testes rápidos a cada conjunto de mudanças.
8. Executar build completo apenas no fechamento do release.
9. Gerar o ZIP Hostinger exclusivamente a partir de um commit conhecido.
10. Registrar no manifesto o commit, o SHA-256 e o resultado dos testes.

## Gate de continuidade

O próximo desenvolvimento deve ocorrer no workspace:

`/Users/thiagoribasdavila/atlas-v3`

Até a troca do workspace, o estado correto é:

- produto oficial localizado;
- conteúdo divergente preservado;
- nenhuma alteração destrutiva realizada;
- nenhum ZIP novo gerado;
- nenhuma migration aplicada;
- nenhum deploy iniciado.
