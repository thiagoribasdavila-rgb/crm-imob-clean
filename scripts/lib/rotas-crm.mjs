/**
 * CLASSIFICAR AS ROTAS DO CRM — e dizer quais ficaram ÓRFÃS.
 *
 * ── Por que este módulo existe ──────────────────────────────────────────────
 *
 * `check-evolution-phase-021.mjs` tinha uma asserção chamada "Todas as rotas
 * CRM foram classificadas". Ela era, na íntegra:
 *
 *     inventory.counts.crmRoutes === config.topology.crmRoutes
 *       && inventory.counts.crmRoutes === 139
 *
 * Ela não classifica nada. Compara um total com outro total. E a asserção
 * vizinha, "Buckets fecham o inventário", somava CINCO campos do config e
 * comparava com um SEXTO campo do MESMO config — evidência que a própria
 * entrega escreveu conferindo a si mesma. O inventário medido no disco nem
 * entrava na conta.
 *
 * O que essas duas asserções sabiam sobre classificação: nada. O que elas
 * sabiam sobre o total: que ele mudou. Em 02/08/2026 o total mudou (139 → 140,
 * apoio profundo 71 → 72) porque nasceu `app/(crm)/marketing/
 * campanhas-criativos-proposta/page.tsx` — uma sub-página de `/marketing`, um
 * caso perfeitamente normal — e o portão parou tudo sem saber dizer o quê.
 *
 * ── O que se mede aqui ─────────────────────────────────────────────────────
 *
 * A propriedade que a etiqueta promete: TODA rota vive em exatamente um balde,
 * a soma dos baldes é o total MEDIDO, e nenhuma rota é órfã — isto é, o
 * primeiro segmento de toda rota de apoio ou contextual é uma FAMÍLIA que
 * existe (um destino do catálogo canônico ou uma superfície de topo).
 *
 * Rota órfã é defeito de verdade, e é o que o número nunca pegaria: uma página
 * em `app/(crm)/relatorios-novos/detalhe/page.tsx` sem `/relatorios-novos` no
 * catálogo nem entre as superfícies de topo é uma tela que só existe para quem
 * digitar a URL.
 *
 * Puro de propósito: recebe listas, devolve dado, não lê disco. É o que deixa
 * `tests/contracts/rotas-crm-reprova.test.mjs` alimentar rota órfã e rota
 * duplicada e VER o vermelho.
 */

/**
 * O primeiro segmento navegável de uma rota, como família.
 *
 * As convenções de arquivo do App Router não são segmentos de URL e precisam
 * cair fora antes: slot paralelo (`@ficha`), interceptação (`(.)`, `(..)`,
 * `(...)`) e grupo de rota (`(crm)`). Sem isso `/@ficha/(.)leads/[id]` — a
 * lâmina da ficha do lead sobre a lista — apareceria como órfã de uma família
 * `@ficha` que não existe em lugar nenhum, e a asserção acusaria um defeito
 * inventado.
 */
export function familiaDaRota(rota) {
  const segmentos = rota
    .split("/")
    .filter(Boolean)
    /* Slot paralelo (`@ficha`) e grupo de rota (`(crm)`) somem inteiros: não
       existem na URL. */
    .filter((s) => !s.startsWith("@") && !/^\(.*\)$/.test(s))
    /* Interceptação é PREFIXO do segmento, não segmento: em `(.)leads` a rota
       é `leads`. Tirar o segmento inteiro aqui foi o meu primeiro erro — a
       lâmina da ficha virou órfã de uma família `/(.)leads` que nunca
       existiu, e a asserção teria acusado um defeito inventado. */
    .map((s) => s.replace(/^(?:\(\.{1,3}\))+/, ""));
  return segmentos.length ? `/${segmentos[0]}` : "/";
}

/**
 * Classifica cada rota em um balde e devolve o que ficou de fora.
 *
 * - `canonicas`   destinos do catálogo de navegação que têm página
 * - `dinamicas`   rotas com parâmetro (`[id]`) — contexto, não destino
 * - `apoio`       rotas aninhadas sob uma família (2+ segmentos)
 * - `topo`        rotas de um segmento fora do catálogo
 * - `raiz`        a rota `/`
 * - `orfas`       rotas de apoio/dinâmicas cuja família não existe
 * - `duplicadas`  rotas que caíram em mais de um balde (não pode acontecer)
 */
export function classificarRotasCrm(rotas, destinosCanonicos) {
  const canonico = new Set(destinosCanonicos);
  const baldes = { canonicas: [], dinamicas: [], apoio: [], topo: [], raiz: [] };

  for (const rota of rotas) {
    if (rota === "/") baldes.raiz.push(rota);
    else if (canonico.has(rota)) baldes.canonicas.push(rota);
    else if (rota.includes("[")) baldes.dinamicas.push(rota);
    else if (rota.split("/").filter(Boolean).length > 1) baldes.apoio.push(rota);
    else baldes.topo.push(rota);
  }

  /* A família de uma rota profunda tem de existir como destino canônico ou
     como superfície de topo declarada. Só essas duas são "porta de entrada". */
  const familias = new Set([...canonico, ...baldes.topo]);
  const orfas = [...baldes.apoio, ...baldes.dinamicas]
    .filter((rota) => !familias.has(familiaDaRota(rota)))
    .sort();

  const vistas = new Map();
  for (const [balde, lista] of Object.entries(baldes)) {
    for (const rota of lista) vistas.set(rota, [...(vistas.get(rota) ?? []), balde]);
  }
  const duplicadas = [...vistas.entries()].filter(([, baldesDaRota]) => baldesDaRota.length > 1).map(([rota]) => rota);

  const soma = Object.values(baldes).reduce((total, lista) => total + lista.length, 0);

  return { baldes, orfas, duplicadas, soma, total: rotas.length, fecha: soma === rotas.length && duplicadas.length === 0 };
}
