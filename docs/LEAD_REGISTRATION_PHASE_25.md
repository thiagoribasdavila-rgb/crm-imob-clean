# Fase 25 — Cadastro de lead

## Missão

Permitir que o corretor cadastre uma lead em poucos segundos, com o mínimo necessário, sem duplicar clientes e sem perder a qualificação opcional.

## Experiência

O primeiro bloco pede somente nome, telefone ou e-mail, origem e projeto. Objetivo, dormitórios, orçamento, regiões e observações ficam em “Adicionar qualificação agora” e podem ser concluídos depois no Lead 360. O botão só habilita quando há nome e contato, possui alvo adequado para toque e mostra o campo que precisa de correção.

## Validação e duplicidade

- nome entre 2 e 120 caracteres;
- pelo menos telefone com DDD ou e-mail válido;
- origem e objetivo limitados aos valores aceitos;
- orçamento, dormitórios, projeto, regiões e observações com limites explícitos;
- telefone normalizado e e-mail em minúsculas;
- bloqueio de telefones com histórico de qualidade inválida;
- deduplicação dentro da organização por telefone ou e-mail.

A criação usa uma função transacional com trava por contato. Duas requisições concorrentes não criam duas leads. Quando a lead duplicada pertence ao escopo do usuário, a tela oferece abri-la; fora do escopo, informa apenas a duplicidade e não revela identidade ou responsável.

## Homologação

1. Criar lead somente com nome e telefone.
2. Criar lead somente com nome e e-mail.
3. Validar telefone, e-mail, orçamento e projeto inválidos.
4. Enviar simultaneamente o mesmo contato e confirmar uma única lead.
5. Tentar duplicar lead visível e confirmar o atalho para o Lead 360.
6. Tentar duplicar lead de carteira lateral e confirmar ausência de identificação.
7. Tentar recadastrar telefone suprimido e confirmar bloqueio.
8. Testar o fluxo em celular e medir conclusão em menos de um minuto.
