# PRODUCT_DECISIONS_REQUIRED — o que só o dono do produto pode decidir

Estes itens **não** foram alterados. Cada um tem opções concretas e a consequência de cada uma.
Nenhum é ambíguo por falta de análise — são ambíguos porque a escolha é de negócio.

---

## D-1 · A home do CRM: `/dashboard` é redirect ou tela completa?

**Situação:** o repo transformou `/dashboard` em **rota de compatibilidade que redireciona**
para o Command Center — decisão documentada no próprio código ("Fusão Início → Sala de comando:
o Command Center passou a ser a única home"). O pacote Atlas One traz um dashboard completo e
independente de 1.424 linhas.

| opção | consequência |
|---|---|
| **A. Manter o redirect** (recomendado) | Preserva a consolidação já feita. 16 lugares apontam para `/dashboard` e continuam funcionando. |
| B. Restaurar o dashboard completo | Desfaz a fusão; passa a haver duas homes concorrentes; exige redecidir o que vive em cada uma. |

---

## D-2 · Política de rollback: voltar para o V2 ou para o release anterior do V3?

**Situação:** o repo implementa "rollback para o V2 preservado" (campo `targetV2Url`). O Atlas One
mudou a política para "rollback para release anterior do V3", exigindo versão, artefato imutável e
evidência de Storage — e só conta ensaios marcados com `ATLAS_V3_RELEASE_ROLLBACK:`.

**Consequência escondida:** adotar a versão do ZIP **invalida toda a evidência de ensaio já
registrada** (ensaios antigos não têm o marcador), e `rollbackPassed` vira `false` — travando o
aceite executivo até que novos ensaios sejam feitos.

| opção | consequência |
|---|---|
| **A. Manter o V2 como alvo** | Nada muda; a evidência atual continua válida. |
| B. Adotar release anterior do V3 | Política mais moderna, mas exige refazer os ensaios e atualizar o formulário (`targetV2Url` → `targetReleaseUrl`). Requer copiar `lib/governance/recovery-contract.ts`, que não existe no repo. |
| **C. Só as guardas novas** (bom meio-termo) | Importar apenas a exigência de healthcheck 200–399 e a validação de que a URL de destino é diferente da atual — sem mudar a política nem invalidar evidência. Risco baixo. |

---

## D-3 · Quarentena de rotas: amputar o CRM até o núcleo "Atlas One"?

**Situação:** `scripts/legacy-route-paths.mjs` do ZIP amplia a quarentena de 22 para 38 rotas.
**30 caminhos que existem hoje** sairiam do build — entre eles `atlas-v2`, `atlas-2030`,
`atlas-v3`, `agents`, `ai-insights`, `analytics`, `approvals`, `automation`, `chat`, `creatives`,
`intelligence`, `kanban`, `notifications`, além de 8 route groups inteiros e 5 componentes Atlas.

| opção | consequência |
|---|---|
| **A. Manter as 22** (recomendado por ora) | Nada sai do ar. |
| B. Adotar as 38 | Produto fica menor e mais focado, mas 30 telas somem. É decisão de escopo comercial, não de merge. |

---

## D-4 · `currentPhase`: 101 (repo) ou 164 (ZIP)?

**Situação:** o ZIP declara `currentPhase: 164` e um `strategicRoadmap` até a fase 374. O repo
está em 101 e só tem verificadores até `check-evolution-phase-101.mjs`.

Nenhum script lê `strategicRoadmap` hoje. Declarar 164 faria o programa afirmar 63 fases sem
artefato de evidência correspondente.

| opção | consequência |
|---|---|
| **A. Manter 101 e importar só o roadmap** (recomendado) | O plano fica registrado sem alegar entrega. |
| B. Adotar 164 | Alinha com a linha Atlas One, mas desacopla o número da evidência. |

---

## D-5 · A página `/leads/actions`: hoje são 4 botões que não fazem nada

**Situação:** o repo tem um stub de 281 bytes com botões inertes — o defeito "tela só visual"
do próprio protocolo. O ZIP tem a página real (333 linhas), bem construída, que lê o envelope
da API corretamente.

**O impedimento:** ela busca os destinos de transferência com **GET** em
`/api/v1/crm/leads/bulk-transfer`, e o repo só expõe **POST** nessa rota.

| opção | consequência |
|---|---|
| A. Importar a página como está | Listagem e seleção de leads funcionam; o bloco de transferência aparece **desabilitado**. Melhor que 4 botões mortos, mas entrega meia funcionalidade. |
| **B. Importar a página + criar o GET de destinos** (recomendado) | Funcionalidade completa. Custo: uma rota nova de leitura, ~1h, e precisa decidir quem pode ver quais destinos. |
| C. Não importar | O stub continua. |

---

## D-6 · Os 14 portões de qualidade vermelhos

**Situação:** dos 80 portões da cadeia `validate`, **14 reprovam** — todos já reprovavam antes
desta sessão (eram 24; dez foram corrigidos aqui e nenhum novo foi criado).

O caso `commercial-hierarchy:check` mostra por que isso não é só "consertar o código": o portão
exige que a rota de equipe chame o RPC `manage_commercial_profile`, **mas a migration que cria
esse RPC (`20260717072714`) não está aplicada no banco vivo**. Fazer o portão ficar verde
quebraria a gestão de equipe em produção.

**CORREÇÃO IMPORTANTE (verificado ao vivo em 2026-07-24):** o diagnóstico de "migrations não
aplicadas" estava **errado**. O `atlas-v3-homologacao` tem **176 migrations aplicadas** e
**todos os 12 RPCs** que os portões exigem. O que existe é uma separação entre schema e dado:

| projeto | tabelas | leads | quem aponta |
|---|---|---|---|
| `atlas-v3-homologacao` | 176 | **0** | `.env.local` (dev) |
| `atlas-ai-crm-v1` | 24 | **17.151** | `.env.hostinger` (deploy) |

O deploy aponta para o banco **sem** os RPCs. Ligar o código a eles hoje funcionaria em
desenvolvimento e quebraria no Hostinger.

| opção | consequência |
|---|---|
| **A. Apontar o deploy para homologação** | Destrava os 12 portões de uma vez. Custo: a base está **vazia** — precisa da carga dos dados, que envolve 17.151 leads reais (PII). |
| B. Migrar o `atlas-ai-crm-v1` para o schema V3 | Mantém o dado onde está, mas é operação sobre base com dado de cliente — não é exercício de schema. |
| C. Manter como está | Os 12 portões seguem vermelhos por um motivo agora preciso e documentado. |

**Princípio aplicado em toda a sessão:** nenhum portão foi relaxado para produzir verde.
Quando o verde exigia quebrar produção, o vermelho ficou — documentado.

---

## D-7 · O favicon simplificado é intencional?

**Situação:** `check-atlas-logo` reprovava em 4 casos. Dois eram deriva de nome de token
(corrigidos em `8fc5cfc7` — as cores da marca nunca mudaram, viraram tokens white-label).

Os **dois restantes são sobre o favicon**: `app/icon.svg` desenha a estrela igual ao
componente, mas **omite a órbita e o planeta**, e o caso 20 aponta uma referência de gradiente
que o parser não consegue casar. O comentário dentro do próprio SVG justifica a simplificação —
em 16×16 px, órbita e planeta viram ruído.

| opção | consequência |
|---|---|
| **A. Ratificar a simplificação** (recomendado) | Ajustar os casos 20 e 22 para aceitarem que o favicon é uma redução deliberada da marca, não uma cópia. O portão fecha. |
| B. Igualar a geometria | O favicon passa a ter órbita e planeta; fica fiel à marca e ilegível no tamanho real. |
| C. Deixar como está | O portão segue vermelho por um motivo conhecido e aceito. |

Hoje o portão reprova **apenas** por isto — todo o resto foi resolvido.
