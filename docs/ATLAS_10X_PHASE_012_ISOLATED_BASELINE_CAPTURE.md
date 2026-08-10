# ATLAS 10X — Fase 12/24

## Captura estrutural sanitizada em alvo isolado

Esta fase transforma o pacote canônico da Fase 11 em um procedimento
executável, mas não concede acesso à homologação.

## Regra de alvo

A captura aceita somente:

- PostgreSQL 17;
- host de loopback (`localhost`, `127.0.0.1` ou `::1`);
- banco descartável;
- conteúdo estrutural ou fixtures sintéticas;
- autorização manual ainda válida e vinculada ao fingerprint do alvo.

A URL nunca é gravada em configuração, evidência ou documentação.

## Preflight

O avaliador verifica:

1. contrato da Fase 11;
2. Supabase CLI 2.109.1;
3. `supabase/config.toml`;
4. runtime Docker compatível e respondendo;
5. `psql` disponível para confirmar a versão real do servidor;
6. autorização explícita, vinculada e não expirada;
7. conexão real com alvo loopback PostgreSQL 17;
8. ausência de dados, credenciais e informações pessoais;
9. preservação da homologação, build e pacote.

No macOS, o preflight também reconhece os binários empacotados pelo
Docker Desktop/OrbStack e o cliente `psql` fornecido pelo `libpq` do
Homebrew ou pelo Postgres.app. Não é necessário criar links globais
somente para satisfazer a descoberta dessas ferramentas.

## Execução autorizada

O executor usa apenas:

`supabase db dump --db-url <loopback> --schema public --file <arquivo parcial>`

O arquivo parcial só se torna canônico após:

- conter estrutura do schema `public`;
- não conter `COPY ... FROM stdin` ou `INSERT INTO` fora de corpos de função;
- não conter URL autenticada, token ou chave;
- não conter e-mail, CPF ou telefone;
- gerar inventário estrutural;
- gerar checksum SHA-256.

## Não use

- `supabase link`;
- `supabase db pull`;
- `supabase db push`;
- `supabase migration repair`;
- `supabase db reset --linked`;
- `--linked`;
- `--data-only`;
- qualquer URL da homologação.

## Estado atual

O procedimento está pronto, mas a execução está bloqueada porque:

- `supabase/config.toml` existe, declara PostgreSQL 17 e foi validado;
- não há Docker ou runtime compatível instalado;
- não há `psql` para comprovar a versão do alvo;
- não há alvo loopback PostgreSQL 17;
- o recibo de aprovação permanece fechado;
- nenhuma captura foi realizada.

Esse estado é correto: ausência de infraestrutura ou aprovação não pode ser
interpretada como permissão.

## Quando os bloqueios forem removidos

1. criar um alvo local descartável PostgreSQL 17;
2. confirmar que ele contém somente schema ou dados sintéticos;
3. disponibilizar `psql` e confirmar PostgreSQL 17;
4. gerar o fingerprint do alvo sem usuário, senha ou query string;
5. preencher o recibo com aprovação, fingerprint e expiração;
6. fornecer um `HOME` isolado;
7. executar `npm run atlas:baseline-capture:execute`;
8. revisar inventário e checksum antes da Fase 13.

## Segurança

- nenhum dado comercial é exportado;
- nenhum usuário de autenticação é copiado;
- nenhuma saída bruta da CLI é persistida;
- nenhum comando linked existe no executor;
- falha parcial não é promovida a baseline;
- captura existente não é sobrescrita.
