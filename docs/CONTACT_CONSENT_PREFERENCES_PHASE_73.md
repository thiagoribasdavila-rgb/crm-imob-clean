# Fase 73 — Consentimento e preferência de contato

Cada lead possui regra por canal com estado, base, evidência, preferência, dias, horário, fuso e validade. Sem consentimento concedido, dentro da validade e da janela, o Atlas não prepara rascunho de IA nem enfileira mensagem.

Opt-out cria supressão imediata. Toda alteração gera evento. Atalhos externos de WhatsApp/e-mail foram removidos da Lead 360 para que o envio use o fluxo protegido.

## Homologação

Aplicar a migration; testar ausência, autorização, expiração, janela, fuso inválido, opt-out e nova autorização com evidência; validar rascunho, envio, fila, corretor/gestão e dois tenants.
