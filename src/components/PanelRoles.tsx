import { panelInk } from '@/lib/panelColors';
import { EnterpriseFocus } from '@/components/EnterpriseFocus';
import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { db } from '@/lib/firebase';
import {
  collection, doc, updateDoc, onSnapshot,
} from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { permisosDeRol, codigoEmpleado } from '@/lib/tramites';
import { esRolDelEquipo, type UserRole, type Permission } from '@/types';
import { Users, Shield, ChevronDown, Search, Check, AlertCircle } from 'lucide-react';

// ─── Configuración visual de roles ────────────────────────────────────────────
// Mismos colores que el resto de la app (Usuarios, Calendario, Admin).
const ROLE_META: Record<UserRole, { color: string; bg: string; description: string }> = {
  CEO:           { color: '#c084fc', bg: '#c084fc18', description: 'Acceso total al sistema' },
  Administración:{ color: '#60a5fa', bg: '#60a5fa18', description: 'Gestión y supervisión general' },
  Diseño:        { color: '#a78bfa', bg: '#a78bfa18', description: 'Panel de diseño gráfico y multimedia' },
  Secretaría:    { color: '#4ade80', bg: '#4ade8018', description: 'Documentos, agenda y actividades' },
  Programación:  { color: '#f472b6', bg: '#f472b618', description: 'Proyectos y control de versiones' },
  Contador:      { color: '#34d399', bg: '#34d39918', description: 'Contabilidad y libro diario' },
  Empleado:      { color: '#94a3b8', bg: '#94a3b818', description: 'Acceso básico al dashboard' },
};

const ALL_ROLES: UserRole[] = [
  'CEO', 'Administración', 'Diseño', 'Secretaría', 'Programación', 'Contador', 'Empleado',
];

const PERMISSION_LABELS: Record<Permission, string> = {
  roles:        'Gestión de roles',
  admin:        'Panel de administración',
  diseno:       'Panel de diseño',
  secretaria:   'Panel de secretaría',
  programacion: 'Panel de programación',
  contador:     'Contabilidad',
  webs:         'Gestión de webs',
  ceo:          'Panel CEO',
  tramites_gestion: 'Gestionar trámites',
  acceso:       'Centro de administración',
  conferencias: 'Gestionar conferencias',
};

interface UserDoc {
  uid: string;
  displayName: string;
  email: string;
  role: UserRole;
  avatar?: string;
  createdAt: any;
}

type Toast = { type: 'success' | 'error'; msg: string } | null;

