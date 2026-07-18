# Fase 026 — Hierarquia visual da navegação

## Resultado

A navegação agora deixa explícitos o contexto empresarial, o grupo funcional e a tela atual. A hierarquia foi reforçada sem aumentar o catálogo ou devolver a repetição eliminada na Fase 025.

## Contexto governado na topbar

A topbar deixou de manter uma lista paralela e incompleta de nomes. O contexto é resolvido diretamente pelo catálogo governado de 20 destinos principais e 6 comandos contextuais.

A correspondência mais específica prevalece. Assim, uma rota profunda como `/leads/import` é identificada como **Reativação**, enquanto outras rotas abaixo de `/leads` continuam herdando o contexto de **Leads**.

A apresentação possui três níveis:

1. empresa, como contexto discreto;
2. grupo funcional, como categoria;
3. destino atual, como informação principal.

## Hierarquia semântica na sidebar

Cada grupo passou a ser uma `section` identificada por um título `h2`. A relação usa `aria-labelledby`, permitindo que tecnologia assistiva compreenda a estrutura, além da separação visual.

O grupo que contém o destino ativo recebe um marcador próprio. Quando o item ativo está fixado, a seção de Favoritos assume esse contexto sem marcar simultaneamente o grupo original.

## Estado atual inequívoco

O destino ativo combina sinais independentes:

- `aria-current="page"`;
- texto explícito **Atual**;
- trilho lateral;
- maior peso tipográfico;
- superfície destacada do ícone;
- marcador do grupo atual.

O estado não depende somente de cor. No menu recolhido, o texto é ocultado, mas o link mantém nome acessível, ícone destacado e trilho ativo.

## Prioridade e toque

Ícones inativos agora usam contraste secundário. O ícone ativo e o destino atual recebem a maior ênfase, enquanto a ação de favoritar permanece visualmente discreta.

Tanto o destino quanto a ação de favorito possuem alvo mínimo de 44 pixels. O menu recolhido também recentraliza o link depois de ocultar as ações secundárias.

## Preservação funcional

- 20 destinos principais preservados.
- 6 comandos contextuais preservados.
- 4 destinos móveis primários preservados.
- Nenhuma rota removida.
- Nenhuma permissão alterada.
- RBAC e favoritos preservados.

## Limite de evidência

Esta fase comprova hierarquia estrutural, semântica e visual no código. Ela não afirma melhora de tempo, clique, conclusão ou adoção; esses indicadores continuam dependentes de telemetria real autorizada.

## Segurança

- Nenhum dado comercial foi lido ou alterado.
- Nenhuma variável de ambiente foi consultada.
- Nenhuma informação pessoal foi capturada.
- Nenhuma decisão automática sobre pessoas foi executada.
- O bloqueio de staging da Fase 020 permanece ativo.

## Próxima fase

Fase 027 — **Arquitetura de navegação · Reduzir passos da tarefa**.

O próximo avanço deve encurtar jornadas críticas usando entradas contextuais comprovadas, sem criar atalhos duplicados ou contornar permissões.
