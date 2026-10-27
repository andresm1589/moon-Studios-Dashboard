import type { ReactNode } from 'react';
import { Download, RotateCcw, SlidersHorizontal } from 'lucide-react';
import './work-view-toolbar.css';

interface Props {
  label: string;
  description: string;
  count: number;
  total: number;
  children?: ReactNode;
  onReset?: () => void;
  onExport?: () => void;
  loading?: boolean;
}

export default function WorkViewToolbar({ label, description, count, total, children, onReset, onExport, loading = false }: Props) {
  return <section data-moon-reveal="card" className="moon-work-tools" aria-label={label}>
    <div className="moon-work-tools-heading">
      <div className="moon-work-tools-copy"><span><SlidersHorizontal size={14} />{label}</span><p>{description}</p></div>
      <div className="moon-work-tools-actions">
        <span className="moon-work-result-count" aria-live="polite">{loading ? 'Cargando…' : `${count} de ${total}`}</span>
        {onReset && <button type="button" onClick={onReset}><RotateCcw size={14} />Restablecer</button>}
        {onExport && <button type="button" onClick={onExport} disabled={loading || !count} title="Descargar las filas de esta vista en CSV"><Download size={14} />Exportar vista</button>}
      </div>
    </div>
    {children && <div className="moon-work-tools-controls">{children}</div>}
  </section>;
}
