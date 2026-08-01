begin;
-- Cache de prompt e procedência da tarifa em ai_usage_events.
--
-- Sem cached_input_tokens a economia de cache de prefixo é INOBSERVÁVEL: a razão
-- "tokens em cache / tokens de entrada" não podia ser calculada por nenhuma
-- consulta, e todo token de entrada era precificado à tarifa cheia.
--
-- pricing_source registra qual par (provedor, modelo) sustentou o preço daquela
-- linha. Sem isso, comparar custo antes/depois mistura linhas precificadas por
-- tabelas diferentes — e linhas sem tarifa (custo NULL) com linhas medidas.
alter table public.ai_usage_events add column if not exists cached_input_tokens integer not null default 0;
alter table public.ai_usage_events add column if not exists cache_write_tokens integer not null default 0;
alter table public.ai_usage_events add column if not exists pricing_source text;
alter table public.ai_usage_events drop constraint if exists ai_usage_cache_tokens_non_negative;
alter table public.ai_usage_events add constraint ai_usage_cache_tokens_non_negative check (
  coalesce(cached_input_tokens, 0) >= 0 and coalesce(cache_write_tokens, 0) >= 0
);
commit;
