import { ArrowLeft, FileText, AlertTriangle, Scale, ShieldCheck, Zap, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const Terms = () => (
  <div className="container max-w-3xl mx-auto py-8 px-4">
    <Button variant="ghost" className="mb-6" onClick={() => window.history.back()}>
      <ArrowLeft className="h-4 w-4 mr-2" />
      Volver
    </Button>

    <div className="flex items-center gap-3 mb-2">
      <FileText className="h-8 w-8 text-primary" />
      <h1 className="text-3xl font-bold">Términos de Servicio</h1>
    </div>
    <p className="text-muted-foreground mb-8">
      Última actualización: 24 de abril de 2026
    </p>

    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5" />
            Aceptación de términos
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-3">
          <p>
            Al acceder y usar <strong>MejoraContactos</strong>, aceptás estos Términos de Servicio.
            Si no estás de acuerdo con alguno de estos términos, no uses la aplicación.
          </p>
          <p className="text-muted-foreground">
            Nos reservamos el derecho de modificar estos términos en cualquier momento.
            Los cambios serán efectivos inmediatamente después de su publicación.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Descripción del servicio
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-3">
          <p>MejoraContactos es una aplicación web gratuita que ofrece:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Importación de contactos desde múltiples formatos (CSV, Excel, VCF, JSON, Google Contacts)</li>
            <li>Limpieza y normalización de datos mediante reglas e inteligencia artificial</li>
            <li>Deduplicación de contactos</li>
            <li>Exportación en múltiples formatos</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Limitación de responsabilidad
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-3">
          <p>
            <strong>La aplicación se proporciona "tal cual" y "según disponibilidad"</strong>,
            sin garantías de ningún tipo, ya sean expresas o implícitas.
          </p>
          <p>En ningún caso seremos responsables por:</p>
          <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
            <li>Pérdida de datos durante la limpieza o deduplicación</li>
            <li>Errores en la limpieza realizada por proveedores de IA de terceros</li>
            <li>Interrupciones del servicio</li>
            <li>Daños indirectos, incidentales o consecuentes</li>
          </ul>
          <p className="font-medium">
            Recomendamos siempre hacer una copia de seguridad de tus contactos antes de procesarlos.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Responsabilidades del usuario
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-3">
          <p>El usuario se compromete a:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>No usar la aplicación para procesar datos obtenidos ilegalmente</li>
            <li>No intentar sobrecargar o dañar la aplicación</li>
            <li>No usar la aplicación para enviar spam o contenido malicioso a proveedores de IA</li>
            <li>Respetar los términos de servicio de los proveedores de IA de terceros</li>
            <li>Mantener la confidencialidad de sus propias API keys</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Proveedores de terceros
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-3">
          <p>
            La aplicación utiliza servicios de terceros (proveedores de IA) para la limpieza de contactos.
            El uso de estos servicios está sujeto a sus propios términos y condiciones.
          </p>
          <p className="text-muted-foreground">
            No somos responsables por la disponibilidad, precisión o políticas de estos servicios de terceros.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Propiedad intelectual</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-3">
          <p>
            El código fuente de MejoraContactos está disponible bajo licencia open source en GitHub.
            Los datos que procesás con la aplicación son de tu exclusiva propiedad.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ley aplicable</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <p>
            Estos términos se rigen por las leyes aplicables según la jurisdicción del usuario.
            Cualquier disputa se resolverá de buena fe entre las partes.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contacto</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <p>
            Para consultas sobre estos términos, podés contactarnos a través de
            GitHub Issues en el repositorio del proyecto.
          </p>
        </CardContent>
      </Card>
    </div>
  </div>
);

export default Terms;
