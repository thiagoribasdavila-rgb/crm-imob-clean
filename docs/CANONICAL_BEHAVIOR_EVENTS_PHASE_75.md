# Fase 75 — Eventos comportamentais canônicos

## Resultado

Mensagens, ligações, visitas, propostas e conversões agora alimentam uma timeline append-only comum. O mesmo evento não entra duas vezes e a leitura respeita organização, hierarquia e proprietário da lead.

## Privacidade e eficiência

O evento guarda somente estado, canal, formato, resultado e duração. Conteúdo de mensagens, nome, telefone, e-mail, CPF, CNPJ, endereço, anotações e documentos nunca entram nos atributos analíticos. A normalização é determinística e não consome tokens de IA.

## Captura

- Mensagem criada ou lida.
- Visita agendada, confirmada, realizada, cancelada ou ausente.
- Proposta criada, em revisão, aprovada, recusada ou expirada.
- Mudança de etapa, ganho, perda ou compra externa.
- Resultado estruturado de ligação registrado pelo corretor.

## Homologação

Aplicar a migration, executar `npm run behavior-events:check` e validar uma jornada completa. Repetir webhooks e atualizações para confirmar idempotência; conferir corretor, gerente, diretor e dois tenants; verificar que nenhum texto livre ou dado pessoal chegou à tabela.
