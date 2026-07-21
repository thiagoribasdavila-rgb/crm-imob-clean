/**
 * Upload de mídia para a Marketing API da Meta — imagens e vídeos — como
 * matéria-prima do creative (o hash da imagem / o video_id entram no
 * asset_feed_spec ou no object_story_spec do campaign-executor).
 *
 * Divisão rígida (mesmo idioma de campaign-read/campaign-executor):
 * - Validações PURAS e exportadas (URL https, extensão, host, tamanho
 *   declarado) — não tocam a rede, servem de pré-voo antes de qualquer POST.
 * - As cascas efetful (uploadImageFromUrl / uploadVideoFromUrl) usam fetcher
 *   INJETÁVEL, têm dryRun default TRUE (devolvem hash/videoId sintético sem
 *   tocar a rede) e nunca imprimem o token — erro estruturado sempre.
 *
 * IMAGENS: a doc é explícita — Meta NÃO baixa imagem de URL (só vídeo).
 * Então baixamos os bytes da imagem (GET) e enviamos base64 em `bytes` no
 * POST /act_{id}/adimages. A resposta é um mapa keyed por filename; extraímos
 * o `hash` do primeiro item.
 *
 * VÍDEOS: a doc confirma `file_url` — a Meta baixa o vídeo server-side. Então
 * o POST /act_{id}/advideos leva apenas `file_url` (+ title opcional). Upload
 * chunked/resumível fica como TODO documentado (a doc só o exige, na prática,
 * para arquivos grandes/rede instável — não há limite de bytes fixo).
 */

const GRAPH = "https://graph.facebook.com";

/** Limites da doc: imagem JPG/PNG < 30 MB. */
export const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png"]);
const VIDEO_EXTENSIONS = new Set(["mp4", "mov", "m4v", "avi", "wmv", "flv", "mkv", "webm"]);

export type MetaUploadError = {
  ok: false;
  code: number | string;
  subcode?: number | string;
  message: string;
  fbtrace?: string;
};

export type UploadImageResult = { hash: string };
export type UploadVideoResult = { videoId: string };

export type UploadOptions = {
  /** DEFAULT TRUE: não toca a rede, devolve hash/videoId sintético para inspeção. */
  dryRun?: boolean;
  /** Fetcher injetável (rede sempre por aqui — testável e mockável). */
  fetcher?: typeof fetch;
  graphVersion?: string;
  /** Nome do arquivo (vira a chave no mapa de resposta de imagem); default derivado da URL. */
  filename?: string;
  /** Título opcional do vídeo (advideos aceita title/name). */
  title?: string;
  /** Tamanho declarado em bytes (se conhecido antes do download) — validado no pré-voo. */
  declaredSizeBytes?: number;
  /** Chave de idempotência do POST (obrigatória em efeito externo por regra do repo). */
  idempotencyKey?: string;
};

// ---------------------------------------------------------------------------
// Validações puras (exportadas — pré-voo sem rede)
// ---------------------------------------------------------------------------

/** true só se a URL for https com host — nada de http, ftp, data:, etc. */
export function isHttpsUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && u.hostname.length > 0;
  } catch {
    return false;
  }
}

/** Extensão do arquivo na URL (minúscula, sem ponto). "" se não houver. */
export function urlExtension(value: string): string {
  let pathname: string;
  try {
    pathname = new URL(value).pathname;
  } catch {
    return "";
  }
  const base = pathname.split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "";
  return base.slice(dot + 1).toLowerCase();
}

/** Nome de arquivo derivado da URL (fallback quando opts.filename não vem). */
export function filenameFromUrl(value: string, fallback: string): string {
  let pathname: string;
  try {
    pathname = new URL(value).pathname;
  } catch {
    return fallback;
  }
  const base = pathname.split("/").pop() ?? "";
  return base.length ? base : fallback;
}

/** Pré-voo da URL de imagem: https + extensão JPG/PNG. Null = ok. */
export function validateImageUrl(value: string): MetaUploadError | null {
  if (!isHttpsUrl(value)) {
    return { ok: false, code: "invalid_url", message: "URL de imagem inválida — só https é aceito." };
  }
  const ext = urlExtension(value);
  if (!IMAGE_EXTENSIONS.has(ext)) {
    return {
      ok: false,
      code: "invalid_extension",
      message: `extensão "${ext || "(nenhuma)"}" não suportada — imagem deve ser JPG/PNG.`,
    };
  }
  return null;
}

