# V3000 — Fase 52: Command Center por exceção

## Resultado

O Command Center deixou de repetir os mesmos totais e a mesma prioridade em
blocos diferentes. A leitura operacional agora tem uma hierarquia única:

1. uma decisão principal no topo;
2. até três exceções secundárias, sem repetir a decisão principal;
3. três indicadores de apoio sem ação concorrente.

O usuário abre a rota da prioridade diretamente pelo topo. As exceções levam à
rota operacional correspondente; de lá, a oportunidade fica acessível em no
máximo mais um clique. Assim, o caminho até a oportunidade permanece limitado a
dois cliques.

## Regras de composição

- A decisão principal continua derivada do cálculo operacional já existente.
- A fila elimina duplicações pelo título e destino normalizados.
- Exceções são ordenadas por criticidade e estabilidade de origem.
- A fila nunca exibe mais de três itens.
- Os indicadores de apoio nunca exibem mais de três sinais.
- Nenhuma ação de negócio é executada automaticamente.

## Dados e segurança

Não foi criada consulta adicional nem ampliada a visibilidade no cliente. Os
dados vêm das APIs autenticadas já usadas pelo Command Center, respeitando o
perfil, a organização e a RLS do Supabase. Esta fase não cria migration, não
altera o banco, não chama modelo de IA e não usa dados sintéticos.

## Aceite verificável

- uma única ação principal visível no topo;
- até três exceções secundárias não repetidas;
- até três sinais de apoio;
- acesso à oportunidade em até dois cliques;
- estados vazios orientam a continuidade sem inventar alerta;
- leitura responsiva em desktop e mobile.
