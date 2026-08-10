# ATLAS AI OS — Prontidão de execução da Fase 22

## Resultado atual

O preflight local confirmou a CLI 2.109.1 exigida pelo contrato. O ensaio
descartável ainda não pode começar porque faltam:

- runtime Docker compatível disponível no terminal;
- conclusão da cadeia de evidências e decisões humanas iniciada na F17;
- recibo revisado da autoria local da F21;
- autorização JIT da F22, de uso único e validade máxima de 30 minutos.

O `supabase/config.toml` já foi criado localmente pela CLI fixada, revisado e
validado sem iniciar banco, aplicar migration ou acessar ambiente remoto.

## O que o preflight faz

- identifica a versão local da Supabase CLI;
- detecta apenas a presença do cliente de containers, sem consultar o daemon;
- verifica a existência e o hash dos artefatos manuais esperados;
- reaproveita os gates fail-closed das fases 21 e 22;
- produz evidência sanitizada, sem credenciais, dados pessoais ou linhas de
  negócio.

## O que ele não faz

- não inicia Docker ou banco local;
- não executa SQL, pgTAP, lint de banco ou rollback;
- não acessa projeto linked, staging ou produção;
- não aplica migration;
- não executa build;
- não cria ZIP.

Até esta verificação, nenhuma migration foi aplicada.

## Ordem segura para desbloqueio

1. concluir a decisão humana e a evidência sanitizada da F17;
2. concluir o preflight isolado da F18;
3. aprovar o plano sanitizado da F19;
4. aprovar a especificação local da F20;
5. autorar e revisar uma única migration e seu pgTAP na F21;
6. disponibilizar o runtime Docker, preservando o `supabase/config.toml`
   validado;
7. emitir a autorização JIT da F22 somente quando a janela real de ensaio
   estiver aberta;
8. executar o ensaio descartável, validar fingerprints e destruir apenas o
   ambiente isolado.

## Comandos de medição

```bash
npm run atlas:migration-rehearsal-v2:preflight
npm run atlas:migration-rehearsal-v2:preflight-check
```

O primeiro comando mede e atualiza a evidência. O segundo confirma que o
preflight continua seguro e honesto.
