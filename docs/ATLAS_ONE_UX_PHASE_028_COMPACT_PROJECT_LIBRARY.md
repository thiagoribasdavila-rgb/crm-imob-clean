# ATLAS ONE — Fase 28: biblioteca operacional compacta por projeto

## Objetivo

Reduzir ruído na busca de materiais sem criar um módulo novo nem alterar o modelo de dados. O corretor passa a encontrar o arquivo pela intenção de uso, dentro do projeto selecionado.

## Entrega

- **Oferta comercial:** book, tabela e espelho.
- **Plantas e implantação:** plantas, tipologias e implantação.
- **Imagens e vídeos:** apresentações, vídeos e arquivos cujo MIME identifica conteúdo visual.
- **Documentos de apoio:** memoriais, fichas e materiais complementares.
- Linhas compactas substituem cartões grandes e repetitivos.
- Busca, filtro, abertura, compartilhamento, validação, upload e histórico de versão foram preservados.

## Segurança e dados

- Nenhuma migration foi criada.
- A fonte continua sendo `project_materials` e o armazenamento privado já configurado.
- A API continua isolada por organização e entrega links assinados com validade curta.
- Imagens são reconhecidas pelo MIME real; não foi criada categoria fictícia no banco.

## Validação

Execute:

```bash
npm run ux:phase-028:check
npm run typecheck
npm run lint
npm test
```
