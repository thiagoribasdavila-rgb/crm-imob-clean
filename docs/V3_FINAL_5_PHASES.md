# Atlas V3 — cinco fases finais

## Fase 46 — Conexão e enxugamento

- O V3, V2 preservado, CRM, IA, Meta, WhatsApp, materiais e governança permanecem no mesmo produto.
- Rotas antigas que já são colocadas em quarentena durante build e desenvolvimento ficam fora somente do ZIP de produção.
- Código histórico continua no repositório; nenhuma base ou funcionalidade homologável é apagada.

## Fase 47 — Eficiência operacional

- Build usa somente o escopo ativo.
- IA possui roteamento por tarefa, fallback observável e proteção contra envio de dados pessoais a provedores econômicos.
- Hostinger executa um processo web e workers/relatórios via cron, evitando processos duplicados.

## Fase 48 — Segurança e privacidade

- Toda página é privada por padrão; somente home e autenticação são públicas.
- O pacote nasce exclusivamente de arquivos versionados.
- `.env.local`, credenciais, bases históricas, planilhas, PDFs, `tmp`, `outputs`, caches e dependências instaladas são proibidos no ZIP.
- O gerador valida a lista interna e produz SHA-256 para conferir integridade após o upload.

## Fase 49 — Homologação técnica

- Executar `npm ci`, `npm run prisma:generate`, `npm run validate` e `npm run preflight:production` na Hostinger.
- Aplicar migrações no Supabase de homologação antes do teste autenticado.
- Validar diretor, superintendente, gerente e corretor, além de dois tenants distintos.
- Meta, WhatsApp e cada IA só recebem status conectado após ensaio real.

## Fase 50 — Publicação Hostinger

1. Enviar `atlas-v3-hostinger.zip` para uma pasta nova, separada do V2.
2. Conferir o SHA-256 com o arquivo `.sha256`.
3. Extrair o ZIP e criar `.env.local` a partir de `.env.example`, sem copiar o arquivo local de desenvolvimento.
4. Usar Node.js 24 e executar `npm ci && npm run prisma:generate && npm run validate`.
5. Iniciar com `pm2 start ecosystem.config.cjs` ou `npm start` no Node.js Web App.
6. Configurar HTTPS, domínio de homologação, callbacks Supabase e crons.
7. Executar `npm run routes:real` e `npm run preflight:production`.
8. Manter o V2 e o rollback até o piloto operacional ser aprovado.

O ZIP comprova prontidão técnica do código, não substitui os ensaios com credenciais, banco, perfis e APIs reais.
