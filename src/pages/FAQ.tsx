import { useState } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, HelpCircle } from "lucide-react";

interface FaqItem {
  question: string;
  answer: string;
}

const faqs: FaqItem[] = [
  {
    question: "¿Qué es MejoraContactos?",
    answer:
      "MejoraContactos es una aplicación web para limpiar, deduplicar y mejorar tus contactos. Importá tus archivos, dejá que la IA los procese y exportá los resultados en el formato que necesités.",
  },
  {
    question: "¿Mis datos se suben a internet?",
    answer:
      "No. Todo se procesa directamente en tu browser. Tus archivos y contactos nunca salen de tu dispositivo, salvo cuando vos elegís enviar datos a un proveedor de IA (y eso requiere tu API key explícita).",
  },
  {
    question: "¿Qué formatos puedo importar?",
    answer:
      "Podés importar contactos desde CSV, Excel (.xlsx), VCF (vCard), JSON y Google Contacts. La app detecta automáticamente el formato y mapea los campos.",
  },
  {
    question: "¿Cómo funciona la IA?",
    answer:
      "La IA se usa para detectar duplicados, normalizar nombres y mejorar la calidad de los datos. Usá proveedores gratuitos como OpenRouter, Groq o Mistral — solo necesitás configurar tu propia API key en la sección Configuración.",
  },
  {
    question: "¿Cuántos contactos puedo procesar?",
    answer:
      "No hay un límite fijo. Para archivos grandes (más de 50.000 contactos) la app usa Web Workers automáticamente para que tu browser no se trabe.",
  },
  {
    question: "¿Es gratis?",
    answer:
      "Sí, la app es completamente gratuita. El único costo es el que puedas generar al usar tu API key de IA, según el proveedor que elijas.",
  },
  {
    question: "¿Puedo deshacer cambios?",
    answer:
      "Sí. Cada vez que procesás o limpiás contactos, la app guarda un snapshot en el historial. Desde la pestaña Configuración podés restaurar cualquier versión anterior.",
  },
  {
    question: "¿Cómo exporto los resultados?",
    answer:
      "Podés exportar tus contactos limpios en CSV, Excel (.xlsx), VCF (vCard), JSON, JSONL y HTML. Elegí el formato desde la pestaña Exportar.",
  },
];

function FaqCollapsible({ item }: { item: FaqItem }) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border border-border/50 bg-card px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-accent/50 [&[data-state=open]]:rounded-b-none [&[data-state=open]]:border-b-0">
        <span>{item.question}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="border border-t-0 border-border/50 bg-card px-4 py-3 text-sm text-muted-foreground rounded-b-lg">
        {item.answer}
      </CollapsibleContent>
    </Collapsible>
  );
}

const FAQ = () => {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-primary shadow-sm">
        <div className="container flex h-14 items-center gap-2 px-4">
          <a href={import.meta.env.BASE_URL} className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-accent flex items-center justify-center">
              <HelpCircle className="h-4 w-4 text-accent-foreground" />
            </div>
            <h1 className="text-sm font-bold tracking-tight text-primary-foreground">
              MejoraContactos
            </h1>
          </a>
          <span className="text-xs text-primary-foreground/60 ml-2">· FAQ</span>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 container max-w-2xl px-4 py-8">
        <div className="mb-8 text-center">
          <h2 className="text-2xl font-bold tracking-tight mb-2">Preguntas frecuentes</h2>
          <p className="text-sm text-muted-foreground">
            Todo lo que necesitás saber sobre MejoraContactos.
          </p>
        </div>

        <div className="space-y-2">
          {faqs.map((faq) => (
            <FaqCollapsible key={faq.question} item={faq} />
          ))}
        </div>

        <div className="mt-8 text-center text-sm text-muted-foreground">
          <p>
            ¿No encontrás tu pregunta?{" "}
            <a
              href="https://github.com/pabloeckert/MejoraContactos/issues"
              className="underline underline-offset-2 hover:text-foreground"
              target="_blank"
              rel="noopener noreferrer"
            >
              Abrí un issue en GitHub
            </a>
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-3 px-4 text-center text-xs text-muted-foreground/60 border-t border-border/30">
        <span>© 2026 MejoraContactos · </span>
        <a href={`${import.meta.env.BASE_URL}privacy`} className="hover:text-foreground underline underline-offset-2">
          Privacidad
        </a>
        <span> · </span>
        <a href={`${import.meta.env.BASE_URL}terms`} className="hover:text-foreground underline underline-offset-2">
          Términos
        </a>
        <span> · </span>
        <a href={`${import.meta.env.BASE_URL}faq`} className="hover:text-foreground underline underline-offset-2">
          FAQ
        </a>
      </footer>
    </div>
  );
};

export default FAQ;
