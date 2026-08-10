import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type EnvRequirement = {
  detail: string;
  key: string;
  label: string;
  required: boolean;
};

const requiredChecks: EnvRequirement[] = [
  {
    detail: "Mantém a integração no contrato correto da Graph API.",
    key: "META_GRAPH_API_VERSION",
    label: "Versão Graph API",
    required: true,
  },
  {
    detail: "Identifica a conta de anúncios auditada pelo Atlas.",
    key: "META_AD_ACCOUNT_ID",
    label: "Conta de anúncios",
    required: true,
  },
  {
    detail: "Permite homologar eventos da Conversions API em ambiente controlado.",
    key: "META_CONVERSIONS_ACCESS_TOKEN",
    label: "Token Conversions API",
    required: true,
  },
  {
    detail: "Garante que o primeiro ensaio caia como teste no Events Manager.",
    key: "META_TEST_EVENT_CODE",
    label: "Código de teste Meta",
    required: true,
  },
];

const optionalChecks: EnvRequirement[] = [
  {
    detail: "Ajuda a ler formulários e origem de leads Meta.",
    key: "META_LEAD_ACCESS_TOKEN",
    label: "Token Lead Ads",
    required: false,
  },
  {
    detail: "Confirma que webhooks podem ser verificados sem expor segredo.",
    key: "META_WEBHOOK_VERIFY_TOKEN",
    label: "Webhook Verify Token",
    required: false,
  },
  {
    detail: "Reforça governança e validação de assinatura.",
    key: "META_APP_SECRET",
    label: "App Secret",
    required: false,
  },
  {
    detail: "Necessária para callback público e ensaio oficial na Hostinger.",
    key: "ATLAS_BASE_URL",
    label: "URL pública Atlas",
    required: false,
  },
];

function hasUsableValue(key: string) {
  const value = process.env[key]?.trim();
  if (!value) return false;

  const normalized = value.toLowerCase();
  return !["changeme", "change_me", "todo", "preencher", "sua-chave", "sua_chave", "xxx"].includes(normalized);
}

function toCheck(requirement: EnvRequirement) {
  const present = hasUsableValue(requirement.key);

  return {
    detail: requirement.detail,
    key: requirement.key,
    label: requirement.label,
    present,
    required: requirement.required,
    status: present ? "ok" : requirement.required ? "missing" : "optional",
  };
}

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, {
    limit: 30,
    scope: "meta-test-readiness",
  });
  if (!rate.ok) return rate.response;

  const access = await requireAccessContext(request, {
    accessRoles: ["admin", "director_decisor", "director"],
  });
  if (!access.ok) return access.response;

  const checks = [...requiredChecks, ...optionalChecks].map(toCheck);
  const required = checks.filter((check) => check.required);
  const optional = checks.filter((check) => !check.required);
  const requiredOk = required.filter((check) => check.present).length;
  const optionalOk = optional.filter((check) => check.present).length;
  const requiredTotal = required.length;
  const optionalTotal = optional.length;
  const weightedTotal = requiredTotal * 2 + optionalTotal;
  const weightedOk = requiredOk * 2 + optionalOk;
  const readinessPct = weightedTotal ? Math.round((weightedOk / weightedTotal) * 100) : 0;
  const status = requiredOk === requiredTotal ? "ready" : requiredOk >= Math.ceil(requiredTotal / 2) ? "partial" : "blocked";
  const missingRequired = required.filter((check) => !check.present).map((check) => check.label);

  return NextResponse.json(
    {
      data: {
        checks,
        generatedAt: new Date().toISOString(),
        guardrails: [
          "Readiness only: não aciona Meta API.",
          "Não expõe tokens, app secret, código de teste ou identificadores sensíveis.",
          "Não envia evento real nem move campanha.",
          "CAPI real exige aprovação do diretor e recibo no Events Manager.",
        ],
        mode: "readiness_only_no_delivery",
        nextAction:
          status === "ready"
            ? "Ambiente pronto para ensaio oficial controlado no modo teste Meta."
            : `Preencher antes do ensaio: ${missingRequired.join(", ") || "revisar integrações opcionais"}.`,
        status,
        summary: {
          optionalOk,
          optionalTotal,
          readinessPct,
          requiredOk,
          requiredTotal,
        },
      },
    },
    {
      headers: {
        ...rate.headers,
        "Cache-Control": "private, no-store",
      },
    },
  );
}
