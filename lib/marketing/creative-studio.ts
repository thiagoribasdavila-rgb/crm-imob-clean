import { generateAIText } from "@/lib/ai/provider-router";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";

/**
 * ATLAS CREATIVE STUDIO — briefing e copies a partir do que já está cadastrado.
 *
 * Duas regras moldam este módulo:
 *
 * 1. NÃO INVENTAR DADO COMERCIAL. Preço, disponibilidade e prazo de entrega só
 *    entram no criativo se estiverem no cadastro. O prompt diz isso à IA de
 *    forma explícita, e `pendencias()` devolve o que falta para que a interface
 *    bloqueie o avanço em vez de deixar a IA preencher o buraco.
 *
 * 2. ECONOMIA POR CONSTRUÇÃO. O briefing é gerado UMA vez e reaproveitado por
 *    todas as copies — em vez de reenviar a ficha do empreendimento a cada peça.
 *    É a diferença entre um prompt de ~600 tokens e um de vários milhares.
 */

export type BriefingEmpreendimento = {
  developmentId: string;
  nome: string;
  incorporadora: string | null;
  bairro: string | null;
  cidade: string | null;
  totalUnidades: number | null;
  areaMin: number | null;
  areaMax: number | null;
  tipologias: string[];
  materiais: Array<{ tipo: string; titulo: string }>;
  /** Campos comerciais que faltam para a campanha ser honesta. */
  pendencias: string[];
};

export type ObjetivoCampanha =
  | "gerar_leads" | "contato_whatsapp" | "gerar_visitas"
  | "divulgar_lancamento" | "vender_estoque" | "atrair_investidores" | "remarketing";

const ROTULO_OBJETIVO: Record<ObjetivoCampanha, string> = {
  gerar_leads: "gerar leads qualificadas por formulário",
  contato_whatsapp: "iniciar conversas no WhatsApp",
  gerar_visitas: "agendar visitas ao decorado",
  divulgar_lancamento: "divulgar o lançamento e construir audiência",
  vender_estoque: "vender unidades específicas em estoque",
  atrair_investidores: "atrair investidores",
  remarketing: "reconquistar quem já demonstrou interesse",
};

/** Lê o empreendimento e monta o insumo do briefing — sem IA, só dado cadastrado. */
export async function carregarEmpreendimento(organizationId: string, developmentId: string): Promise<BriefingEmpreendimento | null> {
  const admin = getSupabaseAdmin();
  const [dev, materiais, tipologias] = await Promise.all([
    admin.from("developments")
      .select("id,name,developer_name,neighborhood,city,total_units,private_area_min,private_area_max,typologies,price_min,price_max,delivery_date,sales_cycle_status")
      .eq("id", developmentId).eq("organization_id", organizationId).maybeSingle(),
    admin.from("project_materials").select("material_type,title").eq("development_id", developmentId).eq("is_current", true),
    admin.from("development_typologies").select("code,name").eq("development_id", developmentId).eq("status", "active"),
  ]);
  if (dev.error || !dev.data) return null;
  const d = dev.data as Record<string, unknown>;

  // O que falta para a campanha não precisar inventar nada.
  const pendencias: string[] = [];
  if (!d.price_min && !d.price_max) pendencias.push("preço não confirmado no cadastro");
  if (!d.delivery_date) pendencias.push("prazo de entrega não informado");
  if (!(materiais.data ?? []).some((m) => ["presentation", "book"].includes(String(m.material_type)))) {
    pendencias.push("sem apresentação ou book cadastrado");
  }

  return {
    developmentId,
    nome: String(d.name),
    incorporadora: (d.developer_name as string) ?? null,
    bairro: (d.neighborhood as string) ?? null,
    cidade: (d.city as string) ?? null,
    totalUnidades: (d.total_units as number) ?? null,
    areaMin: d.private_area_min ? Number(d.private_area_min) : null,
    areaMax: d.private_area_max ? Number(d.private_area_max) : null,
    tipologias: [
      ...((d.typologies as string[]) ?? []),
      ...(tipologias.data ?? []).map((t) => String(t.name)),
    ].filter(Boolean),
    materiais: (materiais.data ?? []).map((m) => ({ tipo: String(m.material_type), titulo: String(m.title) })),
    pendencias,
  };
}

/**
 * Exportado para que o gerador com lastro (`gerador-de-criativos.ts`) use O
 * MESMO sistema. Duplicar este texto criaria duas políticas de anúncio
 * divergindo em silêncio — a classe "caminhos divergentes" que já mordeu este
 * repositório.
 */
