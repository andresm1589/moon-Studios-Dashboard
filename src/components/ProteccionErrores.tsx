import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

// ─── Protección contra errores de un panel ───────────────────────────────────
// Si un panel se rompe al dibujarse (por ejemplo, la API cambió de forma y el
// panel espera otra cosa), React desmonta TODA la app y queda la pantalla en
// negro. Con esto solo ese panel muestra el error, con un botón para
// reintentar, y el resto del dashboard sigue funcionando.

interface Props { nombre: string; children: React.ReactNode }
interface Estado { error: Error | null }

export class ProteccionErrores extends React.Component<Props, Estado> {
  state: Estado = { error: null };

  static getDerivedStateFromError(error: Error): Estado { return { error }; }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[${this.props.nombre}] se rompió al dibujarse:`, error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    // Al cambiar de pestaña, se vuelve a intentar.
    if (prev.nombre !== this.props.nombre && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <AlertTriangle className="w-6 h-6 text-amber-400" strokeWidth={1.5} />
        <p className="text-sm font-light text-white">Este panel tuvo un error y no se pudo mostrar.</p>
        <p className="text-xs font-light max-w-md break-words" style={{ color: 'hsl(var(--muted-foreground))' }}>
          {this.state.error.message || 'Error desconocido'} · Si sigue pasando, actualiza la app (puede haber una versión nueva).
        </p>
        <button type="button" onClick={() => this.setState({ error: null })}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-light transition-all hover:bg-white/5"
          style={{ border: '1px solid hsl(var(--border))', color: 'hsl(var(--muted-foreground))' }}>
          <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.5} /> Reintentar
        </button>
      </div>
    );
  }
}
