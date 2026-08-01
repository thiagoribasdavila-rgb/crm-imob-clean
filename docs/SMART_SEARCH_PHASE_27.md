# Fase 27 — Busca inteligente

## Missão

Encontrar rapidamente uma lead mesmo quando o usuário lembra apenas parte do nome, telefone, e-mail, projeto, incorporadora, corretor, origem ou intenção.

## Funcionamento

A busca consulta somente registros visíveis pelo RLS e pela hierarquia do usuário. Resultados de projetos e corretores são relacionados novamente às leads dentro do mesmo escopo. A resposta informa por quais campos a lead foi encontrada e sugere abrir o Lead 360, definir próxima ação ou tratar um follow-up vencido.

## Experiência

- página dedicada com busca progressiva e atraso curto para evitar excesso de consultas;
- paleta global pelo teclado usando o mesmo endpoint;
- tolerância a acentos e normalização de texto;
- busca parcial de telefone a partir de quatro dígitos;
- ranking por correspondência exata, quantidade de sinais, score e urgência;
- estados vazios que não revelam a existência de registros ocultos.

## Homologação

1. Buscar por nome com e sem acento.
2. Buscar por parte do telefone e e-mail.
3. Buscar pelo nome do projeto e da incorporadora.
4. Buscar pelo corretor, origem e intenção.
5. Comparar corretor, gerente e diretor para validar escopo.
6. Confirmar que uma lead lateral não aparece nem altera a contagem.
7. Validar paleta com teclado, celular e busca interrompida.