export const SISTEMA_CRIATIVO = `Você é estrategista de performance de uma incorporadora brasileira.
Escreve em português do Brasil, direto e sem jargão de agência.

REGRAS INEGOCIÁVEIS:
- NUNCA invente preço, condição de pagamento, prazo de entrega, metragem ou
  disponibilidade. Use apenas o que estiver nos dados fornecidos.
- Se um dado comercial não foi fornecido, escreva a peça SEM ele. Jamais escreva
  "a partir de R$ X" ou "entrega em ANO" sem o dado.
- Nunca prometa valorização, retorno garantido ou rentabilidade.
- Respeite as regras de anúncio imobiliário: nada de segmentação ou linguagem
  que exclua pessoas por origem, religião, estado civil, deficiência ou família.
- Responda SOMENTE com JSON válido, sem cercas de código e sem comentários.`;

/**
 * O nome interno de sempre, preservado de propósito: outra frente edita este
 * arquivo agora, e trocar o identificador que ela já usa quebraria o build dela.
 * O alias custa uma linha; a renomeação custaria um conflito.
 */
const SISTEMA = SISTEMA_CRIATIVO;

function fichaTecnica(b: BriefingEmpreendimento) {
  const linhas = [
    `Empreendimento: ${b.nome}`,
    b.incorporadora && `Incorporadora: ${b.incorporadora}`,
    [b.bairro, b.cidade].filter(Boolean).length && `Localização: ${[b.bairro, b.cidade].filter(Boolean).join(", ")}`,
    b.totalUnidades && `Total de unidades: ${b.totalUnidades}`,
    b.areaMin && b.areaMax && `Áreas privativas: de ${b.areaMin} a ${b.areaMax} m²`,
    b.tipologias.length && `Tipologias:\n${b.tipologias.map((t) => `  - ${t}`).join("\n")}`,
    b.materiais.length && `Materiais disponíveis: ${b.materiais.map((m) => m.titulo).join("; ")}`,
    b.pendencias.length && `DADOS NÃO CONFIRMADOS (não use, não invente): ${b.pendencias.join("; ")}`,
  ].filter(Boolean);
  return linhas.join("\n");
}

export type Briefing = {
  resumo: string; personaPrincipal: string; personaSecundaria: string;
  oferta: string; argumentoCentral: string;
  objecoes: Array<{ objecao: string; resposta: string }>;
  etapaFunil: string; regiao: string; hipotese: string; criterioSucesso: string;
};

/** Gera o briefing estratégico. É chamado UMA vez por campanha e reaproveitado. */
export async function gerarBriefing(
  b: BriefingEmpreendimento, objetivo: ObjetivoCampanha, organizationId: string, userId?: string,
): Promise<{ briefing: Briefing; custoUsd: number | null; modelo: string; provedor: string; tokens: number }> {
  const r = await generateAIText({
    task: "commercial",
    feature: "creative-studio.briefing",
    organizationId, userId,
    system: SISTEMA,
    prompt: `${fichaTecnica(b)}

Objetivo da campanha: ${ROTULO_OBJETIVO[objetivo]}.

Devolva JSON com exatamente estas chaves:
{"resumo","personaPrincipal","personaSecundaria","oferta","argumentoCentral",
 "objecoes":[{"objecao","resposta"}],"etapaFunil","regiao","hipotese","criterioSucesso"}

"oferta" deve descrever o que o anúncio promete entregar ao clicar — não invente
condição comercial. "hipotese" é o que a campanha quer provar. "criterioSucesso"
deve ser mensurável e realista.`,
  });
  return {
    briefing: extrairJson<Briefing>(r.text),
    custoUsd: r.cost?.estimatedUsd ?? null,
    modelo: r.model, provedor: r.provider, tokens: r.usage.totalTokens,
  };
}

export type ConjuntoCopies = {
  conceitos: Array<{ nome: string; angulo: string; publicoAlvo: string }>;
  titulos: string[]; textosPrincipais: string[]; descricoes: string[]; ctas: string[];
  roteirosVideo: Array<{ titulo: string; cenas: string[] }>;
};

