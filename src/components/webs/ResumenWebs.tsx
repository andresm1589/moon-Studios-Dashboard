import type { Timestamp } from 'firebase/firestore';
import { Building2, Moon, PartyPopper, ExternalLink, ChevronRight, Inbox, FileText, Loader2, CheckCircle2 } from 'lucide-react';
import { EstadoSocio, NivelChip } from './SociosPanel';
import type { DatosWebs } from './datos';
import { dolares } from './niveles';

// ─── Webs — Resumen ──────────────────────────────────────────────────────────
// Los tres sitios de un vistazo y lo que está esperando respuesta.

const TIPOS: Record<string, string> = { cotizacion: 'Cotización', ticket: 'Ticket', alianza: 'Alianza', soporte: 'Soporte' };
const hace = (t: Timestamp | null) => {
  if (!t?.toDate) return '';
  const dias = Math.floor((Date.now() - t.toDate().getTime()) / 86400000);
  return dias <= 0 ? 'hoy' : dias === 1 ? 'ayer' : `hace ${dias} días`;
};
const n = (v: number | null) => (v === null ? '—' : String(v));

export function ResumenWebs({ datos, ir }: { datos: DatosWebs | null; ir: (id: string) => void }) {
  if (!datos) return <div className="wb-vacio"><Loader2 className="animate-spin" />Cargando el resumen…</div>;

  const pendientes = datos.solicitudes.filter(s => s.estado === 'pendiente');
  const enProceso = datos.solicitudes.filter(s => s.estado === 'en_proceso').length;
  const sociosRev = datos.socios.filter(s => s.estado === 'pendiente');
  const capital = datos.socios.filter(s => s.estado === 'aprobado').reduce((a, s) => a + (Number(s.monto) || 0), 0);

  const SITIOS = [
    {
      nombre: 'Moon Studios', url: 'https://moon-studios.netlify.app', Icon: Building2,
      cifras: [
        { t: 'Solicitudes por atender', v: String(pendientes.length), ir: 'portal' },
        { t: 'En proceso', v: String(enProceso), ir: 'portal' },
        { t: 'Socios en revisión', v: String(sociosRev.length), ir: 'socios' },
        { t: 'Capital aprobado', v: dolares(capital), ir: 'socios' },
        { t: 'Proyectos', v: n(datos.proyectos), ir: 'portafolio' },
        { t: 'Equipo', v: n(datos.equipo), ir: 'equipo' },
      ],
    },
    {
      nombre: 'Luna NET', url: 'https://luna-net.nellyx.xyz', Icon: Moon,
      cifras: [
        { t: 'Aliados', v: n(datos.aliados), ir: 'luna' },
        { t: 'Eventos de temporada', v: 'Editar', ir: 'eventos' },
        { t: 'Incidentes', v: 'Ver', ir: 'incidentes' },
        { t: 'Blog y contacto', v: 'Editar', ir: 'webluna' },
      ],
    },
    {
      nombre: 'Moon Fest 2026', url: 'https://moon-studios-fest.netlify.app', Icon: PartyPopper,
      cifras: [
        { t: 'Inscritos', v: n(datos.inscritos), ir: 'sitios' },
        { t: 'Correo masivo', v: 'Enviar', ir: 'correo' },
      ],
    },
  ];

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
        {SITIOS.map(s => (
          <section key={s.nombre} className="wb-tarjeta" style={{ padding: 16, display: 'grid', gap: 12, alignContent: 'start' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="wb-avatar" style={{ borderRadius: 11 }}><s.Icon size={17} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b style={{ display: 'block', fontSize: 14, fontWeight: 400, color: 'hsl(var(--foreground))' }}>{s.nombre}</b>
                <small style={{ fontSize: 11, color: 'hsl(var(--muted-foreground))' }}>{s.url.replace('https://', '')}</small>
              </div>
              <a className="wb-btn" style={{ width: 32, padding: 0 }} href={s.url} target="_blank" rel="noopener noreferrer" title="Abrir el sitio"><ExternalLink /></a>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 6 }}>
              {s.cifras.map(c => (
                <button key={c.t} type="button" className="wb-fila" style={{ display: 'grid', gap: 2, padding: '10px 12px' }} onClick={() => ir(c.ir)}>
                  <span style={{ fontSize: 18, fontWeight: 300, color: 'hsl(var(--foreground))' }}>{c.v}</span>
                  <span style={{ fontSize: 10.5, fontWeight: 300, color: 'hsl(var(--muted-foreground))' }}>{c.t}</span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
        <section className="wb-tarjeta" style={{ padding: 16, display: 'grid', gap: 12, alignContent: 'start' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 className="wb-h2"><Inbox />Solicitudes por atender</h2>
            <button type="button" className="wb-btn" onClick={() => ir('portal')}>Ver todas<ChevronRight /></button>
          </div>
          {pendientes.length ? (
            <div className="wb-lista">
              {pendientes.slice(0, 5).map(s => (
                <button key={s.id} type="button" className="wb-fila" onClick={() => ir('portal')}>
                  <span className="wb-avatar" style={{ borderRadius: 10, width: 32, height: 32 }}><FileText size={15} /></span>
                  <span className="wb-fila-texto"><b>{s.titulo || 'Sin título'}</b><small>{TIPOS[s.tipo] ?? s.tipo} · {hace(s.creadoEn)}</small></span>
                  <ChevronRight size={15} style={{ color: 'hsl(var(--muted-foreground))' }} />
                </button>
              ))}
            </div>
          ) : <div className="wb-vacio" style={{ padding: 20 }}><CheckCircle2 />Todo respondido.</div>}
        </section>

        <section className="wb-tarjeta" style={{ padding: 16, display: 'grid', gap: 12, alignContent: 'start' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2 className="wb-h2"><Building2 />Socios en revisión</h2>
            <button type="button" className="wb-btn" onClick={() => ir('socios')}>Ver socios<ChevronRight /></button>
          </div>
          {sociosRev.length ? (
            <div className="wb-lista">
              {sociosRev.slice(0, 5).map(s => (
                <button key={s.id} type="button" className="wb-fila" onClick={() => ir('socios')}>
                  <span className="wb-avatar" style={{ width: 32, height: 32, fontSize: 12 }}>{(s.nombre || '?').charAt(0).toUpperCase()}</span>
                  <span className="wb-fila-texto"><b>{s.nombre}</b><small><NivelChip monto={s.monto} etiqueta={s.tierLabel} /> · {hace(s.creadoEn)}</small></span>
                  <span className="wb-monto">{dolares(s.monto)}</span>
                  <EstadoSocio estado={s.estado} />
                </button>
              ))}
            </div>
          ) : <div className="wb-vacio" style={{ padding: 20 }}><CheckCircle2 />No hay socios esperando.</div>}
        </section>
      </div>
    </div>
  );
}
