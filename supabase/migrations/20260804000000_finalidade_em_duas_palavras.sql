-- SEIS GRAFIAS PARA DOIS CONCEITOS.
--
-- ── O que foi medido no banco vivo em 03/08/2026 ────────────────────────────
--
--   morar .......... 58        investir ........ 37
--   Moradia ........ 44        Investimento .... 39
--   moradia ......... 8        investimento ..... 4
--
-- 190 leads com finalidade declarada, escrita de seis jeitos. `purpose` é o
-- único destes campos que a ingestão preenche, e o formulário da Meta manda o
-- rótulo como o cliente o viu — daí "Moradia" com maiúscula convivendo com
-- "morar" do mapeamento antigo.
--
-- ── Por que isto NÃO é cosmética ────────────────────────────────────────────
--
-- Dois consumidores leem o valor CRU e ambos erram com ele:
--
--   · `app/(crm)/pipeline/page.tsx` filtra por substring — procurar "moradia"
--     não encontra as 58 leads gravadas como "morar";
--   · `lib/ai/governed-real-estate-context.ts` manda `purpose` direto para o
--     modelo, que recebe dois vocabulários para a mesma intenção e não tem como
--     saber que são a mesma coisa.
--
-- ── O QUE NÃO SE PERDE ──────────────────────────────────────────────────────
--
-- 178 das 190 têm o original preservado em `notes` ("Objetivo declarado: …"),
-- gravado pelo próprio construtor do payload. Nas 12 restantes a tradução é
-- exata em significado: morar→moradia, investir→investimento.
--
-- Só as SEIS grafias medidas são tocadas. Qualquer outro valor fica como está —
-- resposta que ninguém previu é informação, e trocá-la por um rótulo canônico
-- para "limpar a base" destruiria o que o cliente respondeu. É a mesma regra de
-- `normalizarFinalidade` em lib/crm/ficha-do-comprador.ts, que reconcilia na
-- LEITURA e preserva o desconhecido.
--
-- ── SEGURANÇA ───────────────────────────────────────────────────────────────
--
-- Toca uma coluna, em linhas nomeadas por valor exato. Não altera schema.
-- Reaplicar não faz nada (os valores de destino não casam com a lista de
-- origem).
--
-- ROLLBACK: não há volta automática, e não deveria haver — desfazer
-- reintroduziria as seis grafias. O original de 178 linhas continua em `notes`.

update public.leads
   set purpose = 'moradia'
 where purpose in ('morar', 'Moradia', 'MORADIA', 'Morar');

update public.leads
   set purpose = 'investimento'
 where purpose in ('investir', 'Investimento', 'INVESTIMENTO', 'Investir');
