# ATLAS ONE — Fase 365 · Memória factual do WhatsApp oficial

## Objetivo

Iniciar o ciclo 365–369 com uma linha de base factual das linhas oficiais,
conversas e mensagens já registradas no CRM, sem enviar mensagens, alterar o
login, chamar a Graph API ou modificar dados remotos.

## Entrega

- linhas cadastradas, conectadas, pendentes e desconectadas;
- conversas vinculadas ou não a leads;
- conversas atribuídas ou sem responsável;
- mensagens recebidas, enviadas, entregues, lidas e com falha;
- evidência externa por `external_message_id` e datas mais recentes;
- cobertura disponível para aprendizado da IA;
- painel factual independente do diagnóstico ao vivo da Graph API.

## Política de verdade

Uma linha com status `connected` é apresentada como configurada. Tráfego só é
classificado como comprovado quando o CRM possui ao menos uma mensagem com
identificador externo. O painel não interpreta variável de ambiente ou cadastro
como prova de funcionamento externo.

## Arquivos alterados

- `lib/analytics/whatsapp-memory-baseline.ts`
- `app/api/v1/integrations/whatsapp/memory-baseline/route.ts`
- `app/(crm)/integrations/whatsapp/page.tsx`
- `tests/contracts/whatsapp-memory-baseline.test.mjs`
- `config/evolution-phase-365-whatsapp-memory-baseline.json`
- `package.json`

## Segurança e isolamento

O endpoint é somente leitura, exclusivo da diretoria e filtra todas as consultas
pela organização resolvida na sessão. Nenhum telefone, remetente, destinatário
ou conteúdo de mensagem é selecionado ou devolvido. O endpoint não usa service
role no cliente e não executa integração externa.

## Estado

`implemented_local / authenticated_runtime_proof_pending`

A promoção exige prova autenticada com dados reais da organização. Nenhum build,
ZIP, deploy, envio externo ou alteração remota foi executado nesta fase isolada.

## Próxima fase

A Fase 366 deve medir correspondência, propriedade e continuidade das conversas
por lead sem expor conteúdo ou automatizar contato.
