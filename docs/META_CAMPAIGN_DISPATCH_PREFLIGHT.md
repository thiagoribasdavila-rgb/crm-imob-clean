# ATLAS V3 — Pré-voo de disparo de campanhas Meta

Objetivo: validar se o Atlas consegue preparar campanhas Meta Lead Ads pelo fluxo governado, sem criar anúncio, sem ativar campanha e sem gastar verba.

## Variáveis necessárias

Na Hostinger, preencha:

- `META_ADS_ACCESS_TOKEN`
- `META_AD_ACCOUNT_ID`
- `META_GRAPH_API_VERSION`
- `META_PAGE_ID`
- `META_LEAD_FORM_ID`
- `META_LEAD_ACCESS_TOKEN` quando o token de leads for separado do token de ads

Opcional:

- `META_INSTAGRAM_ACTOR_ID`

## Teste dentro do Atlas

Com login de liderança/diretoria, chame:

```txt
/api/v1/integrations/meta/campaign-dispatch-test
```

Também é possível testar uma página/formulário específico:

```txt
/api/v1/integrations/meta/campaign-dispatch-test?pageId=SEU_PAGE_ID&leadFormId=SEU_FORM_ID
```

## Interpretação

- `ok`: conexão pronta para seguir para prévia/criação pausada.
- `warning`: conta conectada, mas falta completar página, formulário ou mídia.
- `blocked`: token, conta ou permissão impedem o disparo.

O retorno nunca expõe token. Identificadores sensíveis saem mascarados.

## Fluxo seguro de campanha

1. Rodar o pré-voo.
2. Gerar prévia da campanha em `/api/v1/marketing/campaign-intake`.
3. Registrar aprovação humana.
4. Criar campanha real pausada.
5. Conferir no Meta Ads Manager.
6. Ativar somente após decisão do diretor.

Regra de segurança: o Atlas não ativa campanha nem altera verba no pré-voo. O disparo real cria estruturas pausadas; gasto só acontece por ativação aprovada.

## Andromeda

Andromeda não é uma API separada. O Atlas ajuda enviando sinais melhores para a Meta:

- lead recebido;
- lead qualificado;
- contato realizado;
- visita marcada;
- proposta;
- venda;
- perda qualificada.

Esses sinais alimentam o aprendizado das campanhas pela Meta Conversions API e pelo histórico comercial do CRM.
