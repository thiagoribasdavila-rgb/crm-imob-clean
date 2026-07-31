/**
 * A CONFIGURAÇÃO PÚBLICA DO SUPABASE — e o placeholder que envenenou um deploy.
 *
 * ── O INCIDENTE DE 2026-07-31 ───────────────────────────────────────────────
 *
 * Um build de produção rodou sem `NEXT_PUBLIC_SUPABASE_URL`. Esta função tinha
 * uma escotilha que, durante `phase-production-build`, devolvia
 * `http://127.0.0.1:54321` em vez de falhar.
 *
 * O problema é que `NEXT_PUBLIC_*` é **assada no bundle do navegador**. O
 * placeholder não ficou em memória durante o build: foi **gravado no JavaScript
 * entregue a cada usuário**. O navegador de quem abria o CRM passava a tentar
 * autenticar contra `127.0.0.1` — a própria máquina da pessoa.
 *
 * Resultado medido em produção: `/login` com HTTP 200, **sem campo de senha**, e
 * o CRM inteiro fora do ar.
 *
 * A escotilha existia por um motivo legítimo — permitir `next build` em CI sem
 * credencial. Mas transformava "falta configuração" em "artefato que parece
 * pronto e não funciona", que é a pior troca possível.
 *
 * ── A CORREÇÃO ─────────────────────────────────────────────────────────────
 *
 * O placeholder continua existindo, porque removê-lo quebraria builds de
 * verificação. O que muda:
 *
 *   1. ele GRITA no log do build;
 *   2. passa a ser RECONHECÍVEL em tempo de execução, por
 *      `configuracaoEhPlaceholder()` — o produto pode dizer "esta instalação não
 *      foi configurada" em vez de mostrar uma tela quebrada;
 *   3. o endereço mudou. `127.0.0.1:54321` é o Supabase local legítimo, e um
 *      desenvolvedor com o Supabase de pé veria a aplicação "funcionar" contra o
 *      banco errado. O TLD `.invalid` é reservado pela RFC 2606 e **não resolve
 *      em lugar nenhum**: falha imediatamente, sempre, em vez de conectar em
 *      algo por acidente.
 */

/** Host impossível por norma (RFC 2606). Distingue "não configurado" de "configurado errado". */
export const SUPABASE_PLACEHOLDER_URL = "https://build-sem-configuracao.placeholder.invalid";
export const SUPABASE_PLACEHOLDER_KEY = "atlas-build-placeholder-not-a-real-key";

export function getSupabasePublicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    if (process.env.NEXT_PHASE === "phase-production-build") {
      // Grita no log do build. `scripts/build.mjs` recusa antes de chegar aqui,
      // exceto com a escotilha explícita `ATLAS_BUILD_SEM_AMBIENTE=1` — e é
      // justamente nesse caminho que este aviso precisa aparecer.
      console.warn(
        "\n⚠️  ATLAS: build SEM configuração pública do Supabase.\n" +
          "   O bundle do navegador sairá com um endereço PLACEHOLDER assado dentro.\n" +
          "   Este artefato NÃO SERVE PARA PRODUÇÃO: o login não vai funcionar.\n",
      );
      return { url: SUPABASE_PLACEHOLDER_URL, key: SUPABASE_PLACEHOLDER_KEY };
    }
    throw new Error(
      "Supabase público não configurado. Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }

  return { url, key };
}

/**
 * O bundle que está rodando foi assado SEM configuração real?
 *
 * Existe para o produto poder dizer "esta instalação não foi configurada" em vez
 * de mostrar uma tela quebrada. A diferença entre as duas é a diferença entre
 * alguém abrir um chamado com a informação certa e alguém achar que o sistema
 * caiu.
 *
 * Roda no navegador: lê os mesmos valores inlinados, sem tocar em rede.
 */
export function configuracaoEhPlaceholder(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return true;
  return url === SUPABASE_PLACEHOLDER_URL || key === SUPABASE_PLACEHOLDER_KEY || url.includes(".placeholder.invalid");
}
