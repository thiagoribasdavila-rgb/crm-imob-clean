import { createHmac, timingSafeEqual } from "node:crypto";

function normalizeSignature(signature: string): string {
  return signature.startsWith("sha256=") ? signature.slice(7) : signature;
}

export function signWebhookPayload(payload: string, secret: string): string {
  if (!secret) throw new Error("Webhook secret ausente.");
  return createHmac("sha256", secret).update(payload, "utf8").digest("hex");
}

export function verifyWebhookSignature(
  payload: string,
  receivedSignature: string | null,
  secret: string,
): boolean {
  if (!receivedSignature || !secret) return false;

  const expected = Buffer.from(signWebhookPayload(payload, secret), "hex");
  const receivedHex = normalizeSignature(receivedSignature.trim());

  if (!/^[a-f0-9]{64}$/i.test(receivedHex)) return false;
  const received = Buffer.from(receivedHex, "hex");
  if (received.length !== expected.length) return false;

  return timingSafeEqual(received, expected);
}
