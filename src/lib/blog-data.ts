export interface BlogPostMeta {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  tags: string[];
  category: string;
  readTime: string;
  keywords: string[];
}

// El slug de cada post tiene que coincidir con una clave real de ARTICLES en BlogPost.tsx
export const BLOG_POSTS: BlogPostMeta[] = [
  {
    slug: "como-limpiar-contactos-google",
    title: "Cómo limpiar tus contactos con IA en 5 minutos",
    excerpt: "Guía paso a paso para limpiar, deduplicar y normalizar tu agenda usando inteligencia artificial.",
    date: "2026-04-15",
    tags: ["Guía", "IA"],
    category: "Guía",
    readTime: "5 min",
    keywords: ["limpiar contactos", "IA", "deduplicación", "Google Contacts"],
  },
  {
    slug: "normalizar-telefonos-argentina-whatsapp",
    title: "¿Por qué deberías usar formato E.164 para teléfonos?",
    excerpt: "El estándar E.164 elimina la ambigüedad en números internacionales. Te explicamos cómo funciona.",
    date: "2026-04-10",
    tags: ["Técnico", "Telefonía"],
    category: "Técnico",
    readTime: "4 min",
    keywords: ["E.164", "formato de teléfono", "normalización telefónica", "WhatsApp"],
  },
  {
    slug: "mejores-apis-gratis-limpieza-contactos-ia",
    title: "Las mejores APIs gratis de IA para limpiar contactos (12 comparadas)",
    excerpt: "Comparamos latencia, límites gratis y casos de uso de los 12 proveedores de IA que soporta MejoraContactos.",
    date: "2026-04-05",
    tags: ["Técnico", "IA"],
    category: "Técnico",
    readTime: "6 min",
    keywords: ["proveedores de IA", "Groq", "APIs gratis", "limpieza de contactos"],
  },
];

