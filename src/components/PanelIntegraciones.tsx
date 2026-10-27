// PanelIntegraciones — Configuración → Integraciones.
//
// Antes esto era una lista fija de cinco servicios con el botón desactivado
// y la etiqueta «Próximamente». Ahora conecta de verdad: el empleado autoriza
// su cuenta de GitHub o de Google y el panel le enseña sus repositorios, sus
// PR abiertos, sus próximas reuniones y sus archivos recientes.
//
// Todo es de SOLO LECTURA: los permisos que se piden no dan escritura, y el
// token de acceso no pasa por acá — vive en la API de Luna. Lo que llega a
// este componente son datos ya resueltos.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Github, Globe, Link2, Loader2, Check, X, RefreshCw, ExternalLink,
         AlertTriangle, GitPullRequest, Calendar, FileText, Lock } from 'lucide-react';
import {
  listar, conectar, desconectar, resumenDe, haceCuanto, ErrorIntegracion,
  type Conexion, type ProveedorId, type Servicio,
  type ResumenGithub, type ResumenGoogle,
} from '@/lib/integraciones';
import { abrirExterno } from '@/lib/escritorio';

const ICONOS: Record<ProveedorId, { icon: React.ElementType; color: string; desc: string }> = {
  github: { icon: Github, color: '#24292F', desc: 'Repositorios y pull requests' },
  google: { icon: Globe,  color: '#4285F4', desc: 'Calendar y Drive' },
};

interface Props {
  cardStyle: React.CSSProperties;
  sectionTitle: React.CSSProperties;
  bd: string;
  accentColor: string;
}

