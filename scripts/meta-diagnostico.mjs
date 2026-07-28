#!/usr/bin/env node
/**
 * DIAGNÓSTICO DA META — cada token contra o alvo que ele precisa alcançar.
 *
 * ── Por que existe ──────────────────────────────────────────────────────────
 *
 * São TRÊS tokens com finalidades diferentes (leads, anúncios, conversões) e
 * cinco alvos. Um deles pode estar quebrado enquanto os outros funcionam — e
 * foi exatamente o que se descobriu em 2026-07-27: o token de anúncios
 * alcançava a conta, e o de conversões devolvia OAuthException 190/465 no
 * dataset. Ninguém teria notado até o custo por lead subir sem explicação,
 * porque `ATLAS_META_CAPI_ENABLED` estava desligada e ESCONDIA a credencial
 * quebrada.
 *
 * Já houve nesta operação um diagnóstico que custou semanas: a Meta responde
 * "Ad account owner has NOT grant ads_management" quando o problema é o ID da
 * conta. A mensagem aponta para o lugar errado. Por isso este script testa cada
 * par (token, alvo) separadamente e traduz o erro para o que fazer.
 *
 * ── O que NUNCA faz ─────────────────────────────────────────────────────────
 *
 * Não imprime token, nem parte dele. Só LÊ — nenhuma chamada cria, publica,
 * ativa ou gasta. Nenhum evento de conversão é enviado.
 *
 *   npm run meta:diagnostico
 */

import { readFileSync } from "node:fs";

for (const l of readFileSync(".env.local", "utf8").split("\n")) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const V = process.env.META_GRAPH_API_VERSION || "v23.0";

/**
 * Conta alcançável mas parada — provavelmente não é onde o trabalho acontece.
 *
 * Contar campanhas NÃO basta: medido em 2026-07-27, a conta configurada tinha
 * 14 campanhas e mesmo assim era a errada — todas de 2024, nenhuma dos
 * empreendimentos que o CRM acompanha. O que distingue é a RECÊNCIA.
 */
const PROBLEMA_CONTA_SUSPEITA = (motivo) => ({
  causa: `conta alcançável, mas ${motivo}`,
  acao: "Confira no Business Manager em qual conta suas campanhas realmente rodam. Apontar o CRM para uma conta parada isola o aprendizado do que já foi gasto. Se a conta certa devolver 403, o System User precisa ser atribuído a ela: Usuários do sistema → Adicionar ativos → Contas de anúncios → Gerenciar campanhas.",
  quem: "quem administra o Business Manager",
});

/**
 * Cada verificação é um par (token, alvo). Separá-las é o ponto: um token bom
 * num alvo errado produz a mesma cara de "não funciona" que um token ruim.
 */
