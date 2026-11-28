import { useState } from "react";
import { Upload, Zap, Download, ArrowRight, ArrowLeft, SkipForward, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { analytics } from "@/lib/analytics";

interface OnboardingWizardProps {
  onComplete: () => void;
  onSkip: () => void;
  onStartImport: () => void;
}

const STEPS = [
  {
    icon: <Upload className="h-8 w-8" />,
    title: "Importá tus contactos",
    description: "Subí carpetas o archivos CSV, Excel, VCF, TXT o JSON directo desde tu equipo.",
    tip: "Arrastrá y soltás tus archivos — nada sale de tu navegador.",
    color: "text-blue-500",
    bg: "bg-blue-500/10",
  },
  {
    icon: <Sparkles className="h-8 w-8" />,
    title: "Limpieza automática local",
    description: "El proceso normaliza nombres, teléfonos E.164 y emails, y unifica contactos duplicados.",
    tip: "Funciona 100% offline y autónomo, sin conexiones externas.",
    color: "text-violet-500",
    bg: "bg-violet-500/10",
  },
  {
    icon: <Download className="h-8 w-8" />,
    title: "Exportá limpio",
    description: "Descargá tus contactos limpios en CSV, Excel, VCF, JSON o informe HTML.",
    tip: "Listos para usar en tu planilla o teléfono.",
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
  },
];

export function OnboardingWizard({ onComplete, onSkip, onStartImport }: OnboardingWizardProps) {
  const [step, setStep] = useState(0);
  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];

  const handleNext = () => {
    if (isLast) {
      analytics.wizardCompleted();
      onComplete();
      onStartImport();
    } else {
      analytics.wizardStep(step + 1);
      setStep((s) => s + 1);
    }
  };

  const handleBack = () => {
    if (step > 0) setStep((s) => s - 1);
  };

  const handleSkip = () => {
    analytics.wizardSkipped();
    onSkip();
  };

  return (
    <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-xl border-2">
        <CardContent className="p-6">
          {/* Progress dots */}
          <div className="flex justify-center gap-2 mb-6">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-2 w-2 rounded-full transition-all duration-300 ${
                  i === step ? "bg-primary w-6" : i < step ? "bg-primary/60" : "bg-muted"
                }`}
              />
            ))}
          </div>

          {/* Step content */}
          <div className="text-center mb-6">
            <div className={`inline-flex items-center justify-center h-16 w-16 rounded-2xl ${current.bg} ${current.color} mb-4`}>
              {current.icon}
            </div>
            <h2 className="text-xl font-bold mb-2">{current.title}</h2>
            <p className="text-muted-foreground text-sm mb-3">{current.description}</p>
            <Badge variant="outline" className="text-xs font-normal">
              💡 {current.tip}
            </Badge>
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between gap-3">
            {step > 0 ? (
              <Button variant="ghost" size="sm" onClick={handleBack}>
                <ArrowLeft className="h-4 w-4 mr-1" />
                Atrás
              </Button>
            ) : (
              <div />
            )}

            <div className="flex gap-2">
              <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={handleSkip}>
                Saltar
                <SkipForward className="h-3.5 w-3.5 ml-1" />
              </Button>
              <Button size="sm" onClick={handleNext}>
                {isLast ? "¡Empezar!" : "Siguiente"}
                {!isLast && <ArrowRight className="h-4 w-4 ml-1" />}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
