# Fase Final 1 — Auditoria global e linha de base

## Inventário comprovado

- 1.708 arquivos rastreados; 1.614 entram no pacote.
- 269 páginas rastreadas; 177 classificadas como implantáveis pelo inventário e 175 materializadas no build atual.
- 135 rotas de API; 134 implantáveis.
- 388 arquivos TSX, sendo 140 componentes/telas cliente.
- 119 migrations Supabase.
- 121 arquivos com efeitos React, principal área para consolidar carregamento e cancelamento.
- Cinco telas acima de 800 linhas: Lead 360 (2.009), Meta (1.496), leads (1.216), dashboard (913) e configurações de IA em seguida (522).
- Apenas um boundary global de loading, erro e não encontrado; boundaries locais serão priorizados onde dados externos dominam o tempo de resposta.
- Nenhuma tag `img` bruta; imagens continuam no pipeline otimizado.

## Riscos priorizados

1. Componentes grandes aumentam custo de manutenção, renderização e regressão.
2. Carregamentos manuais repetidos dificultam cache, cancelamento e feedback consistente.
3. Meta, Lead 360 e dashboard concentram muitas responsabilidades.
4. Efeitos de vidro e blur devem permanecer controlados em mobile e placas gráficas modestas.
5. Homologação real ainda é necessária para afirmar latência, Core Web Vitals e capacidade na Hostinger.

## Melhorias já incorporadas à linha de base

- Identidade do shell compartilhada, reduzindo as consultas iniciais de cinco para três (40%).
- Cache de sessão com revalidação silenciosa.
- Conteúdo fora da tela usa renderização diferida.
- Animação contínua e blur pesado foram reduzidos.
- CRM possui busca imediata, filtros progressivos e Lead 360 focado em ações.

## Gate para a Fase 2

O inventário deve continuar reproduzível; arquivos locais `outputs/` e `tmp/` permanecem fora de commits; nenhuma alteração pode reduzir o isolamento por perfil ou organização.
