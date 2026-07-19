# Fase 82 — Contexto imobiliário governado

## Resultado

O Copiloto deixou de enviar blocos amplos de lead, metadata, memória e tela. Cada chamada recebe somente operação agregada e, quando necessário, sinais comerciais da lead, projeto, estoque agregado, fontes regionais verificadas e contadores de continuidade.

## Exclusões

- Nome, telefone, e-mail, CPF, CNPJ e endereço.
- Metadata bruta, fatos históricos livres e texto de documentos.
- Resumos regionais livres, conversas anteriores e contexto bruto da tela.
- IDs de organização, lead, corretor ou copiloto no prompt externo.

Cada pacote gera manifesto e fingerprint sem armazenar seu conteúdo. Contexto de lead ou prompt com identificador é classificado como pessoal e segue somente pela rota OpenAI/local.

## Homologação

Aplicar a migration, executar `npm run ai-context:check`, simular contexto agregado e de lead, conferir manifesto, fingerprint, fontes verificadas, bloqueio de rotas e isolamento de hierarquia/tenant.
