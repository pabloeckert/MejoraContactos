import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Calendar, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";

const POSTS = [
  {
    slug: "como-limpiar-contactos-ia",
    title: "Cómo limpiar tus contactos con IA en 5 minutos",
    excerpt: "Guía paso a paso para limpiar, deduplicar y normalizar tu agenda usando inteligencia artificial.",
    date: "2026-04-15",
    tags: ["Guía", "IA"],
  },
  {
    slug: "formato-e164-telefonos",
    title: "¿Por qué deberías usar formato E.164 para teléfonos?",
    excerpt: "El estándar E.164 elimina la ambigüedad en números internacionales. Te explicamos cómo funciona.",
    date: "2026-04-10",
    tags: ["Técnico", "Telefonía"],
  },
  {
    slug: "deduplicacion-jaro-winkler",
    title: "Deduplicación inteligente: más allá del email exacto",
    excerpt: "Cómo el algoritmo Jaro-Winkler detecta contactos duplicados aunque los nombres estén escritos diferente.",
    date: "2026-04-05",
    tags: ["Técnico", "Algoritmos"],
  },
];

export default function Blog() {
  useEffect(() => {
    document.title = "Blog — Guías para limpiar contactos | MejoraContactos";
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute("content", "Guías y tutoriales para limpiar, deduplicar y normalizar tus contactos. Tips sobre IA, Google Contacts, WhatsApp y más.");
  }, []);

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">Blog</h1>
        <p className="text-muted-foreground mb-8">Tips, guías y novedades sobre limpieza de contactos.</p>
        <div className="space-y-6">
          {POSTS.map((post) => (
            <Card key={post.slug} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                  <Calendar className="h-3.5 w-3.5" />
                  {new Date(post.date).toLocaleDateString("es-AR", { year: "numeric", month: "long", day: "numeric" })}
                </div>
                <CardTitle className="text-lg">
                  <Link to={`/blog/${post.slug}`} className="hover:text-primary transition-colors">
                    {post.title}
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm mb-3">{post.excerpt}</p>
                <div className="flex items-center gap-2">
                  {post.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                  ))}
                  <Link to={`/blog/${post.slug}`} className="ml-auto text-sm text-primary flex items-center gap-1 hover:underline">
                    Leer más <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
