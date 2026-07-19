# ATLAS AI OS — Fase 101/3000

## Objetivo

Entregar um pacote seguro de homologação para a Hostinger sem declarar produção aprovada antes das evidências finais.

## Problemas resolvidos

- a base Supabase ativa usa contratos V2, enquanto a interface V3 possui entidades mais novas;
- artefatos locais de análise e bases privadas não podem entrar no ZIP;
- a conta técnica dedicada de smoke configurada localmente não existe mais no Auth;
- a migração de escrita de projetos ainda não foi aplicada em homologação.

## Alterações e evidências

- os adaptadores consultaram, sem alterar os dados, 17.150 leads, 2 tarefas e 1 projeto em `public.leads`, `public.tasks` e `public.crm_projects`;
- `outputs/`, `tmp/`, arquivos de ambiente, planilhas, CSVs e PDFs ficam fora do controle de versão e do pacote;
- o pacote nasce de um commit limpo e recebe inventário interno e checksum SHA-256 externo;
- a migração pendente continua versionada, mas não é executada automaticamente;
- o deploy automático e a promoção de produção permanecem bloqueados.

## Impacto operacional

O time recebe um candidato reproduzível para upload e teste na Hostinger, contendo a aplicação e os contratos de compatibilidade, sem chaves, contatos ou bases privadas.

## Checklist

- [x] auditoria do banco em modo somente leitura;
- [x] proteção contra inclusão de dados privados;
- [x] um único build final previsto para fechar o artefato;
- [x] ZIP e checksum obrigatórios;
- [ ] corrigir a conta técnica de smoke;
- [ ] aplicar migrações com backup e rollback;
- [ ] executar smoke HTTPS autenticado após upload;
- [ ] aprovar explicitamente produção.

## Próximo passo

Subir o ZIP no ambiente Node.js da Hostinger, preencher as variáveis diretamente no painel, aplicar a migração em homologação e validar a jornada de cada papel antes de promover o ambiente.
