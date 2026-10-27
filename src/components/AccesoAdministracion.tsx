import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { ArrowUpRight, Check, Inbox, LoaderCircle, LockKeyhole, Save, ShieldCheck, SlidersHorizontal, UsersRound, AlertCircle } from 'lucide-react';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { EnterpriseFocus } from '@/components/EnterpriseFocus';
import { fechaHora } from '@/lib/ajustes/fecha';
import { accesoPorDefecto, codigoEmpleado, guardarAcceso, MODULOS_DELEGABLES, SOLO_CEO, type AccesoAdministracion } from '@/lib/tramites';
import '@/styles/tramites.css';

const TRAMITES = [
  { clave: 'resolver' as const, nombre: 'Resolver trámites', detalle: 'Atender la bandeja: aprobar, rechazar o marcar en revisión. Nunca sus propios trámites ni los marcados «Solo CEO».', icono: Inbox },
  { clave: 'catalogo' as const, nombre: 'Editar el catálogo', detalle: 'Crear trámites, cambiar sus formularios y ocultarlos. La marca «Solo CEO» queda fuera de su alcance.', icono: SlidersHorizontal },
];
const iguales = (a: AccesoAdministracion, b: AccesoAdministracion) => JSON.stringify([a.modulos, a.tramites]) === JSON.stringify([b.modulos, b.tramites]);

