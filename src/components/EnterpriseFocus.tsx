import type { ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';
import '@/styles/enterprise-sections.css';

type FocusMetric = { label: string; value: ReactNode; detail?: string; onClick?: () => void };

/** Resumen de datos del panel. Los accesos conservan el estado de sus pestañas. */
export function EnterpriseFocus({ eyebrow, title, description, metrics, children }: {
  eyebrow: string;
  title: string;
  description: string;
  metrics: FocusMetric[];
  children?: ReactNode;
}) {
  return (
    <section data-moon-reveal="heading" className="enterprise-focus" aria-label={eyebrow}>
      <div className="enterprise-focus__intro">
        <span className="enterprise-kicker"><span aria-hidden="true" />{eyebrow}</span>
        <h1 className="moon-page-title">{title}</h1>
        <p>{description}</p>
        {children && <div className="enterprise-actions">{children}</div>}
      </div>
      <div className="enterprise-focus__metrics">
        {metrics.map(metric => {
          const content = <><span>{metric.label}{metric.onClick && <ArrowUpRight aria-hidden="true" />}</span><strong>{metric.value}</strong>{metric.detail && <small>{metric.detail}</small>}</>;
          return metric.onClick
            ? <button type="button" key={metric.label} className="enterprise-focus__metric" onClick={metric.onClick}>{content}</button>
            : <div key={metric.label} className="enterprise-focus__metric">{content}</div>;
        })}
      </div>
    </section>
  );
}
