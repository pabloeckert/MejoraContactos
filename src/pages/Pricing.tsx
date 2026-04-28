import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, Sparkles, Zap, Users, ArrowRight, Shield, Globe, Heart } from "lucide-react";

const FEATURES_COMPARISON = [
  { feature: "Contactos por lote", free: "500", pro: "10,000", icon: <Users className="h-4 w-4" /> },
  { feature: "Lotes por día", free: "3", pro: "Ilimitados", icon: <Zap className="h-4 w-4" /> },
  { feature: "Proveedores IA", free: "12 (con tu key)", pro: "12 (con tu key)", icon: <Sparkles className="h-4 w-4" /> },
  { feature: "Formatos exportación", free: "6 formatos", pro: "6 formatos", icon: <Globe className="h-4 w-4" /> },
  { feature: "Deduplicación", free: "Completa", pro: "Completa", icon: <Shield className="h-4 w-4" /> },
  { feature: "Google Contacts", free: "1 cuenta", pro: "5 cuentas", icon: <Users className="h-4 w-4" /> },
  { feature: "Historial / Undo", free: "30 días", pro: "90 días", icon: <Zap className="h-4 w-4" /> },
  { feature: "Soporte", free: "Comunidad", pro: "Email prioritario", icon: <Heart className="h-4 w-4" /> },
];

