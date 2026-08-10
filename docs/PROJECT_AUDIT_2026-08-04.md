# Auditoria do projeto Atlas One — 04/08/2026

## Resultado executivo

O código ativo compila e os contratos locais estão consistentes. A base é um bom candidato de homologação, mas ainda não pode ser chamada de produção comprovada: faltam a prova autenticada ponta a ponta no ambiente real, a paridade remota das migrations/RLS e a rastreabilidade por Git deste diretório.

Prontidão geral baseada em evidências: **73/100**.

| Dimensão | Nota | Evidência |
| --- | ---: | --- |
| Código e build | 30/30 | TypeScript, lint e build de produção aprovados |
| Segurança e dados (estático) | 18/20 | scan de segredos, contratos RLS e grants aprovados; banco remoto ainda não comparado |
| Testes automatizados | 12/20 | contratos locais aprovados; jornada autenticada real ainda sem credenciais locais |
| Runtime e integrações | 3/15 | configuração mínima de Supabase/cron ausente neste workspace; Meta, WhatsApp e IA não comprovados ao vivo |
| Release e rollback | 8/10 | ZIP determinístico, checksum, inventário e relatório interno; ausência de Git reduz rastreabilidade |
| Manutenibilidade | 2/5 | arquivos e scripts excessivamente grandes e legado ainda presente |

## Inventário factual

- 274 páginas `page.tsx` encontradas; o contrato canônico identifica 94 páginas ativas.
- 156 APIs `route.ts`.
- 127 migrations Supabase.
- Aproximadamente 153 mil linhas de código-fonte.
- 610 scripts npm, com sobreposição relevante de gates históricos.
- `dist/` ocupava aproximadamente 109 MB e continha múltiplos ZIPs anteriores.
- Maiores concentrações: `app/globals.css` (14.812 linhas), Pipeline (3.392), Copilot Dock (2.678), Lead 360 (2.533) e Leads (1.932).
- Não há repositório Git reconhecido nesta pasta; a origem é identificada apenas por fingerprint SHA-256 do conteúdo.

## Gates executados

| Gate | Resultado inicial |
| --- | --- |
| Testes unitários/contratos | aprovado |
| Typecheck ativo | aprovado |
| Cobertura TypeScript ativa | 100% |
| ESLint sem warnings | aprovado |
| Build Next.js de produção | aprovado |
| Scan de segredos | 0 ocorrências |
| Contratos de entidades, dados e módulos | aprovado |
| Contratos Next.js 16 e rotas ativas | aprovado |
| Contratos Supabase grants/hardening | aprovado |
| Auditoria de dependências (high) | aprovado após correção segura do lockfile |
| E2E autenticado real | bloqueado por configuração/usuários de teste ausentes |
| Paridade Supabase remoto | não comprovada nesta máquina |

## Principais riscos e prioridades

### P0 — antes de produção

1. Restaurar rastreabilidade Git desta base canônica; sem isso não há rollback por commit.
2. Configurar de forma segura as variáveis de homologação e os usuários E2E por papel, sem incluí-los no ZIP.
3. Comparar migrations, funções, triggers, índices e RLS locais com o Supabase remoto antes de qualquer DDL.
4. Executar a jornada real: entrada de lead, distribuição, Pipeline, tarefa, relatório semanal e atribuição de campanha.

### P1 — próximo ciclo controlado

1. Atualizar Next/Prisma e dependências transitivas em branch própria; seis avisos moderados permanecem e exigem upgrades fora das faixas atuais.
2. Reduzir os 610 scripts para um conjunto canônico de gates, mantendo aliases históricos somente por compatibilidade temporária.
3. Dividir progressivamente telas e estilos muito grandes, sem redesenho funcional.
4. Revisar branches-alvo e gates do CI; a pasta atual não permite provar que os workflows publicados correspondem a esta fonte.
5. Normalizar referências residuais de marca principal para Atlas One.

### P2 — eficiência contínua

1. Aplicar retenção automática aos ZIPs antigos, preservando releases homologadas e seus checksums.
2. Consolidar acesso ao banco em uma camada server-only e reduzir consultas repetidas.
3. Medir latência real de Command Center, Leads, Pipeline e relatórios com dados representativos.
4. Isolar ou remover legado somente depois de prova de não utilização pelas rotas ativas.

## Correção segura já aplicada

O lockfile recebeu somente correções transitivas compatíveis (`npm audit fix`, sem `--force`). Os dois achados de severidade alta foram eliminados. Permanecem seis achados moderados que dependem de migração controlada de Next/Prisma e não foram forçados nesta release.

## Política de ZIP por alteração

- Nome imutável: `atlas-one-audited-AAAAMMDD-rNNN.zip`.
- Nunca sobrescrever uma release existente.
- Antes do pacote: testes de contrato, auditoria de dependências e gate completo com um único build de produção.
- Dentro do ZIP: manifesto, inventário SHA-256 e relatório dos testes sem valores de segredos.
- Ao lado do ZIP: checksum e resumo `.release.json`.
- Se qualquer gate falhar, nenhum ZIP auditado é emitido.

## Critério para 100/100

O percentual só deve subir após evidência operacional: configuração válida, E2E autenticado dos papéis, paridade remota de banco/RLS, jornada comercial real e rollback comprovado. Quantidade de telas, scripts ou migrations não aumenta a nota por si só.
