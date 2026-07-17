# Fase Final 6 — Projetos e incorporadoras

## Resultado

O corretor encontra o projeto por nome, incorporadora, cidade ou região e abre o kit comercial vigente sem sair do centro de materiais. Book, tabela e espelho aparecem primeiro, com versão e disponibilidade explícitas.

## Correção funcional

As operações de listar e publicar materiais agora enviam o token da sessão, como a validação gerencial já fazia. Antes, essas chamadas dependiam de autenticação implícita incompatível com a API protegida e poderiam retornar acesso negado.

## Pacote comercial

- Book, tabela e espelho com acesso direto.
- Estoque e espelho de vendas.
- Vigências e histórico de versões.
- Fluxos de pagamento por incorporadora.
- Tipologias, diferenciais, estudo regional e dossiê para IA.
- Cobertura e pendências consolidadas por incorporadora.

## Atualização simples e segura

A gestão escolhe projeto, tipo, vigência e arquivo. A versão anterior é arquivada, a nova passa a ser corrente e o evento fica auditado. A API valida tipo real do arquivo, assinatura, tamanho máximo, datas, organização, projeto e permissão do usuário.

## Nuvem privada

Os materiais permanecem em bucket privado. A tela recebe apenas links assinados com 15 minutos de duração; caminho interno e separação por organização não são expostos. Leitura e upload exigem sessão autenticada.

## Critério de experiência

Do portfólio ao arquivo vigente são necessárias no máximo três interações: buscar projeto, selecionar e abrir o item essencial. Materiais ausentes aparecem como pendência, nunca como se estivessem disponíveis.
