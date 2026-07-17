# Atlas V3 — evolução máxima em 100 fases

Data-base: 17/07/2026. Branch: `develop/atlas-v3`. O relatório considera evidência versionada e separa implementação, teste automatizado e homologação real.

## Regra de medição

- **Estruturada**: contrato ou interface existe, sem jornada comprovada.
- **Implementada**: fluxo existe no código e preserva a arquitetura canônica.
- **Testada**: possui controle automatizado e passa no release gate.
- **Homologada**: foi comprovada no domínio final com credenciais e dados reais de teste.
- **Bloqueada externamente**: código pronto, mas depende de credencial, conta, aprovação ou evidência externa.

Percentuais não são promovidos por existência visual. Um bloqueio crítico impede produção mesmo quando o build está verde.

## Fase 1 — Inventário completo

Status: **Testada**.

Percentual antes: **70%** — inventários anteriores estavam manuais e divergiam da árvore atual.  
Percentual depois: **100%** — inventário reproduzível criado sobre arquivos versionados e separação explícita entre superfície histórica e pacote implantável.

### Evidência atual

Execute `npm run inventory:v3` para obter os números do commit corrente. A medição distingue:

- arquivos versionados e arquivos implantáveis;
- páginas e APIs históricas versus rotas mantidas no pacote;
- componentes, bibliotecas, migrations, scripts e documentação;
- variáveis públicas e variáveis exclusivas do servidor;
- caminhos protótipos excluídos do ZIP final;
- Hostinger, Node.js 24 e Supabase como limites oficiais.

### Resultado desta fase

- O V2 histórico não é dependência de execução.
- Rotas protótipo permanecem rastreáveis no Git, mas são removidas do pacote Hostinger.
- `.env.local`, dados privados, `outputs`, `tmp`, planilhas e PDFs não integram o inventário implantável.
- A fase corrige a base de medição usada pelos relatórios antigos, sem remover código por aproximação.

### Riscos e dependências

- Credenciais externas continuam ausentes; isso não reduz o inventário, mas impede homologação real.
- Páginas existentes não são automaticamente consideradas funcionalidades concluídas.
- A Fase 2 deve classificar duplicidades e protótipos usando este inventário antes de qualquer remoção.

## Painel das 100 fases

| Bloco | Fases | Estado atual | Próximo gate |
|---|---:|---|---|
| Base, arquitetura e governança | 1–10 | Fase 1 testada; 2–10 em auditoria | Classificar duplicidades e consolidar contratos canônicos |
| Segurança, autenticação e perfis | 11–20 | Implementação avançada; homologação externa pendente | Supabase real, quatro perfis e dois tenants |
| CRM e experiência comercial | 21–30 | Implementação e controles avançados | Jornada real por perfil |
| Pipeline e Kanban | 31–40 | Implementação e controles avançados | Dados reais, comissão e forecast aferido |
| Tarefas e produtividade | 41–50 | Implementação avançada | Piloto móvel e adoção real |
| Distribuição e carteiras | 51–60 | Implementação e atomicidade testadas em código | Equipe real online e concorrência real |
| Projetos e incorporadoras | 61–70 | Estruturada/implementada | Conferência de portfólio e materiais reais |
| Dados, score e predição | 71–80 | Implementação avançada | Calibração com resultados reais |
| IA comercial e automação | 81–90 | Implementação testada com fallback | Chaves, qualidade e custo reais |
| Marketing e produção | 91–100 | Estruturada/implementada | Meta, WhatsApp, Hostinger e aceite formal |

## Percentuais independentes no início do programa

| Dimensão | Percentual comprovado | Observação |
|---|---:|---|
| Implementação | 88% | Núcleo funcional amplo; conectores externos ainda parciais |
| Testes automatizados | 86% | Release gate e controles imobiliários robustos |
| Segurança | 84% | RLS e escopo implementados; teste real entre tenants pendente |
| Experiência do usuário | 86% | Núcleo modernizado; auditoria móvel completa pendente |
| Integrações externas | 28% | Contratos existem, mas credenciais e evidências reais faltam |
| Dados reais | 18% | Materiais e bases ainda precisam de importação homologada |
| Homologação real | 8% | Servidor local responde; domínio e usuários reais pendentes |
| Preparação Hostinger | 92% | ZIP e roteiro prontos; ambiente final ainda não configurado |

Esses percentuais serão recalculados por evidência ao final de cada fase. Não representam autorização para produção.
