# Atlas One — Fase 26: busca compacta de projetos e materiais

## Resultado

O Hub de Materiais existente passou a localizar a oferta por projeto, incorporadora, região e tipologia na mesma área. O corretor pode partir do Lead 360 com o projeto previamente selecionado ou pesquisar o portfólio sem percorrer telas administrativas.

## Decisões de experiência

- uma caixa pesquisa nome, incorporadora, bairro, cidade, estado, tipo de produto e tipologias;
- filtros explícitos refinam incorporadora, região e tipologia;
- o total aderente e a limpeza conjunta dos filtros ficam visíveis;
- cada resultado antecipa localização, tipologia e estado comercial;
- o kit comercial vigente permanece ao lado da busca, com o mesmo controle de versão, revisão e link privado.

## Governança preservada

O endpoint continua autenticado, limitado por organização e protegido por rate limit. Não foram criadas tabelas, migrations, policies, automações ou release. Apenas campos já existentes no cadastro canônico do empreendimento passaram a compor a leitura operacional.
