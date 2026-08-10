# Atlas One — release operacional consolidada

Data da verificação: 23/07/2026

## Resultado

A base canônica é o workspace atual. Ela preserva autenticação, organização,
perfil administrativo, isolamento por organização, RLS e as migrations já
existentes. Nenhum bootstrap foi reexecutado e nenhum dado remoto foi apagado.

O candidato de homologação foi gerado em:

`dist/hostinger/ATLAS_ONE_FINAL_OPERACIONAL.zip`

- Arquivos: 2.252
- Tamanho: 5.396.412 bytes
- SHA-256: `1552e018057a4be779cddcc9373f683ac35f94007aa07249a2a1edb06897544c`
- Verificação do pacote: aprovada

## Evidências técnicas aprovadas

- Next.js 16.2.11 compilado em modo de produção;
- 17 testes de contrato aprovados;
- TypeScript e lint aprovados;
- 248 arquivos de rota ativos auditados;
- 181 arquivos de rota legados isolados;
- 94 páginas ativas e 29 destinos oficiais;
- zero colisão de rota ativa;
- zero credencial detectada em 3.136 arquivos;
- 154 APIs classificadas;
- autenticação, RBAC, pós-login e endurecimento Supabase aprovados;
- zero vulnerabilidade alta no conjunto de produção.

## Escopo apresentado como operacional

- login, sessão, perfil e contexto da organização;
- Command Center;
- leads e Lead 360;
- pipeline;
- tarefas, agenda e atividades;
- clientes;
- relatórios;
- usuários e permissões suportados pelo banco atual;
- configurações e saúde das integrações;
- projetos, materiais, estoque e campanhas somente conforme o contrato já
  implementado, sem declarar integrações externas como conectadas.

Rotas experimentais, duplicadas e superfícies antigas de evolução foram
retiradas da navegação diária e mantidas fora da release ativa.

## Bloqueio de publicação em produção

O candidato não deve substituir o ambiente funcional antes do aceite
autenticado dos seguintes fluxos com dados reais:

1. criar uma incorporadora e um projeto;
2. enviar, abrir e baixar um book;
3. importar e confirmar uma tabela de preços;
4. criar um gerente e um corretor e confirmar isolamento por organização;
5. criar uma campanha interna sem credenciais Meta.

Integrações Meta, WhatsApp e outros provedores devem permanecer com o estado
“Conectar integração” até credencial e teste real.

## Implantação segura

1. preservar o deploy atual;
2. criar backup do ambiente e do banco;
3. subir o ZIP como candidato de homologação;
4. manter as variáveis reais apenas na Hostinger;
5. executar os cinco fluxos acima;
6. publicar somente após aceite humano;
7. manter a versão anterior disponível para rollback.

