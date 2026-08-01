# Fase 020 — Homologação segura da Onda 001

## Resultado

A primeira onda possui qualidade local comprovada, mas **não está homologada para produção**. O gate agora diferencia claramente código aprovado de operação runtime aprovada. Nenhum usuário, lead, perfil ou registro comercial foi alterado nesta fase.

## Evidência aprovada

- typecheck, lint e build concluídos;
- scanner de segredos sem credenciais empacotadas;
- navegação validada para os perfis oficiais;
- auditorias runtime executadas somente em leitura e sem imprimir dados pessoais;
- interface passa a mostrar a Fase 020 como `Aguardando staging`.

## Por que a onda continua bloqueada

O ambiente local aponta para um único projeto Supabase e não comprova uma instalação separada de homologação. Além disso, `20260711040000_atlas_v3_foundation.sql` documenta um estado remoto, mas não contém a DDL necessária para recriar a fundação do zero. Por isso, a cadeia local ainda não é uma fonte reproduzível do banco atual.

Não executar `supabase db push` diretamente em produção. A documentação oficial do Supabase recomenda separar staging e produção, sincronizar o schema existente antes de novas mudanças e promover migrations somente após a validação no ambiente de staging.

## Sequência segura para concluir

1. Criar um projeto Supabase exclusivo para homologação, sem reutilizar produção.
2. Criar e testar um backup restaurável antes de qualquer mudança remota.
3. Instalar a CLI oficial e comparar o histórico local com o remoto.
4. Capturar/reconciliar a fundação real em uma baseline revisável.
5. Reproduzir toda a cadeia em um banco de homologação limpo.
6. Executar as auditorias de schema, RLS e hierarquia em modo leitura.
7. Validar login e jornadas de administrador, diretor, gerente e corretor.
8. Registrar o aceite explícito da diretoria antes da promoção.

## Comandos do gate

- `npm run wave-001:homologation:check` valida que o bloqueio e as evidências estão corretamente representados.
- `npm run wave-001:homologation:status` retorna falha enquanto qualquer gate remoto estiver pendente. Ele nunca aplica migrations.

## Decisão

**Status: bloqueada aguardando staging reproduzível.** A Fase 021 não deve alterar schema de produção para contornar este gate.
