# Atlas ONE — CRM de incorporação e vendas

CRM real, em operação. Next.js 16 (App Router, Turbopack) · React 19 · TypeScript ·
Tailwind v4 · Supabase.

Este arquivo é o ponto de entrada: o que o pacote precisa para subir e como
continuar de onde a última pessoa parou. Antes dele havia o texto padrão do
`create-next-app` — que descreve qualquer projeto e não ajuda em nenhum.

---

## 1. Subir localmente

| item | por quê |
|---|---|
| **Node 22 LTS** | `engines` declara `>=22.6`. **Node 26 está fora** por decisão do dono do produto |
| **Um projeto Supabase** | não há modo offline; sem banco o produto não sobe |
| **`.env` preenchido** | copie de `.env.production.example`. O build **recusa** subir sem as chaves |

```bash
npm ci
cp .env.production.example .env     # e preencha
npm run build
npm start
```

Para conferir compilação sem gerar artefato de produção:

```bash
ATLAS_BUILD_SEM_AMBIENTE=1 npm run build
```

O `.env` **nunca** entra no pacote nem no git. Se você recebeu um ZIP com um `.env`
real dentro, ele foi montado errado — pare e avise.

---

## 2. O banco

**Não existe `npm run migrate`.** As migrations são aplicadas no banco alvo, na
ordem, conforme `GUIA_INSTALACAO_HOSTINGER.md` §3 — que também lista quais são
obrigatórias e o que quebra sem cada uma.

O que o repositório garante é medido, não prometido (01/08/2026):

```
tabelas no banco ......... 188
criadas por migration .... 187   (99%)
funções (RPC) ............ 115 de 115 com CREATE FUNCTION   (100%)
sem migration ............   1   campaign_assets — 0 linhas, 0 usos no código
```

Quem confere é um portão:

```bash
npm run cobertura-schema:check
```

Ele **não fica verde sem banco**: sai com `2` e `NÃO EXECUTADO`. Verde por ausência
de medição afirmaria que o pacote instala — que é justamente o que não se sabe sem
olhar.

**Pendência conhecida:** `20260801100000_elenco_de_distribuicao.sql`
(`distribution_roster`) existe no repositório e **nunca foi aplicada**. O portão a
reporta na linha *"em migration e ausentes no banco"*.

---

## 3. Como este projeto se verifica

Cada camada pega uma classe diferente de erro:

```bash
npx tsc --noEmit          # tipos
npm run lint              # o teto é ZERO warning, não um alvo
npm run test:contracts    # 1.309 contratos
npm run portoes:todos     # 226 portões executáveis
npm run build             # compila de verdade
```

**A regra que sustenta tudo: um portão precisa ser visto RECUSANDO.** Escrever a
asserção e vê-la verde não prova nada — ela pode estar verificando outra coisa.
Sabote o código de propósito e confirme que reprova. Nesta base, mais de uma
asserção passou na primeira sabotagem porque media a regra errada; uma delas
aprovava o próprio autor.

Portões que dependem de ambiente ficam em **quarentena declarada** e saem com
`NÃO EXECUTADO` em vez de verde. `npm run portoes:todos` lista quais e por quê.

---

## 4. A linguagem visual (v3)

| eixo | onde mora |
|---|---|
| escala tipográfica | `text-micro` 10 · `text-rotulo` 11 · `text-corpo` 13 · `text-numero` 20 · `text-heroi` 34 |
| superfície | `.cc6-panel` — primitiva vencedora por uso medido (316 × 45) |
| bordas com papel | `cc6-destaque` · `cc6-atencao` · `cc6-alerta` · `cc6-interativo(-acento)` |
| alvo de toque | **44px** em qualquer controle que muda estado |
| referência viva | `components/atlas/FilaDeDecisoesPanel.tsx` |

```bash
npm run linguagem-visual:check
```

**Duas armadilhas que já custaram caro aqui:**

1. `app/globals.css` é **sem camada** (`@layer`), e utilitário do Tailwind vive em
   `@layer utilities`. **Sem camada vence camada** — uma regra do `globals.css`
   passa por cima de um utilitário que não tenha `!`. Isso quase apagou 13 bordas
   intencionais de uma vez.
2. O Tailwind varre o arquivo **inteiro, comentário incluído**. Citar o nome de uma
   classe num comentário faz o CSS dela voltar a ser emitido.

---

## 5. Regras de trabalho

- **Nunca `git add -A`.** Arquivo por arquivo.
- **Um `npm run dev` por vez.** A quarentena de rotas trava o segundo. Matar o dev
  deixa uma trava órfã do Next (*"Another next build process is already running"*);
  `rm -rf .next` resolve.
- **Migration é incremental e tem rollback.** Nada de resetar banco.
- **Não afrouxe catraca para passar.** Os tetos (cor cravada, tamanho arbitrário,
  cobertura de schema) só descem. Subir um teto sem correção transforma dívida em
  permissão.
- **Medir antes e depois.** Mudança visual sem medição não entra. Quando não dá
  para medir, o certo é **declarar a pendência com o motivo** — há exemplo disso
  em `components/atlas/app-shell.tsx`, na densidade que uma linha ligaria e que
  ficou desligada de propósito.

---

## 6. Onde olhar quando algo estiver errado

| pergunta | onde |
|---|---|
| qual commit está no ar? | `GET /api/version` |
| a operação está de pé? | `GET /api/ready` — distingue `ok` de `degraded` e diz o motivo |
| instalar em servidor | `GUIA_INSTALACAO_HOSTINGER.md` |
| agendamento dos workers | `config/workers-schedule.json` — instalar o crontab é **etapa do deploy**, não opcional |

`/api/version` compara o commit do artefato com o `ATLAS_BUILD_COMMIT` do ambiente.
Quando divergem ele responde `identidadeConfiavel: false` — e nesse estado
**nenhuma afirmação sobre "o que está no ar" vale**, inclusive as suas.
