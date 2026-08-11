# Atlas One V3000 — Fase 8: gate autenticado de paridade da release

## Resultado

A Fase 8 está concluída como **gate de paridade**, com resultado **BLOQUEADO
PARA PROMOÇÃO**. O piloto de Notificações está presente e aprovado no código
local, mas a release publicada na Hostinger ainda não contém a rota
`/notifications`.

Essa diferença impede uma homologação visual real em desktop e mobile. A fase
não promove o template, não cria uma falsa aprovação e não modifica dados
comerciais.

## Evidência autenticada

| Verificação | Resultado factual |
| --- | --- |
| Sessão no domínio real | autenticada e válida |
| URL acessada | `https://atlasaios.com.br/notifications` |
| Resposta visual | página 404 do próprio Atlas |
| Mensagem | “Esta rota não está disponível” |
| Avisos no console | 0 |
| Erros no console | 0 |
| Mutação de dados | 0 |

O 404 comprova que a sessão e o shell publicados responderam, porém o artefato
implantado não possui a rota do piloto local. Não houve tentativa de criar,
editar, ler ou dispensar lembretes na operação real.

## Estado dos gates

| Gate | Estado | Motivo |
| --- | --- | --- |
| Contrato local | APROVADO | rota, template e ilha operacional existem |
| Release Hostinger | BLOQUEADO | rota ausente no artefato publicado |
| Desktop autenticado | BLOQUEADO | não há tela do piloto para validar |
| Mobile autenticado | BLOQUEADO | não há tela do piloto para validar |
| Teclado e foco | BLOQUEADO | não pode ser provado na release atual |
| Ações reais | BLOQUEADO | nenhuma mutação deve ocorrer sobre um 404 |
| Promoção para segunda página | NÃO ELEGÍVEL | paridade ainda não comprovada |

## Contratos locais preservados

- página Server Component com uma única ilha cliente;
- `GET` e `PATCH /api/v1/task-reminders`;
- sessão Supabase e token Bearer existentes;
- Realtime filtrado pelo responsável;
- RLS e isolamento por organização;
- loading, vazio, erro recuperável e feedback de ação;
- skip link, alvo focável, foco visível e layout mobile-first;
- nenhuma automação comercial silenciosa.

## Decisão operacional

O piloto não está homologado em produção. Ele somente poderá ser promovido
depois que a release controlada da Hostinger incluir o código local atual e a
mesma URL carregar o workspace autenticado.

## Próxima prova obrigatória

1. incluir o piloto atual na próxima release controlada, sem alterar banco;
2. confirmar que `/notifications` deixa de responder 404;
3. repetir a prova autenticada em desktop e mobile;
4. validar skip link, foco, loading, vazio e erro recuperável;
5. executar leitura/dispensa somente com registro seguro destinado ao teste;
6. promover o template apenas se todos os gates forem aprovados.

Até essa prova, a implementação continua isolada e reversível, e nenhuma
segunda página deve adotar o template V3000.
