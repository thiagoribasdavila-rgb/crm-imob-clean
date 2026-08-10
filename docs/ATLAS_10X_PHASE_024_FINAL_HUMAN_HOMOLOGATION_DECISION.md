# ATLAS AI OS — Fase 24/24

## Decisão humana final de homologação

Esta fase encerra a fundação de governança do ciclo 10x. Ela converte a cadeia
sanitizada das Fases 22 e 23 em uma decisão humana curta, rastreável e
fail-closed.

Há três estados diferentes:

1. **Contrato implementado**: o avaliador, o template e os gates existem.
2. **Evidência homologável**: ensaio, revisão e dossiê sanitizado reais passaram.
3. **Execução autorizada**: uma autorização operacional nova e específica foi
   concedida para uma mudança concreta.

A Fase 24 conclui apenas o primeiro estado. Mesmo com `67/67`, seu único
resultado permitido é a elegibilidade para preparar outro plano de mudança
controlado.

## Estado medido

| Controle | Resultado |
|---|---:|
| Gates atuais | 21 de 67 |
| Percentual | 31% |
| Blockers explícitos | 46 |
| Mutantes rejeitados | 114/114 |
| Recibo real da Fase 22 | Ausente |
| Revisão humana da Fase 23 | Ausente |
| Dossiê sanitizado persistido | Ausente |
| Decisão humana final | Ausente |
| Registro final gerado | Não |
| Autoridade operacional concedida | Não |

O estado `21/67` não é falha do contrato. É o bloqueio esperado enquanto a
evidência real e a decisão humana não existem.

## Cadeia obrigatória

```text
Ensaio descartável F22
  → recibo sanitizado F22
  → revisão humana F23
  → dossiê sanitizado F23
  → decisão humana F24
  → elegível para preparar outro plano controlado
```

Cada elo referencia o SHA-256 do artefato anterior. Alterar um byte invalida a
cadeia.

## Ambiente-alvo

A decisão deve confirmar explicitamente:

- Hostinger como hospedagem;
- Supabase como banco;
- homologação como alvo;
- versão PostgreSQL suportada;
- extensões depreciadas e breaking changes revisadas;
- backup, restauração, janela de manutenção e responsável por rollback;
- grants e RLS da Data API revisados separadamente;
- fronteiras de views, funções e segredo de serviço revisadas.

O contrato aceita PostgreSQL 15 ou 17 e recusa PostgreSQL 14. A decisão deve
usar a versão realmente observada no ambiente, nunca uma suposição.

## Limites operacionais

Esta fase:

- não inicia banco local ou Docker;
- não executa migration, pgTAP, lint ou rollback;
- não acessa projeto linked;
- não lê dados comerciais, Auth ou Storage;
- não lê ou escreve remotamente;
- não toca produção;
- não cria build ou ZIP;
- não faz deploy na Hostinger;
- não altera campanha Meta;
- não envia WhatsApp.

O avaliador pode montar o registro final apenas em memória. Ele não persiste o
registro e não converte aprovação documental em autoridade operacional.

## Como avaliar localmente

```bash
npm run atlas:homologation-final:assess
npm run atlas:homologation-final:check
```

O preenchimento manual deve seguir
`docs/templates/ATLAS_FINAL_HOMOLOGATION_DECISION_TEMPLATE.md`.

## Referências oficiais verificadas

- [Segurança da Data API](https://supabase.com/docs/guides/api/securing-your-api)
- [Testes e lint local](https://supabase.com/docs/guides/local-development/cli/testing-and-linting)
- [Fim do suporte ao PostgreSQL 14](https://supabase.com/changelog/45827-deprecation-notice-support-for-postgres-14-ending-on-1st-july-2026)
- [Mudança de PostgreSQL 15 para 17 no self-hosted](https://supabase.com/changelog/46080-self-hosted-supabase-upgrading-from-pg-15-to-17-breaking-change)
- [Breaking changes](https://supabase.com/changelog?tags=breaking-change)

## Próximo ciclo

Executar o ensaio F22 em ambiente descartável, concluir a revisão F23 e
preencher a decisão F24. Somente após `67/67` poderá ser preparado outro plano
de mudança controlado. Esse plano ainda exigirá autorização humana específica
antes de qualquer aplicação, build, ZIP ou deploy.
