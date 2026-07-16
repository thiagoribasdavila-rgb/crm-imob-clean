import type { AtlasProperty } from "@/types/atlas";

type PresentationProperty = Pick<AtlasProperty, "title" | "price" | "city" | "state" | "bedrooms" | "area" | "status">;

const unsafeClaims = [
  { pattern: /(?:preço|valor) garantido/gi, label: "Garantia de preço" },
  { pattern: /(?:disponibilidade|unidade) garantida/gi, label: "Garantia de disponibilidade" },
  { pattern: /rentabilidade garantida/gi, label: "Promessa de rentabilidade" },
  { pattern: /aprova(?:ção|do) garantid/gi, label: "Promessa de crédito" },
  { pattern: /última unidade/gi, label: "Escassez não comprovada" },
];

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export function fallbackPropertyPresentation(firstName: string, properties: PresentationProperty[]) {
  const options = properties.map((property, index) => {
    const details = [
      property.price ? brl.format(property.price) : "valor sob consulta",
      property.bedrooms ? `${property.bedrooms} dorm.` : null,
      property.area ? `${property.area} m²` : null,
      [property.city, property.state].filter(Boolean).join("/") || null,
    ].filter(Boolean).join(" · ");
    return `${index + 1}. ${property.title || "Imóvel selecionado"} — ${details}`;
  }).join("\n");

  return `Olá, ${firstName}! Separei estas opções com boa aderência ao seu perfil:\n\n${options}\n\nPosso detalhar as diferenças e entender qual delas faz mais sentido para você? Valores e disponibilidade precisam ser confirmados na tabela e no estoque vigentes.`;
}

export function auditPropertyPresentation(content: string) {
  const warnings = unsafeClaims.filter(({ pattern }) => {
    pattern.lastIndex = 0;
    return pattern.test(content);
  }).map(({ label }) => label);
  return { safe: warnings.length === 0, warnings };
}
