import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  chaveDoAtivo,
  pecaOferecida,
  type LinhaDeAtivo,
  type PecaOferecida,
} from "./importar-biblioteca-de-midia.ts";

/**
 * AS DUAS CONVERSAS COM `creative_assets` QUE A IMPORTAÇÃO PRECISA — uma
 * leitura e uma gravação, escritas UMA vez.
 *
 * Elas moram aqui, e não dentro da rota, porque têm dois consumidores: a rota
 * (`/api/v1/marketing/biblioteca-de-midia`) e o ensaio a seco
 * (`scripts/ensaio-a-seco-biblioteca.mjs`). Duas cópias do mesmo SELECT
 * divergiriam no primeiro ajuste — e a divergência apareceria do pior jeito
 * possível: o ensaio dizendo "25 peças a importar" e a rota gravando 25
 * duplicatas porque procurou as existentes com outro filtro.
 *
 * A decisão continua fora daqui, em `importar-biblioteca-de-midia.ts`, que é
 * puro e o contrato executa. Este arquivo só fala com o banco.
 */

/** Teto de leitura, dito em voz alta: recorte silencioso passa por lista completa. */
export const TETO_DE_ATIVOS = 500;

export type AtivosDaBiblioteca =
  | { ok: true; pecas: PecaOferecida[]; chaves: Set<string> }
  | { ok: false; erro: string };

/**
 * As peças que o CRM já pode oferecer, e as chaves que já existem.
 *
 * Erro do PostgREST NUNCA vira lista vazia: "permissão negada" e "não há peça
 * nenhuma" pedem coisas opostas de quem lê a tela — e, pior, um erro lido como
 * lista vazia faria a importação achar que precisa gravar tudo de novo.
 */
export async function lerAtivosDaBiblioteca(organizationId: string): Promise<AtivosDaBiblioteca> {
  const { data, error } = await getSupabaseAdmin()
    .from("creative_assets")
    .select("id,name,asset_url,metadata,created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(TETO_DE_ATIVOS);
  if (error) return { ok: false, erro: error.message };

  const pecas: PecaOferecida[] = [];
  const chaves = new Set<string>();
  for (const linha of data ?? []) {
    const chave = chaveDoAtivo(linha);
    // Peça de texto do Creative Studio: mesma tabela, nada para citar.
    if (!chave) continue;
    chaves.add(chave);
    const peca = pecaOferecida(linha);
    if (peca) pecas.push(peca);
  }
  return { ok: true, pecas, chaves };
}

/**
 * Grava as linhas planejadas. Só INSERT — nada é apagado nem sobrescrito: uma
 * peça pode estar citada numa proposta pendente, e mexer nela por trás faria a
 * proposta perder a referência que o aprovador leu.
 *
 * O erro do banco volta INTEIRO. Foi um 23503 mudo em `campaign_id` que manteve
 * esta tabela com zero linhas por meses.
 */
export async function gravarPecasImportadas(
  linhas: LinhaDeAtivo[],
): Promise<{ ok: true; gravadas: number } | { ok: false; erro: string }> {
  if (!linhas.length) return { ok: true, gravadas: 0 };
  const { data, error } = await getSupabaseAdmin().from("creative_assets").insert(linhas).select("id");
  if (error) return { ok: false, erro: error.message };
  return { ok: true, gravadas: data?.length ?? 0 };
}
