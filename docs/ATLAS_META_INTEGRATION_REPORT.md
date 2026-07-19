# ATLAS — Auditoria Meta Ads, Lead Ads e Andromeda

## Regra de evidência

Uma variável no servidor significa **configurada**, não **operacional**. O Atlas só mostra uma conexão como operacional depois de autenticação, permissão, webhook e evento real confirmados. Não aprovado sem teste real.

## Inventário auditado

| Item | Implementação Atlas | Critério para ativação real |
|---|---|---|
| Meta Marketing API | Credenciais detectadas pelo servidor, sem expor segredo | Consultar a conta autorizada com sucesso |
| Lead Ads | Webhook e captura preparados | Página, formulário e assinatura `leadgen` confirmados |
| Webhook | Verificação e assinatura protegidas | Receber uma lead de teste, deduplicar e responder `2xx` |
| Conversion API | Outbox, idempotência e eventos profundos preparados | Token, conta e primeiro evento aceito pela Meta |
| Feedback de vendas | Lead, qualificação, visita, proposta e venda modelados | Eventos entregues com atribuição e consentimento válidos |
| Andromeda | Ciclo de evidência e recomendação governada | Volume e profundidade suficientes, com decisão do diretor |

## O que Andromeda significa no Atlas

Andromeda não é uma API direta para receber “conhecimento do CRM”. É o sistema de recuperação e seleção de anúncios da Meta. O Atlas contribui com sinais melhores ao devolver eventos de conversão reais e consistentes pela Conversion API. Nenhum público, orçamento ou campanha é alterado automaticamente.

## Bloqueios que impedem falso positivo

- Credencial presente sem teste não vira selo verde.
- Evento sem consentimento ou identificador elegível não sai do Atlas.
- Falha entra em fila auditável; duplicata usa `event_id` estável.
- Sinais negativos permanecem internos.
- Alteração de campanha depende de decisão explícita do diretor.
- Business Manager, conta, página e formulários precisam ser confirmados no ambiente real.

## Sequência de homologação

1. Confirmar ativos e permissões no Meta Business Manager.
2. Enviar uma Lead Ad de teste e verificar criação única no CRM.
3. Executar um evento de teste na Conversion API.
4. Conferir aceite, deduplicação, correspondência e latência.
5. Liberar sinais profundos gradualmente.
6. Comparar campanha, lead, visita e venda antes de recomendar mudanças.

