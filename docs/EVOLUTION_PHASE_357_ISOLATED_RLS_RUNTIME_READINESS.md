# ATLAS ONE — Fase 357: prontidão operacional do ensaio RLS isolado

## Resultado

Esta fase consolidou a preparação para executar a prova dinâmica de RLS sem
arriscar o projeto real. O executor da fase 8 já recusava qualquer banco que
não fosse `localhost`, `127.0.0.1` ou `::1`; a fase 357 adicionou um preflight
factual que mostra apenas os nomes das variáveis e falha fechado quando o clone
isolado não está disponível.

Nenhum DDL, migration, build, ZIP ou deploy foi executado. O administrador, a
organização, a autenticação e os dados comerciais permaneceram intactos.

## Inventário factual do Mac em 09/08/2026

| Recurso | Estado | Consequência |
|---|---|---|
| CLI Supabase local do projeto | disponível | o pgTAP poderá ser executado contra um clone loopback |
| CLI Supabase global | disponível | ferramenta auxiliar presente |
| Docker, Podman ou Colima | indisponível | o Mac atual não consegue provisionar o clone local agora |
| `psql` | indisponível | o snapshot ACL não pode ser capturado manualmente por esse cliente agora |
| alvo loopback explicitamente configurado | ausente | execução dinâmica bloqueada |
| snapshot ACL do clone | ausente | execução dinâmica bloqueada |

Esse estado é **bloqueio de infraestrutura**, não falha de RLS e não aprovação
do ensaio. A prova dinâmica continua pendente.

## Controles adicionados

O comando `npm run atlas:phase357:assess` verifica sem conectar ao banco:

- ambiente marcado como `isolated_clone`;
- aprovação explícita;
- URL PostgreSQL presente e restrita a loopback;
- snapshot dentro do workspace com contrato válido;
- CLI Supabase disponível;
- capacidade local de provisionar o clone;
- ausência de exposição de URL, senha, token ou valor de variável.

O comando `npm run atlas:phase357:check` também reexecuta o contrato da fase 8,
incluindo o mutante que tenta usar host remoto e deve ser recusado antes de
qualquer acesso.

## Único caminho autorizado para a prova dinâmica

1. Disponibilizar um runtime local de contêineres ou um clone PostgreSQL já
   ativo em loopback.
2. Carregar no clone isolado uma cópia sanitizada compatível com o contrato de
   fixtures da fase 8.
3. Capturar e revisar o snapshot ACL somente leitura.
4. Definir localmente, sem enviar valores ao chat ou Git, as quatro variáveis
   listadas pelo preflight.
5. Reexecutar o preflight.
6. Somente quando o estado for `ready_for_explicit_isolated_execution`, rodar
   `npm run atlas:rls-dynamic:execute`.

O executor injeta `app.atlas_rls_rehearsal_environment=isolated_clone`, executa
o teste em transação com `rollback` e persiste somente evidência sanitizada.

## Gates de release

O ensaio dinâmico ainda não foi executado e esta fase não libera build, ZIP ou
deploy. As provas pendentes das fases 350, 353 e 354 permanecem abertas. O
marcador oficial da release continua na fase **349**.
