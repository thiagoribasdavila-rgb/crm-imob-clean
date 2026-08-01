# Campanha Spin Mood — semente da 1ª campanha Meta autônoma do Atlas

Este diretório guarda o **brief da primeira campanha** que o Atlas vai criar e gerir
de forma autônoma no Meta. Serve como entrada (spec) para o módulo de criação de
campanhas a ser construído.

## Arquivos
- **`campaign-spec.json`** — spec estruturado (produto, inventário/preços, criativos,
  copy morador+investidor, segmentação, formulário com qualificador de renda,
  orçamento, governança e o loop Andromeda). Fonte de verdade da campanha.

## Assets (fora do git — binários)
Ficam em `~/Downloads/Spin-Mood-Campanha/`:
- `videos/1-PRINCIPAL-morador-15s.mp4` (principal), `2-morador-18s`, `3-investidor-…`
- `book/Spin-Mood-Book.pdf` (enviar ao lead)
- `textos/COPY-PARA-COLAR.txt` + kits

## O que já existe no Atlas (loop de resultado)
Ingestão de leads (`app/api/webhooks/meta`), insights (`lib/meta/insights.ts`),
CAPI/conversions (`lib/meta/conversions.ts`), inteligência de campanha
(`lib/meta/campaign-intelligence.ts`), aprendizado (`lib/meta/andromeda-learning-loop.ts`),
cascata (`lib/distribution/hierarchical-cascade.ts`), score (`lib/ai/conversion-predictor.ts`).

## O que FALTA (a feature nova)
**Criação de campanha** via Meta Marketing API (hoje o Atlas só lê/analisa/devolve, não cria).
Guardrails inegociáveis: **aprovação humana antes de publicar**, **teto de orçamento**,
auditoria por ação, kill-switch. Ver `campaign-spec.json → governance`.

> Plano de implementação: será desenhado como onda do SALTO V4 (ver `docs/SALTO_ATLAS_V4.md`).
