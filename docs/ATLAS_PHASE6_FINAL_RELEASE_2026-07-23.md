# Atlas One V1000 — Fase 6

## Entrega

- Primeiro administrador preservado e bootstrap não repetido.
- Ledger local/remoto reconciliado sem reset.
- Três migrations seguras aplicadas; migration exclusiva de clone mantida bloqueada.
- Segredos excluídos do pacote.
- Matriz factual de paridade publicada.
- Pacote final: `ATLAS_ONE_V1000_PHASE6_FINAL.zip`.

## Gate de homologação

O pacote está apto para continuar a homologação interna. Antes de promoção a produção são obrigatórios:

1. produzir dump lógico com `DATABASE_URL` no terminal seguro;
2. restaurar o dump em banco descartável;
3. testar os papéis Diretor, Gerente e Corretor;
4. realizar um lead Meta e uma conversa WhatsApp reais;
5. resolver ou aceitar formalmente os avisos restantes do assessor Supabase.

Nenhuma dessas pendências exige apagar o administrador atual.
