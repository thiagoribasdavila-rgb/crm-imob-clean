export type ProjectCompatibilitySignalKey =
  | "budget"
  | "region"
  | "typology"
  | "timeline"
  | "purpose";

export type ProjectCompatibilitySignal = {
  key: ProjectCompatibilitySignalKey;
  label: string;
  state: "aligned" | "attention" | "known";
  evidence: string;
};

export type ProjectCompatibilityMissing = {
  key: ProjectCompatibilitySignalKey | "project";
  label: string;
  question: string;
};

export type ProjectCompatibility = {
  status:
    | "evidence_available"
    | "needs_qualification"
    | "project_unavailable";
  project_id: string | null;
  project_name: string | null;
  signals: ProjectCompatibilitySignal[];
  evidence_count: number;
  missing: ProjectCompatibilityMissing | null;
  evaluated_without_ai: true;
};

type FactRecord = Record<string, unknown>;

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function number(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const compact = value.replace(/[^0-9,.-]/g, "");
  const normalized = compact.includes(",")
    ? compact.replace(/\./g, "").replace(",", ".")
    : compact;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function list(value: unknown) {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  const single = text(value);
  return single
    ? single
        .split(/[,;|]/)
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function normalize(value: unknown) {
  return text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

function rangeLabel(minimum: number | null, maximum: number | null) {
  if (minimum !== null && maximum !== null) {
    return `${money.format(minimum)} a ${money.format(maximum)}`;
  }
  if (minimum !== null) return `a partir de ${money.format(minimum)}`;
  if (maximum !== null) return `até ${money.format(maximum)}`;
  return "não informado";
}

function rangesOverlap(
  leadMin: number | null,
  leadMax: number | null,
  projectMin: number | null,
  projectMax: number | null,
) {
  const leftMin = leadMin ?? leadMax;
  const leftMax = leadMax ?? leadMin;
  const rightMin = projectMin ?? projectMax;
  const rightMax = projectMax ?? projectMin;
  if (
    leftMin === null ||
    leftMax === null ||
    rightMin === null ||
    rightMax === null
  ) {
    return null;
  }
  return leftMin <= rightMax && rightMin <= leftMax;
}

function metadata(lead: FactRecord) {
  return lead.metadata && typeof lead.metadata === "object"
    ? (lead.metadata as FactRecord)
    : {};
}

function qualificationValue(
  lead: FactRecord,
  qualification: FactRecord | null,
  keys: string[],
) {
  const leadMetadata = metadata(lead);
  for (const key of keys) {
    const value = qualification?.[key] ?? leadMetadata[key] ?? lead[key];
    if (value !== null && value !== undefined && text(value)) return value;
  }
  return null;
}

/**
 * Produces a factual compatibility reading. Missing information is deliberately
 * returned as a qualification question and never converted into a negative
 * score or a fabricated probability.
 */
export function buildProjectCompatibility(
  lead: FactRecord,
  development: FactRecord | null,
  qualification: FactRecord | null = null,
): ProjectCompatibility {
  const projectId = text(development?.id || lead.development_id) || null;
  const projectName =
    text(
      development?.name ||
        lead.development_name ||
        lead.project_name ||
        lead.project,
    ) || null;

  if (!development) {
    return {
      status: "project_unavailable",
      project_id: projectId,
      project_name: projectName,
      signals: [],
      evidence_count: 0,
      missing: {
        key: "project",
        label: "Empreendimento",
        question: "Qual empreendimento deve ser considerado para este cliente?",
      },
      evaluated_without_ai: true,
    };
  }

  const signals: ProjectCompatibilitySignal[] = [];
  const missing: ProjectCompatibilityMissing[] = [];

  const leadBudgetMin = number(lead.budget_min);
  const leadBudgetMax = number(lead.budget_max);
  const projectPriceMin = number(development.price_min);
  const projectPriceMax = number(development.price_max);
  const budgetOverlap = rangesOverlap(
    leadBudgetMin,
    leadBudgetMax,
    projectPriceMin,
    projectPriceMax,
  );
  if (budgetOverlap !== null) {
    signals.push({
      key: "budget",
      label: "Faixa de preço",
      state: budgetOverlap ? "aligned" : "attention",
      evidence: `Cliente ${rangeLabel(leadBudgetMin, leadBudgetMax)} · projeto ${rangeLabel(projectPriceMin, projectPriceMax)}`,
    });
  } else {
    missing.push({
      key: "budget",
      label: "Faixa de investimento",
      question: "Qual faixa de investimento fica confortável para este cliente?",
    });
  }

  const preferredRegions = list(lead.preferred_regions);
  const projectRegions = [
    development.neighborhood,
    development.city,
    development.state,
  ]
    .map(text)
    .filter(Boolean);
  if (preferredRegions.length && projectRegions.length) {
    const aligned = preferredRegions.some((preferred) =>
      projectRegions.some((projectRegion) => {
        const left = normalize(preferred);
        const right = normalize(projectRegion);
        return left === right || left.includes(right) || right.includes(left);
      }),
    );
    signals.push({
      key: "region",
      label: "Região",
      state: aligned ? "aligned" : "attention",
      evidence: `Preferência ${preferredRegions.join(", ")} · projeto ${projectRegions.join(", ")}`,
    });
  } else {
    missing.push({
      key: "region",
      label: "Região de interesse",
      question: "Quais regiões são prioridade para este cliente e por quê?",
    });
  }

  const bedrooms = number(lead.bedrooms);
  const bedroomsMin = number(development.bedrooms_min);
  const bedroomsMax = number(development.bedrooms_max);
  if (bedrooms !== null && (bedroomsMin !== null || bedroomsMax !== null)) {
    const minimum = bedroomsMin ?? bedroomsMax ?? bedrooms;
    const maximum = bedroomsMax ?? bedroomsMin ?? bedrooms;
    const aligned = bedrooms >= minimum && bedrooms <= maximum;
    signals.push({
      key: "typology",
      label: "Tipologia",
      state: aligned ? "aligned" : "attention",
      evidence: `Cliente busca ${bedrooms} dorm. · projeto oferece ${minimum === maximum ? minimum : `${minimum}–${maximum}`} dorm.`,
    });
  } else {
    const unitProfile = text(
      qualificationValue(lead, qualification, [
        "unit_profile_key",
        "unit_profile",
      ]),
    );
    if (unitProfile) {
      signals.push({
        key: "typology",
        label: "Tipologia",
        state: "known",
        evidence: `Perfil de unidade informado: ${unitProfile}`,
      });
    } else {
      missing.push({
        key: "typology",
        label: "Tipologia desejada",
        question: "Quantos dormitórios atendem à necessidade deste cliente?",
      });
    }
  }

  const timeline = text(
    qualificationValue(lead, qualification, [
      "timeline_key",
      "purchase_timeline",
      "timeline",
    ]),
  );
  if (timeline) {
    signals.push({
      key: "timeline",
      label: "Prazo",
      state: "known",
      evidence: `Prazo informado: ${timeline}`,
    });
  } else {
    missing.push({
      key: "timeline",
      label: "Prazo de compra",
      question: "Quando este cliente pretende comprar?",
    });
  }

  const purpose = text(
    qualificationValue(lead, qualification, ["purpose_key", "purpose"]),
  );
  if (purpose) {
    signals.push({
      key: "purpose",
      label: "Objetivo",
      state: "known",
      evidence: `Objetivo informado: ${purpose}`,
    });
  } else {
    missing.push({
      key: "purpose",
      label: "Objetivo da compra",
      question: "O imóvel é para morar ou investir?",
    });
  }

  return {
    status: missing.length ? "needs_qualification" : "evidence_available",
    project_id: projectId,
    project_name: projectName,
    signals,
    evidence_count: signals.length,
    missing: missing[0] ?? null,
    evaluated_without_ai: true,
  };
}
