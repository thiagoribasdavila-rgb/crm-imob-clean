# Fase Final 10 — Regressão e pacote Hostinger

## Resultado

O fechamento usa exclusivamente o commit Git aprovado. O pacote não reaproveita o V2 e não inclui `.env.local`, chaves, dados pessoais, planilhas, PDFs, dependências instaladas, cache de build, arquivos temporários ou saídas locais.

## Integridade

O ZIP contém manifesto com versão e commit, inventário SHA-256 de cada arquivo e checksum SHA-256 externo. A verificação extrai o pacote em diretório temporário, rejeita caminhos inseguros e compara cada arquivo com o inventário.

## Instalação

Na Hostinger, usar Node.js 24, executar `npm ci`, `npm run prisma:generate`, aplicar as migrations aprovadas no Supabase de homologação e iniciar com `npm start` ou `pm2 start ecosystem.config.cjs`. As chaves devem ser preenchidas no painel da Hostinger, nunca dentro do ZIP.

## Estado de liberação

O artefato é um candidato final de homologação. Produção continua bloqueada até smoke HTTPS, quatro perfis, dois tenants, restauração, rollback e GO formal do diretor. Gerar o ZIP não publica nem autoriza produção.

## Verificação

Execute `npm run package:hostinger`. O comando gera e valida o ZIP e o checksum em `dist/hostinger`. Depois do upload em homologação, execute `ATLAS_SMOKE_BASE_URL=https://seu-dominio npm run smoke:hostinger`.
