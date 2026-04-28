import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Zap, Building2 } from "lucide-react";

const PLANS = [
  {
    name: "Gratis",
    price: "$0",
    icon: <Zap className="h-5 w-5" />,
    features: [
      "Hasta 1,000 contactos",
      "3 proveedores de IA",
      "Importación CSV/VCF/JSON",
      "Exportación CSV/Excel",
      "Deduplicación básica",
    ],
    cta: "Empezar gratis",
    popular: false,
  },
  {
    name: "Pro",
    price: "$9/mes",
    icon: <CheckCircle className="h-5 w-5" />,
    features: [
      "Contactos ilimitados",
      "12 proveedores de IA",
      "Todos los formatos",
      "Exportación JSONL (fine-tuning)",
      "Deduplicación avanzada (Jaro-Winkler)",
      "Google Contacts OAuth",
      "Dashboard con métricas",
    ],
    cta: "Coming soon",
    popular: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    icon: <Building2 className="h-5 w-5" />,
    features: [
      "Todo de Pro",
      "API REST",
      "Multi-usuario",
      "SSO/SAML",
      "Soporte prioritario",
      "SLA 99.9%",
    ],
    cta: "Contactar",
    popular: false,
  },
];

export default function Pricing() {
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-3xl font-bold mb-3">Precios</h1>
          <p className="text-muted-foreground">Elegí el plan que mejor se adapte a tus necesidades.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {PLANS.map((plan) => (
            <Card key={plan.name} className={`relative ${plan.popular ? "border-primary shadow-lg" : ""}`}>
              {plan.popular && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">Popular</Badge>
              )}
              <CardHeader className="text-center">
                <div className="flex justify-center mb-2">{plan.icon}</div>
                <CardTitle>{plan.name}</CardTitle>
                <p className="text-2xl font-bold">{plan.price}</p>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <CheckCircle className="h-4 w-4 text-success shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
