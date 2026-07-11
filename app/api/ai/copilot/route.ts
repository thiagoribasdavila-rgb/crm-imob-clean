import { NextResponse } from "next/server";
import { generateText } from "ai";
import { requireApiIdentity } from "@/lib/security/api-auth";
import { logger } from "@/lib/observability/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type CopilotRequest = {
  prompt?: unknown;
  context?: unknown;
};

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function compact(value: unknown) {
  if (!value || typeof value !== "object") return "";
  return JSON.stringify(value).slice(0, 4000);
}

export async function POST(request: Request) {
  try {
    const identity = await requireApiIdentity(request);

    const body = (await request.json()) as CopilotRequest;
    const prompt = text(body.prompt);

    if (!prompt) {
      return NextResponse.json({ error: "prompt é obrigatório." }, { status: 400 });
    }

    if (prompt.length > 2000) {
      return NextResponse.json({ error: "prompt deve ter no máximo 2000 caracteres." }, { status: 400 });
    }

    const { text: answer } = await generateText({
      model: process.env.ATLAS_AI_MODEL || "openai/gpt-5.5",
      system: [
        "Você é o Atlas Copilot do Atlas AI Real Estate Operating System.",
        "Responda em português do Brasil, de forma objetiva e operacional.",
        "Priorize estabilidade, produção, teste real, segurança e dados do CRM imobiliário.",
        "Não invente dados ausentes; quando faltar contexto, diga qual dado precisa ser validado.",
        "Nunca solicite ou revele secrets, tokens, cookies, service role keys ou senhas.",
      ].join("\n"),
      prompt: [
        `Organização: ${identity.organizationId}`,
        `Usuário: ${identity.userId}`,
        `Contexto operacional: ${compact(body.context) || "não informado"}`,
        `Pergunta: ${prompt}`,
      ].join("\n\n"),
    });

    return NextResponse.json({ answer });
  } catch (error) {
    logger.warn("ai.copilot_failed", { error: error instanceof Error ? error.message : String(error) });
    const message = error instanceof Error ? error.message : "Falha ao consultar o Atlas Copilot.";
    const unauthorized = /token|sessão|autenticação|organização/i.test(message);
    return NextResponse.json({ error: message }, { status: unauthorized ? 401 : 500 });
  }
}
