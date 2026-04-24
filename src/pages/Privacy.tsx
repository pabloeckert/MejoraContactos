import { ArrowLeft, Shield, Lock, Eye, Database, Globe, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const Privacy = () => (
  <div className="container max-w-3xl mx-auto py-8 px-4">
    <Button variant="ghost" className="mb-6" onClick={() => window.history.back()}>
      <ArrowLeft className="h-4 w-4 mr-2" />
      Volver
    </Button>

    <div className="flex items-center gap-3 mb-2">
      <Shield className="h-8 w-8 text-primary" />
      <h1 className="text-3xl font-bold">Política de Privacidad</h1>
    </div>
    <p className="text-muted-foreground mb-8">
      Última actualización: 24 de abril de 2026
    </p>

    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Tu privacidad es nuestra prioridad
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            <strong>MejoraContactos</strong> es una herramienta de limpieza y deduplicación de contactos.
            Diseñamos la aplicación con un principio fundamental: <strong>tus datos se procesan en tu navegador</strong>.
          </p>
          <p>
            No enviamos tus contactos a nuestros servidores. Los datos se almacenan exclusivamente
            en tu dispositivo mediante IndexedDB (almacenamiento local del navegador).
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            ¿Qué datos recopilamos?
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <h4 className="font-semibold mb-1">Datos que NUNCA recopilamos:</h4>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li>Tus contactos (nombres, teléfonos, emails)</li>
              <li>Tus archivos importados (CSV, Excel, VCF, JSON)</li>
              <li>Tus credenciales de Google Contacts</li>
              <li>Las API keys que ingresás para proveedores de IA</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-1">Datos que SÍ se procesan:</h4>
            <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
              <li><strong>Contactos para limpieza:</strong> se envían temporalmente a proveedores de IA de terceros (Groq, OpenRouter, etc.) que vos elegís, para realizar la limpieza. No los almacenamos.</li>
              <li><strong>API keys:</strong> se guardan en localStorage de tu navegador y solo se envían al proveedor correspondiente. Nunca llegan a nuestros servidores.</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Proveedores de IA de terceros
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            Cuando usás la función de limpieza con IA, tus contactos se envían temporalmente a uno
            o más de estos proveedores para procesamiento:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
            <li>Groq Cloud</li>
            <li>OpenRouter</li>
            <li>Together AI</li>
            <li>Cerebras</li>
            <li>DeepInfra</li>
            <li>SambaNova</li>
            <li>Mistral AI</li>
            <li>DeepSeek</li>
            <li>Google AI Studio (Gemini)</li>
            <li>Cloudflare Workers AI</li>
            <li>Hugging Face</li>
            <li>Nebius AI</li>
          </ul>
          <p className="text-muted-foreground">
            Cada proveedor tiene su propia política de privacidad. Te recomendamos revisarlas.
            Solo se envían los datos mínimos necesarios para la limpieza (nombre, teléfono, email, empresa, cargo).
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Google Contacts
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>
            Si usás la importación desde Google Contacts, la aplicación accede a tu lista de contactos
            de Google mediante OAuth 2.0. Los tokens de acceso se almacenan solo en tu navegador
            y se usan exclusivamente para importar contactos.
          </p>
          <p className="text-muted-foreground">
            No almacenamos, copiamos ni transmitimos tus credenciales de Google a ningún otro servicio.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5" />
            Tus derechos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Derecho de acceso:</strong> Todos tus datos están en tu navegador. Podés exportarlos en cualquier momento.</li>
            <li><strong>Derecho de eliminación:</strong> Podés borrar todos tus datos desde la app o limpiando los datos del navegador.</li>
            <li><strong>Derecho de portabilidad:</strong> Exportá tus contactos en 6 formatos diferentes.</li>
            <li><strong>Derecho de oposición:</strong> No usamos tus datos para ningún propósito que no sea la limpieza de contactos.</li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contacto</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          <p>
            Si tenés preguntas sobre esta política de privacidad, podés contactarnos a través de
            GitHub Issues en el repositorio del proyecto.
          </p>
        </CardContent>
      </Card>
    </div>
  </div>
);

export default Privacy;
