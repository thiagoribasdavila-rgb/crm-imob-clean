# Fase 91 — Inteligência de campanhas multicanal

## Entrega

O Atlas passa a comparar Meta, Google Ads, YouTube, TikTok Ads e portais imobiliários em um contrato único diário. A camada não substitui `campaigns`: preserva os totais existentes e adiciona snapshots versionados para auditoria.

As métricas declaradas pela mídia (`impressions`, `clicks`, `platform_leads`) ficam separadas do funil confirmado no CRM (`crm_leads`, qualificadas, visitas, propostas, vendas e receita). O painel usa BRL e só habilita ranking decisório após 30 leads CRM.

## Segurança e governança

- nenhum dado pessoal entra nos fatos de campanha;
- diretor, superintendente e gerente consultam; somente diretor e superintendente importam;
- toda revisão cria uma versão e desativa apenas o snapshot corrente anterior;
- hash SHA-256 identifica a origem do lote;
- modelos de atribuição não são somados silenciosamente;
- nenhuma verba, campanha ou público é alterado automaticamente.

## Homologação externa

1. aplicar a migration da fase;
2. importar um snapshot de teste por canal e confirmar isolamento entre duas organizações;
3. reenviar um dia corrigido e conferir versão anterior preservada;
4. comparar gasto, leads e vendas com cada plataforma e com o CRM;
5. validar campanha com 29 e 30 leads para confirmar o gate de amostra;
6. conectar credenciais oficiais somente após essa conciliação.

Os conectores estão preparados pelo contrato de ingestão, mas não são considerados ativos enquanto credenciais e dados reais não forem homologados.