/** Gera o conjunto de copies A PARTIR do briefing — não reenvia a ficha inteira. */
export async function gerarCopies(
  briefing: Briefing, nomeEmpreendimento: string, objetivo: ObjetivoCampanha,
  organizationId: string, userId?: string,
): Promise<{ copies: ConjuntoCopies; custoUsd: number | null; modelo: string; provedor: string; tokens: number }> {
  const r = await generateAIText({
    task: "commercial",
    feature: "creative-studio.copies",
    organizationId, userId,
    system: SISTEMA,
    // Só o briefing entra aqui: é o resumo reutilizável que evita reenviar a ficha.
    prompt: `Empreendimento: ${nomeEmpreendimento}
Objetivo: ${ROTULO_OBJETIVO[objetivo]}

BRIEFING APROVADO:
- Resumo: ${briefing.resumo}
- Persona principal: ${briefing.personaPrincipal}
- Persona secundária: ${briefing.personaSecundaria}
- Oferta: ${briefing.oferta}
- Argumento central: ${briefing.argumentoCentral}
- Principais objeções: ${briefing.objecoes?.map((o) => o.objecao).join("; ")}

Devolva JSON:
{"conceitos":[{"nome","angulo","publicoAlvo"}] (exatamente 3),
 "titulos":[5 títulos de até 40 caracteres],
 "textosPrincipais":[3 textos de até 125 caracteres],
 "descricoes":[3 descrições de até 30 caracteres],
 "ctas":[3 chamadas curtas],
 "roteirosVideo":[{"titulo","cenas":[4 a 6 cenas de uma linha]}] (exatamente 2)}

Um conceito deve falar a quem compra para MORAR e outro a quem compra para
INVESTIR. Respeite os limites de caracteres do Meta Ads.`,
  });
  return {
    copies: extrairJson<ConjuntoCopies>(r.text),
    custoUsd: r.cost?.estimatedUsd ?? null,
    modelo: r.model, provedor: r.provider, tokens: r.usage.totalTokens,
  };
}

/**
 * Modelos às vezes devolvem o JSON cercado por ``` ou com texto em volta,
 * mesmo instruídos a não fazê-lo. Recortar o primeiro objeto balanceado é mais
 * confiável que confiar na obediência do modelo.
 */
function extrairJson<T>(texto: string): T {
  const limpo = texto.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try { return JSON.parse(limpo) as T; } catch { /* segue para o recorte */ }
  const inicio = limpo.indexOf("{");
  if (inicio >= 0) {
    let profundidade = 0;
    for (let i = inicio; i < limpo.length; i += 1) {
      if (limpo[i] === "{") profundidade += 1;
      else if (limpo[i] === "}") {
        profundidade -= 1;
        if (profundidade === 0) {
          try { return JSON.parse(limpo.slice(inicio, i + 1)) as T; } catch { break; }
        }
      }
    }
  }
  logger.warn("creative_studio.json_invalido", { amostra: limpo.slice(0, 120) });
  throw new Error("A IA não devolveu JSON válido.");
}

/** Persiste as peças como rascunho — nada vai para anúncio sem aprovação humana. */
export async function salvarCriativos(
  organizationId: string, campaignId: string, copies: ConjuntoCopies,
  contexto: { briefing: Briefing; modelo: string; provedor: string; custoUsd: number | null; developmentId: string },
  createdBy: string,
) {
  const linhas = copies.conceitos.flatMap((conceito, i) =>
    (copies.titulos[i] ? [copies.titulos[i]] : []).map((titulo) => ({
      organization_id: organizationId,
      // NULO de propósito. `creative_assets.campaign_id` referencia
      // `campaigns(id)` — tabela com 0 linhas — e NÃO `marketing_campaigns(id)`,
      // que é de onde `campaignId` vem. Gravar o id da segunda aqui devolve
      // SQLSTATE 23503 e derruba a gravação inteira: é por isso que
      // `creative_assets` tinha ZERO linhas enquanto `marketing_campaigns` tinha
      // 8. Medido por ensaio a seco na produção em 02/08/2026. O vínculo real
      // vai para metadata, onde nenhuma FK o rejeita.
      campaign_id: null,
      name: `${conceito.nome} · variação ${i + 1}`,
      format: "single_image",
      channel: "meta",
      headline: titulo?.slice(0, 255) ?? null,
      primary_text: copies.textosPrincipais[i] ?? copies.textosPrincipais[0] ?? null,
      description: copies.descricoes[i] ?? copies.descricoes[0] ?? null,
      call_to_action: copies.ctas[i] ?? copies.ctas[0] ?? null,
      status: "draft",
      created_by: createdBy,
      metadata: {
        marketingCampaignId: campaignId,
        conceito: conceito.nome,
        angulo: conceito.angulo,
        publicoAlvo: conceito.publicoAlvo,
        hipotese: contexto.briefing.hipotese,
        developmentId: contexto.developmentId,
        geradoPor: { provedor: contexto.provedor, modelo: contexto.modelo, custoUsd: contexto.custoUsd },
        // Roteiro é ROTEIRO: não existe vídeo produzido até alguém produzir.
        videoProduzido: false,
      },
    })),
  );
  if (!linhas.length) return { criados: 0 };
  const { data, error } = await getSupabaseAdmin().from("creative_assets").insert(linhas).select("id");
  if (error) throw error;
  return { criados: data.length };
}