/** Pré-voo da URL de vídeo: https + extensão de vídeo conhecida. Null = ok. */
export function validateVideoUrl(value: string): MetaUploadError | null {
  if (!isHttpsUrl(value)) {
    return { ok: false, code: "invalid_url", message: "URL de vídeo inválida — só https é aceito." };
  }
  const ext = urlExtension(value);
  if (!VIDEO_EXTENSIONS.has(ext)) {
    return {
      ok: false,
      code: "invalid_extension",
      message: `extensão "${ext || "(nenhuma)"}" não parece vídeo (mp4/mov/…).`,
    };
  }
  return null;
}

/** Valida o tamanho declarado contra o teto (quando informado). Null = ok. */
export function validateDeclaredSize(sizeBytes: number | undefined, maxBytes: number): MetaUploadError | null {
  if (sizeBytes == null) return null;
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return { ok: false, code: "invalid_size", message: `tamanho declarado inválido: ${sizeBytes}.` };
  }
  if (sizeBytes > maxBytes) {
    return {
      ok: false,
      code: "too_large",
      message: `arquivo declarado com ${sizeBytes} bytes excede o limite de ${maxBytes} bytes.`,
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

function version(v?: string): string {
  return v || process.env.META_GRAPH_API_VERSION || "v23.0";
}
function accPath(accountId: string): string {
  return `act_${String(accountId).replace(/^act_/, "")}`;
}
/** Remove o token de qualquer mensagem antes de devolver/logar. */
function sanitize(message: string, token: string): string {
  return token ? message.split(token).join("[token]") : message;
}
/** Idempotency-key obrigatória por regra do repo; deriva uma estável se faltar. */
function idempotency(opts: UploadOptions, seed: string): string {
  const key = opts.idempotencyKey && opts.idempotencyKey.trim() ? opts.idempotencyKey.trim() : `media:${seed}`;
  return key;
}

type GraphErrorEnvelope = {
  error?: { code?: number; error_subcode?: number; message?: string; fbtrace_id?: string };
};

/** Traduz o envelope de erro da Graph (ou HTTP não-ok) em MetaUploadError sanitizado. */
function graphError(json: GraphErrorEnvelope, status: number, token: string): MetaUploadError | null {
  if (json.error) {
    const e = json.error;
    return {
      ok: false,
      code: e.code ?? status,
      subcode: e.error_subcode,
      message: sanitize(String(e.message ?? `HTTP ${status}`), token),
      fbtrace: e.fbtrace_id,
    };
  }
  return null;
}

/** Extrai o hash da imagem do mapa keyed-por-filename (ou de um shape plano). */
function extractImageHash(json: unknown): string | null {
  if (typeof json !== "object" || json === null) return null;
  const top = json as { hash?: unknown; images?: unknown };
  if (typeof top.hash === "string" && top.hash) return top.hash;
  const images = top.images;
  if (typeof images === "object" && images !== null) {
    for (const entry of Object.values(images as Record<string, unknown>)) {
      if (typeof entry === "object" && entry !== null) {
        const hash = (entry as { hash?: unknown }).hash;
        if (typeof hash === "string" && hash) return hash;
      }
    }
  }
  return null;
}

/** Extrai o id do vídeo (advideos devolve id e/ou video_id). */
function extractVideoId(json: unknown): string | null {
  if (typeof json !== "object" || json === null) return null;
  const rec = json as { id?: unknown; video_id?: unknown };
  const raw = rec.id ?? rec.video_id;
  if (typeof raw === "string" && raw) return raw;
  if (typeof raw === "number") return String(raw);
  return null;
}

function isUploadError(x: unknown): x is MetaUploadError {
  return typeof x === "object" && x !== null && (x as { ok?: boolean }).ok === false;
}

// ---------------------------------------------------------------------------
// Uploads (casca efetful — dryRun default TRUE)
// ---------------------------------------------------------------------------

/**
 * Sobe uma imagem para /act_{id}/adimages a partir de uma URL.
 *
 * A Meta NÃO baixa imagem de URL (só vídeo), então baixamos os bytes (GET via
 * fetcher) e enviamos base64 em `bytes`. Devolve { hash } para uso como
 * image_hash no creative, ou MetaUploadError (token sanitizado).
 * dryRun (default) devolve { hash: "DRYRUN_HASH" } sem tocar a rede.
 */
export async function uploadImageFromUrl(
  accountId: string,
  token: string,
  imageUrl: string,
  opts: UploadOptions = {},
): Promise<UploadImageResult | MetaUploadError> {
  const urlProblem = validateImageUrl(imageUrl);
  if (urlProblem) return urlProblem;
  const sizeProblem = validateDeclaredSize(opts.declaredSizeBytes, MAX_IMAGE_BYTES);
  if (sizeProblem) return sizeProblem;

  const dryRun = opts.dryRun !== false;
  if (dryRun) return { hash: "DRYRUN_HASH" };

  const fetcher = opts.fetcher ?? fetch;

  // 1) baixa os bytes da imagem
  let bytesB64: string;
  try {
    const dl = await fetcher(imageUrl);
    if (!dl.ok) {
      return { ok: false, code: `download_${dl.status}`, message: `falha ao baixar a imagem (HTTP ${dl.status}).` };
    }
    const buf = Buffer.from(await dl.arrayBuffer());
    if (buf.byteLength > MAX_IMAGE_BYTES) {
      return { ok: false, code: "too_large", message: `imagem baixada tem ${buf.byteLength} bytes, acima de ${MAX_IMAGE_BYTES}.` };
    }
    if (buf.byteLength === 0) {
      return { ok: false, code: "empty", message: "imagem baixada está vazia (0 bytes)." };
    }
    bytesB64 = buf.toString("base64");
  } catch (err) {
    return { ok: false, code: "network", message: sanitize(`falha de rede no download: ${err instanceof Error ? err.message : String(err)}`, token) };
  }

  // 2) POST /act_{id}/adimages com bytes=base64
  try {
    const body = new URLSearchParams({ bytes: bytesB64 });
    const res = await fetcher(`${GRAPH}/${version(opts.graphVersion)}/${accPath(accountId)}/adimages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Atlas-Idempotency-Key": idempotency(opts, `img:${accPath(accountId)}:${filenameFromUrl(imageUrl, "image")}`),
      },
      body,
    });
    const json = (await res.json().catch(() => ({}))) as GraphErrorEnvelope;
    const err = graphError(json, res.status, token);
    if (err) return err;
    if (!res.ok) return { ok: false, code: res.status, message: `HTTP ${res.status} sem envelope de erro da Graph.` };
    const hash = extractImageHash(json);
    if (!hash) return { ok: false, code: "no_hash", message: "resposta da Graph sem hash de imagem." };
    return { hash };
  } catch (err) {
    return { ok: false, code: "network", message: sanitize(`falha de rede no upload: ${err instanceof Error ? err.message : String(err)}`, token) };
  }
}

/**
 * Sobe um vídeo para /act_{id}/advideos usando `file_url` (a Meta baixa o
 * vídeo server-side). Devolve { videoId } — lembre que o vídeo é codificado de
 * forma assíncrona; o chamador deve pollar GET /{video_id}?fields=status até
 * status=ready antes de usar no creative.
 * dryRun (default) devolve { videoId: "DRYRUN_VIDEO_ID" } sem tocar a rede.
 *
 * TODO(chunked): para arquivos grandes ou rede instável a doc recomenda o
 * upload resumível (upload_phase start/transfer/finish com file_size e
 * upload_session_id). Não implementado aqui — file_url cobre o caso comum
 * (arquivos pequenos/médios com URL pública). Ver:
 * https://developers.facebook.com/docs/marketing-api/reference/ad-account/advideos/
 */
export async function uploadVideoFromUrl(
  accountId: string,
  token: string,
  videoUrl: string,
  opts: UploadOptions = {},
): Promise<UploadVideoResult | MetaUploadError> {
  const urlProblem = validateVideoUrl(videoUrl);
  if (urlProblem) return urlProblem;
  const sizeProblem = validateDeclaredSize(opts.declaredSizeBytes, Number.MAX_SAFE_INTEGER);
  if (sizeProblem) return sizeProblem;

  const dryRun = opts.dryRun !== false;
  if (dryRun) return { videoId: "DRYRUN_VIDEO_ID" };

  const fetcher = opts.fetcher ?? fetch;

  try {
    const body = new URLSearchParams({ file_url: videoUrl });
    if (opts.title) body.set("title", opts.title);
    const res = await fetcher(`${GRAPH}/${version(opts.graphVersion)}/${accPath(accountId)}/advideos`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Atlas-Idempotency-Key": idempotency(opts, `vid:${accPath(accountId)}:${filenameFromUrl(videoUrl, "video")}`),
      },
      body,
    });
    const json = (await res.json().catch(() => ({}))) as GraphErrorEnvelope;
    const err = graphError(json, res.status, token);
    if (err) return err;
    if (!res.ok) return { ok: false, code: res.status, message: `HTTP ${res.status} sem envelope de erro da Graph.` };
    const videoId = extractVideoId(json);
    if (!videoId) return { ok: false, code: "no_video_id", message: "resposta da Graph sem id de vídeo." };
    return { videoId };
  } catch (err) {
    return { ok: false, code: "network", message: sanitize(`falha de rede no upload: ${err instanceof Error ? err.message : String(err)}`, token) };
  }
}

export { isUploadError };
