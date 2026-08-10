# Fase 155 — Meta Campaign Homologation Workbench

## Objetivo

Criar uma esteira simples para campanhas que já subiram no Meta: confirmar campanha publicada, testar lead real, qualificar o cliente e devolver sinais de conversão para o aprendizado do público.

## Problema resolvido

Depois que uma campanha sobe, a operação precisa saber se ela está apenas gerando volume ou se está gerando compradores reais. A Fase 155 cria uma leitura executiva para evitar decisões por ansiedade e orientar escala somente com evidência comercial.

## Alterações realizadas

- A página de campanhas ganhou a seção **Esteira de homologação Meta**.
- A esteira mostra quatro passos:
  - campanha publicada no Meta;
  - lead real recebido;
  - cliente qualificado;
  - conversão devolvida.
- A tela ganhou uma matriz de perguntas que qualificam clientes:
  - objetivo;
  - prazo;
  - pagamento;
  - região;
  - tipologia.
- A experiência reforça que Andromeda depende dos sinais que o CRM devolve para a Meta.

## Impacto operacional

O diretor passa a enxergar o que falta antes de escalar campanha. O corretor entende quais informações precisa coletar para melhorar score, atendimento e aprendizado de público. A IA fica preparada para transformar respostas simples em sinais úteis de conversão.

## Segurança e governança

- Nenhuma campanha real é modificada.
- Nenhum webhook ou token é alterado.
- Nenhuma migration foi criada.
- Nenhum envio automático para Meta foi adicionado nesta fase.
- A decisão de escala continua humana e registrada fora desta camada visual.

## Checklist de validação

- `npm run evolution:phase-155:check`
- `npm run typecheck`
- `npm run lint`

## Próxima etapa recomendada

Salvar os rascunhos de campanha e o checklist de homologação como registros auditáveis para o diretor aprovar antes do teste real de lead.
