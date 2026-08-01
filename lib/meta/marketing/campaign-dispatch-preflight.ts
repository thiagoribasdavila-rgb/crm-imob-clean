import { describeMetaGraphFailure, metaGraphVersion } from "@/lib/meta/graph";

export type DispatchPreflightStatus = "ok" | "warning" | "blocked";

export type DispatchPreflightCheck = {
  id: string;
  label: string;
  status: DispatchPreflightStatus;
  message: string;
  technical?: string;
};

export type DispatchPreflightInput = {
  adsToken?: string | null;
  leadToken?: string | null;
  adAccountId?: string | null;
  pageId?: string | null;
  leadFormId?: string | null;
  graphVersion?: string | null;
  fetcher?: typeof fetch;
};

type GraphEnvelope = Record<string, unknown> & {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
};

type GraphRead = {
  ok: boolean;
  status: number;
  body: GraphEnvelope;
  technical?: string;
};

function clean(value?: string | null): string {
  return String(value ?? "").trim();
}

function accountPath(accountId: string): string {
  const id = clean(accountId).replace(/^act_/, "");
  return id ? `act_${id}` : "";
}

function masked(value: string): string | null {
  const cleanValue = clean(value);
  if (!cleanValue) return null;
  return `••••${cleanValue.slice(-4)}`;
}

function hasValue(value?: string | null): boolean {
  return clean(value).length > 0;
}

function graphUrl(path: string, graphVersion?: string | null): string {
  const version = clean(graphVersion) || metaGraphVersion();
  return `https://graph.facebook.com/${version}/${path}`;
}

function noToken(value: string, token: string): string {
  return token ? value.split(token).join("<token>") : value;
}

