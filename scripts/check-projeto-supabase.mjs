#!/usr/bin/env node
/**
 * PORTÃO: o ambiente aponta para o projeto Supabase CANÔNICO — e a chave é pública.
 *
 * ── O que motivou (medido em 01/08/2026) ───────────────────────────────────
 *
 * O job `validate` do PR #9 reprovava no build com as duas variáveis públicas
 * VAZIAS. A causa não era nenhuma das suspeitas usuais:
 *
 *   · `gh api repos/…/actions/secrets`   → total_count: 0
 *   · `gh api repos/…/actions/variables` → total_count: 0
 *   · os 10 environments (Production, Preview…) → 0 secrets, 0 variables
 *   · nenhum job declarava `environment:`
 *
 * Os valores nunca estiveram em camada nenhuma do GitHub. E `${{ secrets.X }}`
 * de um segredo inexistente **não falha**: resolve para string vazia e o job
 * segue como se estivesse configurado. O erro só aparecia no fim, no build.
 *
 * Por baixo havia uma segunda causa, essa mais traiçoeira: DIVERGÊNCIA DE NOME.
 * O projeto usa `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (formato novo,
 * `sb_publishable_…`); o workflow pedia `..._ANON_KEY`, ausente do `.env.local`.
 * Cadastrar o segredo com o nome antigo não teria resolvido nada.
 *
 * ── O que este portão mede ─────────────────────────────────────────────────
 *
 * Ele roda ANTES do build e responde em uma tela: as variáveis chegaram, a URL
 * é do projeto canônico, e a chave é pública — não administrativa.
 *
 * NUNCA imprime valor. Só veredito. A chave de serviço no bundle do navegador é
 * o pior desfecho possível desta família de defeitos, e é justamente o que a
 * pressa por "fazer o build passar" produz.
 *
 * Rodar: node scripts/check-projeto-supabase.mjs
 */
import fs from "node:fs";

/* O ref canônico não é digitado aqui: sai do registro versionado, que também
   guarda o projeto APOSENTADO. Duas verdades sobre qual é o banco foi o defeito
   que criou `config/supabase-projetos.json` — não vou recriá-lo. */
const REGISTRO = JSON.parse(fs.readFileSync("config/supabase-projetos.json", "utf8"));
const REF = REGISTRO?.canonico?.ref;
/* O registro também nomeia os APOSENTADOS, e diz por quê: "NÃO É VAZIO. Nenhum
   script, roteiro ou configuração deste repositório pode apontar para ele."
   Apontar para o aposentado é pior que apontar para lugar nenhum — o build
   sobe, a tela abre, e o corretor trabalha no banco errado. */
const APOSENTADOS = new Map((REGISTRO?.aposentados ?? []).map((p) => [p.ref, p.nome || p.ref]));

const falhas = [];
const ok = [];
const diga = (rotulo, veredito) => console.log(`  ${rotulo.padEnd(38)} ${veredito}`);

if (!REF || !/^[a-z0-9]{20}$/.test(REF)) {
  console.error("✗ projeto-supabase: não achei o ref canônico em config/supabase-projetos.json — o instrumento quebrou, não o produto.");
  process.exit(1);
}

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
const nomeDaChave = ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"].find(
  (n) => (process.env[n] || "").trim(),
);
const chave = (process.env[nomeDaChave] || "").trim();

/* Sem ambiente NÃO é aprovação e também não é reprovação: é NÃO EXECUTADO.
   Mesma doutrina de `cobertura-schema:check` e `vigias-vivos:check`. */
if (!url && !chave) {
  console.error("  NÃO EXECUTADO — nenhuma variável pública do Supabase neste ambiente.");
  console.error("  Este portão confere PARA QUAL projeto o build vai apontar; sem variável não há o que conferir.");
  process.exit(2);
}

