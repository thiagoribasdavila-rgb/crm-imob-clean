# VALUE_ADD_IMPROVEMENTS — melhorias adicionais desta execução

Limite recomendado: 5. Registradas até agora: **3**.

Cada uma passou pelo Value-Add Gate antes de ser executada.

---

## VA-1 — o scanner de segredos deixava passar segredo no início de arquivo

**MELHORIA:** corrigir o uso de regex com `/g` junto de `.test()` em `scripts/scan-secrets.mjs`.
**PROBLEMA:** `RegExp.prototype.test()` com a flag `/g` guarda `lastIndex` entre chamadas. Como
os mesmos objetos de regex eram reusados para todos os arquivos, depois de um arquivo dar match
a varredura do próximo **começava do meio** — um segredo nas primeiras linhas escapava.
**EVIDÊNCIA:** reproduzido isoladamente. Com dois arquivos contendo a mesma chave AWS falsa, o
primeiro acusa `true` e o segundo `false`. Teste de regressão permanente: caso 1b de
`tests/contracts/secret-scan.test.mjs`.
**RESULTADO:** aumenta confiabilidade e protege dados — o portão de segredos volta a varrer
100% do conteúdo de 100% dos arquivos.
**ESFORÇO:** ~10 min. **RISCO:** baixo (só amplia detecção).
**TESTE:** `npm run test:contracts` (caso 1b) + `npm run security:secrets`.
**ROLLBACK:** `git revert af458ea7`.
**MOTIVO PARA EXECUTAR AGORA:** encontrado dentro do arquivo que a seção 5 mandava corrigir;
deixar passar seria entregar um scanner "verde" que ainda tem cego.

---

## VA-2 — detecção de JWT e de token Slack não existia

**MELHORIA:** adicionar os dois padrões ao scanner.
**PROBLEMA:** o scanner cobria OpenAI, Perplexity, GitHub, AWS e chave privada PEM. **JWT não
era detectado** — justamente o formato das chaves de service role do Supabase, o segredo mais
sensível deste projeto. Token Slack também não.
**EVIDÊNCIA:** a lista `tokenPatterns` original não continha nenhum dos dois. Varredura do repo
após a inclusão: 0 achados reais (nenhum JWT vazado hoje) — a proteção é preventiva.
**RESULTADO:** protege dados; fecha a lacuna mais perigosa do projeto.
**ESFORÇO:** ~15 min. **RISCO:** baixo. O padrão de JWT exige assinatura de 20+ caracteres
(um HS256 real tem 43), então fixtures didáticos com sufixo curto não viram falso positivo —
comportamento fixado pelo caso 2 do teste.
**TESTE:** `npm run test:contracts` (casos 1, 2 e 6).
**ROLLBACK:** `git revert af458ea7`.
**MOTIVO PARA EXECUTAR AGORA:** custo marginal zero enquanto o arquivo já estava aberto, e a
seção 5 pedia explicitamente para não desativar detecção de JWT — que não existia.

---

## VA-3 — três vulnerabilidades ALTAS bloqueando a cadeia de validação

**MELHORIA:** subir `next` de 16.2.10 para 16.2.11 (traz `sharp` 0.34.5 → 0.35.0).
**PROBLEMA:** `npm audit --omit=dev --audit-level=high` reprova com 3 vulnerabilidades altas:
`sharp <0.35.0` herda CVEs do libvips (CVE-2026-33327, CVE-2026-33328, CVE-2026-35590,
CVE-2026-35591). `sharp` não é dependência direta — entra por `next@16.2.10`.
**EVIDÊNCIA:** `npm ls sharp` → `next@16.2.10 └── sharp@0.34.5`. A cadeia `validate` para no
3º passo (`security:dependencies`), com saída 1. **Falha pré-existente**, apenas encoberta:
antes desta sessão a cadeia já morria no 1º passo (`security:secrets`), então ninguém chegava
a ver este bloqueio.
**RESULTADO:** elimina erro, protege dados e **desbloqueia a suíte `validate` inteira** —
objetivo 5 desta execução.
**ESFORÇO:** ~30 min com validação completa. **RISCO:** médio — é bump de dependência, mitigado
por rodar typecheck, lint, 69 testes, build de produção e a cadeia `validate` depois.
**TESTE:** `npm audit --omit=dev --audit-level=high` + `npm run validate`.
**ROLLBACK:** `git revert` do commit (package.json + package-lock.json voltam juntos).
**MOTIVO PARA EXECUTAR AGORA:** não é conveniência nem biblioteca nova — é a correção de
segurança que o próprio pacote Atlas One já tinha aplicado (`next 16.2.11`, `sharp 0.35.0`),
e é o que impede a base de ficar estável. Importação pontual da fonte seletiva autorizada.