async function readGraph(path: string, token: string, graphVersion?: string | null, fetcher: typeof fetch = fetch): Promise<GraphRead> {
  try {
    const response = await fetcher(graphUrl(path, graphVersion), {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const body = (await response.json().catch(() => ({}))) as GraphEnvelope;
    if (!response.ok || body.error) {
      return {
        ok: false,
        status: response.status,
        body,
        technical: noToken(describeMetaGraphFailure(response.status, body), token),
      };
    }
    return { ok: true, status: response.status, body };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      body: {},
      technical: noToken(error instanceof Error ? error.message : String(error), token),
    };
  }
}

function addConfigCheck(checks: DispatchPreflightCheck[], id: string, label: string, value: string | null, missing: string) {
  checks.push({
    id,
    label,
    status: hasValue(value) ? "ok" : "blocked",
    message: hasValue(value) ? "Configurado." : missing,
  });
}

function addGraphCheck(
  checks: DispatchPreflightCheck[],
  id: string,
  label: string,
  result: GraphRead,
  okMessage: string,
  failMessage: string,
) {
  checks.push({
    id,
    label,
    status: result.ok ? "ok" : "blocked",
    message: result.ok ? okMessage : failMessage,
    ...(result.technical ? { technical: result.technical } : {}),
  });
}

export async function runMetaCampaignDispatchPreflight(input: DispatchPreflightInput) {
  const checks: DispatchPreflightCheck[] = [];
  const graphVersion = clean(input.graphVersion) || metaGraphVersion();
  const adsToken = clean(input.adsToken);
  const leadToken = clean(input.leadToken) || adsToken;
  const account = accountPath(clean(input.adAccountId));
  const pageId = clean(input.pageId);
  const leadFormId = clean(input.leadFormId);
  const fetcher = input.fetcher ?? fetch;

  addConfigCheck(checks, "ads-token", "Token Meta Ads", adsToken, "Configure META_ADS_ACCESS_TOKEN na Hostinger.");
  addConfigCheck(checks, "ad-account", "Conta de anúncios", account, "Configure META_AD_ACCOUNT_ID na Hostinger.");

  let accountRead: GraphRead | null = null;
  if (adsToken && account) {
    accountRead = await readGraph(`${account}?fields=id,name,account_status,currency,timezone_name,disable_reason`, adsToken, graphVersion, fetcher);
    addGraphCheck(
      checks,
      "account-read",
      "Leitura da conta",
      accountRead,
      "Conta lida com sucesso pela Marketing API.",
      "A Meta recusou a leitura da conta. Revise token, permissões ou conta.",
    );
  }

  let campaignRead: GraphRead | null = null;
  if (adsToken && account && accountRead?.ok) {
    campaignRead = await readGraph(`${account}/campaigns?fields=id,name,status,effective_status,objective,special_ad_categories&limit=1`, adsToken, graphVersion, fetcher);
    addGraphCheck(
      checks,
      "campaigns-read",
      "Leitura de campanhas",
      campaignRead,
      "Campanhas lidas com sucesso. A conta aceita consulta de campanhas.",
      "A Meta recusou a leitura de campanhas. Verifique ads_read/ads_management e permissões do Business.",
    );
  }

  if (!pageId) {
    checks.push({
      id: "page-id",
      label: "Página Meta",
      status: "warning",
      message: "Configure META_PAGE_ID ou envie pageId no material da campanha antes de criar anúncio de leads.",
    });
  } else if (leadToken) {
    const pageRead = await readGraph(`${encodeURIComponent(pageId)}?fields=id,name`, leadToken, graphVersion, fetcher);
    addGraphCheck(
      checks,
      "page-read",
      "Página Meta",
      pageRead,
      "Página lida com sucesso.",
      "Não foi possível ler a Página. Revise acesso da Página/token.",
    );
  }

  if (!leadFormId) {
    checks.push({
      id: "lead-form-id",
      label: "Formulário Lead Ads",
      status: "warning",
      message: "Configure META_LEAD_FORM_ID ou envie leadFormId no material da campanha antes de criar anúncio de leads.",
    });
  } else if (leadToken) {
    const formRead = await readGraph(`${encodeURIComponent(leadFormId)}?fields=id,name,status`, leadToken, graphVersion, fetcher);
    addGraphCheck(
      checks,
      "lead-form-read",
      "Formulário Lead Ads",
      formRead,
      "Formulário lido com sucesso.",
      "Não foi possível ler o formulário de leads. Revise leads_retrieval/página/formulário.",
    );
  }

  checks.push({
    id: "safe-publication-mode",
    label: "Modo seguro de publicação",
    status: "ok",
    message: "O Atlas cria campanhas pausadas; ativação com gasto exige aprovação humana separada.",
  });

  checks.push({
    id: "media-commit",
    label: "Mídia da campanha",
    status: "warning",
    message: "Na criação real, envie ao menos uma URL de imagem ou vídeo para o Atlas subir a mídia e receber image_hash/video_id.",
  });

  const blockers = checks.filter((check) => check.status === "blocked");
  const warnings = checks.filter((check) => check.status === "warning");
  const score = Math.round(((checks.length - blockers.length - warnings.length * 0.35) / checks.length) * 100);
  const canCreatePausedCampaign = blockers.length === 0 && warnings.every((check) => !["page-id", "lead-form-id"].includes(check.id));

  return {
    status: blockers.length ? "blocked" : warnings.length ? "warning" : "ok",
    score: Math.max(0, Math.min(100, score)),
    graphVersion,
    accountIdMasked: account ? masked(account.replace(/^act_/, "")) : null,
    pageIdMasked: pageId ? masked(pageId) : null,
    leadFormIdMasked: leadFormId ? masked(leadFormId) : null,
    checks,
    readiness: {
      canReadMetaAccount: Boolean(accountRead?.ok),
      canReadCampaigns: Boolean(campaignRead?.ok),
      canCreatePausedCampaign,
      canActivateWithSpend: false,
      activationRequiresHumanApproval: true,
      externalMutationExecuted: false,
    },
    nextActions: blockers.length
      ? blockers.map((check) => check.message)
      : canCreatePausedCampaign
        ? ["Rodar prévia da campanha com produto, verba, pageId, leadFormId e mídia.", "Enviar aprovação humana antes da criação real pausada.", "Ativar somente depois de revisar a campanha criada."]
        : warnings.map((check) => check.message),
  };
}
