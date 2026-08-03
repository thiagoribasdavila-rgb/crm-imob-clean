/**
 * O ADAPTADOR: a porta estreita de `corrida-pela-lead` cumprida com o Supabase.
 *
 * Nenhuma regra de negócio mora aqui — é tradução de intenção para PostgREST, e
 * a razão de existir separado é que o ensaio de concorrência precisa
 * implementar a MESMA porta sem tocar em rede. O árbitro que roda em produção é
 * o mesmo objeto que o ensaio exercita; se ele fosse escrito dentro da rota,
 * provar a corrida exigiria levantar a rota — e por isso não seria provado.
 *
 * Toda escrita pede `.select(...)` e conta as linhas. Sem isso o PostgREST
 * devolve 200 para um update que não casou com nada, e a corrida some.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PortaDaDecisao } from "@/lib/crm/corrida-pela-lead";

/**
 * A porta estreita, DERIVADA do cliente real em vez de redesenhada à mão.
 *
 * Era `from: (tabela: string) => any`, e o `any` desligava a checagem no exato
 * ponto que mais precisa dela: uma escrita sem `.select(...)` continuaria
 * compilando, e é ela que faz o PostgREST devolver 200 para um update que não
 * casou com nada — a corrida some sem ninguém ver.
 *
 * Tentar declarar a cadeia à mão (`update` → `eq` → `is` → `select`) parece
 * mais explícito e é uma armadilha: `from()` devolve o construtor da tabela e
 * os filtros só existem no que `update()` retorna, então a interface caseira
 * deixa de aceitar o cliente de verdade. `Pick` mantém a intenção — este
 * adaptador só precisa de `from` — sem inventar uma segunda descrição da mesma
 * API, que divergiria na próxima versão da biblioteca.
 */
type ClienteMinimo = Pick<SupabaseClient, "from">;

export function portaDaDecisaoSupabase(admin: ClienteMinimo, organizationId: string): PortaDaDecisao {
  return {
    async reivindicar({ registroId, decisao, decididoPor }) {
      const { data, error } = await admin
        .from("ai_shadow_decisions")
        .update({ decisao_humana: decisao, decidido_por: decididoPor, decidido_em: new Date().toISOString() })
        .eq("id", registroId)
        .eq("organization_id", organizationId)
        // O CADEADO. Sem esta linha, duas pessoas gravam por cima uma da outra
        // e as duas recebem "Feito".
        .is("decisao_humana", null)
        .select("id");
      if (error) return { ok: false as const, detalhe: error.message };
      return { ok: true as const, casou: (data ?? []).length };
    },

    async devolverReivindicacao({ registroId, decididoPor }) {
      // Devolve SÓ o que esta pessoa reivindicou. Sem o `eq` em `decidido_por`,
      // um desfazer atrasado apagaria o julgamento de quem ganhou a corrida.
      const { data, error } = await admin
        .from("ai_shadow_decisions")
        .update({ decisao_humana: null, decidido_por: null, decidido_em: null })
        .eq("id", registroId)
        .eq("organization_id", organizationId)
        .eq("decidido_por", decididoPor)
        .select("id");
      return { ok: !error && (data ?? []).length === 1 };
    },

    async moverLead({ leadId, deQuem, paraQuem }) {
      let consulta = admin
        .from("leads")
        // As DUAS colunas de dono: metade das telas lê uma, metade lê a outra.
        .update({ assigned_to: paraQuem, assigned_user_id: paraQuem, updated_at: new Date().toISOString() })
        .eq("id", leadId)
        .eq("organization_id", organizationId);
      // A trava otimista: a lead só se move se ainda estiver onde a decisão a viu.
      consulta = deQuem ? consulta.eq("assigned_to", deQuem) : consulta.is("assigned_to", null);
      const { data, error } = await consulta.select("id");
      if (error) return { ok: false as const, detalhe: error.message };
      return { ok: true as const, casou: (data ?? []).length };
    },

    async quemDecidiu(registroId) {
      const { data } = await admin
        .from("ai_shadow_decisions")
        .select("decisao_humana,decidido_por")
        .eq("id", registroId)
        .eq("organization_id", organizationId)
        .maybeSingle();
      const decisao = typeof data?.decisao_humana === "string" ? data.decisao_humana : null;
      if (!data?.decidido_por) return { nome: null, decisao };
      const { data: perfil } = await admin
        .from("profiles")
        // `full_name` primeiro e por extenso: medido, 488 das 489 leads com dono
        // têm o dono com `name` NULO. Ler só `name` devolveria "outra pessoa".
        .select("full_name,name")
        .eq("id", data.decidido_por)
        .maybeSingle();
      return { nome: (perfil?.full_name || perfil?.name || null) as string | null, decisao };
    },

    async quemEstaComALead(leadId) {
      const { data } = await admin
        .from("leads")
        .select("assigned_to")
        .eq("id", leadId)
        .eq("organization_id", organizationId)
        .maybeSingle();
      if (!data?.assigned_to) return { nome: null };
      const { data: perfil } = await admin
        .from("profiles")
        .select("full_name,name")
        .eq("id", data.assigned_to)
        .maybeSingle();
      return { nome: (perfil?.full_name || perfil?.name || null) as string | null };
    },
  };
}
