import { useState } from "react";
import {
  Sparkles, Shield, Zap, Download, Users, Globe, ArrowRight,
  CheckCircle, Star, Mail, FileSpreadsheet, FileText, File,
  Bot, RefreshCw, BarChart3, Lock, Heart
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

const FEATURES = [
  {
    icon: <Sparkles className="h-5 w-5" />,
    title: "Limpieza con IA",
    description: "12 proveedores de IA con rotación automática. Normaliza nombres, teléfonos y emails inteligentemente.",
    color: "text-violet-500",
    bg: "bg-violet-500/10",
  },
  {
    icon: <RefreshCw className="h-5 w-5" />,
    title: "Deduplicación inteligente",
    description: "Detecta duplicados por email, teléfono O similitud de nombre con algoritmo Jaro-Winkler.",
    color: "text-blue-500",
    bg: "bg-blue-500/10",
  },
  {
    icon: <FileSpreadsheet className="h-5 w-5" />,
    title: "Multi-formato",
    description: "Importá CSV, Excel, VCF, JSON y Google Contacts. Exportá en 6 formatos incluyendo JSONL para fine-tuning.",
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
  },
  {
    icon: <Shield className="h-5 w-5" />,
    title: "Privacy-first",
    description: "Tus datos se procesan en tu navegador. No los enviamos a nuestros servidores. Nunca.",
    color: "text-amber-500",
    bg: "bg-amber-500/10",
  },
  {
    icon: <Zap className="h-5 w-5" />,
    title: "Ultra rápido",
    description: "Pipeline híbrido: reglas determinísticas (80%+ casos) + IA solo cuando hace falta. Web Workers para datasets grandes.",
    color: "text-orange-500",
    bg: "bg-orange-500/10",
  },
  {
    icon: <Globe className="h-5 w-5" />,
    title: "Multi-país",
    description: "21 países con códigos telefónicos. Formato E.164, detección WhatsApp, validación por región.",
    color: "text-cyan-500",
    bg: "bg-cyan-500/10",
  },
];

const PROVIDERS = [
  "Groq", "OpenRouter", "Together AI", "Cerebras", "DeepInfra",
  "SambaNova", "Mistral", "DeepSeek", "Gemini", "Cloudflare", "Hugging Face", "Nbius"
];

const FORMATS = [
  { name: "CSV", icon: <FileText className="h-4 w-4" /> },
  { name: "Excel", icon: <FileSpreadsheet className="h-4 w-4" /> },
  { name: "VCF", icon: <File className="h-4 w-4" /> },
  { name: "JSON", icon: <FileText className="h-4 w-4" /> },
  { name: "Google", icon: <Users className="h-4 w-4" /> },
];

const STATS = [
  { value: "12", label: "Proveedores de IA" },
  { value: "6", label: "Formatos de exportación" },
  { value: "21", label: "Países soportados" },
  { value: "188", label: "Tests automatizados" },
];

export default function Landing() {
  const [email, setEmail] = useState("");

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <section className="relative overflow-hidden border-b">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-violet-500/5" />
        <div className="container relative px-4 py-16 md:py-24 text-center">
          <Badge className="mb-4 bg-violet-500/10 text-violet-600 dark:text-violet-400 border-0">
            <Sparkles className="h-3 w-3 mr-1" />
            Powered by 12 AI Providers
          </Badge>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight mb-4">
            Limpia tus contactos{" "}
            <span className="text-violet-500">con inteligencia artificial</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
            Deduplica, normaliza y unifica tu agenda desde CSV, Excel, VCF, JSON o Google Contacts.
            Gratis. Privado. Ultra rápido.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button size="lg" className="text-base" asChild>
              <a href={`${import.meta.env.BASE_URL}`}>
                <Zap className="h-5 w-5 mr-2" />
                Empezar gratis
                <ArrowRight className="h-5 w-5 ml-2" />
              </a>
            </Button>
            <Button size="lg" variant="outline" className="text-base" asChild>
              <a href="#features">
                Ver características
              </a>
            </Button>
          </div>

          {/* Trust badges */}
          <div className="flex flex-wrap justify-center gap-6 mt-10 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Lock className="h-4 w-4 text-emerald-500" />
              Privacy-first
            </span>
            <span className="flex items-center gap-1.5">
              <Heart className="h-4 w-4 text-red-500" />
              100% gratis
            </span>
            <span className="flex items-center gap-1.5">
              <Shield className="h-4 w-4 text-blue-500" />
              Open source
            </span>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-b bg-muted/30">
        <div className="container px-4 py-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            {STATS.map((stat) => (
              <div key={stat.label}>
                <div className="text-3xl font-bold text-violet-500">{stat.value}</div>
                <div className="text-sm text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="container px-4 py-16 md:py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-3">Todo lo que necesitás para limpiar tu agenda</h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Un pipeline completo: importar → limpiar con IA → deduplicar → validar → exportar.
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((feature) => (
            <Card key={feature.title} className="border-0 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className={`inline-flex items-center justify-center h-10 w-10 rounded-lg ${feature.bg} ${feature.color} mb-4`}>
                  {feature.icon}
                </div>
                <h3 className="font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-muted/30 border-y">
        <div className="container px-4 py-16 md:py-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-3">¿Cómo funciona?</h2>
            <p className="text-muted-foreground">3 pasos simples. Minutos, no horas.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-3xl mx-auto">
            {[
              { step: "1", icon: <Download className="h-6 w-6" />, title: "Importá", desc: "Subí tus archivos CSV, Excel, VCF o JSON. O conectá Google Contacts." },
              { step: "2", icon: <Bot className="h-6 w-6" />, title: "Limpiá con IA", desc: "La IA normaliza nombres, teléfonos y emails. Deduplica automáticamente." },
              { step: "3", icon: <BarChart3 className="h-6 w-6" />, title: "Exportá limpio", desc: "Descargá en CSV, Excel, VCF, JSON o JSONL. Listos para importar." },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-violet-500/10 text-violet-500 mb-4">
                  {item.icon}
                </div>
                <div className="text-xs font-bold text-violet-500 mb-2">PASO {item.step}</div>
                <h3 className="font-semibold mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Supported formats */}
      <section className="container px-4 py-16 md:py-20">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold mb-3">Formatos soportados</h2>
          <p className="text-muted-foreground">Importá desde cualquier fuente. Exportá a cualquier destino.</p>
        </div>
        <div className="flex flex-wrap justify-center gap-4">
          {FORMATS.map((fmt) => (
            <div key={fmt.name} className="flex items-center gap-2 px-4 py-2 rounded-full bg-muted text-sm font-medium">
              {fmt.icon}
              {fmt.name}
            </div>
          ))}
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400 text-sm font-medium">
            <Star className="h-4 w-4" />
            + JSONL (fine-tuning) + HTML (informes)
          </div>
        </div>
      </section>

      {/* AI Providers */}
      <section className="bg-muted/30 border-y">
        <div className="container px-4 py-16 md:py-20 text-center">
          <h2 className="text-3xl font-bold mb-3">12 proveedores de IA</h2>
          <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
            Rotación automática de keys. Si un proveedor se agota, el siguiente toma el relevo. Sin interrupciones.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {PROVIDERS.map((p) => (
              <Badge key={p} variant="secondary" className="text-sm px-3 py-1">{p}</Badge>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="container px-4 py-16 md:py-20 text-center">
        <h2 className="text-3xl font-bold mb-4">¿Listo para limpiar tu agenda?</h2>
        <p className="text-muted-foreground mb-8 max-w-md mx-auto">
          Gratis, sin registro, sin límites artificiales. Tus datos se procesan en tu navegador.
        </p>
        <Button size="lg" className="text-base" asChild>
          <a href={`${import.meta.env.BASE_URL}`}>
            <Sparkles className="h-5 w-5 mr-2" />
            Empezar ahora
          </a>
        </Button>

        {/* Newsletter (future) */}
        <div className="mt-12 max-w-sm mx-auto">
          <p className="text-sm text-muted-foreground mb-3">¿Querés recibir novedades?</p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="email"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm rounded-md border bg-background"
                aria-label="Email para novedades"
              />
            </div>
            <Button size="sm" disabled={!email.includes("@")}>
              Suscribirse
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t bg-muted/30">
        <div className="container px-4 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span className="font-semibold">MejoraContactos</span>
              <span>© 2026</span>
            </div>
            <div className="flex gap-4">
              <a href={`${import.meta.env.BASE_URL}pricing`} className="hover:text-foreground">Precios</a>
              <a href={`${import.meta.env.BASE_URL}privacy`} className="hover:text-foreground">Privacidad</a>
              <a href={`${import.meta.env.BASE_URL}terms`} className="hover:text-foreground">Términos</a>
              <a href={`${import.meta.env.BASE_URL}blog`} className="hover:text-foreground">Blog</a>
              <a href="https://github.com/pabloeckert/MejoraContactos" className="hover:text-foreground" target="_blank" rel="noopener noreferrer">GitHub</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
