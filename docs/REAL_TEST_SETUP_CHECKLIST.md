# Atlas AI — Checklist completo para teste real

## 1. Atualizar o projeto

```bash
cd /Users/thiagoribasdavila/crm-imob-clean
git fetch origin
git switch atlas-v3-auth
git pull --ff-only origin atlas-v3-auth
npm ci
npm run prisma:generate
```

## 2. Preparar o ambiente

```bash
npm run prepare:test
```

Na primeira execução, o comando cria `.env.local` usando `.env.example`. Abra o arquivo e preencha sem compartilhar os valores.

Obrigatórias:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ATLAS_CRON_SECRET`
- `ATLAS_TEST_EMAIL`
- `ATLAS_TEST_PASSWORD`
- `ATLAS_BASE_URL=http://localhost:3000`

Temporária:

- `ATLAS_BOOTSTRAP_SECRET` — use somente para criar o primeiro administrador e remova depois.

Opcionais no primeiro teste:

- Meta
- WhatsApp

## 3. Criar a conta administrativa

Execute somente quando ainda não existir um administrador:

```bash
npm run bootstrap:admin -- \
  --email="SEU_EMAIL_DE_TESTE" \
  --password="SUA_SENHA_FORTE" \
  --name="Administrador Atlas"
```

Depois, use o mesmo e-mail e senha em `ATLAS_TEST_EMAIL` e `ATLAS_TEST_PASSWORD`.

## 4. Validar o código

```bash
npm run release:check
```

Resultado obrigatório:

- arquitetura aprovada;
- TypeScript sem erros;
- ESLint sem erros;
- build de produção concluído.

## 5. Iniciar o Atlas

Terminal 1:

```bash
npm run dev
```

Acesse:

```text
http://localhost:3000/login
```

## 6. Executar a bateria automatizada

Terminal 2:

```bash
npm run test:real
```

Esse comando executa:

1. release check;
2. smoke V1/V2;
3. smoke V3;
4. auditoria das rotas públicas e protegidas;
5. login técnico real;
6. APIs autenticadas;
7. preflight de produção.

## 7. Roteiro funcional manual

Execute nesta ordem:

1. Login
2. Dashboard
3. Novo lead
4. Lead 360
5. Registrar atividade
6. Criar oportunidade
7. Pipeline
8. Empreendimentos
9. Command Center do lançamento
10. Inventário
11. Reserva temporária
12. Tarefas
13. Marketing
14. Atlas V2
15. Atlas V3
16. Atlas 2030

## 8. Critérios de aceite

Cada fluxo precisa:

- abrir sem 404 ou tela branca;
- respeitar autenticação e organização;
- gravar e ler dados reais;
- exibir erro compreensível quando falhar;
- manter responsividade;
- não gerar erro no console;
- refletir alterações após recarregar.

## 9. Como registrar um problema

Use o botão de feedback na Topbar ou o atalho:

```text
Command/Ctrl + Shift + F
```

Registre:

- rota;
- ação realizada;
- resultado esperado;
- resultado obtido;
- prioridade;
- captura de tela, quando houver.

## 10. Regra da homologação

Durante o teste real:

```text
não criar novo módulo
→ reproduzir o erro
→ corrigir a causa
→ adicionar proteção
→ validar regressão
→ repetir o fluxo
```
