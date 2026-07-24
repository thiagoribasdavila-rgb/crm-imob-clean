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

## D-6 · Os 20 portões de qualidade vermelhos

**Situação:** dos 80 portões da cadeia `validate`, **20 reprovam** — todos já reprovavam antes
desta sessão (eram 24; três foram corrigidos aqui e nenhum novo foi criado).

O caso `commercial-hierarchy:check` mostra por que isso não é só "consertar o código": o portão
exige que a rota de equipe chame o RPC `manage_commercial_profile`, **mas a migration que cria
esse RPC (`20260717072714`) não está aplicada no banco vivo**. Fazer o portão ficar verde
quebraria a gestão de equipe em produção.

| opção | consequência |
|---|---|
| A. Aplicar as migrations pendentes | Destrava vários portões de uma vez. **Exige autorização de banco** e enfrentar o drift (a maioria das migrations não está aplicada). |
| B. Corrigir só os portões que não dependem do banco | Progresso real e seguro; ver a triagem em [KNOWN_RISKS.md](KNOWN_RISKS.md). |
| C. Aceitar conscientemente e documentar | O que está feito hoje: nenhum portão foi afrouxado para ficar verde. |

**Princípio aplicado em toda a sessão:** nenhum portão foi relaxado para produzir verde.
Quando o verde exigia quebrar produção, o vermelho ficou — documentado.
