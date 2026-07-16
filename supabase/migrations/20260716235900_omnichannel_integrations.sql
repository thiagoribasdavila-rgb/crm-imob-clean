-- Amplia o hub omnichannel sem armazenar tokens no banco.
alter table public.integrations drop constraint if exists integrations_provider_check;
alter table public.integrations add constraint integrations_provider_check check (provider in (
  'meta','whatsapp','google','google_ads','youtube','tiktok_ads','linkedin_ads',
  'zap_imoveis','vivareal','olx_imoveis','quintoandar','imovelweb','chavesnamao',
  'website','webhook','calendar','sheets','n8n','make','custom'
));
