# Fase 12 — Resiliência de prazos do Livro Executivo

## Objetivo

Garantir que decisões antigas ou incompletas permaneçam compreensíveis para a gestão, sem apresentar uma data incorreta ou quebrar a leitura do Livro Executivo.

## Entrega

- Estados de prazo: vencido, futuro e sem prazo disponível.
- Registros sem data ou com data inválida mostram uma indicação explícita e segura.
- A próxima decisão e a lista usam a mesma leitura de prazo.

## Limites preservados

- Não corrige nem grava dados antigos automaticamente.
- Não cria migration, tarefa, notificação ou ação externa.
- Mantém o escopo de organização e permissões já resolvido pelo servidor.

## Validação manual

1. Abra o Livro Executivo com decisões válidas e confirme a data exibida.
2. Em um ambiente de teste, consulte um registro legado sem prazo e confirme a indicação **Sem prazo**.
3. Confirme que o filtro **Vencidos** continua exibindo apenas compromissos vencidos válidos.
