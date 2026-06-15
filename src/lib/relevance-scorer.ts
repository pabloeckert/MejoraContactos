import type { UnifiedContact } from "@/types/contact";

// ── Cargo / Job Title scoring ──────────────────────────────────

const JOB_SCORE_40 = [
  "dueño", "propietario", "ceo", "director general", "gerente general",
  "presidente", "socio", "fundador", "titular", "socio gerente",
  "socio fundador",
];

const JOB_SCORE_30 = [
  "director", "gerente", "jefe", "coordinador", "responsable",
  "encargado", "supervisor", "líder", "lider", "head of", "vp", "vice",
];

const JOB_SCORE_15 = [
  "asesor", "consultor", "comercial", "vendedor", "representante", "agente",
];

const JOB_SCORE_5 = [
  "administrativo", "asistente", "recepcionista", "pasante",
  "becario", "estudiante", "auxiliar",
];

const EMPTY_COMPANY_VALUES = new Set([
  "independiente", "particular", "freelance", "ninguna",
  "n/a", "sin empresa", "-", "",
]);

// ── City scoring ───────────────────────────────────────────────

// Tier 1: target cities (AR/PY region)
const CITIES_TIER1 = new Set([
  "posadas", "misiones", "encarnación", "encarnacion",
  "asunción", "asuncion", "formosa", "corrientes",
  "ciudad del este", "luque", "lambaré", "lambare",
  "fernando de la mora", "san lorenzo", "resistencia",
  "caacupé", "caacupe", "caaguazú", "caaguazu",
  "villarrica", "concepción", "concepcion", "pilar",
  "san pedro", "coronel oviedo", "pedro juan caballero",
  "obera", "oberá", "eldorado", "iguazú", "iguazu",
  "san ignacio", "apóstoles", "apostoles", "leandro n. alem",
]);

// Tier 2: other AR/PY cities
const CITIES_TIER2 = new Set([
  "buenos aires", "caba", "córdoba", "cordoba", "rosario",
  "mendoza", "tucumán", "tucuman", "salta", "mar del plata",
  "santa fe", "san juan", "la plata", "bahía blanca", "bahia blanca",
  "neuquén", "neuquen", "chaco", "santiago del estero",
  "entre ríos", "entre rios", "catamarca", "la rioja", "jujuy",
  "río gallegos", "rio gallegos", "ushuaia", "viedma",
  "villa mercedes", "rafaela", "concordia", "paraná", "parana",
  "san rafael", "río cuarto", "rio cuarto", "comodoro rivadavia",
  "ciudad del este", "pedro juan", "villa hayes", "nemby",
  "mariano roque alonso", "san antonio", "areguá", "areguá",
  "capiatá", "capiata", "itaugua", "carapeguá", "carapegua",
  "paraguarí", "paraguari", "caazapá", "caazapa", "ytapé", "ytape",
]);

// Tier 3: other LatAm
const CITIES_TIER3 = new Set([
  "lima", "bogotá", "bogota", "santiago", "quito", "la paz",
  "montevideo", "caracas", "guadalajara", "monterrey", "ciudad de méxico",
  "mexico", "havana", "habana", "managua", "san josé", "san jose",
  "tegucigalpa", "panamá", "panama", "santo domingo", "caracas",
  "santa cruz", "cochabamba", "guayaquil", "medellin", "medellín",
  "cali", "barranquilla", "cartagena",
]);

// AR/PY province/department keywords for fallback
const PROVINCE_KEYWORDS = [
  "misiones", "corrientes", "chaco", "formosa", "entre ríos", "entre rios",
  "santa fe", "córdoba", "cordoba", "buenos aires", "salta", "tucumán",
  "tucuman", "jujuy", "la rioja", "san juan", "mendoza", "neuquén", "neuquen",
  "río negro", "rio negro", "chubut", "santa cruz", "tierra del fuego",
  "san luis", "la pampa", "santiago del estero", "catamarca",
  "alto paraná", "alto parana", "central", "caaguazú", "caaguazu",
  "itapúa", "itapua", "misiones py", "concepción py", "presidente hayes",
  "san pedro py", "cordillera", "guairá", "guaira", "caazapá", "caazapa",
  "paraguarí", "paraguari", "canindeyú", "canindeyú", "amambay", "ñeembucú",
  "ñeembucu", "boquerón", "boqueron",
];

function scoreCityRaw(city: string): number {
  if (!city) return 0;
  const lower = city.toLowerCase().trim();
  if (!lower) return 0;

  if (CITIES_TIER1.has(lower)) return 20;
  if (CITIES_TIER2.has(lower)) return 10;

  // Province/department fallback for AR/PY
  for (const kw of PROVINCE_KEYWORDS) {
    if (lower.includes(kw)) return 10;
  }

  if (CITIES_TIER3.has(lower)) return 5;

  // Generic: any non-empty city gets 5 as a reasonable default
  if (lower.length >= 3) return 5;

  return 0;
}

// ── Origin scoring ─────────────────────────────────────────────

const ORIGIN_SCORE_10 = [
  "after office", "after-office", "afteroffice",
  "evento", "event", "referido", "referral",
  "contacto directo", "networking", "reunión", "reunion",
  "visita",
];

function scoreOriginRaw(origin: string): number {
  if (!origin) return 0;
  const lower = origin.toLowerCase();
  for (const kw of ORIGIN_SCORE_10) {
    if (lower.includes(kw)) return 10;
  }
  return 5;
}

// ── Public API ─────────────────────────────────────────────────

export function scoreJobTitle(jobTitle: string): { score: number; needsAIScoring: boolean } {
  if (!jobTitle || !jobTitle.trim()) return { score: 0, needsAIScoring: false };

  const lower = jobTitle.toLowerCase();

  for (const kw of JOB_SCORE_40) {
    if (lower.includes(kw)) return { score: 40, needsAIScoring: false };
  }
  for (const kw of JOB_SCORE_30) {
    if (lower.includes(kw)) return { score: 30, needsAIScoring: false };
  }
  for (const kw of JOB_SCORE_15) {
    if (lower.includes(kw)) return { score: 15, needsAIScoring: false };
  }
  for (const kw of JOB_SCORE_5) {
    if (lower.includes(kw)) return { score: 5, needsAIScoring: false };
  }

  // Unrecognized cargo — 20 base, flag for AI review
  return { score: 20, needsAIScoring: true };
}

export function scoreRelevance(contact: UnifiedContact): number {
  const { score: cargoScore } = scoreJobTitle(contact.jobTitle || "");

  const company = (contact.company || "").trim().toLowerCase();
  const companyScore = company && !EMPTY_COMPANY_VALUES.has(company) && company.length > 2 ? 30 : 0;

  const cityScore = scoreCityRaw(contact.city || "");

  const originScore = contact.origin ? scoreOriginRaw(contact.origin) : 0;

  const jobIsEmpty = !contact.jobTitle || !contact.jobTitle.trim();
  const penalty = jobIsEmpty ? -10 : 0;

  const raw = cargoScore + companyScore + cityScore + originScore + penalty;
  return Math.max(0, Math.min(100, raw));
}

export function getSegment(score: number): "A" | "B" | "C" {
  if (score >= 70) return "A";
  if (score >= 40) return "B";
  return "C";
}

export function needsAIScoring(contact: UnifiedContact): boolean {
  return scoreJobTitle(contact.jobTitle || "").needsAIScoring;
}
