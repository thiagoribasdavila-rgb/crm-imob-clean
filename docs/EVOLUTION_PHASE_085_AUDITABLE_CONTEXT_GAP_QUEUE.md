# ATLAS AI OS — Fase 85/3000

## Objetivo

Transformar as lacunas de projeto e origem medidas na Fase 84 em uma fila curta, verificável e útil para revisão humana, sem reescrever fatos históricos nem criar prioridade comercial artificial.

## Problema resolvido

O sistema já conseguia medir quanto da memória estava contextualizada, mas o gestor ainda precisava descobrir manualmente quais resultados estavam sem projeto, sem origem ou sem ambos. Também era necessário separar o que pode ser melhorado no cadastro atual da lead do que já pertence a um fato histórico imutável.

## Alterações realizadas

- Criado contrato tipado para lacunas de projeto e origem por resultado observado.
- A fila considera apenas resultados humanos confirmados no período atual e mantém somente o resultado mais recente de cada tarefa.
- Resultados com as duas dimensões ausentes aparecem antes; dentro do mesmo grupo, o fato observado mais antigo aparece primeiro.
- O limite visual é de cinco itens, com saldo restante explícito para evitar poluir a rotina.
- Lacunas de snapshot histórico são marcadas como fatos imutáveis e orientam apenas os próximos registros.
- Lacunas legadas apontam para a página já existente da lead, onde o contexto atual pode ser revisado para resultados futuros.
- A fila usa todos os tipos de resultado confirmado. O filtro supervisionado por categoria não esconde uma lacuna existente.
- A API autenticada entrega a fila no mesmo payload e não adiciona fetch, tabela, migration ou escrita.

## Impacto operacional

Diretores e gestores recebem uma lista pequena do que realmente precisa de contexto humano. O corretor não vê milhares de registros antigos nem uma nova caixa de trabalho paralela: ele chega à lead existente, corrige o cadastro quando aplicável e preserva o histórico como foi registrado.

## Segurança e governança

- Sessão válida, organização resolvida, RLS do usuário e resposta `no-store` permanecem obrigatórios.
- A fila não inclui telefone, e-mail ou outro contato pessoal.
- Nenhum modelo generativo é chamado.
- Nenhuma alteração de lead, evento, tarefa, distribuição ou automação é executada pela leitura.
- Snapshot histórico não recebe backfill, mesmo quando o cadastro atual possui outro valor.
- A ordenação usa apenas número de dimensões ausentes e idade factual; não infere valor, conversão, urgência comercial ou chance de venda.

## Compatibilidade

- Resultados novos continuam usando o snapshot histórico versionado das Fases 82 e 83.
- Resultados antigos continuam usando o fallback atual explicitamente identificado como legado.
- A revisão abre a rota de Lead 360 já existente.
- Nenhuma mudança de schema, dependência ou configuração de Hostinger foi necessária.

## Risco identificado

Editar o projeto ou a origem atual de uma lead antiga não prova qual era o contexto no momento de um resultado passado. Por isso a interface informa que a alteração melhora somente registros futuros e mantém a evidência histórica imutável.

## Checklist de validação

- [x] Projeto e origem são detectados separadamente.
- [x] Ausência das duas dimensões recebe precedência factual.
- [x] Empates usam o fato mais antigo, sem score comercial.
- [x] Tarefas duplicadas são consolidadas pelo resultado mais recente.
- [x] Histórico e fallback legado recebem orientações diferentes.
- [x] A fila permanece curta e informa o saldo não exibido.
- [x] O filtro por tipo de resultado não oculta lacunas.
- [x] Autenticação, tenant, RLS e `no-store` foram preservados.
- [x] Nenhuma escrita downstream ou chamada de IA foi adicionada.
- [x] Build e ZIP continuam reservados ao gate de release.

## Próxima etapa recomendada

Fase 86 — prevenir novas lacunas no momento da confirmação humana, mostrando projeto e origem disponíveis antes de salvar o resultado, sem bloquear o corretor nem preencher valores automaticamente.
