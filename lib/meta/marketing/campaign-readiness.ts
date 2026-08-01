import "server-only";

import { cachedMetaRead } from "@/lib/meta/marketing/insights-cache";
import { derivarProntidao, type BloqueioDeAquisicao, type FonteCadastrada, type ProntidaoMedida } from "@/lib/meta/marketing/prontidao-derivada";

/**
 * PRONTIDÃO DA AQUISIÇÃO — o que decide se entra lead nova amanhã.
 *
 * ── POR QUE ISTO EXISTE ──────────────────────────────────────────────────────
 *
 * O CRM pode estar 10/10 e não receber uma única lead, porque quem traz lead é
 * a campanha. Medido em 2026-07-28 com os tokens de produção: as 4 campanhas
 * ATIVAS publicam numa Página que o System User não administra, e o teto de
 * gasto da conta está esgotado. Nenhum dos dois fatos aparece em tela alguma —
 * eles só existem se alguém rodar `scripts/meta-prontidao-campanhas.mjs` no
 * terminal.
 *
 * Enquanto isso o painel de Marketing da central mostra CPL "—" com o subtexto
 * "Custo não medido", que é indistinguível de "ainda não gastamos". O diretor
 * abre o CRM, lê um funil parado, e supõe que leads novas vão entrar por cima.
 * Não entra nenhuma. É a diferença entre "trabalhe o que tem" e "espere
 * reposição" — e hoje ele decide isso no escuro.
 *
 * ── FRONTEIRAS ───────────────────────────────────────────────────────────────
 *
 * Só LEITURA na Graph API. Nada é criado, pausado ou alterado, e nenhuma verba
 * se move. Falha de rede vira `medido: false` com o motivo — nunca ausência e
 * nunca verde. Publicar saúde por falha de leitura é a pior mentira possível
 * numa tela de comando.
 */

const GRAPH_VERSION = "v23.0";

// TTL generoso: prontidão muda quando alguém mexe no Gerenciador de Anúncios,
// o que é evento manual e raro. O refresh da central é de 60s — sem cache,
// duas leituras Graph por minuto por diretor derrubariam o rate limit.
const READINESS_TTL_MS = 10 * 60_000;

export type { BloqueioDeAquisicao };

export type ProntidaoDeAquisicao = { medido: false; motivo: string; lidoEm: string } | ProntidaoMedida;

async function graph(caminho: string, campos: string | null, extra: Record<string, string | number> = {}, token: string) {
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${caminho}`);
  if (campos) url.searchParams.set("fields", campos);
  for (const [chave, valor] of Object.entries(extra)) url.searchParams.set(chave, String(valor));
  url.searchParams.set("access_token", token);
  const resposta = await fetch(url, { cache: "no-store" });
  const corpo = (await resposta.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: resposta.ok, corpo };
}

/**
 * Lê a prontidão da conta de anúncios e cruza com as fontes cadastradas.
 *
 * `fontes` chega de fora (já lidas de `meta_lead_sources` pelo chamador) para
 * esta função não precisar de cliente de banco — e para o cache guardar apenas
 * o resultado da parte cara, que é a Graph.
 */
export async function lerProntidaoDeAquisicao(input: {
  contaId: string | null | undefined;
  token: string | null | undefined;
  fontes: FonteCadastrada[];
}): Promise<ProntidaoDeAquisicao> {
  const agora = () => new Date().toISOString();
  if (!input.token || !input.contaId) {
    return { medido: false, motivo: "Credenciais da Meta não configuradas neste ambiente.", lidoEm: agora() };
  }
  const token = input.token;
  const contaId = input.contaId;

  const bruto = await cachedMetaRead(
    `readiness:${contaId}`,
    async () => {
      const conta = await graph(contaId, "name,account_status,currency,spend_cap,amount_spent,disable_reason", {}, token);
      if (!conta.ok) {
        const erro = (conta.corpo.error ?? {}) as { message?: string };
        return { falhou: true as const, motivo: erro.message || "A conta de anúncios não respondeu." };
      }
      const campanhas = await graph(`${contaId}/campaigns`, "name,effective_status", { limit: 100 }, token);
      // O creative INTEIRO, e a busca em qualquer profundidade: dependendo de
      // como o anúncio foi montado (Advantage+, catálogo, criativo dinâmico) o
      // lead_gen_form_id não está em object_story_spec.link_data. A primeira
      // versão do script que virou esta lib procurava num caminho só e
      // concluiu "0 formulários" com 19 anúncios ativos usando um.
      const anuncios = await graph(
        `${contaId}/ads`,
        "name,effective_status,creative{object_story_spec,asset_feed_spec,object_type,effective_object_story_id}",
        { limit: 100, effective_status: '["ACTIVE"]' },
        token,
      );
      return { falhou: false as const, conta: conta.corpo, campanhas: campanhas.corpo, anuncios: anuncios.corpo };
    },
    { ttlMs: READINESS_TTL_MS, isCacheable: (valor) => !valor.falhou },
  );

  if (bruto.falhou) return { medido: false, motivo: bruto.motivo, lidoEm: agora() };

  return derivarProntidao({
    contaId,
    lidoEm: agora(),
    conta: bruto.conta as Record<string, unknown>,
    campanhas: (((bruto.campanhas as Record<string, unknown>).data ?? []) as Array<{ effective_status?: string }>),
    anuncios: (((bruto.anuncios as Record<string, unknown>).data ?? []) as Array<{ creative?: unknown }>),
    fontes: input.fontes,
  });
}
