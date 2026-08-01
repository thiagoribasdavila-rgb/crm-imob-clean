/**
 * Teste adversarial do upload de mídia da Marketing API (imagens/vídeos).
 *
 * Standalone, sem framework: executa o CÓDIGO REAL de
 * lib/meta/marketing/media-upload.ts (strip de tipos nativo do Node — o módulo
 * não tem imports de valor) com fetcher MOCK e valida:
 * validações puras de URL/host/extensão/tamanho, dry-run que não toca a rede,
 * shape do POST conforme a doc (imagem baixa bytes → base64; vídeo file_url),
 * extração do hash/videoId, erro estruturado da Graph, idempotency-key no POST
 * e token NUNCA vazado.
 *
 * Rodar da raiz do repo: node scripts/check-media-upload.mjs (Node >= 22.13)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stripTypeScriptTypes } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "lib", "meta", "marketing", "media-upload.ts");
const stripped = stripTypeScriptTypes(fs.readFileSync(sourcePath, "utf8"));
const mod = await import(`data:text/javascript;base64,${Buffer.from(stripped, "utf8").toString("base64")}`);
const {
  uploadImageFromUrl,
  uploadVideoFromUrl,
  isHttpsUrl,
  urlExtension,
  validateImageUrl,
  validateVideoUrl,
  validateDeclaredSize,
  MAX_IMAGE_BYTES,
  isUploadError,
} = mod;

const failures = [];
let passed = 0;
function check(name, condition, extra = "") {
  if (condition) passed += 1;
  else failures.push(`${name}${extra ? ` — ${extra}` : ""}`);
}

const TOKEN = "EAAB-super-secreto-token-meta-999";

/**
 * Fetcher mock: distingue download (GET sem method) de upload (POST) e grava as
 * chamadas. `uploadResponse` controla a resposta do POST; `downloadBytes`
 * controla os bytes baixados (ou um Error para simular falha de rede).
 */
function mockFetcher({ uploadResponse, downloadBytes = "fake-image-bytes", downloadOk = true, downloadStatus = 200 } = {}) {
  const calls = [];
  const fn = async (url, init) => {
    const isPost = !!(init && init.method === "POST");
    calls.push({ url, init, isPost, body: isPost ? String(init.body) : null });
    if (!isPost) {
      // download da imagem
      if (downloadBytes instanceof Error) throw downloadBytes;
      const buf = typeof downloadBytes === "number"
        ? Buffer.alloc(downloadBytes)
        : Buffer.from(downloadBytes, "utf8");
      return {
        ok: downloadOk,
        status: downloadStatus,
        arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
      };
    }
    // upload
    const r = uploadResponse ?? { ok: true, status: 200, json: { images: { "image.jpg": { hash: "HASH_OK" } } } };
    if (r instanceof Error) throw r;
    return { ok: r.ok !== false, status: r.status ?? 200, json: async () => r.json };
  };
  fn.calls = calls;
  return fn;
}

// ---------------------------------------------------------------------------
// 1-6: validações puras
// ---------------------------------------------------------------------------

// 1. isHttpsUrl: só https com host
check(
  "caso 1: isHttpsUrl aceita https e recusa http/ftp/data/malformada",
  isHttpsUrl("https://cdn.exemplo.com/a.jpg") === true &&
    isHttpsUrl("http://cdn.exemplo.com/a.jpg") === false &&
    isHttpsUrl("ftp://x/a.jpg") === false &&
    isHttpsUrl("data:image/png;base64,AAAA") === false &&
    isHttpsUrl("não-é-url") === false,
);

// 2. urlExtension normaliza minúsculo e lida com query/sem-extensão
check(
  "caso 2: urlExtension extrai extensão minúscula, ignora query, vazio sem extensão",
  urlExtension("https://x.com/foto.JPG?v=2") === "jpg" &&
    urlExtension("https://x.com/a/b.png") === "png" &&
    urlExtension("https://x.com/semext") === "" &&
    urlExtension("https://x.com/dir/") === "",
  JSON.stringify([urlExtension("https://x.com/foto.JPG?v=2"), urlExtension("https://x.com/semext")]),
);

// 3. validateImageUrl: aceita jpg/png https, recusa http, recusa gif/sem-ext
{
  const ok = validateImageUrl("https://x.com/a.png");
  const httpErr = validateImageUrl("http://x.com/a.png");
  const extErr = validateImageUrl("https://x.com/a.gif");
  check(
    "caso 3: validateImageUrl aceita jpg/png https e recusa http/gif",
    ok === null &&
      isUploadError(httpErr) && httpErr.code === "invalid_url" &&
      isUploadError(extErr) && extErr.code === "invalid_extension",
    JSON.stringify({ ok, httpErr, extErr }),
  );
}

