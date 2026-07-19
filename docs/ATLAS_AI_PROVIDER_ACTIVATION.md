# ATLAS AI — ativação comprovada dos provedores

## Estado da arquitetura

O Atlas possui um roteador único para OpenAI, Perplexity, DeepSeek, Qwen, Kimi e GLM, com contingência local. Uma variável preenchida significa **configurado**; somente uma resposta real íntegra, com modelo, latência, tokens e identificador do provedor registrados, significa **operacional**.

## Ativação na Hostinger

Configure somente no ambiente seguro do servidor, nunca no repositório ou no ZIP:

- `OPENAI_API_KEY`
- `PERPLEXITY_API_KEY`
- `DEEPSEEK_API_KEY` e `ATLAS_DEEPSEEK_MODEL`
- `QWEN_API_KEY` e `ATLAS_QWEN_MODEL`
- `KIMI_API_KEY` e `ATLAS_KIMI_MODEL`
- `GLM_API_KEY` e `ATLAS_GLM_MODEL`

Modelos e URLs podem mudar. O nome do modelo deve ser copiado do painel oficial da mesma conta e região da chave. URLs alternativas são aceitas apenas pelas variáveis `ATLAS_<PROVEDOR>_BASE_URL` no servidor.

## Homologação

1. Acesse **Configurações → Inteligência Artificial** como administrador ou diretor.
2. No **AI Health Center**, execute o teste individual de cada provedor configurado.
3. O provedor somente ficará operacional quando retornar a frase técnica esperada e consumo real maior que zero.
4. Confirme no painel a data, o modelo e a latência do último sucesso.
5. Simule o orquestrador e confirme a ordem de fallback antes de liberar usuários.

## Privacidade e continuidade

- Kimi, Qwen, DeepSeek, GLM e Perplexity não recebem contextos marcados como dados pessoais.
- Ações externas continuam exigindo aprovação humana.
- Falha de qualquer modelo avança para o próximo provedor elegível.
- Se todos falharem, o CRM continua com resposta determinística local.
- Prompts, respostas e chaves não são armazenados na auditoria do roteador.

## Incidente de credencial local

Se uma chave já foi escrita em arquivo local não protegido, revogue-a no provedor, crie outra e configure a substituta diretamente na Hostinger. O arquivo `hostinger.env` permanece ignorado pelo Git e nunca deve ser empacotado.
