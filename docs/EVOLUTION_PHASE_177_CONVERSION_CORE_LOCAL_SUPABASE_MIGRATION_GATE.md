# Fase 177 — Gate local das migrations Supabase

## Resultado

O Atlas One agora possui um gate explícito para ensaiar migrations somente em uma cópia descartável e em uma pilha Supabase local. O executor recusa `--linked`, `--db-url`, `db push`, `db pull` e `migration repair`, remove credenciais operacionais do processo filho e nunca lê `.env.local`.

## Diagnóstico factual

- 131 migrations SQL foram inventariadas.
- 3 timestamps estão duplicados: `20260716235900`, `20260717203000` e `20260717213000`.
- 144 ativações de RLS e 211 declarações `GRANT` foram detectadas como evidência estática.
- Nenhum uso de `auth.role()` foi encontrado.
- Docker não está disponível neste host.

Os timestamps duplicados não foram renomeados. A migration history remota precisa ser comparada antes de qualquer alteração de nome, pois a CLI reconcilia migrations por timestamp.

## Uso seguro

Auditoria sem mutação:

```bash
npm run evolution:phase-177:assess
```

Ensaio local, somente depois de resolver as duplicidades e disponibilizar Docker:

```bash
npm run evolution:phase-177:execute
```

O executor cria uma cópia temporária sem `.env*`, ZIPs, chaves ou artefatos; inicia Supabase local, roda `db reset --local --no-seed`, lista migrations locais, executa `db lint --local` e remove a pilha e a cópia.

## Estado da release

Build, ZIP e deploy continuam bloqueados. A fase prova o mecanismo de segurança e expõe os bloqueios reais; ela não afirma que o runtime local já foi homologado.

## Evidência de validação

- Contratos específicos da fase: 4/4 aprovados.
- Suíte completa: 404/404 aprovada.
- Typecheck: aprovado.
- ESLint com zero warnings: aprovado.
- Varredura de segredos: 3.581 arquivos, zero credenciais detectadas.
- Check declarativo da fase: aprovado.
