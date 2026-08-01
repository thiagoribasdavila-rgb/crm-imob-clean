# ATLAS AI OS — governança da evolução contínua

## Regra de execução

O programa passa a operar com uma entrega real por dia e horizonte infinito. As 3.000 fases permanecem como backlog de referência, não como linha de chegada nem porcentagem de maturidade. Planejamento, tela criada sem fluxo funcional e porcentagem estimada não contam como evolução concluída. Cada fase precisa de alteração verificável, evidência, risco explícito e validação proporcional ao impacto.

Somente uma fase pode ficar em andamento. A validação diária usa testes direcionados, typecheck quando houver código, lint dos arquivos alterados e varredura de segredos. Build completo é proibido no ciclo diário.

## Ordem de prioridade

1. Operação real: acesso, CRM, leads, pipeline, histórico, tarefas, follow-up e painel básico.
2. Inteligência assistiva: resumo, próxima ação, score explicável, alertas e apoio à gestão.
3. Automação governada: WhatsApp, mídia, distribuição, nutrição e relatórios.
4. Command Center por nível hierárquico.

Toda proposta deve responder: **isso aumenta a capacidade operacional do Atlas?** Trabalho sem impacto operacional comprovável permanece planejado.

## Verdade do progresso

- uma fase planejada não é uma fase concluída;
- cobertura estrutural não é resultado de uso;
- IA preparada não é IA ativa;
- chave configurada não é integração homologada;
- interface carregando não é operação pronta;
- nenhum bloqueio externo é mascarado por porcentagem otimista.

## Política de pacote

O ZIP recorrente do programa anterior foi encerrado como política ativa. O pacote histórico da fase 47 é preservado. O próximo artefato será `ATLAS_AI_OS_RELEASE_v1.zip`, somente quando estrutura, código, dependências, banco, ambiente, testes críticos e operação mínima tiverem evidência aprovada. O fechamento executará exatamente um build local.

O pacote de release não incluirá `.env.local`, segredos, planilhas de clientes, PDFs privados ou dados pessoais.
