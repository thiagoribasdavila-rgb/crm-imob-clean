# ATLAS AI OS — Fase 78/3000

## Objetivo

Tornar explícita a idade do último fato humano confirmado na memória comercial selecionada, ajudando corretor e liderança a reconhecer quando o recorte precisa de atualização.

## Problema resolvido

O Atlas já mostrava contagens, comparação, suficiência e evidências auditáveis. Porém, uma base numerosa poderia parecer atual mesmo quando o fato mais recente já estivesse envelhecido. A fase 78 acrescenta um sinal operacional de recência sem transformar idade em nota de qualidade, conversão ou previsão.

## Alterações realizadas

- Criado contrato tipado de recência para a janela atual.
- Reutilizado o último resultado humano confirmado por tarefa já presente na amostra filtrada.
- Adotados limites transparentes: atual até 72 horas, atenção entre 72 e 168 horas e desatualizada após 168 horas.
- Mantido estado específico quando o recorte atual não possui fatos confirmados.
- Exibidos horário do último fato e quantidade de resultados presentes no recorte.
- Adicionado selo compacto no Copilot, sem novo gráfico ou painel extenso.
- Declarado na própria interface que recência não avalia qualidade, intenção, conversão ou chance de venda.
- Mantidos período, filtro, organização, hierarquia, RLS e resposta `no-store`.
- Nenhuma consulta, tabela, migration, chamada de modelo ou escrita operacional foi adicionada.

## Impacto operacional

O usuário deixa de tomar uma contagem antiga como retrato atual da operação. A liderança sabe quando solicitar novos registros humanos e o corretor entende quando a memória precisa ser alimentada, sem receber uma recomendação automática ou uma falsa pontuação.

## Segurança e governança

- A API continua exigindo sessão e contexto de acesso válidos.
- O cálculo ocorre depois do recorte por organização e hierarquia.
- Apenas resultados humanos confirmados, vinculados a tarefa e lead, participam.
- O filtro supervisionado também se aplica à recência.
- O indicador não expõe telefone, e-mail, mensagens ou credenciais.
- Não há modelo generativo, previsão, causalidade ou ação downstream.
- Não houve mudança de schema nem criação de tabela pública.

## Risco identificado

O selo considera o fato mais recente do recorte, não a idade individual de toda a carteira. Assim, um único registro recente não prova que todas as leads estejam atualizadas. A interface limita explicitamente o significado do indicador e a próxima fase poderá detalhar a recência por contexto sem criar ranking.

## Checklist de validação

- [x] Recência usa somente a janela atual selecionada.
- [x] Apenas o último resultado humano confirmado por tarefa é considerado.
- [x] Evento futuro, inválido ou não confirmado não participa.
- [x] Limites de 72 e 168 horas são explícitos.
- [x] Estado sem fatos não é mostrado como atualizado.
- [x] Filtro de resultado recorta o indicador.
- [x] Recência não é apresentada como qualidade ou previsão.
- [x] Sem nova consulta ou chamada de IA externa.
- [x] Sem escrita no banco ou alteração de schema.
- [x] Build e ZIP mantidos para o gate único de release.

## Próxima etapa recomendada

Fase 79 — mostrar a recência factual por projeto e origem com contagens brutas, sem ranking, taxa, causalidade ou ação automática.