// 4. validateVideoUrl: aceita mp4/mov https, recusa http e extensão não-vídeo
{
  const ok = validateVideoUrl("https://x.com/v.mp4");
  const okMov = validateVideoUrl("https://x.com/v.MOV");
  const httpErr = validateVideoUrl("http://x.com/v.mp4");
  const extErr = validateVideoUrl("https://x.com/v.jpg");
  check(
    "caso 4: validateVideoUrl aceita mp4/mov https e recusa http/não-vídeo",
    ok === null && okMov === null &&
      isUploadError(httpErr) && httpErr.code === "invalid_url" &&
      isUploadError(extErr) && extErr.code === "invalid_extension",
    JSON.stringify({ ok, okMov, httpErr, extErr }),
  );
}

// 5. validateDeclaredSize: null quando ausente, acusa acima do teto e valor inválido
{
  const absent = validateDeclaredSize(undefined, MAX_IMAGE_BYTES);
  const within = validateDeclaredSize(1000, MAX_IMAGE_BYTES);
  const over = validateDeclaredSize(MAX_IMAGE_BYTES + 1, MAX_IMAGE_BYTES);
  const bad = validateDeclaredSize(-5, MAX_IMAGE_BYTES);
  check(
    "caso 5: validateDeclaredSize trata ausente/dentro/acima/inválido",
    absent === null && within === null &&
      isUploadError(over) && over.code === "too_large" &&
      isUploadError(bad) && bad.code === "invalid_size",
    JSON.stringify({ over, bad }),
  );
}

// 6. MAX_IMAGE_BYTES é 30 MB conforme a doc
check("caso 6: MAX_IMAGE_BYTES = 30 MB", MAX_IMAGE_BYTES === 30 * 1024 * 1024, String(MAX_IMAGE_BYTES));

// ---------------------------------------------------------------------------
// 7-11: uploadImageFromUrl
// ---------------------------------------------------------------------------

// 7. dry-run é o DEFAULT: hash sintético e ZERO rede
{
  const fetcher = mockFetcher();
  const r = await uploadImageFromUrl("act_123", TOKEN, "https://x.com/a.jpg", { fetcher });
  check(
    "caso 7: imagem dry-run default devolve DRYRUN_HASH sem tocar a rede",
    r.hash === "DRYRUN_HASH" && fetcher.calls.length === 0,
    JSON.stringify(r),
  );
}

// 8. URL inválida é recusada ANTES de qualquer rede (mesmo com dryRun:false)
{
  const fetcher = mockFetcher();
  const r = await uploadImageFromUrl("123", TOKEN, "http://x.com/a.jpg", { fetcher, dryRun: false });
  check(
    "caso 8: URL http recusada no pré-voo sem tocar a rede",
    isUploadError(r) && r.code === "invalid_url" && fetcher.calls.length === 0,
    JSON.stringify(r),
  );
}

// 9. upload real: baixa bytes → POST /adimages com bytes=base64, extrai hash, idempotency-key presente
{
  const fetcher = mockFetcher({ uploadResponse: { json: { images: { "a.jpg": { hash: "REAL_HASH_1" } } } } });
  const r = await uploadImageFromUrl("act_555", TOKEN, "https://cdn.x.com/a.jpg", { fetcher, dryRun: false, idempotencyKey: "up-1" });
  const post = fetcher.calls.find((c) => c.isPost);
  const params = new URLSearchParams(post.body);
  const expectedB64 = Buffer.from("fake-image-bytes", "utf8").toString("base64");
  check(
    "caso 9: imagem real baixa bytes, POSTa bytes=base64 e extrai o hash",
    r.hash === "REAL_HASH_1" &&
      fetcher.calls.length === 2 &&
      fetcher.calls[0].isPost === false &&
      post.url.includes("act_555/adimages") &&
      params.get("bytes") === expectedB64 &&
      post.init.headers["X-Atlas-Idempotency-Key"] === "up-1" &&
      post.init.headers["Content-Type"] === "application/x-www-form-urlencoded",
    JSON.stringify({ r, url: post.url, idk: post.init.headers["X-Atlas-Idempotency-Key"] }),
  );
}

// 10. erro estruturado da Graph no POST: code/subcode/fbtrace repassados, sem vazar token
{
  const fetcher = mockFetcher({
    uploadResponse: { ok: false, status: 400, json: { error: { code: 100, error_subcode: 1487, message: `token era Bearer ${TOKEN}`, fbtrace_id: "TRACE1" } } },
  });
  const r = await uploadImageFromUrl("act_1", TOKEN, "https://x.com/a.png", { fetcher, dryRun: false });
  const serialized = JSON.stringify(r);
  check(
    "caso 10: erro da Graph repassa code/subcode/fbtrace e sanitiza o token",
    isUploadError(r) && r.code === 100 && r.subcode === 1487 && r.fbtrace === "TRACE1" &&
      !serialized.includes(TOKEN) && serialized.includes("[token]"),
    serialized,
  );
}