const CHECAGENS = [
  {
    nome: "conta de anúncios",
    token: "META_ADS_ACCESS_TOKEN",
    alvo: "META_AD_ACCOUNT_ID",
    campos: "name,account_status,currency",
    resumo: (d) => `${d.name} · status ${d.account_status} · ${d.currency}`,
    paraQue: "criar e pausar campanha, ler métricas",
    /**
     * ── ALCANÇÁVEL NÃO É O MESMO QUE CERTA ────────────────────────────────
     *
     * Medido em 2026-07-27: o token alcançava `act_361228…` ("Conta 01") e o
     * diagnóstico dizia ✔. Só que essa conta não tem NENHUMA campanha de Arvo
     * nem de Spin Mood — elas rodam em `act_893242…` ("D'Avila – Senna"), à
     * qual o mesmo token responde 403.
     *
     * O CRM apontava, portanto, para a conta onde o token funciona e onde não
     * há nada. Verde na coisa errada — o padrão que mais custou caro aqui.
     *
     * Conta parada é SUSPEITA, não erro: pode ser conta nova e legítima. Por
     * isso avisa em vez de reprovar — e diz há quantos dias, para a suspeita ser
     * avaliável em vez de aceita no escuro.
     */
    aprofundar: async (alvo, token) => {
      const r = await fetch(`https://graph.facebook.com/${V}/${alvo}/campaigns?fields=name,created_time&limit=50&access_token=${encodeURIComponent(token)}`,
        { signal: AbortSignal.timeout(20_000) });
      const b = await r.json().catch(() => ({}));
      const campanhas = Array.isArray(b?.data) ? b.data : [];
      if (!campanhas.length) {
        return { suspeita: true, detalhe: "alcançável, porém SEM campanha nenhuma", problema: PROBLEMA_CONTA_SUSPEITA("nenhuma campanha") };
      }
      const datas = campanhas.map((c) => Date.parse(c.created_time || 0)).filter(Boolean).sort((a, b2) => b2 - a);
      const dias = datas.length ? Math.floor((Date.now() - datas[0]) / 86_400_000) : null;
      if (dias != null && dias > 90) {
        return {
          suspeita: true,
          detalhe: `${campanhas.length} campanhas, a mais nova tem ${dias} dias`,
          problema: PROBLEMA_CONTA_SUSPEITA(`a campanha mais recente tem ${dias} dias`),
        };
      }
      return { suspeita: false, detalhe: `${campanhas.length} campanhas, a mais nova tem ${dias ?? "?"} dias` };
    },
  },
  {
    nome: "página do Facebook",
    token: "META_ADS_ACCESS_TOKEN",
    alvo: "META_PAGE_ID",
    campos: "name",
    resumo: (d) => d.name,
    paraQue: "vincular o anúncio e o formulário à página",
  },
  {
    nome: "formulário de leads",
    token: "META_LEAD_ACCESS_TOKEN",
    alvo: "META_LEAD_FORM_ID",
    campos: "name,status",
    resumo: (d) => `${d.name} · ${d.status}`,
    paraQue: "receber as leads pelo webhook",
  },
  {
    nome: "dataset de conversões",
    token: "META_CONVERSIONS_ACCESS_TOKEN",
    alvo: "META_CAPI_DATASET_ID",
    campos: "name",
    resumo: (d) => d.name,
    paraQue: "devolver venda e visita para a Meta otimizar — o ciclo fechado",
  },
];

/** Traduz o erro da Meta para o que fazer e QUEM resolve. */
function diagnosticar(status, erro) {
  const codigo = erro?.code ?? null;
  const sub = erro?.error_subcode ?? null;
  const msg = String(erro?.message ?? "");

  if (codigo === 190 && sub === 465) {
    return {
      causa: "token de um app que não pertence ao Business do alvo",
      acao: "No Business Manager, confirme em qual Business o alvo vive e se o app do System User está vinculado a ele. Gere o token A PARTIR DE LÁ. Não é permissão faltando — é app errado.",
      quem: "quem administra o Business Manager",
    };
  }
  if (codigo === 190) {
    return { causa: "token inválido ou expirado", acao: "Gere um token novo no Business Manager e substitua no .env do servidor.", quem: "quem administra o Business Manager" };
  }
  if (codigo === 100 && /missing perm/i.test(msg)) {
    return { causa: "token válido, sem permissão neste alvo", acao: "Conceda a permissão do alvo ao System User (Fontes de dados → o alvo → Atribuir parceiros).", quem: "quem administra o Business Manager" };
  }
  if (codigo === 100 || /does not exist|Unsupported get request/i.test(msg)) {
    return {
      causa: "o ID não existe, ou este token não o enxerga",
      acao: "Confira o ID na variável de ambiente. A Meta costuma culpar a permissão quando o problema é o ID — foi o que custou semanas nesta operação.",
      quem: "quem configura o servidor",
    };
  }
  if (codigo === 200 || /grant/i.test(msg)) {
    return { causa: "permissão recusada pela Meta", acao: "Confira ID e permissões juntos: esta mensagem aponta para permissão mesmo quando o defeito é o ID.", quem: "quem administra o Business Manager" };
  }
  return { causa: `HTTP ${status}${codigo ? ` (code ${codigo}${sub ? `/${sub}` : ""})` : ""}`, acao: `Guarde esta saída: ${msg.slice(0, 160)}`, quem: "desenvolvimento" };
}

console.log("\nDiagnóstico da Meta — só leitura, nenhum evento é enviado.\n");
console.log(`${"VERIFICAÇÃO".padEnd(24)} ${"ESTADO".padEnd(12)} DETALHE`);
console.log("─".repeat(78));

