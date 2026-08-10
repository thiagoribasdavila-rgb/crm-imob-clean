# ATLAS ONE — Fase 53: validação de respostas dos relatórios

## Objetivo

Evitar que uma resposta parcial ou malformada de um serviço de relatórios derrube a tela, substitua uma leitura correta por dados inválidos ou induza uma decisão comercial inconsistente.

## Alteração realizada

- O painel agora valida a estrutura do briefing, da leitura semanal de incorporadoras e da revisão operacional antes de atualizar qualquer estado tipado.
- A validação cobre totais, funil por etapa, séries de campanhas, incorporadoras, qualidade dos vínculos e indicadores de atendimento usados na interface.
- Se uma resposta não estiver completa, a interface preserva a última leitura válida e explica que parte da atualização não pôde ser aplicada.

## Impacto operacional

O diretor e a equipe continuam vendo a última informação consistente durante uma indisponibilidade ou regressão pontual de API, em vez de receber uma tela quebrada ou números incompletos como se fossem atuais.

## Validação prevista

- formatação dos arquivos alterados;
- verificação de tipos;
- lint;
- contrato de validação de payload dos relatórios;
- contratos já existentes de integridade e governança de relatórios.

## Próxima etapa

Revisar o comportamento de atualização parcial por cartão para tornar explícita a hora da última leitura válida de cada fonte, sem misturar dados de períodos diferentes.