/** Centro de administración: el CEO fija los límites; Administración ve hasta dónde llega. */
export default function AccesoAdministracion() {
  const { isCEO, accesoAdmin, userProfile } = useAuth();
  const vigente = accesoAdmin ?? accesoPorDefecto();
  // null = sin cambios locales: se muestra lo guardado (también si lo cambia otro dispositivo).
  const [cambios, setBorrador] = useState<AccesoAdministracion | null>(null);
  const borrador = cambios ?? vigente;
  const [equipo, setEquipo] = useState<{ uid: string; nombre: string; activo: boolean }[] | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [estado, setEstado] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const sucio = isCEO && !!cambios && !iguales(cambios, vigente);
  useEffect(() => onSnapshot(query(collection(db, 'users'), where('role', '==', 'Administración')),
    snap => setEquipo(snap.docs.map(d => ({ uid: d.id, nombre: String(d.data().displayName || d.data().name || d.data().email || 'Sin nombre'), activo: d.data().isActive !== false }))),
    error => { console.error(error); setEquipo([]); }), []);

  const habilitados = Object.values(vigente.modulos).filter(Boolean).length + Object.values(vigente.tramites).filter(Boolean).length;
  const total = MODULOS_DELEGABLES.length + TRAMITES.length;
  const guardar = async () => {
    if (!userProfile) return;
    setGuardando(true); setEstado(null);
    try { await guardarAcceso(borrador, userProfile.uid, userProfile.displayName || userProfile.email); setBorrador(null); setEstado({ tipo: 'ok', texto: 'Límites guardados. Administración ya ve los cambios.' }); }
    catch (error) { console.error(error); setEstado({ tipo: 'error', texto: 'No se pudieron guardar los límites. Inténtalo de nuevo.' }); }
    finally { setGuardando(false); }
  };

  const interruptor = (activo: boolean, etiqueta: string, cambiar: (v: boolean) => void) => isCEO
    ? <label className="tr-switch"><input type="checkbox" checked={activo} aria-label={etiqueta} disabled={guardando} onChange={e => { cambiar(e.target.checked); setEstado(null); }} /><span /></label>
    : <span className="tr-sello">{activo ? <><Check />Habilitado</> : <><LockKeyhole />Restringido</>}</span>;
  const actual = isCEO ? borrador : vigente;

  return (
    <div className="moon-module moon-module--acceso max-w-5xl mx-auto tr-page">
      <EnterpriseFocus eyebrow="CENTRO DE ADMINISTRACIÓN" title={isCEO ? 'Acceso de Administración' : 'Tu acceso al sistema'}
        description={isCEO ? 'Decide qué partes de Moon Studios administra el área de Administración y con qué límites. Los cambios se aplican al instante.' : 'Estas son las áreas de Moon Studios que puedes administrar. Los límites los define el CEO.'}
        metrics={[
          { label: 'Permisos habilitados', value: `${habilitados}/${total}` },
          { label: 'Personas en Administración', value: equipo?.filter(p => p.activo).length ?? '—' },
          { label: 'Última modificación', value: vigente.updatedAt ? fechaHora(vigente.updatedAt) : 'Valores iniciales', detail: vigente.updatedByName ? `Por ${vigente.updatedByName}` : undefined },
        ]} />

      {estado && <p className={estado.tipo === 'ok' ? 'tr-nota' : 'tr-alerta'} role={estado.tipo === 'ok' ? 'status' : 'alert'}>{estado.tipo === 'ok' ? <ShieldCheck strokeWidth={1.5} /> : <AlertCircle strokeWidth={1.5} />}{estado.texto}</p>}

      <section className="ac-seccion" aria-labelledby="ac-modulos">
        <h2 id="ac-modulos">Módulos del sistema</h2>
        <div className="ac-rejilla">
          {MODULOS_DELEGABLES.map(m => {
            const activo = actual.modulos[m.clave];
            return (
              <article key={m.clave} className={`ac-modulo${activo ? '' : ' is-off'}`} data-moon-reveal="card">
                <div><h3>{m.nombre}</h3><p>{m.detalle}</p></div>
                {interruptor(activo, m.nombre, v => setBorrador({ ...borrador, modulos: { ...borrador.modulos, [m.clave]: v } }))}
                {!isCEO && (activo ? <Link to={m.ruta}>Abrir<ArrowUpRight /></Link> : <span className="ac-estado"><LockKeyhole />El CEO no habilitó este módulo</span>)}
              </article>
            );
          })}
        </div>
      </section>

      <section className="ac-seccion" aria-labelledby="ac-tramites">
        <h2 id="ac-tramites">Trámites del personal</h2>
        <div className="ac-rejilla">
          {TRAMITES.map(({ clave, nombre, detalle, icono: Icono }) => {
            const activo = actual.tramites[clave];
            return (
              <article key={clave} className={`ac-modulo${activo ? '' : ' is-off'}`} data-moon-reveal="card">
                <div><h3><Icono size={15} strokeWidth={1.5} style={{ display: 'inline', marginRight: 6, verticalAlign: '-2px' }} />{nombre}</h3><p>{detalle}</p></div>
                {interruptor(activo, nombre, v => setBorrador({ ...borrador, tramites: { ...borrador.tramites, [clave]: v } }))}
                {!isCEO && activo && <Link to={`/dashboard/tramites?vista=${clave === 'resolver' ? 'bandeja' : 'catalogo'}`}>Abrir<ArrowUpRight /></Link>}
              </article>
            );
          })}
        </div>
      </section>

      <section className="ac-seccion" aria-labelledby="ac-ceo">
        <h2 id="ac-ceo">Siempre reservado al CEO</h2>
        <div className="ac-reservado">{SOLO_CEO.map(item => <span key={item}><LockKeyhole />{item}</span>)}</div>
      </section>

      <section className="ac-seccion" aria-labelledby="ac-equipo">
        <h2 id="ac-equipo">Personas con rol de Administración</h2>
        {equipo === null ? <p className="tr-cargando"><LoaderCircle className="tr-spin" />Cargando…</p>
          : equipo.length ? <div className="tr-lista">{equipo.map(p => (
            <div key={p.uid} className="tr-fila" style={{ cursor: 'default' }}>
              <span className="tr-tipo__icono" aria-hidden="true"><UsersRound strokeWidth={1.5} /></span>
              <span className="tr-fila__texto"><strong>{p.nombre}</strong><span>ID {codigoEmpleado(p.uid)}</span></span>
              <span className="tr-fila__lado">{p.activo ? 'Activa' : 'Inactiva'}</span>
            </div>
          ))}</div>
          : <div className="tr-vacio"><UsersRound /><h3>Nadie tiene el rol de Administración</h3><p>Asígnalo desde Gestión de roles; estos límites se aplicarán a esas cuentas.</p></div>}
      </section>

      <p className="tr-nota"><ShieldCheck strokeWidth={1.5} />Los permisos de trámites se validan también en el servidor. Los módulos se ocultan del menú y de sus rutas para Administración.</p>

      {sucio && (
        <div className="ac-barra" role="region" aria-label="Cambios sin guardar">
          <span>Tienes cambios sin guardar.</span>
          <div>
            <button type="button" className="enterprise-action" disabled={guardando} onClick={() => setBorrador(null)}>Descartar</button>
            <button type="button" className="enterprise-action enterprise-action--primary" disabled={guardando} onClick={() => void guardar()}>{guardando ? <LoaderCircle className="tr-spin" /> : <Save />}Guardar límites</button>
          </div>
        </div>
      )}
    </div>
  );
}
