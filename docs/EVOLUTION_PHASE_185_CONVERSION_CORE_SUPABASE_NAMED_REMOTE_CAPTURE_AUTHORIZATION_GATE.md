# ATLAS AI OS — Fase 185/3000

## Objetivo

Criar o gate local de autorização e revisão humana para a futura captura dos nomes das migrations remotas, sem executar a captura nesta fase.

## Problema resolvido

O procedimento da fase 184 era seguro e somente leitura, mas ainda não possuía um contrato fechado capaz de provar que a autorização humana se refere exatamente ao alvo, à consulta e ao conjunto atual de migrations locais.

## Implementação

- escopo único: captura de metadados nomeados em modo somente leitura;
- vínculo SHA-256 do alvo, consulta fixa, fingerprints locais e nomes lógicos exigidos;
- identidade do revisor armazenável somente como SHA-256;
- papéis aceitos limitados a `ADMIN`, `DIRETOR` e `DIRETOR_DECISOR`;
- sinal explícito vinculado à variável operacional definida na fase 184;
- frase e decisão exatas;
- validade máxima de 15 minutos;
- uso único e rejeição de autorização já consumida;
- formato fechado para impedir payload, credencial ou campo extra;
- executor remoto propositalmente inexistente nesta fase.

## Comportamento fail-closed

O gate recusa autorização ausente, expirada, reutilizada, com janela excessiva, papel inválido, frase alterada, sinal ausente, garantia incompleta ou fingerprint divergente após qualquer mudança local.

Mesmo quando um registro sintético íntegro passa na validação do contrato, o resultado mantém `remoteExecutionAuthorized: false`. A fase não contata o Supabase e não autoriza migration, build, ZIP ou deploy.

## Validação local

```bash
npm run evolution:phase-185:assess
npm run evolution:phase-185:check
node --test tests/contracts/conversion-core-supabase-named-remote-capture-authorization-gate.test.mjs
```

## Estado final

O contrato local do gate está implementado e testado. Nenhuma revisão real foi registrada ou persistida, nenhuma autorização foi consumida e nenhum ambiente remoto foi tocado.

## Próxima fase

Preparar o handoff de uso único entre uma autorização válida e o adaptador da fase 183, preservando bloqueio remoto e zero mutação até uma autorização operacional separada.
