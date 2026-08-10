# Distribuição de leads da Meta — ativação segura

Esta release inclui a migration `20260805130000_director_meta_distribution.sql`.

## Antes de publicar

1. Aplique somente essa migration no projeto Supabase de homologação já conectado ao Atlas One.
2. Não execute reset de banco, seed ou bootstrap.
3. Publique o ZIP na Hostinger e reinicie a aplicação.

## Configuração operacional

1. Entre com o perfil de diretor e abra **Distribuição**.
2. Em **Incorporadora**, escolha a incorporadora e depois o empreendimento para configurar a roleta daquele projeto.
3. Em **Roleta exclusiva de leads da Meta**, mantenha selecionados apenas **Diego** e **Luciano** e salve a configuração com uma justificativa.

## Comportamento garantido

- Apenas a diretoria pode configurar a fila e a roleta da Meta.
- Leads já atribuídos não são alterados.
- Novos leads de origem Meta só entram na roleta quando Diego e Luciano estiverem ativos, online e elegíveis para o projeto.
- Se não houver uma roleta Meta ativa, o sistema não redistribui automaticamente esses leads.
