/**
 * Calibração de público sob a política HOUSING da Meta (Special Ad Category).
 *
 * Anúncio imobiliário na Meta é categoria especial: idade travada em 18–65+,
 * sem gênero, sem exclusões de segmentação detalhada, sem lookalike, geo com
 * raio mínimo amplo (~24 km / 15 mi). Ou seja: o "melhor público" NÃO vem de
 * segmentar — vem de (1) geo em torno do empreendimento, (2) Advantage+ com
 * audience_controls, e (3) o CRIATIVO qualificando o público (copy que
 * descreve o produto/programa de crédito, nunca o leitor).
 *
 * Núcleo determinístico e puro: monta a proposta de targeting compatível e
 * valida qualquer spec contra as travas — nada é enviado à Meta por aqui.
 */

export const HOUSING_MIN_RADIUS_KM = 24; // ~15 milhas — mínimo da política p/ raio
export const HOUSING_AGE_MIN = 18;
export const HOUSING_AGE_MAX = 65; // 65 = "65+" na Meta; não pode estreitar

export type GeoPoint = { latitude: number; longitude: number; radiusKm?: number };
export type GeoTarget = {
  countries?: string[];        // default ["BR"]
  cities?: string[];           // keys de cidade da Meta (ex.: "São Paulo")
  points?: GeoPoint[];         // pinos no empreendimento (raio é clampado ao mínimo)
};

export type TargetingViolation = { field: string; rule: string; detail: string };

/** Monta o targeting HOUSING-compatível: geo + travas + Advantage+ controls. */
export function housingTargetingSpec(geo: GeoTarget): Record<string, unknown> {
  const countries = geo.countries?.length ? geo.countries : ["BR"];
  const geoLocations: Record<string, unknown> = {};
  if (geo.cities?.length) {
    geoLocations.cities = geo.cities.map((key) => ({ key }));
  } else if (geo.points?.length) {
    geoLocations.custom_locations = geo.points.map((p) => ({
      latitude: p.latitude,
      longitude: p.longitude,
      radius: Math.max(p.radiusKm ?? HOUSING_MIN_RADIUS_KM, HOUSING_MIN_RADIUS_KM),
      distance_unit: "kilometer",
    }));
  } else {
    geoLocations.countries = countries;
  }
  return {
    // travas da categoria especial — NUNCA estreitar
    age_min: HOUSING_AGE_MIN,
    age_max: HOUSING_AGE_MAX,
    genders: [], // todos — a política proíbe segmentar por gênero
    geo_locations: geoLocations,
    // Advantage+ audience: a Meta expande além dos controles; controles = só geo
    targeting_automation: { advantage_audience: 1 },
  };
}

/** Valida um targeting arbitrário contra as travas HOUSING. */
export function validateHousingTargeting(spec: Record<string, unknown>): TargetingViolation[] {
  const v: TargetingViolation[] = [];
  const ageMin = Number(spec.age_min);
  const ageMax = Number(spec.age_max);
  if (Number.isFinite(ageMin) && ageMin !== HOUSING_AGE_MIN) {
    v.push({ field: "age_min", rule: "idade_travada", detail: `HOUSING exige age_min ${HOUSING_AGE_MIN} (veio ${ageMin}).` });
  }
  if (Number.isFinite(ageMax) && ageMax !== HOUSING_AGE_MAX) {
    v.push({ field: "age_max", rule: "idade_travada", detail: `HOUSING exige age_max ${HOUSING_AGE_MAX} ("65+") (veio ${ageMax}).` });
  }
  const genders = spec.genders;
  if (Array.isArray(genders) && genders.length > 0) {
    v.push({ field: "genders", rule: "sem_genero", detail: "HOUSING proíbe segmentar por gênero — use todos ([])." });
  }
  if (spec.exclusions != null) {
    v.push({ field: "exclusions", rule: "sem_exclusoes", detail: "HOUSING proíbe exclusões de segmentação detalhada." });
  }
  if (spec.lookalike_audience_ids != null || hasLookalike(spec.custom_audiences)) {
    v.push({ field: "custom_audiences", rule: "sem_lookalike", detail: "HOUSING proíbe públicos semelhantes (lookalike)." });
  }
  const geo = spec.geo_locations as Record<string, unknown> | undefined;
  if (geo?.zips != null) {
    v.push({ field: "geo_locations.zips", rule: "sem_cep", detail: "HOUSING proíbe segmentação por CEP." });
  }
  const custom = geo?.custom_locations;
  if (Array.isArray(custom)) {
    for (const [i, loc] of custom.entries()) {
      const l = loc as { radius?: unknown; distance_unit?: unknown };
      const km = l.distance_unit === "mile" ? Number(l.radius) * 1.609 : Number(l.radius);
      if (Number.isFinite(km) && km < HOUSING_MIN_RADIUS_KM) {
        v.push({ field: `geo_locations.custom_locations[${i}]`, rule: "raio_minimo", detail: `Raio ${km.toFixed(1)} km abaixo do mínimo de ${HOUSING_MIN_RADIUS_KM} km (~15 mi).` });
      }
    }
  }
  return v;
}

function hasLookalike(customAudiences: unknown): boolean {
  if (!Array.isArray(customAudiences)) return false;
  return customAudiences.some((a) => {
    const sub = (a as { subtype?: unknown }).subtype;
    return typeof sub === "string" && sub.toUpperCase() === "LOOKALIKE";
  });
}

/**
 * A doutrina do "melhor público" sob HOUSING, em texto — para a IA explicar a
 * estratégia ao diretor (por que não segmentamos por idade/renda no gerenciador
 * e como o criativo faz esse papel legalmente).
 */
export function audienceDoctrine(product: string): string[] {
  return [
    `Categoria HOUSING trava a segmentação (18–65+, sem gênero, sem lookalike, raio amplo) — segmentar "na mão" é impossível e tentar burlar derruba o anúncio.`,
    `O público certo de ${product} é conquistado pelo CRIATIVO: copy que descreve o produto e o programa de crédito (ex.: "para renda de 6 a 10 salários mínimos") qualifica quem clica sem citar atributos do leitor.`,
    `Diversidade criativa (3–5+ variações de ângulo) deixa o algoritmo da Meta encontrar os subpúblicos que respondem — é assim que se "segmenta" na era Andromeda.`,
    `Geo é o único controle fino permitido: pino no empreendimento com raio mínimo de ${HOUSING_MIN_RADIUS_KM} km ou a cidade — quem busca morar perto responde.`,
    `Advantage+ audience ligado com controles só de geo: a Meta expande a entrega para além do óbvio, e o lead form filtra o resto.`,
  ];
}