export default function PanelRoles() {
  const { userProfile, isCEO, accesoAdmin } = useAuth();
  const [users,       setUsers]       = useState<UserDoc[]>([]);
  const [search,      setSearch]      = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'todos'>('todos');
  const [loading,     setLoading]     = useState(true);
  const [loadError,   setLoadError]   = useState<string | null>(null);
  const [saving,      setSaving]      = useState<string | null>(null);
  const [toast,       setToast]       = useState<Toast>(null);
  const [activeTab,   setActiveTab]   = useState<'usuarios' | 'permisos'>('usuarios');
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [dropdownPos,  setDropdownPos]  = useState<{ top: number; right: number } | null>(null);
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // ── Cargar usuarios ──────────────────────────────────────────────────────
  // Sin orderBy: Firestore excluye los documentos que no tienen el campo
  // ordenado, así que los usuarios sin displayName desaparecían. Se ordena acá.
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), snap => {
      // Solo el equipo: las cuentas de clientes (rol `client`) no son parte de este directorio.
      const docs = snap.docs.filter(d => esRolDelEquipo(d.data().role)).map(d => ({ uid: d.id, ...d.data() } as UserDoc));
      docs.sort((a, b) => (a.displayName || a.email || '').localeCompare(b.displayName || b.email || '', 'es'));
      setUsers(docs);
      setLoadError(null);
      setLoading(false);
    }, err => {
      console.error('Error cargando usuarios:', err);
      setLoadError(err.code === 'permission-denied'
        ? 'No tienes permiso para ver la lista de usuarios.'
        : 'No se pudieron cargar los usuarios. Revisa tu conexión e inténtalo de nuevo.');
      setLoading(false);
    });
    return () => unsub();
  }, []);

  // El menú es `fixed` y se calcula una sola vez al abrirlo: si la página se
  // desplaza o cambia de tamaño queda flotando lejos del botón, así que se cierra.
  useEffect(() => {
    if (!openDropdown) return;
    const cerrar = () => { setOpenDropdown(null); setDropdownPos(null); };
    window.addEventListener('scroll', cerrar, true);
    window.addEventListener('resize', cerrar);
    return () => {
      window.removeEventListener('scroll', cerrar, true);
      window.removeEventListener('resize', cerrar);
    };
  }, [openDropdown]);

  const showToast = useCallback((type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // ── Cambiar rol ──────────────────────────────────────────────────────────
  const handleRoleChange = async (uid: string, newRole: UserRole) => {
    if (uid === userProfile?.uid) {
      showToast('error', 'No puedes cambiar tu propio rol');
      return;
    }
    // Las reglas de Firestore solo dejan al CEO cambiar `role`.
    if (!isCEO) {
      showToast('error', 'Solo el CEO puede cambiar roles');
      return;
    }
    setSaving(uid);
    setOpenDropdown(null);
    try {
      await updateDoc(doc(db, 'users', uid), { role: newRole });
      showToast('success', 'Rol actualizado correctamente');
    } catch (err: any) {
      showToast('error', err?.code === 'permission-denied'
        ? 'No tienes permiso para cambiar este rol'
        : `Error: ${err.message}`);
    } finally {
      setSaving(null);
    }
  };

  const filtered = users.filter(u => (roleFilter === 'todos' || u.role === roleFilter) && (
    u.displayName?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase()) ||
    u.role?.toLowerCase().includes(search.toLowerCase()) ||
    codigoEmpleado(u.uid).toLowerCase().includes(search.toLowerCase()) ||
    u.uid === search.trim()
  ));

  // ── Stats por rol ────────────────────────────────────────────────────────
  const countByRole = ALL_ROLES.reduce((acc, role) => {
    acc[role] = users.filter(u => u.role === role).length;
    return acc;
  }, {} as Record<UserRole, number>);

  return (
    <div className="moon-module moon-module--panel-roles max-w-5xl mx-auto space-y-6">

      {/* ── Toast ── */}
      {toast && (
        <div
          className={`fixed top-20 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-2xl border text-sm font-light shadow-2xl transition-all`}
          style={{
            background: toast.type === 'success' ? 'rgba(20,30,20,0.97)' : 'rgba(30,15,15,0.97)',
            borderColor: toast.type === 'success' ? 'rgba(52,211,153,0.3)' : 'rgba(248,113,113,0.3)',
            color: panelInk(toast.type === 'success' ? '#34d399' : '#f87171'),
          }}
        >
          {toast.type === 'success'
            ? <Check className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} />
            : <AlertCircle className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} />}
          {toast.msg}
        </div>
      )}

      <EnterpriseFocus eyebrow="Seguridad · Equipo" title="Roles y permisos"
        description="Consulta qué puede hacer cada área y administra los accesos del equipo con sus permisos actuales."
        metrics={[
          { label: 'Integrantes', value: loading ? '—' : users.length, detail: 'Ver directorio de accesos', onClick: () => { setRoleFilter('todos'); setActiveTab('usuarios'); } },
          { label: 'Roles disponibles', value: ALL_ROLES.length, detail: 'Comparar permisos', onClick: () => setActiveTab('permisos') },
          { label: 'En esta vista', value: loading ? '—' : filtered.length, detail: roleFilter === 'todos' ? 'Todos los roles' : roleFilter },
        ]}>
        <button type="button" className="enterprise-action" onClick={() => setActiveTab(activeTab === 'permisos' ? 'usuarios' : 'permisos')}><Shield />{activeTab === 'permisos' ? 'Ver integrantes' : 'Comparar permisos'}</button>
      </EnterpriseFocus>

      {/* ── Stats por rol ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {ALL_ROLES.map(role => {
          const meta = ROLE_META[role];
          return (
            <button data-moon-reveal="card" type="button" key={role}
              className="enterprise-role-card moon-panel rounded-2xl border p-4"
              aria-label={`Filtrar integrantes de ${role}`} aria-pressed={roleFilter === role}
              onClick={() => { setRoleFilter(roleFilter === role ? 'todos' : role); setActiveTab('usuarios'); }}
              style={{ background: 'var(--moon-surface)', borderColor: 'var(--moon-line)' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-light tracking-wide" style={{ color: panelInk(meta.color) }}>{role}</span>
                <span className="text-lg font-light moon-panel-ink">{countByRole[role]}</span>
              </div>
              <div className="h-1 rounded-full overflow-hidden moon-panel-surface">
                <div className="h-full rounded-full transition-all" style={{
                  width: users.length > 0 ? `${(countByRole[role] / users.length) * 100}%` : '0%',
                  background: meta.color,
                }} />
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Tabs ── */}
      <div data-moon-reveal="card" className="moon-panel flex gap-1 p-1 rounded-2xl" style={{ background: 'var(--moon-surface)', border: '1px solid var(--moon-line)' }}>
        {(['usuarios', 'permisos'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className="flex-1 py-2 rounded-xl text-sm font-light capitalize transition-all"
            style={{
              background: activeTab === tab ? "var(--moon-surface-raised)" : 'transparent',
              color: panelInk(activeTab === tab ? "var(--moon-ink)" : "var(--moon-muted)"),
            }}>
            {tab === 'usuarios' ? `Usuarios (${users.length})` : 'Matriz de Permisos'}
          </button>
        ))}
      </div>

      {/* ════ TAB: USUARIOS ════ */}
      {activeTab === 'usuarios' && (
        <div className="space-y-4">
          <div className="enterprise-roles-filter"><p>{roleFilter === 'todos' ? 'Todos los integrantes' : `Área: ${roleFilter}`} · {filtered.length} resultados</p>
            {(search || roleFilter !== 'todos') && <button type="button" className="enterprise-action" onClick={() => { setSearch(''); setRoleFilter('todos'); }}>Limpiar filtros</button>}
          </div>
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 moon-panel-muted" strokeWidth={1.5} />
            <input
              type="text"
              placeholder="Buscar por nombre, email o rol..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-2xl text-sm font-light moon-panel-ink placeholder-zinc-600 outline-none"
              style={{ background: 'var(--moon-surface)', border: '1px solid var(--moon-line)' }}
            />
          </div>

          {/* Tabla */}
          <div className="enterprise-role-directory rounded-2xl" style={{ border: '1px solid var(--moon-line)' }}>
            {loading ? (
              <div className="py-16 flex items-center justify-center">
                <div className="w-6 h-6 border moon-panel-border border-t-zinc-400 rounded-full animate-spin" />
              </div>
            ) : loadError ? (
              <div className="py-16 text-center">
                <AlertCircle className="w-8 h-8 mx-auto mb-3" style={{ color: panelInk('#f87171') }} strokeWidth={1} />
                <p className="text-sm font-light" style={{ color: panelInk('#f87171') }}>{loadError}</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center">
                <Users className="w-8 h-8 moon-panel-muted mx-auto mb-3" strokeWidth={1} />
                <p className="moon-panel-muted text-sm font-light">No se encontraron usuarios</p>
              </div>
            ) : (
              <div className="enterprise-role-directory__scroll divide-y divide-zinc-900/60" role="region" aria-label="Directorio de roles, desplazable horizontalmente" tabIndex={0}>
                {/* Header */}
                <div className="grid grid-cols-12 gap-4 px-5 py-3"
                  style={{ background: 'var(--moon-surface)', borderRadius: '16px 16px 0 0' }}>
                  <span className="col-span-5 moon-panel-muted text-xs font-light uppercase tracking-wider">Usuario</span>
                  <span className="col-span-4 moon-panel-muted text-xs font-light uppercase tracking-wider">Rol actual</span>
                  <span className="col-span-3 moon-panel-muted text-xs font-light uppercase tracking-wider">Cambiar rol</span>
                </div>

                {filtered.map(user => {
                  const meta    = ROLE_META[user.role] ?? ROLE_META.Empleado;
                  const isSelf  = user.uid === userProfile?.uid;
                  const isBusy  = saving === user.uid;
                  const isOpen  = openDropdown === user.uid;

                  return (
                    <div data-moon-reveal="row" key={user.uid}
                      className="grid grid-cols-12 gap-4 px-5 py-4 items-center moon-panel-hover transition-colors">
                      {/* Avatar + nombre */}
                      <div className="col-span-5 flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl overflow-hidden moon-panel-raised border moon-panel-border flex items-center justify-center flex-shrink-0">
                          {user.avatar ? (
                            <img src={user.avatar} alt={user.displayName} className="w-full h-full object-cover" />
                          ) : (
                            <span className="moon-panel-ink text-xs font-light">
                              {(user.displayName || user.email || 'U').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="moon-panel-ink text-sm font-light truncate">
                            {user.displayName || user.email || 'Sin nombre'}
                            {isSelf && <span className="ml-2 moon-panel-muted text-xs">(tú)</span>}
                          </p>
                          <p className="moon-panel-muted text-xs font-light truncate">{user.email}</p>
                          <p className="moon-panel-muted text-[11px] font-light truncate" title={`UID: ${user.uid}`}>ID {codigoEmpleado(user.uid)}</p>
                        </div>
                      </div>

                      {/* Rol actual badge */}
                      <div className="col-span-4">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-light"
                          style={{ color: panelInk(meta.color), background: meta.bg }}>
                          <Shield className="w-3 h-3" strokeWidth={1.5} />
                          {user.role}
                        </span>
                      </div>

                      {/* Dropdown para cambiar rol */}
                      <div className="col-span-3 relative">
                        {isSelf || user.role === 'CEO' || !isCEO ? (
                          <span className="moon-panel-muted text-xs font-light"
                            title={!isCEO && !isSelf && user.role !== 'CEO' ? 'Solo el CEO puede cambiar roles' : undefined}>—</span>
                        ) : (
                          <>
                            <button
                              ref={el => { buttonRefs.current[user.uid] = el; }}
                              onClick={() => {
                                if (isOpen) {
                                  setOpenDropdown(null);
                                  setDropdownPos(null);
                                } else {
                                  const btn = buttonRefs.current[user.uid];
                                  if (btn) {
                                    const rect = btn.getBoundingClientRect();
                                    setDropdownPos({
                                      top:   rect.bottom + 6,
                                      right: window.innerWidth - rect.right,
                                    });
                                  }
                                  setOpenDropdown(user.uid);
                                }
                              }}
                              disabled={isBusy}
                              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-light transition-all"
                              style={{
                                background: 'var(--moon-surface-raised)',
                                border: '1px solid var(--moon-line)',
                                color: 'var(--moon-muted)',
                                cursor: isBusy ? 'not-allowed' : 'pointer',
                              }}>
                              {isBusy ? (
                                <div className="w-3 h-3 border moon-panel-border border-t-zinc-300 rounded-full animate-spin" />
                              ) : (
                                <>Cambiar <ChevronDown className="w-3 h-3" strokeWidth={1.5} /></>
                              )}
                            </button>

                            {isOpen && dropdownPos && createPortal(
                              <>
                                <div className="fixed inset-0" style={{ zIndex: 9998 }}
                                  onClick={() => { setOpenDropdown(null); setDropdownPos(null); }} />
                                <div className="fixed rounded-2xl overflow-hidden shadow-2xl"
                                  style={{
                                    top:         dropdownPos.top,
                                    right:        dropdownPos.right,
                                    zIndex:       9999,
                                    width:        '192px',
                                    background: 'var(--moon-surface)',
                                    border: '1px solid var(--moon-line)',
                                    boxShadow:    '0 24px 60px rgba(0,0,0,0.8)',
                                  }}>
                                  {ALL_ROLES.filter(r => r !== 'CEO' && r !== user.role).map(role => {
                                    const m = ROLE_META[role];
                                    return (
                                      <button key={role}
                                        onClick={() => { handleRoleChange(user.uid, role); setDropdownPos(null); }}
                                        className="w-full flex items-center gap-2.5 px-4 py-3 text-left text-sm font-light moon-panel-hover transition-colors"
                                        style={{ color: panelInk(m.color) }}>
                                        <Shield className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={1.5} />
                                        {role}
                                      </button>
                                    );
                                  })}
                                </div>
                              </>,
                              document.body
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════ TAB: PERMISOS ════ */}
      {activeTab === 'permisos' && (
        <div className="enterprise-permissions rounded-2xl overflow-hidden" style={{ border: '1px solid var(--moon-line)' }}>
          <div className="enterprise-permissions__scroll" role="region" aria-label="Matriz de permisos por rol, desplazable horizontalmente" tabIndex={0}>
            <table className="w-full text-sm">
              <thead>
                <tr data-moon-reveal="row" style={{ background: 'var(--moon-surface)', borderBottom: '1px solid var(--moon-line)' }}>
                  <th className="text-left px-5 py-3 moon-panel-muted text-xs font-light uppercase tracking-wider">
                    Permiso / Rol
                  </th>
                  {ALL_ROLES.map(role => {
                    const meta = ROLE_META[role];
                    return (
                      <th key={role} className="px-4 py-3 text-center">
                        <span className="text-xs font-light" style={{ color: panelInk(meta.color) }}>{role}</span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-900/50">
                {(Object.keys(PERMISSION_LABELS) as Permission[]).map(perm => (
                  <tr data-moon-reveal="row" key={perm} className="moon-panel-hover transition-colors">
                    <td className="px-5 py-3.5 moon-panel-muted text-sm font-light">
                      {PERMISSION_LABELS[perm]}
                    </td>
                    {ALL_ROLES.map(role => {
                      const has = permisosDeRol(role, accesoAdmin).includes(perm);
                      return (
                        <td key={role} className="px-4 py-3.5 text-center">
                          {has ? (
                            <Check className="w-4 h-4 moon-panel-tone-green mx-auto" strokeWidth={2} />
                          ) : (
                            <span className="w-4 h-4 mx-auto block text-center moon-panel-muted">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Leyenda */}
          <div className="px-5 py-4 border-t moon-panel-border flex flex-wrap gap-3">
            {ALL_ROLES.map(role => {
              const meta = ROLE_META[role];
              return (
                <div key={role} className="flex items-start gap-2">
                  <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: meta.color }} />
                  <div>
                    <span className="text-xs font-light" style={{ color: panelInk(meta.color) }}>{role}</span>
                    <span className="moon-panel-muted text-xs ml-1 hidden sm:inline">— {meta.description}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
