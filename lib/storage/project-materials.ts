import { createHash } from "node:crypto";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type MaterialStorageProvider = "supabase" | "s3";
export type MaterialLocation = { provider: MaterialStorageProvider; bucket: string; path: string };

const supabaseBucket = "project-materials";
function s3Config() {
  const endpoint = process.env.ATLAS_OBJECT_STORAGE_ENDPOINT;
  const region = process.env.ATLAS_OBJECT_STORAGE_REGION || "auto";
  const bucket = process.env.ATLAS_OBJECT_STORAGE_BUCKET;
  const accessKeyId = process.env.ATLAS_OBJECT_STORAGE_ACCESS_KEY_ID;
  const secretAccessKey = process.env.ATLAS_OBJECT_STORAGE_SECRET_ACCESS_KEY;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  return { endpoint, region, bucket, accessKeyId, secretAccessKey };
}

function s3() {
  const config = s3Config();
  if (!config) throw new Error("Armazenamento de objetos não configurado.");
  return { bucket: config.bucket, client: new S3Client({ endpoint: config.endpoint, region: config.region, forcePathStyle: process.env.ATLAS_OBJECT_STORAGE_FORCE_PATH_STYLE === "true", credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey } }) };
}

export function preferredMaterialStorage(): MaterialStorageProvider {
  return process.env.ATLAS_MATERIAL_STORAGE_PROVIDER === "s3" && s3Config() ? "s3" : "supabase";
}

export function materialStorageReady() { return { preferred: preferredMaterialStorage(), s3Configured: Boolean(s3Config()), private: true, signedUrlTtlSeconds: 900 }; }
export function sha256(body: Uint8Array) { return createHash("sha256").update(body).digest("hex"); }

export async function uploadMaterial(path: string, body: Uint8Array, contentType: string) {
  if (preferredMaterialStorage() === "s3") {
    const target = s3();
    const checksum = sha256(body);
    await target.client.send(new PutObjectCommand({ Bucket: target.bucket, Key: path, Body: body, ContentType: contentType, CacheControl: "private, max-age=3600", Metadata: { sha256: checksum } }));
    const head = await target.client.send(new HeadObjectCommand({ Bucket: target.bucket, Key: path }));
    if (Number(head.ContentLength) !== body.byteLength || head.Metadata?.sha256 !== checksum) throw new Error("Falha na verificação do arquivo enviado.");
    return { provider: "s3" as const, bucket: target.bucket, path, checksum };
  }
  const checksum = sha256(body);
  const result = await getSupabaseAdmin().storage.from(supabaseBucket).upload(path, body, { contentType, cacheControl: "3600", upsert: false });
  if (result.error) throw result.error;
  return { provider: "supabase" as const, bucket: supabaseBucket, path, checksum };
}

export async function signedMaterialUrl(location: MaterialLocation, expiresIn = 900) {
  if (location.provider === "s3") { const target = s3(); return getSignedUrl(target.client, new GetObjectCommand({ Bucket: location.bucket, Key: location.path }), { expiresIn }); }
  const { data } = await getSupabaseAdmin().storage.from(location.bucket).createSignedUrl(location.path, expiresIn);
  return data?.signedUrl ?? null;
}

export async function deleteMaterial(location: MaterialLocation) {
  if (location.provider === "s3") { const target = s3(); await target.client.send(new DeleteObjectCommand({ Bucket: location.bucket, Key: location.path })); return; }
  await getSupabaseAdmin().storage.from(location.bucket).remove([location.path]);
}

export async function readMaterial(location: MaterialLocation) {
  if (location.provider === "s3") { const target = s3(); const result = await target.client.send(new GetObjectCommand({ Bucket: location.bucket, Key: location.path })); return new Uint8Array(await result.Body!.transformToByteArray()); }
  const { data, error } = await getSupabaseAdmin().storage.from(location.bucket).download(location.path);
  if (error || !data) throw error || new Error("Arquivo não encontrado.");
  return new Uint8Array(await data.arrayBuffer());
}

export async function copyMaterialToS3(source: MaterialLocation) {
  const body = await readMaterial(source); const checksum = sha256(body); const target = s3();
  await target.client.send(new PutObjectCommand({ Bucket: target.bucket, Key: source.path, Body: body, Metadata: { sha256: checksum } }));
  const head = await target.client.send(new HeadObjectCommand({ Bucket: target.bucket, Key: source.path }));
  if (Number(head.ContentLength) !== body.byteLength || head.Metadata?.sha256 !== checksum) throw new Error("Checksum ou tamanho divergente após cópia.");
  return { provider: "s3" as const, bucket: target.bucket, path: source.path, checksum };
}
