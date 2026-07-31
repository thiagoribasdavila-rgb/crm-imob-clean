# DIAGNÓSTICO PRÉ-DEPLOY

**2026-07-31T14:07:55Z** · executado da máquina local, **sem alterar nada**.

# O ACHADO QUE MUDA O PLANO

> **A aplicação está VIVA e saudável em produção — e NÃO está no VPS
> `85.209.93.32` que foi diagnosticado.**

Publicar naquele VPS não atualizaria `atlasaios.com.br`. Criaria uma **segunda**
implantação, e o domínio continuaria servindo a que já existe.

## AS EVIDÊNCIAS

### 1. Existe origem viva, e ela fala com o banco

```
GET https://atlasaios.com.br/api/v1/ready → HTTP 200 · 0,20 s
cache-control: no-store
server-timing: atlas;dur=143
{"ok":true,"data":{"service":"atlas-api-platform","status":"ready",
 "latencyMs":143,"checks":{"database":{"ok":true,"latencyMs":65}}...
```

`cache-control: no-store` **e** um `latencyMs` de banco medido em 65 ms provam
que a resposta **não** vem de cache: há um processo Node executando consulta real
ao Supabase neste instante.

### 2. O DNS não aponta para o VPS diagnosticado

| | |
|---|---|
| `atlasaios.com.br` → A | **89.116.213.33** · **91.108.127.185** |
| VPS diagnosticado | **85.209.93.32** |
| veredito | **hosts diferentes** |

Nenhum dos dois IPs do domínio aceita SSH na 22 (são bordas de CDN).

### 3. A borda é a CDN da Hostinger

```
server: hcdn
x-nextjs-cache: HIT
x-nextjs-prerender: 1
strict-transport-security: max-age=63072000; includeSubDomains; preload
x-frame-options: DENY
```

Páginas estáticas vêm do cache da CDN; rotas de API atravessam até a origem.

### 4. O VPS `85.209.93.32` está vazio

Confirmado pelo diagnóstico do operador: PM2 sem aplicações, nenhum processo
Node, nenhum listener em 80/443/3000/3001/8080. **Coerente com não ser a origem.**

## CONCLUSÃO: ONDE A APLICAÇÃO ESTÁ, NINGUÉM SABE

A origem real pode ser hospedagem gerenciada da Hostinger, outro VPS, ou um
serviço de aplicação — **e isso precisa ser descoberto antes de qualquer deploy**,
no painel da Hostinger, olhando qual serviço está vinculado ao domínio.

**Fazer deploy no VPS diagnosticado agora seria publicar no lugar errado.**

# QUAL VERSÃO ESTÁ NO AR: NÃO É POSSÍVEL AFIRMAR

```
npm run commit-publicado:check
✘ a resposta NÃO declara `build`
```

A resposta de `/api/v1/ready` traz 8 chaves — e **nenhuma** delas é `build`,
`estado`, `filas`, `migrations`, `procedencia` ou `agendamento`.

Todas essas chaves existem no código desde 30/07. **A produção é anterior a elas.**
O código no ar é de antes de 30 de julho — antes de toda esta linha de trabalho.

| campo | produção | esperado no commit `c8dfef72` |
|---|---|---|
| `build` | **ausente** | `{ commit, time, migrations }` |
| `estado` | **ausente** | 1 dos 6 estados |
| `filas` · `migrations` · `procedencia` | **ausentes** | presentes |

# ACESSO SSH: BLOQUEADO NESTA SESSÃO

```
ssh -o BatchMode=yes root@85.209.93.32   → Permission denied (publickey,password)
ssh -o BatchMode=yes atlas@85.209.93.32  → Permission denied (publickey,password)
ssh -o BatchMode=yes ubuntu@85.209.93.32 → Permission denied (publickey,password)
```

Não há chave SSH nesta máquina (`~/.ssh/` sem `id_*`, sem entrada em `config`).
O servidor aceita senha — e **digitar senha não é operação que eu faça**.

**Consequência:** as fases 1, 2, 5, 6, 7, 9, 10 e 13 do briefing (backup no
servidor, Node 22, build remoto, migrations, PM2, Nginx, deploy, observabilidade)
**não podem ser executadas por mim nesta sessão.**

O que **foi** entregue: os scripts que executam cada uma delas, prontos para o
operador rodar com uma linha — ver `scripts/production/`.

# AS DUAS PERGUNTAS QUE PRECISAM DE RESPOSTA HUMANA

1. **Onde a aplicação roda hoje?** Painel da Hostinger → qual serviço está
   vinculado a `atlasaios.com.br`. Sem isso, qualquer deploy é aposta.
2. **O VPS `85.209.93.32` deve virar a nova casa,** ou o deploy deve ir para
   onde a aplicação já está? São caminhos diferentes e a escolha é de negócio.
