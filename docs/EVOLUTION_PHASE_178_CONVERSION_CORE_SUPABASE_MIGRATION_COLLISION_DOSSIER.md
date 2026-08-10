# ATLAS ONE — Fase 178/3000

## Objetivo

Transformar as três colisões de timestamp encontradas na Fase 177 em evidência objetiva e reproduzível, sem renomear migrations, alterar o histórico ou tocar no banco operacional.

## Resultado

- 131 migrations locais e 128 versões únicas inventariadas.
- Três versões duplicadas preservadas como encontradas.
- Cada arquivo recebeu SHA-256, tamanho e inventário de objetos SQL, sem persistir o corpo SQL no relatório.
- Cada par foi classificado como `object_overlap` ou `disjoint_but_order_ambiguous`.
- Renomear, aplicar, reparar histórico e resetar banco permanecem proibidos.

## Colisões sob reconciliação

| Versão | Arquivos | Decisão segura atual |
| --- | --- | --- |
| `20260716235900` | relatórios Meta / integrações omnichannel | exigir histórico remoto somente leitura |
| `20260717203000` | catálogo de materiais / ciclos de SLA | exigir histórico remoto somente leitura |
| `20260717213000` | SLA de visitas / bridge legado V3 | exigir histórico remoto somente leitura |

## Procedimento de reconciliação futura

1. Em sessão operacional autorizada, listar o histórico remoto sem imprimir credenciais.
2. Comparar versões aplicadas, schema remoto e os hashes deste dossiê.
3. Nunca editar ou renomear uma migration que possa já ter sido aplicada.
4. Se faltar efeito de schema, criar posteriormente uma migration aditiva e idempotente com um novo timestamp.
5. Validar essa migration primeiro em Supabase local descartável.
6. Só liberar build/release quando histórico, runtime local e rastreabilidade da fonte estiverem comprovados.

`supabase migration repair` não faz parte desta fase: o próprio CLI o descreve como alteração da tabela de histórico.

## Impacto operacional

Nenhum. Banco remoto, autenticação, administrador, organização, leads e operação real não foram acessados nem alterados.

## Validação

```bash
npm run evolution:phase-178:assess
npm run evolution:phase-178:check
node --test tests/contracts/conversion-core-supabase-migration-collision-dossier.test.mjs
```

## Gate de release

Build, ZIP e deploy continuam bloqueados. Esta fase reduz ambiguidade; não inventa uma reconciliação que ainda depende de evidência remota.

