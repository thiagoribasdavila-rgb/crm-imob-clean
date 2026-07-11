# Atlas AI — Runbook de Teste Real

## Objetivo

Validar o Atlas com usuário, dados e ambiente reais antes de continuar a evolução de produto.

## 1. Atualizar o projeto

```bash
cd /Users/thiagoribasdavila/crm-imob-clean
git fetch origin
git switch atlas-v3-auth
git pull --ff-only origin atlas-v3-auth
npm ci
npm run prisma:generate
```

## 2. Validar configuração local

O arquivo `.env.local` deve conter, no mínimo:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ATLAS_CRON_SECRET=
```

Para criar o primeiro administrador, temporariamente:

```text
ATLAS_BOOTSTRAP_SECRET=
```

Meta e WhatsApp não bloqueiam o primeiro teste do CRM.

## 3. Rodar qualidade e servidor

```bash
npm run release:check
npm run dev
```

Mantenha o servidor aberto.

## 4. Rodar o preflight em outro terminal

```bash
cd /Users/thiagoribasdavila/crm-imob-clean
npm run preflight:production
```

Para executar todos os testes automáticos disponíveis:

```bash
npm run test:real
```

## 5. Criar administrador

Somente quando ainda não existir perfil:

```bash
npm run bootstrap:admin -- \
  --email="SEU_EMAIL" \
  --password="SENHA_FORTE_COM_12_OU_MAIS_CARACTERES" \
  --name="Thiago D'Avila"
```

Após confirmar o login, remova `ATLAS_BOOTSTRAP_SECRET` do ambiente.

## 6. Roteiro funcional obrigatório

Execute nesta ordem e registre qualquer falha no Feedback Center do próprio Atlas:

1. Login e logout.
2. Dashboard abre sem erro.
3. Criar lead com telefone.
4. Abrir Lead 360.
5. Editar qualificação e salvar.
6. Registrar atividade.
7. Criar oportunidade.
8. Mover lead no pipeline.
9. Abrir empreendimentos.
10. Abrir Command Center de um empreendimento.
11. Abrir inventário do empreendimento.
12. Reservar uma unidade disponível.
13. Confirmar que a unidade não aceita reserva duplicada.
14. Abrir V2, V3 e Atlas 2030.
15. Testar em largura de celular.

## 7. Critério de aceite para piloto

O piloto pode começar quando:

- Release Gate e Security Gate estiverem verdes.
- `npm run test:real` terminar sem falhas obrigatórias.
- login, lead, Lead 360, pipeline e Launch OS funcionarem com dados reais.
- RLS impedir acesso cruzado entre organizações.
- nenhum segredo estiver exposto no navegador ou repositório.
- erros encontrados tiverem reprodução e prioridade registradas.

## 8. Ordem de correção durante homologação

1. Segurança e perda de dados.
2. Login e autorização.
3. Cadastro e atualização de dados.
4. Pipeline e reservas.
5. Performance e responsividade.
6. Aparência e melhorias não bloqueantes.

Durante esta etapa, não adicionar módulos novos. Corrigir e estabilizar o fluxo real primeiro.