export default function PanelIntegraciones({ cardStyle, sectionTitle, bd, accentColor }: Props) {
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [conexiones, setConexiones] = useState<Conexion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState<ProveedorId | null>(null);
  const [aviso, setAviso] = useState<{ tono: 'ok' | 'mal'; texto: string } | null>(null);

  const [resumenes, setResumenes] = useState<Partial<Record<ProveedorId, ResumenGithub | ResumenGoogle>>>({});
  const [cargandoResumen, setCargandoResumen] = useState<ProveedorId | null>(null);
  /* Qué proveedores ya se intentaron traer. Vive en una ref y no en el estado
     porque solo sirve para no repetir la petición: meterlo en el estado haría
     que cada intento provocara un render de más. */
  const pedidos = useRef<Set<ProveedorId>>(new Set());

  // Para cancelar el sondeo si el componente se desmonta a media conexión.
  const abortar = useRef<AbortController | null>(null);
  const vivo = useRef(true);
  useEffect(() => () => { vivo.current = false; abortar.current?.abort(); }, []);

  const decir = (tono: 'ok' | 'mal', texto: string) => {
    setAviso({ tono, texto });
    setTimeout(() => { if (vivo.current) setAviso(null); }, 8000);
  };

  const traerResumen = useCallback(async (proveedor: ProveedorId) => {
    setCargandoResumen(proveedor);
    try {
      const d = await resumenDe<ResumenGithub | ResumenGoogle>(proveedor);
      if (vivo.current) setResumenes(r => ({ ...r, [proveedor]: d }));
    } catch (e) {
      if (!vivo.current) return;
      decir('mal', e instanceof Error ? e.message : 'No se pudieron traer los datos.');
      // Si el token murió hay que recargar la lista para que el botón diga
      // «Conectar» y no «Actualizar». Se marca aparte y lo resuelve `cargar`.
      if (e instanceof ErrorIntegracion && e.reconectar) pedidos.current.delete(proveedor);
    } finally {
      if (vivo.current) setCargandoResumen(null);
    }
  }, []);

  /**
   * Trae la lista y, de paso, los datos de lo que ya esté conectado.
   *
   * Los datos se piden acá y no en un efecto que vigile `conexiones`: ese
   * efecto llamaba a setState en su propio cuerpo y encadenaba renders.
   */
  const cargar = useCallback(async () => {
    try {
      const d = await listar();
      if (!vivo.current) return;
      setServicios(d.servicios);
      setConexiones(d.conexiones);

      for (const c of d.conexiones) {
        if (c.caducado || pedidos.current.has(c.proveedor)) continue;
        pedidos.current.add(c.proveedor);
        traerResumen(c.proveedor);
      }
    } catch (e) {
      if (vivo.current) decir('mal', e instanceof Error ? e.message : 'No se pudieron cargar las integraciones.');
    } finally {
      if (vivo.current) setCargando(false);
    }
  }, [traerResumen]);

  useEffect(() => { cargar(); }, [cargar]);

  const alConectar = async (proveedor: ProveedorId) => {
    setOcupado(proveedor);
    abortar.current = new AbortController();
    try {
      const c = await conectar(proveedor, { señal: abortar.current.signal });
      if (!vivo.current) return;
      decir('ok', `${ICONOS[proveedor] ? servicios.find(s => s.id === proveedor)?.nombre : proveedor} conectado${c.cuenta ? ` como ${c.cuenta}` : ''}.`);
      await cargar();
      traerResumen(proveedor);
    } catch (e) {
      if (vivo.current) decir('mal', e instanceof Error ? e.message : 'No se pudo conectar.');
    } finally {
      if (vivo.current) setOcupado(null);
      abortar.current = null;
    }
  };

  const alDesconectar = async (proveedor: ProveedorId, nombre: string) => {
    if (!window.confirm(
      `¿Desconectar ${nombre}?\n\nSe borrará el acceso que guardamos y se le pedirá al servicio que lo olvide. Puedes volver a conectarlo cuando quieras.`)) return;
    setOcupado(proveedor);
    try {
      await desconectar(proveedor);
      if (!vivo.current) return;
      setResumenes(r => { const n = { ...r }; delete n[proveedor]; return n; });
      pedidos.current.delete(proveedor);
      decir('ok', `${nombre} quedó desconectado.`);
      await cargar();
    } catch (e) {
      if (vivo.current) decir('mal', e instanceof Error ? e.message : 'No se pudo desconectar.');
    } finally {
      if (vivo.current) setOcupado(null);
    }
  };

  const conexionDe = (id: ProveedorId) => conexiones.find(c => c.proveedor === id);

  if (cargando) {
    return (
      <div className="aj-card" style={{ ...cardStyle, textAlign: 'center', padding: 36 }}>
        <Loader2 size={20} className="animate-spin" style={{ margin: '0 auto 10px', color: 'var(--text-muted)' }} />
        <div style={{ fontSize: '0.8571rem', color: 'var(--text-muted)' }}>Cargando tus integraciones…</div>
      </div>
    );
  }

  return (
    <>
      {aviso && (
        <div style={{
          ...cardStyle, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10,
          borderColor: aviso.tono === 'ok' ? '#16a34a40' : '#dc262640',
          background: aviso.tono === 'ok' ? '#16a34a0f' : '#dc26260f',
        }}>
          {aviso.tono === 'ok' ? <Check size={16} style={{ color: '#16a34a', flexShrink: 0 }} />
                               : <AlertTriangle size={16} style={{ color: '#dc2626', flexShrink: 0 }} />}
          <span style={{ fontSize: '0.8571rem', color: 'var(--text-primary)' }}>{aviso.texto}</span>
        </div>
      )}

      <div className="aj-card" style={cardStyle}>
        <div style={sectionTitle}>Servicios</div>

        {servicios.map((s, i) => {
          const meta = ICONOS[s.id];
          const Icon = meta?.icon ?? Link2;
          const con = conexionDe(s.id);
          const esperando = ocupado === s.id;

          return (
            <div key={s.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
              padding: '12px 0', borderBottom: i < servicios.length - 1 ? `1px solid ${bd}` : 'none',
              flexWrap: 'wrap',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 180 }}>
                <div style={{
                  width: 34, height: 34, minWidth: 34, borderRadius: 9,
                  background: `${meta?.color ?? accentColor}18`,
                  border: `1px solid ${meta?.color ?? accentColor}25`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {con?.avatar
                    ? <img src={con.avatar} alt="" style={{ width: 28, height: 28, borderRadius: 7, objectFit: 'cover' }} />
                    : <Icon size={16} style={{ color: meta?.color ?? accentColor }} />}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '0.9286rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {s.nombre}
                    {con && !con.caducado && (
                      <span style={{
                        fontSize: '0.7143rem', padding: '1px 7px', borderRadius: 20,
                        background: '#16a34a1a', color: '#16a34a', border: '1px solid #16a34a30',
                      }}>Conectado</span>
                    )}
                    {con?.caducado && (
                      <span style={{
                        fontSize: '0.7143rem', padding: '1px 7px', borderRadius: 20,
                        background: '#f59e0b1a', color: '#b45309', border: '1px solid #f59e0b30',
                      }}>Caducado</span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.7857rem', color: 'var(--text-muted)' }}>
                    {con?.cuenta
                      ? <>Como <strong>{con.cuenta}</strong> · desde {new Date(con.conectadoEn || 0).toLocaleDateString('es')}</>
                      : (meta?.desc ?? '')}
                  </div>
                  {/* Qué permisos se piden, dicho antes de pedirlos. */}
                  <div style={{ fontSize: '0.7143rem', color: 'var(--text-muted)', opacity: 0.75, display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                    <Lock size={10} /> {s.permisos}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                {con && (
                  <button type="button" onClick={() => traerResumen(s.id)} disabled={cargandoResumen === s.id}
                    title="Volver a traer los datos"
                    style={botonSecundario}>
                    {cargandoResumen === s.id ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                  </button>
                )}
                {!s.configurado ? (
                  <button type="button" disabled
                    title="El servidor todavía no tiene las credenciales de este servicio"
                    style={{ ...botonSecundario, cursor: 'not-allowed', opacity: 0.5 }}>
                    Sin configurar
                  </button>
                ) : con ? (
                  <button type="button" onClick={() => alDesconectar(s.id, s.nombre)} disabled={esperando}
                    style={{ ...botonSecundario, color: '#dc2626', borderColor: '#dc262640' }}>
                    {esperando ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />} Desconectar
                  </button>
                ) : (
                  <button type="button" onClick={() => alConectar(s.id)} disabled={esperando}
                    style={{ ...botonSecundario, background: accentColor, color: '#fff', borderColor: accentColor }}>
                    {esperando ? <><Loader2 size={13} className="animate-spin" /> Esperando…</> : 'Conectar'}
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {servicios.some(s => !s.configurado) && (
          <div style={{ marginTop: 14, fontSize: '0.7857rem', color: 'var(--text-muted)', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
            <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>
              Los servicios «sin configurar» necesitan que Programación registre la aplicación
              en el proveedor y añada las credenciales al servidor. No es algo que se arregle desde acá.
            </span>
          </div>
        )}

        {ocupado && (
          <div style={{ marginTop: 14, fontSize: '0.7857rem', color: 'var(--text-muted)' }}>
            Se abrió el navegador para que autorices la cuenta. Al terminar, vuelve a esta ventana:
            el panel se actualiza solo.
          </div>
        )}
      </div>

      {/* ── Los datos ──────────────────────────────────────────────────── */}
      {conexionDe('github') && resumenes.github && (
        <VistaGithub datos={resumenes.github as ResumenGithub}
          cardStyle={cardStyle} sectionTitle={sectionTitle} bd={bd} />
      )}
      {conexionDe('google') && resumenes.google && (
        <VistaGoogle datos={resumenes.google as ResumenGoogle}
          cardStyle={cardStyle} sectionTitle={sectionTitle} bd={bd} />
      )}

      {conexiones.length === 0 && (
        <div style={{ ...cardStyle, padding: 20, textAlign: 'center' }}>
          <Link2 size={20} style={{ margin: '0 auto 8px', color: 'var(--border-main)' }} />
          <div style={{ fontSize: '0.8571rem', color: 'var(--text-muted)', marginBottom: 10 }}>
            Todavía no has conectado ninguna cuenta
          </div>
          <div style={{ fontSize: '0.7857rem', color: 'var(--text-muted)', opacity: 0.8 }}>
            Al conectarla verás acá tus repositorios, tus pull requests y tu agenda.
            Si necesitas otro servicio, pídeselo al equipo de Programación.
          </div>
        </div>
      )}
    </>
  );
}

const botonSecundario: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 5,
  padding: '6px 12px', borderRadius: 8, fontSize: '0.8571rem', cursor: 'pointer',
  border: '1px solid var(--border-main)', background: 'var(--sidebar-card-bg)',
  color: 'var(--text-primary)', flexShrink: 0,
};

const filaEnlace: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, padding: '9px 0',
  textDecoration: 'none', color: 'inherit', width: '100%', textAlign: 'left',
  background: 'none', border: 0, cursor: 'pointer', font: 'inherit',
};

/** Fila que abre un enlace externo (en escritorio, en el navegador del sistema). */
function Enlace({ url, children, borde }: { url: string | null; children: React.ReactNode; borde: string }) {
  return (
    <button type="button" onClick={() => url && abrirExterno(url)} disabled={!url}
      style={{ ...filaEnlace, borderBottom: borde }}>
      {children}
    </button>
  );
}

function VistaGithub({ datos, cardStyle, sectionTitle, bd }: {
  datos: ResumenGithub; cardStyle: React.CSSProperties; sectionTitle: React.CSSProperties; bd: string;
}) {
  const sinRepos = datos.repos.length === 0;
  return (
    <>
      {datos.prs.length > 0 && (
        <div className="aj-card" style={cardStyle}>
          <div style={sectionTitle}>Pull requests abiertos ({datos.prs.length})</div>
          {datos.prs.map((p, i) => (
            <Enlace key={p.id} url={p.url} borde={i < datos.prs.length - 1 ? `1px solid ${bd}` : 'none'}>
              <GitPullRequest size={14} style={{ color: p.borrador ? 'var(--text-muted)' : '#16a34a', flexShrink: 0 }} />
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display: 'block', fontSize: '0.9286rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.titulo}
                </span>
                <span style={{ display: 'block', fontSize: '0.7857rem', color: 'var(--text-muted)' }}>
                  {p.repo} #{p.numero} · {p.autor} · {haceCuanto(p.actualizado)}
                  {p.borrador && ' · borrador'}
                </span>
              </span>
              <ExternalLink size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            </Enlace>
          ))}
        </div>
      )}

      <div className="aj-card" style={cardStyle}>
        <div style={sectionTitle}>
          Repositorios {datos.totalRepos > 0 && `(${datos.totalRepos})`}
        </div>
        {sinRepos ? (
          // Distinguir «no tienes repos» de «la App no está instalada» importa:
          // lo segundo tiene arreglo y lo primero no.
          <div style={{ fontSize: '0.8571rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            No hay repositorios visibles todavía. La aplicación de Moon Studios tiene que
            estar <strong>instalada</strong> en tu cuenta u organización de GitHub, y con acceso
            concedido a los repositorios que quieras ver. Se hace desde los ajustes de GitHub,
            en «Applications».
          </div>
        ) : datos.repos.map((r, i) => (
          <Enlace key={r.id} url={r.url} borde={i < datos.repos.length - 1 ? `1px solid ${bd}` : 'none'}>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: 'block', fontSize: '0.9286rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.nombre}
                {r.privado && <span style={{ marginLeft: 6, fontSize: '0.7143rem', color: 'var(--text-muted)' }}>privado</span>}
              </span>
              <span style={{ display: 'block', fontSize: '0.7857rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {[r.lenguaje, r.actualizado ? haceCuanto(r.actualizado) : null, r.descripcion]
                  .filter(Boolean).join(' · ')}
              </span>
            </span>
            <ExternalLink size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          </Enlace>
        ))}
        {datos.instalaciones.length > 0 && (
          <div style={{ marginTop: 12, fontSize: '0.7143rem', color: 'var(--text-muted)', opacity: 0.8 }}>
            Instalada en: {datos.instalaciones.map(i => `${i.cuenta} (${i.repositorios})`).join(', ')}
          </div>
        )}
      </div>
    </>
  );
}

function VistaGoogle({ datos, cardStyle, sectionTitle, bd }: {
  datos: ResumenGoogle; cardStyle: React.CSSProperties; sectionTitle: React.CSSProperties; bd: string;
}) {
  // Las fechas vienen de Google con su zona dentro; se formatean con la del
  // navegador y no se tocan a mano, para no mover la hora de una reunión.
  const cuando = (e: ResumenGoogle['eventos'][number]) => {
    if (!e.inicio) return '';
    const d = new Date(e.inicio);
    if (e.todoElDia) return d.toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' }) + ' · todo el día';
    return d.toLocaleString('es', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <>
      <div className="aj-card" style={cardStyle}>
        <div style={sectionTitle}>Próximos eventos</div>
        {datos.eventos.length === 0 ? (
          <div style={{ fontSize: '0.8571rem', color: 'var(--text-muted)' }}>
            No hay nada en tu calendario a partir de ahora.
          </div>
        ) : datos.eventos.map((e, i) => (
          <Enlace key={e.id} url={e.meet || e.url} borde={i < datos.eventos.length - 1 ? `1px solid ${bd}` : 'none'}>
            <Calendar size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: 'block', fontSize: '0.9286rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {e.titulo}
              </span>
              <span style={{ display: 'block', fontSize: '0.7857rem', color: 'var(--text-muted)' }}>
                {[cuando(e), e.lugar, e.meet ? 'Meet' : null].filter(Boolean).join(' · ')}
              </span>
            </span>
            <ExternalLink size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          </Enlace>
        ))}
      </div>

      <div className="aj-card" style={cardStyle}>
        <div style={sectionTitle}>Archivos recientes de Drive</div>
        {datos.archivos.length === 0 ? (
          <div style={{ fontSize: '0.8571rem', color: 'var(--text-muted)' }}>
            No hay archivos recientes.
          </div>
        ) : datos.archivos.map((f, i) => (
          <Enlace key={f.id} url={f.url} borde={i < datos.archivos.length - 1 ? `1px solid ${bd}` : 'none'}>
            {f.icono
              ? <img src={f.icono} alt="" style={{ width: 14, height: 14, flexShrink: 0 }} />
              : <FileText size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: 'block', fontSize: '0.9286rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {f.nombre}
              </span>
              <span style={{ display: 'block', fontSize: '0.7857rem', color: 'var(--text-muted)' }}>
                {haceCuanto(f.modificado)}
              </span>
            </span>
            <ExternalLink size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          </Enlace>
        ))}
      </div>
    </>
  );
}
