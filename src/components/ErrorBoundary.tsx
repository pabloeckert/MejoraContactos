import { Component, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { captureError } from "@/lib/error-reporter";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    captureError(error, {
      component: "ErrorBoundary",
      extra: { componentStack: errorInfo.componentStack },
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex flex-col items-center justify-center min-h-[300px] p-8 text-center">
          <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
          <h2 className="text-xl font-semibold mb-2">Algo salió mal</h2>
          <p className="text-muted-foreground mb-2 max-w-md">
            Ocurrió un error inesperado. Podés intentar recargar la sección o toda la página.
          </p>
          {this.state.error && (
            <details className="mb-4 max-w-lg">
              <summary className="text-sm text-muted-foreground cursor-pointer hover:text-foreground">
                Ver detalles del error
              </summary>
              <pre className="mt-2 text-xs text-left bg-muted p-3 rounded-md overflow-auto max-h-40">
                {this.state.error.message}
                {"\n\n"}
                {this.state.error.stack}
              </pre>
            </details>
          )}
          <div className="flex gap-3">
            <Button variant="outline" onClick={this.handleReset}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Reintentar
            </Button>
            <Button onClick={this.handleReload}>
              Recargar página
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
