/**
 * LER A RESPOSTA DE `/api/ready` — o painel estava lendo o envelope errado.
 *
 * ── O DEFEITO, MEDIDO ───────────────────────────────────────────────────────
 *
 * `apiSuccess()` responde `{ ok, data, meta }`. O `AtlasSystemPulse` lia
 * `body.status`, `body.checks`, `body.latencyMs`, `body.environment`,
 * `body.version` e `body.timestamp` — TODOS no nível de cima, onde só existem
 * `ok`, `data` e `meta`.
 *
 * Consequência: `payload.status` era `undefined`, então `healthy` era falso
 * SEMPRE. O botão ficava rosa dizendo "Atenção necessária", o painel dizia
 * "Operação degradada", a lista de camadas críticas dizia "Nenhuma verificação
 * disponível" e latência/ambiente/versão saíam como "—" — com a plataforma
 * respondendo 200 e o banco em 219 ms.
 *
 * É o mesmo defeito desta entrega com o sinal invertido: um painel de prontidão
 * que não consegue dizer a verdade. Verde que mente ensina a ignorar o alarme;
 * vermelho permanente ensina a ignorar o painel. Os dois terminam no mesmo
 * lugar — ninguém olha.
 *
 * ── A REGRA QUE NÃO SE AFROUXA ──────────────────────────────────────────────
 *
 * Só `status === "ready"` pode pintar verde. Qualquer coisa irreconhecível vira
 * `desconhecido`, que NÃO é verde. Um leitor tolerante que, na dúvida, aprova
 * seria o defeito de novo.
 */

export type ChecagemLida = { nome: string; ok: boolean; latencyMs: number | null };

export type IntegracaoLida = {
  nome: string;
  estado: string;
  assunto: string | null;
  verificado: boolean;
  motivo: string;
  ondeSeConfigura: string | null;
};

export type ProntidaoLida = {
  status: "ready" | "not_ready" | "desconhecido";
  checks: ChecagemLida[];
  integracoes: IntegracaoLida[];
  latencyMs: number | null;
  versao: string | null;
  em: string | null;
  /** Por que não deu para ler, quando não deu. Nunca fica em silêncio. */
  motivo: string | null;
};

const objeto = (valor: unknown): Record<string, unknown> | null =>
  valor && typeof valor === "object" && !Array.isArray(valor) ? (valor as Record<string, unknown>) : null;

const texto = (valor: unknown): string | null => (typeof valor === "string" && valor.trim() ? valor : null);
const numero = (valor: unknown): number | null => (typeof valor === "number" && Number.isFinite(valor) ? valor : null);

export function lerRespostaDeProntidao(corpo: unknown): ProntidaoLida {
  const raiz = objeto(corpo);
  const vazio: ProntidaoLida = {
    status: "desconhecido",
    checks: [],
    integracoes: [],
    latencyMs: null,
    versao: null,
    em: null,
    motivo: "resposta de prontidão ilegível",
  };
  if (!raiz) return vazio;

  // O envelope de `apiSuccess`: o conteúdo vive em `data`, os metadados em
  // `meta`. Ler o nível de cima era o defeito — e por isso o `data` é exigido
  // aqui em vez de "tentado": um payload sem `data` não é resposta desta rota, e
  // adivinhar seria inventar prontidão.
  const dados = objeto(raiz.data);
  if (!dados) {
    return {
      ...vazio,
      motivo:
        raiz.ok === false
          ? `a rota recusou: ${texto(objeto(raiz.error)?.message) ?? "sem mensagem"}`
          : "resposta sem o campo `data` — não é o envelope de /api/ready",
    };
  }
  const meta = objeto(raiz.meta);

  const bruto = texto(dados.status);
  const status: ProntidaoLida["status"] =
    bruto === "ready" ? "ready" : bruto === "not_ready" ? "not_ready" : "desconhecido";

  const checks = Object.entries(objeto(dados.checks) ?? {}).map(([nome, valor]) => {
    const check = objeto(valor);
    return { nome, ok: check?.ok === true, latencyMs: numero(check?.latencyMs) };
  });

  const integracoes = Object.entries(objeto(dados.integrations) ?? {}).map(([nome, valor]) => {
    const linha = objeto(valor);
    return {
      nome,
      // String solta (o formato antigo, "configured") é declarada como estado
      // desconhecido em vez de virar rótulo verde por acidente.
      estado: texto(linha?.estado) ?? texto(valor) ?? "desconhecido",
      assunto: texto(linha?.assunto),
      verificado: linha?.verificado === true,
      motivo: texto(linha?.motivo) ?? "sem motivo publicado",
      ondeSeConfigura: texto(linha?.ondeSeConfigura),
    };
  });

  return {
    status,
    checks,
    integracoes,
    latencyMs: numero(dados.latencyMs),
    versao: texto(meta?.version),
    em: texto(meta?.timestamp),
    motivo: status === "desconhecido" ? `status não reconhecido: ${bruto ?? "ausente"}` : null,
  };
}

/** Verde é só `ready`. Função para ninguém reescrever a regra na tela. */
export function prontidaoEstaVerde(lida: ProntidaoLida): boolean {
  return lida.status === "ready";
}
