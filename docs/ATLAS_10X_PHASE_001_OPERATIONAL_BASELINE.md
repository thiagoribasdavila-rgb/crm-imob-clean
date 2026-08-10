# ATLAS 10/10 — Fase 1/24: linha de base operacional

## Objetivo

Estabelecer uma única leitura confiável do estado atual do Atlas antes de novas mudanças. A regra central desta fase é simples:

> Código aprovado não significa operação comprovada.

O Atlas agora separa três níveis:

1. **Construído:** a capacidade existe no projeto.
2. **Validado localmente:** contratos, tipagem, lint e controles automatizados passaram.
3. **Comprovado em homologação:** banco, autenticação, dados reais, navegador e integrações responderam no ambiente correto.

## O que foi consolidado

- Um contrato versionado reúne os controles essenciais de CRM, Pipeline, IA, segurança, integrações e Meta.
- Um medidor reproduzível executa a validação local sem fazer build e sem gerar ZIP.
- Os testes remotos só rodam com solicitação explícita e ambiente local configurado.
- Ausência de evidência mantém produção bloqueada; nenhuma porcentagem visual libera implantação.
- A política de eficiência foi preservada: o build completo fica reservado ao fechamento do pacote.

## Estado inicial medido

| Dimensão | Situação | Leitura correta |
|---|---|---|
| Arquitetura e interface | Avançadas | Há ampla cobertura funcional e visual. |
| Validação estática | Forte | Tipagem, lint e gates locais são reproduzíveis. |
| Supabase remoto | Pendente de ambiente | Exige `.env.local` e auditoria autenticada; nenhum segredo é lido pelo medidor padrão. |
| Meta/CAPI | Preparada, não promovida | Test Events e resultado real ainda são evidências obrigatórias. |
| Operação comercial | Validada localmente | O SLA do primeiro contato possui contrato cobrindo API, Kanban e visão gerencial; falta observação remota com dados reais. |
| Produção | Bloqueada | Depende de evidência remota, smoke autenticado e autorização humana. |

## Problema de conversão priorizado

O **SLA do primeiro contato** já possui cobertura contratual local. A próxima evidência necessária é observá-lo em homologação, entre entrada e primeira resposta na jornada real, para que o Atlas possa:

- proteger a velocidade de atendimento;
- alertar corretor e gerente com confiança;
- relacionar rapidez de contato com conversão;
- devolver ao Meta um sinal comercial completo.

Esse item faz parte do gate local. A validação em ambiente real será concluída na fase de velocidade comercial.

## Como validar

Validação estrutural da fase:

```bash
npm run atlas:baseline:check
```

Medição local, sem build:

```bash
npm run atlas:baseline:measure
```

Medição de homologação, somente quando `.env.local` estiver configurado e houver autorização:

```bash
npm run atlas:baseline:measure -- --runtime
```

Nenhum desses comandos publica, cria ZIP ou altera dados.

## Critério de aceite

- inventário e comandos críticos centralizados;
- build não executado nesta fase;
- nenhuma produção promovida por inferência;
- bloqueadores operacionais apresentados de forma explícita;
- caminho para comprovação remota definido.

## Próxima etapa

**Fase 2 — Backup, restauração e rollback comprovados.**

Antes de qualquer ajuste remoto de schema ou integração, será necessário demonstrar que a base pode ser restaurada com segurança e que a versão anterior pode ser recuperada sem perda de dados.