export default function Pricing() {
  useEffect(() => {
    document.title = "Precios — MejoraContactos";
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute("content", "Plan gratuito con 500 contactos/lote y 3 lotes/día. Plan Pro con 10,000 contactos/lote e lotes ilimitados. Usá tu propia API key de IA.");

    // Schema.org Product structured data
    const scriptId = "pricing-schema";
    document.getElementById(scriptId)?.remove();
    const script = document.createElement("script");
    script.id = scriptId;
    script.type = "application/ld+json";
    script.textContent = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "name": "MejoraContactos",
      "description": "Limpieza de contactos con IA — Plan gratuito y Pro",
      "url": "https://util.mejoraok.com/mejoracontactos/pricing",
      "applicationCategory": "BusinessApplication",
      "offers": [
        {
          "@type": "Offer",
          "name": "Free",
          "price": "0",
          "priceCurrency": "USD",
          "description": "500 contactos/lote, 3 lotes/día"
        },
        {
          "@type": "Offer",
          "name": "Pro",
          "price": "9",
          "priceCurrency": "USD",
          "priceSpecification": { "@type": "UnitPriceSpecification", "billingDuration": "P1M" },
          "description": "10,000 contactos/lote, lotes ilimitados"
        }
      ],
    });
    document.head.appendChild(script);

    return () => {
      document.getElementById(scriptId)?.remove();
      document.title = "MejoraContactos — Limpieza de contactos con IA";
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <section className="relative overflow-hidden border-b">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 via-transparent to-emerald-500/5" />
        <div className="container relative px-4 py-16 md:py-20 text-center">
          <Badge className="mb-4 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-0">
            <Heart className="h-3 w-3 mr-1" />
            100% transparente
          </Badge>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            Precios simples,{" "}
            <span className="text-violet-500">sin sorpresas</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto mb-8">
            Usás tu propia API key de IA. No cobramos por procesamiento. Solo hay límites de uso razonables en el plan gratuito.
          </p>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="container px-4 py-16 md:py-20">
        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* Free */}
          <Card className="relative border-2 hover:border-violet-500/30 transition-colors">
            <CardContent className="p-8">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                  <Zap className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">Free</h3>
                  <p className="text-sm text-muted-foreground">Para uso personal</p>
                </div>
              </div>
              <div className="mb-6">
                <span className="text-4xl font-bold">$0</span>
                <span className="text-muted-foreground"> / siempre</span>
              </div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                  <span>Hasta 500 contactos por lote</span>
                </li>
                <li className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                  <span>3 lotes por día</span>
                </li>
                <li className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                  <span>12 proveedores IA (con tu key)</span>
                </li>
                <li className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                  <span>6 formatos de exportación</span>
                </li>
                <li className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                  <span>Deduplicación completa</span>
                </li>
                <li className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                  <span>1 cuenta de Google Contacts</span>
                </li>
                <li className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                  <span>Historial 30 días</span>
                </li>
              </ul>
              <Button className="w-full" variant="outline" asChild>
                <a href={`${import.meta.env.BASE_URL}`}>
                  Empezar gratis
                  <ArrowRight className="h-4 w-4 ml-2" />
                </a>
              </Button>
            </CardContent>
          </Card>

          {/* Pro */}
          <Card className="relative border-2 border-violet-500 shadow-lg shadow-violet-500/10">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <Badge className="bg-violet-500 text-white border-0 px-4 py-1">
                <Sparkles className="h-3 w-3 mr-1" />
                Recomendado
              </Badge>
            </div>
            <CardContent className="p-8">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-10 w-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
                  <Sparkles className="h-5 w-5 text-violet-500" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">Pro</h3>
                  <p className="text-sm text-muted-foreground">Para equipos y empresas</p>
                </div>
              </div>
              <div className="mb-6">
                <span className="text-4xl font-bold">$9</span>
                <span className="text-muted-foreground"> / mes</span>
              </div>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                  <span className="font-medium">Hasta 10,000 contactos por lote</span>
                </li>
                <li className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                  <span className="font-medium">Lotes ilimitados por día</span>
                </li>
                <li className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                  <span>12 proveedores IA (con tu key)</span>
                </li>
                <li className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                  <span>6 formatos de exportación</span>
                </li>
                <li className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                  <span>Deduplicación completa</span>
                </li>
                <li className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                  <span className="font-medium">5 cuentas de Google Contacts</span>
                </li>
                <li className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                  <span className="font-medium">Historial 90 días</span>
                </li>
                <li className="flex items-center gap-2 text-sm">
                  <CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                  <span className="font-medium">Soporte prioritario por email</span>
                </li>
              </ul>
              <Button className="w-full bg-violet-500 hover:bg-violet-600" asChild>
                <a href="mailto:contacto@mejoraok.com?subject=MejoraContactos%20Pro">
                  <Sparkles className="h-4 w-4 mr-2" />
                  Contactar para Pro
                </a>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Feature Comparison Table */}
      <section className="bg-muted/30 border-y">
        <div className="container px-4 py-16 md:py-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-3">Comparación detallada</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Todo lo que necesitás para limpiar tus contactos, en cualquier plan.
            </p>
          </div>
          <div className="max-w-2xl mx-auto">
            <div className="grid grid-cols-3 gap-4 mb-4 px-4 text-sm font-semibold">
              <div>Característica</div>
              <div className="text-center">Free</div>
              <div className="text-center">Pro</div>
            </div>
            <div className="space-y-2">
              {FEATURES_COMPARISON.map((item) => (
                <div key={item.feature} className="grid grid-cols-3 gap-4 items-center px-4 py-3 rounded-lg bg-background">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">{item.icon}</span>
                    {item.feature}
                  </div>
                  <div className="text-center text-sm text-muted-foreground">{item.free}</div>
                  <div className="text-center text-sm font-medium text-violet-600 dark:text-violet-400">{item.pro}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="container px-4 py-16 md:py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-3">Preguntas frecuentes sobre precios</h2>
        </div>
        <div className="max-w-2xl mx-auto space-y-6">
          {[
            {
              q: "¿Por qué necesito mi propia API key?",
              a: "MejoraContactos es privacy-first. Tus datos se procesan con tu propia clave de IA, lo que significa que nunca vemos tus contactos. Además, muchos proveedores ofrecen tiers gratuitos generosos.",
            },
            {
              q: "¿Qué pasa si me paso del límite de 500 contactos?",
              a: "La app te avisará antes de procesar. Podés dividir tus archivos en lotes de 500 o actualizar a Pro para lotes de hasta 10,000 contactos.",
            },
            {
              q: "¿Los límites se resetean?",
              a: "Sí, los 3 lotes diarios se resetean a medianoche (hora local del browser). El límite de contactos por lote es por cada procesamiento.",
            },
            {
              q: "¿Puedo usar varios proveedores de IA?",
              a: "¡Sí! Todos los planes incluyen los 12 proveedores IA con rotación automática. Si un proveedor se agota, el siguiente toma el relevo.",
            },
            {
              q: "¿Hay contrato o permanencia?",
              a: "No. Podés cancelar Pro en cualquier momento. El plan Free es tuyo para siempre.",
            },
          ].map((item) => (
            <div key={item.q} className="border rounded-lg p-4">
              <h3 className="font-semibold mb-2">{item.q}</h3>
              <p className="text-sm text-muted-foreground">{item.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-muted/30 border-t">
        <div className="container px-4 py-16 md:py-20 text-center">
          <h2 className="text-3xl font-bold mb-4">¿Listo para empezar?</h2>
          <p className="text-muted-foreground mb-8 max-w-md mx-auto">
            Sin registro, sin tarjeta, sin compromiso. Solo subí tus contactos y empezá a limpiar.
          </p>
          <Button size="lg" className="text-base bg-violet-500 hover:bg-violet-600" asChild>
            <a href={`${import.meta.env.BASE_URL}`}>
              <Sparkles className="h-5 w-5 mr-2" />
              Empezar ahora
            </a>
          </Button>
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
              <a href={`${import.meta.env.BASE_URL}privacy`} className="hover:text-foreground">Privacidad</a>
              <a href={`${import.meta.env.BASE_URL}terms`} className="hover:text-foreground">Términos</a>
              <a href={`${import.meta.env.BASE_URL}faq`} className="hover:text-foreground">FAQ</a>
              <a href={`${import.meta.env.BASE_URL}blog`} className="hover:text-foreground">Blog</a>
              <a href="https://github.com/pabloeckert/MejoraContactos" className="hover:text-foreground" target="_blank" rel="noopener noreferrer">GitHub</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
