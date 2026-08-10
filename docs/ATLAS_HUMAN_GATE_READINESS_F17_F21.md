# Mesa de decisão F17–F21

## Resultado

A **Mesa de decisão F17–F21** reúne, em uma única evidência, o estado real dos cinco gates que precedem o ensaio local descartável da F22.

Ela responde quatro perguntas:

1. Qual é o primeiro bloqueio real?
2. Quais evidências técnicas já existem e qual é o SHA-256 de cada uma?
3. Quais documentos ainda exigem decisão humana?
4. Qual é a próxima ação segura?

O coordenador apenas mede e organiza. Ele **não cria aprovação**, não preenche declarações em nome da diretoria, não acessa Supabase remoto, não inicia banco, não gera ou aplica migration, não executa build e não cria ZIP para Hostinger.

## Cadeia segura

1. Validar o pacote F15, o ensaio local F16 e a restauração F02.
2. Preparar manualmente o alvo sanitizado e a decisão `preflight-only` da F17.
3. Emitir uma permissão JIT curta para a observação read-only F18.
4. Produzir em memória o plano sanitizado F19.
5. Aprovar ou adiar os workstreams F20.
6. Autorizar uma única autoria local F21, vinculada por SHA-256.
7. Somente então executar o preflight de ambiente F22.

Ausência de evidência nunca é tratada como aprovação.

## Segurança Supabase atual

RLS e privilégios da Data API são verificações diferentes. Uma tabela exposta precisa de política RLS correta e de `GRANT` explícito compatível com o uso pretendido. A mesa preserva os dois como gates separados, incluindo políticas de `UPDATE` com leitura, `USING` e `WITH CHECK`.

Nenhuma credencial, URL de banco, identificador real de projeto, linha comercial ou registro de autenticação é incluído na evidência. Os arquivos aparecem somente como caminho, presença e SHA-256.

## Uso

```bash
npm run atlas:human-gates:assess
npm run atlas:human-gates:check
```

A evidência fica em:

```text
artifacts/runtime/human-gates/f17-f21-readiness-evidence.json
```

## Critério de avanço

A cadeia só fica pronta quando as cinco fases F17–F21 estiverem aprovadas por seus próprios contratos. O próximo passo técnico continua sendo a F22, ainda local e descartável. Publicação Hostinger, banco real, produção e pacote de release permanecem fora deste gate.
