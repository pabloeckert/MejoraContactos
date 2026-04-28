import { useParams, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Calendar, Clock, Users, Share2 } from "lucide-react";
import { BLOG_POSTS } from "./Blog";

const ARTICLES: Record<string, { content: string }> = {
  "como-limpiar-contactos-google": {
    content: `
## ¿Por qué tus contactos de Google están sucios?

Si usás Google Contacts hace tiempo, probablemente tenés:
- **Contactos duplicados** (la misma persona con 2 o 3 entradas)
- **Nombres inconsistentes** ("juan", "JUAN PÉREZ", "Juan P.")
- **Teléfonos en formatos mezclados** (011-15-1234, +549111234567, 15-1234-5678)
- **Emails con typos** ("gmial.com", "hotmal.com")

Esto pasa porque Google Contacts no valida ni normaliza los datos cuando los importás.

## Paso 1: Exportar tus contactos de Google

1. Abrí [contacts.google.com](https://contacts.google.com)
2. En el menú lateral, hacé clic en **Exportar**
3. Elegí **Contactos** → **CSV de Google** o **vCard (VCF)**
4. Descargá el archivo

> **Tip:** Si tenés múltiples cuentas de Google, exportá de cada una por separado.

## Paso 2: Limpiar con MejoraContactos

1. Abrí [MejoraContactos](https://util.mejoraok.com/mejoracontactos/)
2. Arrastrá tu archivo CSV o VCF a la zona de importación
3. La app detectará automáticamente las columnas (nombre, email, teléfono)
4. Hacé clic en **Procesar**

### ¿Qué hace el pipeline?

El procesamiento tiene 7 etapas:

1. **Mapeo automático** — Detecta qué columna es qué campo
2. **Limpieza por reglas (80%)** — Corrige formatos, capitaliza nombres, valida emails
3. **Limpieza con IA (20%)** — Solo los casos que las reglas no resolvieron
4. **Verificación IA** — Una segunda IA revisa los cambios
5. **Corrección IA** — Arregla los issues detectados
6. **Validación** — Score de 0-100 por campo
7. **Deduplicación** — Por email exacto, teléfono, o similitud de nombre (Jaro-Winkler)

### Configuración recomendada

- **Proveedor IA:** Groq (gratis, rápido, 9ms latencia)
- **País:** Argentina (o el que corresponda)
- **Modo:** Simple (para la mayoría de los casos)

## Paso 3: Revisar los resultados

Después del procesamiento, MejoraContactos te muestra:
- **Contactos únicos** — Los que quedaron limpios
- **Duplicados** — Los que se detectaron como repetidos
- **Score de calidad** — 0-100 por cada contacto
- **Cambios realizados** — Qué modificó la IA y qué corrigieron las reglas

Podés editar cualquier contacto manualmente antes de exportar.

## Paso 4: Exportar e importar de vuelta a Google

1. En la pestaña **Exportar**, elegí **CSV** (formato compatible con Google Contacts)
2. Descargá el archivo
3. En Google Contacts, andá a **Importar** → subí el CSV limpio
4. Google te preguntará si querés fusionar con existentes — decí que sí

> **Pro tip:** Antes de importar, eliminá todos los contactos actuales de Google (hacé backup primero). Así evitás duplicados con los que ya tenías.

## Mantener tus contactos limpios

- Hacé esta limpieza cada 3-6 meses
- Usá el **historial de snapshots** de MejoraContactos para comparar cambios
- Exportá en múltiples formatos (CSV para Google, VCF para iPhone, JSON para backup)
    `,
  },

  "normalizar-telefonos-argentina-whatsapp": {
    content: `
## El problema de los teléfonos argentinos

Argentina tiene uno de los formatos telefónicos más caóticos de Latinoamérica. En una misma base de datos podés encontrar:

\`\`\`
011-15-1234-5678    (formato local Buenos Aires)
+54 9 11 1234-5678  (formato internacional con 9)
5491112345678       (sin separadores)
15-1234-5678        (celular sin código de área)
(011) 15 1234 5678  (formato alternativo)
\`\`\`

Para WhatsApp Business, importar a un CRM, o hacer campañas de SMS, necesitás que TODOS los teléfonos estén en **formato E.164**.

## ¿Qué es E.164?

E.164 es el estándar internacional de la ITU para números telefónicos. Se ve así:

\`\`\`
+5491112345678
\`\`\`

Reglas:
- Siempre empieza con **+** y el código de país
- Sin espacios, guiones ni paréntesis
- Código de país: **54** (Argentina)
- Código de área: **11** (Buenos Aires), **351** (Córdoba), etc.
- Para celulares: se agrega el **9** después del código de país

## Cómo MejoraContactos normaliza teléfonos

MejoraContactos usa \`libphonenumber-js\` (la misma librería de Google) con configuración para 21 países.

### Proceso automático:

1. **Detección de formato** — Identifica si es argentino, brasileño, etc.
2. **Remoción de caracteres** — Quita guiones, paréntesis, espacios
3. **Adición de código de país** — Si falta el +54, lo agrega
4. **Validación E.164** — Verifica que el número sea válido
5. **Detección WhatsApp** — Marca si es celular (válido para WhatsApp)

### Ejemplos de transformación:

| Input | Output E.164 | WhatsApp |
|-------|-------------|----------|
| 011-15-1234-5678 | +5491112345678 | ✅ |
| 15-1234-5678 | +5491112345678 | ✅ |
| +54 11 1234-5678 | +5491112345678 | ✅ |
| (0351) 15-123-4567 | +5493511234567 | ✅ |
| 0800-123-4567 | +548001234567 | ❌ (fijo) |

## Paso a paso para tu base de datos

### 1. Preparar el archivo

Tu archivo CSV debe tener al menos una columna con teléfonos. Ejemplo:

\`\`\`csv
nombre,telefono,email
Juan Pérez,011-15-1234-5678,juan@gmail.com
María García,+54 351 15 123 4567,maria@hotmail.com
\`\`\`

### 2. Importar a MejoraContactos

1. Abrí la app
2. Subí el CSV
3. Mapeá la columna de teléfono a "Teléfono/WhatsApp"
4. Seleccioná **Argentina** como país por defecto

### 3. Procesar

El pipeline hará:
- Limpieza por reglas (formato → E.164)
- Validación telefónica (¿es un número real?)
- Deduplicación (si dos contactos tienen el mismo teléfono, los marca)

### 4. Exportar

Exportá en CSV con la columna \`whatsapp\` ya en formato E.164. Listo para importar a WhatsApp Business.

## Casos especiales

- **Teléfonos fijos:** Se detectan automáticamente (no tienen el 9 después del código de país). No son válidos para WhatsApp.
- **Múltiples teléfonos:** Si un contacto tiene 2 teléfonos, MejoraContactos los separa y crea una entrada por cada uno.
- **Teléfonos internacionales:** La app detecta automáticamente el país si el número tiene código internacional.
    `,
  },

  "mejores-apis-gratis-limpieza-contactos-ia": {
    content: `
## ¿Por qué usar IA para limpiar contactos?

Las reglas determinísticas (regex, validadores) resuelven el 80% de los casos. Pero hay situaciones que necesitan inteligencia artificial:

- **Nombres compuestos inconsistentes** ("María del Carmen" vs "M. del C. García")
- **Empresas con abreviaturas** ("SRL", "S.A.", "Sociedad de Responsabilidad Limitada")
- **Cargos en diferentes idiomas** ("CEO", "Director General", "Chief Executive")
- **Emails con typos inteligentes** ("@gmail.co" → "@gmail.com")

## Los 12 proveedores comparados

### Tier 1: Ultra-rápido (latencia < 50ms)

#### 1. Groq — llama-3.3-70b-versatile
- **Latencia:** ~9ms
- **Tier gratis:** 14,400 tokens/día (suficiente para ~500 contactos)
- **Velocidad:** 750+ tokens/segundo
- **Ideal para:** Limpieza rápida en tiempo real
- **Veredicto:** ⭐⭐⭐⭐⭐ — El más rápido con diferencia

#### 2. Cerebras — llama3.1-8b
- **Latencia:** ~4ms
- **Tier gratis:** Generoso (varios miles de requests)
- **Velocidad:** 1,800+ tokens/segundo
- **Ideal para:** Backup rápido cuando Groq se agota
- **Veredicto:** ⭐⭐⭐⭐ — Rápido pero modelo más chico

### Tier 2: Calidad-precio equilibrado

#### 3. Google Gemini — gemini-2.0-flash
- **Latencia:** ~200ms
- **Tier gratis:** 15 requests/minuto, 1M tokens/día
- **Ventaja:** Entiende contexto multiidioma muy bien
- **Ideal para:** Contactos en español con nombres complejos
- **Veredicto:** ⭐⭐⭐⭐⭐ — Mejor para español

#### 4. DeepSeek — deepseek-chat
- **Latencia:** ~300ms
- **Tier gratis:** Requiere saldo (pero es muy barato: $0.14/M input)
- **Ventaja:** Excelente razonamiento
- **Ideal para:** Casos complejos que otros no resuelven
- **Veredicto:** ⭐⭐⭐⭐ — Necesita saldo pero vale la pena

### Tier 3: Backup y redundancia

#### 5-12. OpenRouter, Together, DeepInfra, SambaNova, Mistral, Cloudflare, HuggingFace, Nebius

Todos ofrecen acceso a modelos Llama 3.3 70B con tiers gratuitos variables. La estrategia óptima:

1. **Groq** como primario (velocidad)
2. **Gemini** como secundario (calidad en español)
3. **Cerebras** como terciario (backup rápido)
4. **Resto** como fallback cuando los 3 principales se agotan

## Configuración recomendada en MejoraContactos

### Pipeline de 3 etapas (default):

| Etapa | Proveedor | Modelo | Para qué |
|-------|----------|--------|----------|
| Limpieza | Groq | llama-3.3-70b | Limpiar la mayoría |
| Verificación | OpenRouter | llama-3.3-70b (free) | Revisar cambios |
| Corrección | Gemini | gemini-2.0-flash | Fixear issues |

### Rotación automática

MejoraContactos implementa rotación automática:
- Si un proveedor devuelve **429** (rate limit) → siguiente proveedor
- Si devuelve **401** (key inválida) → siguiente proveedor
- Si devuelve **402** (sin saldo) → siguiente proveedor
- **Backoff exponencial** en errores transitorios (1s, 2s, 4s)

### Multi-key

Podés agregar múltiples API keys por proveedor. Si Groq tiene 2 keys, rota automáticamente entre ellas.

## Costos reales

| Proveedor | Costo real (tier gratis) | Para 1,000 contactos |
|-----------|------------------------|---------------------|
| Groq | $0 | ~30 lotes gratis |
| Cerebras | $0 | Ilimitado (con límites) |
| Gemini | $0 | ~60 lotes gratis |
| DeepSeek | ~$0.02 | Muy barato |
| Resto | $0 | Variable |

**Conclusión:** Para la mayoría de los usuarios, con Groq + Gemini alcanza para limpiar contactos de forma gratuita.

## Cómo configurar las API keys

1. Andá a la pestaña **Config** en MejoraContactos
2. Hacé clic en **Agregar proveedor**
3. Elegí el proveedor y pegá tu API key
4. Las keys se cifran con **AES-GCM-256** en tu browser (nunca se envían a nuestro servidor)
5. Hacé **Health Check** para verificar que funcionan

### Dónde obtener keys gratis:

- **Groq:** [console.groq.com](https://console.groq.com) → Crear cuenta → API Keys
- **Gemini:** [aistudio.google.com](https://aistudio.google.com) → Get API Key
- **Cerebras:** [cloud.cerebras.ai](https://cloud.cerebras.ai) → API Keys
- **DeepSeek:** [platform.deepseek.com](https://platform.deepseek.com) → API Keys
    `,
  },
};

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const post = BLOG_POSTS.find((p) => p.slug === slug);
  const article = slug ? ARTICLES[slug] : undefined;

  // SEO: set title and meta description
  useEffect(() => {
    if (post) {
      document.title = `${post.title} — MejoraContactos`;
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) metaDesc.setAttribute("content", post.excerpt);

      // Schema.org Article structured data
      const scriptId = "blogpost-schema";
      document.getElementById(scriptId)?.remove();
      const script = document.createElement("script");
      script.id = scriptId;
      script.type = "application/ld+json";
      script.textContent = JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Article",
        "headline": post.title,
        "description": post.excerpt,
        "datePublished": post.date,
        "author": { "@type": "Organization", "name": "MejoraOK" },
        "publisher": { "@type": "Organization", "name": "MejoraOK" },
        "mainEntityOfPage": `https://util.mejoraok.com/mejoracontactos/blog/${post.slug}`,
        "keywords": post.keywords.join(", "),
      });
      document.head.appendChild(script);

      return () => {
        document.getElementById(scriptId)?.remove();
        document.title = "MejoraContactos — Limpieza de contactos con IA";
        const meta = document.querySelector('meta[name="description"]');
        if (meta) meta.setAttribute("content", "Limpia, deduplica y unifica contactos desde CSV, Excel, VCF, JSON y Google Contacts usando múltiples motores de IA con rotación automática.");
      };
    }
  }, [post]);

  if (!post || !article) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4">404</h1>
          <p className="text-muted-foreground mb-6">Artículo no encontrado</p>
          <Button variant="outline" onClick={() => navigate("/blog")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver al blog
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container px-4 py-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/blog")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver al blog
          </Button>
        </div>
      </header>

      {/* Article */}
      <article className="container px-4 py-12 max-w-3xl mx-auto">
        <Badge variant="secondary" className="mb-4">{post.category}</Badge>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">{post.title}</h1>
        <div className="flex items-center gap-4 text-sm text-muted-foreground mb-8 pb-8 border-b">
          <span className="flex items-center gap-1">
            <Calendar className="h-4 w-4" />
            {new Date(post.date).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" })}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            {post.readTime} de lectura
          </span>
          <span className="flex items-center gap-1">
            <Users className="h-4 w-4" />
            MejoraContactos
          </span>
        </div>

        <div className="prose prose-gray dark:prose-invert max-w-none">
          {article.content.split("\n").map((line, i) => {
            // Simple markdown rendering
            if (line.startsWith("## ")) {
              return <h2 key={i} className="text-2xl font-bold mt-10 mb-4">{line.replace("## ", "")}</h2>;
            }
            if (line.startsWith("### ")) {
              return <h3 key={i} className="text-xl font-semibold mt-8 mb-3">{line.replace("### ", "")}</h3>;
            }
            if (line.startsWith("#### ")) {
              return <h4 key={i} className="text-lg font-semibold mt-6 mb-2">{line.replace("#### ", "")}</h4>;
            }
            if (line.startsWith("> ")) {
              return <blockquote key={i} className="border-l-4 border-violet-500 pl-4 italic text-muted-foreground my-4">{line.replace("> ", "")}</blockquote>;
            }
            if (line.startsWith("- ")) {
              return <li key={i} className="ml-4 mb-1">{line.replace("- ", "")}</li>;
            }
            if (line.startsWith("| ")) {
              // Simple table row
              const cells = line.split("|").filter(Boolean).map((c) => c.trim());
              if (cells.every((c) => /^[-]+$/.test(c))) return null; // separator row
              return (
                <div key={i} className="grid grid-cols-3 gap-2 py-1.5 border-b text-sm">
                  {cells.map((cell, j) => <span key={j}>{cell}</span>)}
                </div>
              );
            }
            if (line.startsWith("```")) return null; // code block delimiter
            if (line.trim() === "") return <br key={i} />;
            return <p key={i} className="mb-3 leading-relaxed">{line}</p>;
          })}
        </div>

        {/* Share */}
        <div className="mt-12 pt-8 border-t flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground mb-1">¿Te sirvió este artículo?</p>
            <p className="text-xs text-muted-foreground">Compartilo con quien pueda necesitarlo</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (navigator.share) {
                navigator.share({ title: post.title, url: window.location.href });
              } else {
                navigator.clipboard.writeText(window.location.href);
              }
            }}
          >
            <Share2 className="h-4 w-4 mr-2" />
            Compartir
          </Button>
        </div>
      </article>

      {/* CTA */}
      <section className="bg-muted/30 border-t">
        <div className="container px-4 py-12 text-center">
          <p className="text-muted-foreground mb-4">¿Querés probar lo que leíste?</p>
          <Button className="bg-violet-500 hover:bg-violet-600" asChild>
            <a href={`${import.meta.env.BASE_URL}`}>
              Probar MejoraContactos gratis
            </a>
          </Button>
        </div>
      </section>
    </div>
  );
}
