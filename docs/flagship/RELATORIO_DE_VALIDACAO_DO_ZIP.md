# RELATÓRIO DE VALIDAÇÃO DO PACOTE

**2026-07-31.** O pacote foi gerado por `git archive` — **só arquivos
rastreados**, o que torna estruturalmente impossível vazar `.env`, `node_modules`
ou artefato de build.

## O PACOTE

| campo | valor |
|---|---|
| origem | `git archive --format=zip HEAD` |
| branch | `claude/atlas-v3-entregas` |
| tamanho | **6.617.080 bytes** (6,3 MB) |
| arquivos | **2.579** |
| `node_modules` no pacote | **0** |
| `.env` / `.env.local` real | **0** |
| exemplos de ambiente presentes | `.env.example`, `.env.production.example` |

> O SHA-256 e o commit finais estão em `RELEASE_NOTES_v1.0.0.md`, porque o pacote
> foi **regerado** depois da correção descrita abaixo. Publicar aqui o hash do
> pacote reprovado seria distribuir o número errado.

## A PROVA, PASSO A PASSO

Diretório temporário vazio → extração → instalação limpa, **sem `.env`**:

| etapa | resultado |
|---|---|
| `unzip` | 2.579 arquivos |
| `npm ci` | **exit 0** |
| `npx tsc --noEmit` | **exit 0** |
| `npm run build` | **exit 0** |
| `npm run test:contracts` | **exit 1 — 1 FALHA** |

## O QUE A PROVA PEGOU — e que nenhuma outra verificação pegaria

```
✖ toda exceção declarada existe e realmente cita o aposentado
  AssertionError: exceção declarada para arquivo inexistente: hostinger.env
```

| | máquina de desenvolvimento | pacote extraído |
|---|---:|---:|
| testes executados | 1.191 | **1.179** |
| aprovados | 1.182 | 1.165 |
| **falharam** | 0 | **1** |
| pulados | 9 | **13** |

**A causa:** `config/supabase-projetos.json` declarava exceção para
`hostinger.env`, que está no `.gitignore`. O arquivo existe nesta máquina e
**não existe no pacote, por desenho**. O contrato exigia que toda exceção
apontasse para um arquivo existente — e tratava as duas ausências como a mesma
coisa.

**"Arquivo sumiu do repositório" e "arquivo nunca entra no repositório" são
opostos.** A primeira é exceção podre e precisa reprovar. A segunda é exceção
legítima para arquivo local.

## A CORREÇÃO — mais forte, não mais frouxa

Exceção sem arquivo passou a ser aceita **somente quando o `.gitignore` a
explica** (`git check-ignore`). Sem essa prova, continua reprovando.

**Verificado adversarialmente:** adicionei
`docs/ARQUIVO_QUE_NUNCA_EXISTIU.md` à lista de exceções e rodei o contrato.

| cenário | resultado |
|---|---|
| exceção podre (arquivo inexistente e não ignorado) | **REPROVOU** ✔ |
| lista restaurada | passou ✔ |

Sem esse segundo teste, a correção poderia ter transformado a guarda num "sempre
passa" — que é como esta base já perdeu portões antes.

## O QUE ESTA PROVA **NÃO** COBRIU

| etapa pedida | estado | por quê |
|---|---|---|
| configurar `.env` a partir do `.env.example` | **não executado** | exigiria credenciais reais no pacote de teste |
| iniciar o sistema e fazer login | **não executado** | idem — sem Supabase configurado não há autenticação |
| completar uma jornada principal no pacote extraído | **não executado** | depende do login |

**Consequência honesta:** está provado que o pacote **instala, compila e passa nos
contratos** sozinho. **Não** está provado que ele *opera* sozinho — isso exige
um ambiente com credenciais, que é a etapa de homologação, não de empacotamento.
