# Fase 47 — Sincronização externa de calendário

## Resultado

Google Calendar e Microsoft Outlook recebem um contrato pessoal e opcional. A única direção permitida é Atlas → externo; o padrão publica apenas um título privado, sem nome da lead ou contexto comercial.

## Credenciais

Client secrets vivem somente no ambiente seguro da Hostinger. A aplicação comum guarda apenas referência opaca emitida pelo futuro callback OAuth; tokens nunca passam pelo navegador nem entram nas respostas da API. A tela não declara conexão antes de autorização real.

## Resiliência

A fila registra somente tipo e UUID do compromisso, operação, tentativas e código de erro. Desconectar desativa a preferência e remove referências de acesso. Nenhuma alteração externa retorna ao CRM nesta fase.

## Homologação

Aplicar migration e cadastrar redirect URIs exatas. Validar opt-in, cancelamento OAuth, desconexão, dois usuários, dois tenants, evento sem PII, retry e revogação no provedor. Execute `npm run external-calendar:check`.