diga("NEXT_PUBLIC_SUPABASE_URL", url ? "PRESENTE" : "AUSENTE");
if (!url) falhas.push("URL ausente — o navegador não saberia onde fica o Supabase e a tela de login não autentica");
else {
  const formatoOk = /^https:\/\/[a-z0-9]{20}\.supabase\.co$/.test(url);
  diga("  formato", formatoOk ? "VÁLIDO" : "INVÁLIDO");
  if (!formatoOk) falhas.push("URL fora do formato https://<ref>.supabase.co");
  const refNaUrl = (url.match(/^https:\/\/([a-z0-9]{20})\.supabase\.co$/) || [])[1] || "";
  const refOk = refNaUrl === REF;
  diga("  project ref", refOk ? "CONFERE" : "DIVERGENTE");
  if (!refOk) {
    const aposentado = APOSENTADOS.get(refNaUrl);
    falhas.push(
      aposentado
        ? `a URL aponta para o projeto APOSENTADO "${aposentado}" — o build subiria, a tela abriria, e o corretor trabalharia no banco errado`
        : `a URL não é do projeto canônico ${REF} — o build apontaria para outro banco`,
    );
  }
  const cru = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const limpa = cru === cru.trim() && !/["'`\s]/.test(cru);
  diga("  sem aspas/espaço/quebra", limpa ? "OK" : "SUJA");
  if (!limpa) falhas.push("a URL chegou com aspas, espaço ou quebra de linha — o shell mutilou o valor");
  if (refOk && formatoOk && limpa) ok.push("URL aponta para o projeto canônico");
}

diga("chave pública", chave ? `PRESENTE (${nomeDaChave})` : "AUSENTE");
if (!chave) falhas.push("chave pública ausente — o cliente não tem credencial para falar com o banco");
else {
  const limpa = !/["'`\s]/.test(chave);
  diga("  sem aspas/espaço/quebra", limpa ? "OK" : "SUJA");
  if (!limpa) falhas.push("a chave chegou com aspas, espaço ou quebra de linha");

  let tipo = "formato desconhecido";
  let administrativa = false;
  if (chave.startsWith("sb_publishable_")) tipo = "publishable (formato novo)";
  else if (chave.startsWith("sb_secret_")) { tipo = "SECRET"; administrativa = true; }
  else if (chave.startsWith("eyJ")) {
    try {
      const p = JSON.parse(Buffer.from(chave.split(".")[1], "base64url").toString("utf8"));
      tipo = `JWT legado · role=${p.role || "sem role"}`;
      administrativa = p.role === "service_role";
      if (p.ref) {
        const refOk = p.ref === REF;
        diga("  project ref na chave", refOk ? "CONFERE" : "DIVERGENTE");
        if (!refOk) falhas.push("a chave pertence a OUTRO projeto — URL e chave não casam");
      }
      if (p.exp) {
        const vigente = p.exp * 1000 > Date.now();
        diga("  validade", vigente ? "VIGENTE" : "EXPIRADA");
        if (!vigente) falhas.push("a chave pública está expirada");
      }
    } catch { tipo = "JWT com payload ilegível"; }
  }
  diga("  tipo", tipo);
  diga("  é administrativa?", administrativa ? "SIM" : "não");
  if (administrativa) {
    falhas.push(
      "CHAVE ADMINISTRATIVA numa variável NEXT_PUBLIC_* — ela seria ASSADA NO BUNDLE e servida a qualquer visitante.\n" +
        "        É o pior desfecho desta família de defeitos, e o que a pressa por 'fazer o build passar' produz.",
    );
  }
  if (!administrativa && limpa) ok.push(`chave pública válida (${tipo})`);
}

for (const o of ok) console.log(`  ok   ${o}`);
for (const f of falhas) console.error(`  FALHA ${f}`);

if (falhas.length) {
  console.error(`\n✗ projeto-supabase: ${falhas.length} problema(s) de configuração. O build apontaria para o lugar errado — ou levaria credencial demais.`);
  process.exit(1);
}
console.log(`\n✓ projeto-supabase: ambiente aponta para ${REF}, com chave pública. Nenhum valor foi impresso.`);