const problemas = [];
for (const c of CHECAGENS) {
  const token = process.env[c.token];
  const alvo = process.env[c.alvo];

  if (!token || !alvo) {
    const faltando = [!token && c.token, !alvo && c.alvo].filter(Boolean).join(" e ");
    console.log(`${c.nome.padEnd(24)} ${"— não conf.".padEnd(12)} falta ${faltando}`);
    problemas.push({ ...c, causa: `${faltando} não preenchida(s)`, acao: `Preencha ${faltando} no .env do servidor.`, quem: "quem configura o servidor" });
    continue;
  }

  try {
    const r = await fetch(`https://graph.facebook.com/${V}/${alvo}?fields=${c.campos}&access_token=${encodeURIComponent(token)}`,
      { signal: AbortSignal.timeout(20_000) });
    const b = await r.json().catch(() => ({}));
    if (r.ok && !b?.error) {
      const extra = c.aprofundar ? await c.aprofundar(alvo, token) : null;
      const marca = extra?.suspeita ? "⚠ suspeita" : "✔ alcança";
      console.log(`${c.nome.padEnd(24)} ${marca.padEnd(12)} ${String(extra?.detalhe ?? c.resumo(b) ?? "").slice(0, 44)}`);
      if (extra?.suspeita) problemas.push({ ...c, ...extra.problema });
      continue;
    }
    const d = diagnosticar(r.status, b?.error);
    console.log(`${c.nome.padEnd(24)} ${"✘ falha".padEnd(12)} ${d.causa}`);
    problemas.push({ ...c, ...d });
  } catch (e) {
    console.log(`${c.nome.padEnd(24)} ${"✘ sem rede".padEnd(12)} ${e.message.slice(0, 40)}`);
    problemas.push({ ...c, causa: "não completou", acao: `Confira a saída de rede do servidor: ${e.message}`, quem: "quem administra o servidor" });
  }
}

// ── O interruptor do CAPI ──────────────────────────────────────────────────
//
// Desligado é honesto. Ligado com o dataset inalcançável é PIOR que desligado:
// a tela diz "ativado", nenhuma venda volta para a Meta, o anúncio otimiza às
// cegas, e o sintoma aparece semanas depois como custo por lead subindo.
const capiLigada = String(process.env.ATLAS_META_CAPI_ENABLED || "").toLowerCase() === "true";
const datasetOk = !problemas.some((p) => p.nome === "dataset de conversões");

console.log(`\n${"═".repeat(78)}`);
console.log(`CAPI: ${capiLigada ? "LIGADA" : "desligada"} · dataset: ${datasetOk ? "alcançável" : "INALCANÇÁVEL"}`);

if (capiLigada && !datasetOk) {
  console.log("\n⚠  PIOR COMBINAÇÃO POSSÍVEL. A CAPI está ligada e o dataset não responde.");
  console.log("   Cada conversão falha em silêncio: a tela diz 'ativado', nada volta para a");
  console.log("   Meta, e o anúncio segue otimizando às cegas. DESLIGUE até o token servir.");
} else if (!capiLigada && datasetOk) {
  console.log("\n   O dataset responde e a CAPI está desligada — falta só ATLAS_META_CAPI_ENABLED=true.");
  console.log("   Ligue com o dia de teste combinado: a partir daí venda e visita voltam para a Meta.");
} else if (!capiLigada && !datasetOk) {
  console.log("\n   Desligada é o estado certo por enquanto: o dataset não responde, e ligar");
  console.log("   agora só produziria falha silenciosa. Resolva o token primeiro.");
}

if (problemas.length) {
  console.log("\nO QUE FAZER:\n");
  for (const p of problemas) {
    console.log(`  ${p.nome} — ${p.causa}`);
    console.log(`    para que serve: ${p.paraQue}`);
    console.log(`    ${p.acao}`);
    console.log(`    Quem resolve: ${p.quem}\n`);
  }
} else {
  console.log("\nTodos os tokens alcançam seus alvos.\n");
}

process.exit(problemas.length ? 1 : 0);
