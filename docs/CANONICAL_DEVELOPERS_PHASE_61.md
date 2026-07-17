# Fase 61 — Cadastro canônico de incorporadoras

Incorporadora deixa de ser apenas texto repetido e passa a possuir identidade própria. O cadastro reúne razão social, nome comercial, CNPJ normalizado, canais comerciais, sede, status e SLA padrão de comissão.

Projetos existentes são migrados pelo nome normalizado para `developer_id`; `developer_name` permanece temporariamente para compatibilidade. CNPJ é único dentro da organização, site exige HTTPS, escrita é exclusiva de diretoria/superintendência e toda criação ou alteração gera evento de auditoria.

Homologar criação, edição, CNPJ duplicado, site inválido, dois tenants, perfis sem permissão, migração de nomes existentes e vínculo dos projetos. Execute `npm run canonical-developers:check`.
