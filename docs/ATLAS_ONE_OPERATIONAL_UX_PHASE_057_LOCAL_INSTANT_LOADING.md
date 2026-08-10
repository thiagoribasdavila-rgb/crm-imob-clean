# Atlas One — Fase 57: loading local e navegação percebida como instantânea

## Resultado

As oito rotas operacionais de maior frequência agora possuem limites locais de carregamento. A barra lateral, o topo e os controles globais permanecem disponíveis enquanto somente a área de destino apresenta seu estado transitório.

## Rotas cobertas

- Sala de Comando;
- leads;
- pipeline;
- tarefas;
- agenda;
- Clientes 360;
- projetos;
- campanhas.

O fallback compartilhado ganhou cinco geometrias coerentes com a tarefa: visão geral, lista, kanban, agenda e portfólio. Isso reduz a mudança visual entre o clique e a tela pronta sem inventar números, porcentagens ou latência.

## Segurança e acessibilidade

- um único anúncio acessível por limite local;
- skeletons decorativos ocultos de leitores de tela;
- animações removidas quando o sistema solicita movimento reduzido;
- nenhuma consulta, permissão, rota ou dado foi alterado;
- nenhum progresso fictício foi adicionado.

## Limite técnico explícito

O projeto não habilita `cacheComponents` e as telas críticas atuais são Client Components. Por isso, `unstable_instant` não foi inserido: a versão instalada do Next só aceita essa validação com Cache Components e não permite o export em Client Components. A fase usa a convenção suportada `loading.tsx`, prefetch existente e estados locais, sem mudar a arquitetura de dados.

## Validação

O contrato verifica os oito limites, variantes, shell persistente, semântica acessível, movimento reduzido e ausência de progresso falso. A Fase 58 deve validar cenários com dados reais e comparação posterior, sem confundir cenário com previsão comprovada.
