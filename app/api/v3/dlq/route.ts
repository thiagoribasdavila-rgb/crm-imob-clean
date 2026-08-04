import { NextResponse, type NextRequest } from "next/server";
import { requireApiIdentity } from "@/lib/security/api-auth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { isDirectorProfile, enforceRateLimit } from "@/lib/api/security";
import { lerCartaMorta } from "@/lib/integrations/carta-morta";

export const dynamic = "force-dynamic";

/**
 * A FILA MORTA, LEGÍVEL — a porta que faltava.
 *
 * `/api/v3/dlq/retry` existe desde 16/07/2026 e resolve uma carta morta por
 * clique. Varrido o repositório em 02/08/2026, NADA a chamava: as duas únicas
 * menções em todo o código são um portão que lê o arquivo como texto
 * (scripts/check-hierarchy-enforcement.mjs:21) e um comentário
 * (lib/integrations/outbox-lease.ts:108). Nenhuma tela, nenhum botão.
 *
 * O resultado estava no banco: 12 linhas, ZERO resolvidas, a mais antiga de
 * 31/07 01:50. A tabela tem `resolved`, `resolved_at` e `resolved_by` — o
 * desenho previa que alguém resolvesse. Ninguém nunca resolveu, porque não
 * havia por onde.
 *
 * Esta rota é o lado da LEITURA. Ela não escreve nada.
 *
 * ── O QUE ELA PUBLICA, E O QUE ELA NUNCA PUBLICA ────────────────────────────
 *
 * Publica: tópico, causa em português, idade, tentativas, quem pode resolver, e
 * o veredito de reprocesso com as precondições medidas uma a uma.
 *
 * NUNCA publica: o valor de qualquer segredo. A precondição do token diz
 * `atendida: true|false` e nada mais — sem prefixo, sem tamanho, sem sufixo. O
 * `payload` do evento também fica de fora: ele carrega identificador de lead, e
 * esta tela responde "o que está preso e por quê", não "quem é o lead".
 */
export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, { limit: 30, windowMs: 60_000, scope: "v3.dlq.read" });
  if (!rate.ok) return rate.response;
  try {
    const identity = await requireApiIdentity(request);
    const admin = getSupabaseAdmin();

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("role,commercial_role")
      .eq("id", identity.userId)
      .eq("organization_id", identity.organizationId)
      .single();

    // Falha de leitura do perfil não é "não é diretor": uma é defeito, a outra
    // é resposta. Misturar as duas manda o diretor procurar permissão que ele
    // já tem.
    if (profileError) throw profileError;
    const ehDiretor = isDirectorProfile({ role: profile?.role, commercial_role: profile?.commercial_role });

    const leitura = await lerCartaMorta(admin, identity.organizationId, { incluirResolvidas: true });
    if (!leitura.ok) {
      logger.error("v3.dlq_leitura_falhou", { motivo: leitura.motivo, detalhe: leitura.detalhe });
      return NextResponse.json(
        { error: "Não foi possível ler a fila morta.", motivo: leitura.motivo },
        { status: 503, headers: { ...rate.headers, "Cache-Control": "no-store" } },
      );
    }

    // Nome de quem resolveu. Sem isto, `resolved_by` é um UUID — e a coluna que
    // existe para dar responsável mostraria um identificador para o operador.
    const resolvedores = [...new Set(leitura.linhas.map((l) => l.resolvidaPor).filter((v): v is string => Boolean(v)))];
    const nomes = new Map<string, string>();
    if (resolvedores.length) {
      const perfis = await admin
        .from("profiles")
        .select("id,full_name")
        .eq("organization_id", identity.organizationId)
        .in("id", resolvedores);
      if (perfis.error) {
        logger.warn("v3.dlq_nome_do_resolvedor_ilegivel", { code: perfis.error.code });
      }
      for (const p of perfis.data ?? []) nomes.set(String(p.id), String(p.full_name ?? ""));
    }

    // A TENDÊNCIA. O vigia grava a contagem de cada passagem no livro de
    // execuções; aqui ela vira "cresceu / estável / drenando" para quem lê a
    // tela. Sem isto, doze linhas paradas três dias continuam parecendo doze
    // linhas que acabaram de chegar.
    const passagens = await admin
      .from("atlas_worker_runs")
      .select("concluido_em,resposta,desfecho")
      .eq("vigia", "carta-morta")
      .order("iniciado_em", { ascending: false })
      .limit(12);

    const historico = (passagens.data ?? [])
      .map((p) => {
        const resposta = p.resposta && typeof p.resposta === "object" ? (p.resposta as Record<string, unknown>) : {};
        const valor = resposta.operacionais;
        return {
          em: p.concluido_em ? String(p.concluido_em) : null,
          operacionais: typeof valor === "number" ? valor : null,
          desfecho: String(p.desfecho ?? ""),
        };
      })
      .filter((p) => p.operacionais !== null);

    const vigia = passagens.error
      ? { medido: false as const, motivo: "livro de execuções ilegível" }
      : historico.length === 0
        ? {
            medido: false as const,
            // "Nunca rodou" e "rodou e não achou nada" são estados diferentes, e
            // o produto não pode escolher o mais confortável.
            motivo: "o vigia da carta morta ainda não deixou nenhuma passagem no livro",
          }
        : {
            medido: true as const,
            ultimaEm: historico[0].em,
            ultimaContagem: historico[0].operacionais,
            anteriorContagem: historico.length > 1 ? historico[1].operacionais : null,
            passagens: historico.length,
          };

    return NextResponse.json(
      {
        contagem: leitura.contagem,
        // Critério das provas sintéticas escrito na própria resposta: quem lê a
        // API vê por que 12 vira 10, sem ter de abrir o código.
        criterioDoLixoDeTeste:
          "tópico prova.sintetica.* E sem vínculo de outbox. Sai da contagem operacional, continua na tabela e no total.",
        quemResolve: {
          perfil: "diretoria",
          euPosso: ehDiretor,
          porque: "reprocessar reenfileira entrega real; o repositório trata isso como decisão de diretoria.",
        },
        linhas: leitura.linhas.map((l) => ({
          id: l.id,
          topico: l.topico,
          criadaEm: l.criadaEm,
          idadeHoras: l.idadeHoras,
          tentativas: l.tentativas,
          resolvida: l.resolvida,
          resolvidaEm: l.resolvidaEm,
          resolvidaPor: l.resolvidaPor ? nomes.get(l.resolvidaPor) || "usuário fora desta organização" : null,
          causa: l.veredito.causaLegivel,
          causaResolvida: l.veredito.causaResolvida,
          familia: l.veredito.familia,
          contagem: l.veredito.contagem,
          // O botão só liga com as DUAS condições: causa caída e quem lê é
          // diretor. A tela repete a regra, o servidor a impõe.
          podeReprocessar: l.veredito.podeReprocessar && ehDiretor,
          bloqueio: !ehDiretor && l.veredito.podeReprocessar
            ? "Somente a diretoria reprocessa integrações."
            : l.veredito.bloqueio,
          comoResolver: l.veredito.comoResolver,
          precondicoes: l.veredito.precondicoes,
        })),
        vigia,
      },
      { headers: { ...rate.headers, "Cache-Control": "no-store" } },
    );
  } catch (error) {
    logger.error("v3.dlq_listagem_falhou", error);
    const mensagem = error instanceof Error ? error.message : "Falha ao ler a fila morta.";
    const acesso = /sess[ãa]o|token|autentica|autoriz|organiza|escopo/i.test(mensagem);
    return NextResponse.json({ error: mensagem }, { status: acesso ? 401 : 500 });
  }
}
