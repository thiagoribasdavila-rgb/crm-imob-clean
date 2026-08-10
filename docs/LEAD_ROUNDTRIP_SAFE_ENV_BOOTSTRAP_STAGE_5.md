# Homologação do lead real — Etapa 5

## Resultado

A causa estrutural registrada na Etapa 4 foi tratada sem inventar credenciais: existe agora um modelo mínimo e seguro para preparar a homologação do lead de ponta a ponta.

Esta etapa **não cria `.env.local`**, não tenta autenticar e não abre conexão. Ela apenas organiza o preenchimento humano e privado das 12 variáveis necessárias para que a auditoria estrutural possa ser repetida depois.

## Entregas

- `.env.homologation.example`: modelo sem valores reais;
- `config/environments/lead-roundtrip-homologation-env-manifest.json`: fonte única de escopo e classificação;
- `scripts/check-lead-roundtrip-safe-env-bootstrap.mjs`: verificação determinística do modelo;
- proteção ampliada do empacotador: qualquer arquivo `.env` real fica fora do ZIP;
- `.gitignore` permite somente os modelos terminados em `.example`.

## Separação de segurança

Podem aparecer no navegador apenas as configurações marcadas como públicas, como URL do projeto e publishable key. Senha de teste, `DATABASE_URL` e **service role** permanecem exclusivamente no servidor.

O arquivo preenchido deve existir apenas como `.env.local` na máquina autorizada e como variáveis privadas do ambiente Hostinger. Ele permanece fora do ZIP e do repositório.

## Como avançar com segurança

1. Copiar `.env.homologation.example` para `.env.local` fora de qualquer commit ou pacote.
2. Substituir todos os valores `replace-with-*` usando exclusivamente o ambiente de homologação.
3. Usar tenant dedicado e conta sintética; nunca um cliente real nesta validação inicial.
4. Executar novamente `npm run homologation:lead-roundtrip:environment:audit`.
5. Somente após 11/11 verificações, preencher e aprovar o permit humano da Etapa 3.

O modelo sozinho não libera escrita, autenticação, emissão Meta, produção nem geração do ZIP.

## Declaração de não execução

Nenhuma credencial foi criada, copiada, testada ou revelada. Nenhum banco, ambiente Hostinger, campanha ou conta Meta foi alterado.