// 11. resposta sem hash é acusada; download com HTTP != 2xx também
{
  const noHash = mockFetcher({ uploadResponse: { json: { images: {} } } });
  const r1 = await uploadImageFromUrl("1", TOKEN, "https://x.com/a.jpg", { fetcher: noHash, dryRun: false });
  const dlFail = mockFetcher({ downloadOk: false, downloadStatus: 404 });
  const r2 = await uploadImageFromUrl("1", TOKEN, "https://x.com/a.jpg", { fetcher: dlFail, dryRun: false });
  check(
    "caso 11: resposta sem hash e download 404 viram erro estruturado",
    isUploadError(r1) && r1.code === "no_hash" &&
      isUploadError(r2) && String(r2.code).startsWith("download_") &&
      dlFail.calls.filter((c) => c.isPost).length === 0,
    JSON.stringify({ r1, r2 }),
  );
}

// 12. imagem baixada acima de 30 MB é recusada (sem POST)
{
  const big = mockFetcher({ downloadBytes: MAX_IMAGE_BYTES + 10 });
  const r = await uploadImageFromUrl("1", TOKEN, "https://x.com/a.jpg", { fetcher: big, dryRun: false });
  check(
    "caso 12: imagem baixada acima de 30 MB recusada sem POST",
    isUploadError(r) && r.code === "too_large" && big.calls.filter((c) => c.isPost).length === 0,
    JSON.stringify(r),
  );
}

// 13. falha de rede no download: token sanitizado, sem POST
{
  const netFail = mockFetcher({ downloadBytes: new Error(`ECONNRESET Bearer ${TOKEN}`) });
  const r = await uploadImageFromUrl("1", TOKEN, "https://x.com/a.jpg", { fetcher: netFail, dryRun: false });
  const serialized = JSON.stringify(r);
  check(
    "caso 13: falha de rede no download sanitiza token e não POSTa",
    isUploadError(r) && r.code === "network" && !serialized.includes(TOKEN) && netFail.calls.filter((c) => c.isPost).length === 0,
    serialized,
  );
}

// ---------------------------------------------------------------------------
// 14-16: uploadVideoFromUrl
// ---------------------------------------------------------------------------

// 14. dry-run default: videoId sintético e zero rede
{
  const fetcher = mockFetcher();
  const r = await uploadVideoFromUrl("act_9", TOKEN, "https://x.com/v.mp4", { fetcher });
  check(
    "caso 14: vídeo dry-run default devolve DRYRUN_VIDEO_ID sem rede",
    r.videoId === "DRYRUN_VIDEO_ID" && fetcher.calls.length === 0,
    JSON.stringify(r),
  );
}

// 15. upload real de vídeo: POST /advideos com file_url (e title), sem download, extrai id/video_id
{
  const fetcher = mockFetcher({ uploadResponse: { json: { id: "VID_1" } } });
  const r = await uploadVideoFromUrl("act_77", TOKEN, "https://cdn.x.com/v.mov", { fetcher, dryRun: false, title: "Meu vídeo", idempotencyKey: "vup-1" });
  const post = fetcher.calls.find((c) => c.isPost);
  const params = new URLSearchParams(post.body);
  check(
    "caso 15: vídeo real usa file_url + title, sem baixar bytes, extrai o id",
    r.videoId === "VID_1" &&
      fetcher.calls.length === 1 &&
      post.url.includes("act_77/advideos") &&
      params.get("file_url") === "https://cdn.x.com/v.mov" &&
      params.get("title") === "Meu vídeo" &&
      post.init.headers["X-Atlas-Idempotency-Key"] === "vup-1",
    JSON.stringify({ r, url: post.url }),
  );
}

// 16. vídeo: resposta usando video_id (sem id) é aceita; erro da Graph sanitiza token
{
  const alt = mockFetcher({ uploadResponse: { json: { video_id: "VID_ALT" } } });
  const r1 = await uploadVideoFromUrl("1", TOKEN, "https://x.com/v.mp4", { fetcher: alt, dryRun: false });
  const errFetcher = mockFetcher({ uploadResponse: { ok: false, status: 400, json: { error: { code: 190, message: `bad Bearer ${TOKEN}` } } } });
  const r2 = await uploadVideoFromUrl("1", TOKEN, "https://x.com/v.mp4", { fetcher: errFetcher, dryRun: false });
  const serialized = JSON.stringify(r2);
  check(
    "caso 16: vídeo aceita video_id alternativo e sanitiza token no erro",
    r1.videoId === "VID_ALT" &&
      isUploadError(r2) && r2.code === 190 && !serialized.includes(TOKEN) && serialized.includes("[token]"),
    JSON.stringify({ r1, r2 }),
  );
}

// 17. vídeo com URL inválida recusada no pré-voo, sem rede
{
  const fetcher = mockFetcher();
  const r = await uploadVideoFromUrl("1", TOKEN, "https://x.com/v.jpg", { fetcher, dryRun: false });
  check(
    "caso 17: vídeo com extensão não-vídeo recusado no pré-voo",
    isUploadError(r) && r.code === "invalid_extension" && fetcher.calls.length === 0,
    JSON.stringify(r),
  );
}

// ---------------------------------------------------------------------------
console.log(`check-media-upload: ${passed} passaram, ${failures.length} falharam`);
if (failures.length) {
  for (const f of failures) console.error(`  FALHOU: ${f}`);
  process.exit(1);
}
