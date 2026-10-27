import { panelInk } from '@/lib/panelColors';
import React, { useState, useEffect } from 'react';
import { createUserWithRole, db, logActivity } from '@/lib/firebase';
import { deleteAuthUser } from '@/services/discordApi';
import { collection, onSnapshot, updateDoc, doc, deleteDoc } from 'firebase/firestore';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Edit2, User, Crown, Shield, Briefcase, Calculator, Palette, ClipboardList, Code2, Search, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { esRolDelEquipo, type UserProfile, type UserRole } from '@/types';
import { EnterpriseFocus } from '@/components/EnterpriseFocus';
import { downloadDirectory } from '@/lib/directoryExport';
import { Download, LayoutGrid, List } from 'lucide-react';

// ─── Usuarios del portal ─────────────────────────────────────────────────────
// Reglas de Firestore (users): cualquiera con sesión lista; solo el CEO cambia
// roles y borra cuentas. Por eso, sin ser CEO, acá solo se edita el nombre.

const bd = 'var(--moon-line)';
const sf = 'var(--moon-surface)';
const tx = 'var(--moon-ink)';
const mt = 'var(--moon-muted)';

const ROLES: UserRole[] = ['CEO', 'Administración', 'Empleado', 'Contador', 'Diseño', 'Secretaría', 'Programación'];

const ROLE_CONFIG: Record<UserRole, { color: string; icon: React.ComponentType<{ className?: string; strokeWidth?: number }> }> = {
  CEO:            { color: '#c084fc', icon: Crown         },
  Administración: { color: '#60a5fa', icon: Shield        },
  Empleado:       { color: '#94a3b8', icon: Briefcase     },
  Contador:       { color: '#34d399', icon: Calculator    },
  Diseño:         { color: '#a78bfa', icon: Palette       },
  Secretaría:     { color: '#4ade80', icon: ClipboardList },
  Programación:   { color: '#f472b6', icon: Code2         },
};

// Las mismas reglas que el Panel CEO.
const REGLAS_CLAVE = [
  { label: 'Mínimo 8 caracteres',   test: (p: string) => p.length >= 8 },
  { label: 'Al menos una mayúscula', test: (p: string) => /[A-Z]/.test(p) },
  { label: 'Al menos un número',     test: (p: string) => /\d/.test(p) },
];

type Form = { email: string; password: string; displayName: string; role: UserRole };
const FORM_VACIO: Form = { email: '', password: '', displayName: '', role: 'Empleado' };

const errorDe = (err: unknown) => ({
  code: (err as { code?: string } | null)?.code,
  msg: (err as Error | null)?.message ?? String(err),
});

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="space-y-1.5">
    <label className="text-[10px] uppercase tracking-widest font-light" style={{ color: panelInk(mt) }}>{label}</label>
    {children}
  </div>
);

const Entrada: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
  <input
    {...props}
    className="w-full px-3.5 py-2.5 rounded-xl text-sm font-light outline-none transition-all focus:border-white/20"
    style={{ background: 'var(--moon-surface-raised)', border: `1px solid ${bd}`, color: panelInk(tx) }}
  />
);

// Fuera del componente principal: antes se declaraba adentro y React lo
// volvía a montar en cada tecla, así que los campos perdían el foco.
const FormDialog: React.FC<{
  open: boolean; onClose: () => void; onSubmit: (e: React.FormEvent) => void;
  title: string; isEdit: boolean; form: Form; setForm: React.Dispatch<React.SetStateAction<Form>>;
  puedeCambiarRol: boolean; rolesAsignables: UserRole[]; error: string; guardando: boolean;
}> = ({ open, onClose, onSubmit, title, isEdit, form, setForm, puedeCambiarRol, rolesAsignables, error, guardando }) => (
  <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
    <DialogContent style={{ background: 'var(--moon-surface, hsl(var(--card)))', border: `1px solid ${bd}`, borderRadius: '20px', maxWidth: '420px' }}>
      <DialogHeader>
        <DialogTitle className="font-light text-base" style={{ color: panelInk(tx) }}>{title}</DialogTitle>
      </DialogHeader>
      <form onSubmit={onSubmit} className="space-y-4 mt-2">
        <Field label="Nombre completo">
          <Entrada value={form.displayName} onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} required placeholder="Juan García" />
        </Field>
        {!isEdit && (
          <>
            <Field label="Correo electrónico">
              <Entrada type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required placeholder="juan@moon.com" />
            </Field>
            <Field label="Contraseña">
              <Entrada type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required placeholder="••••••••" />
              <ul className="mt-1.5 space-y-0.5">
                {REGLAS_CLAVE.map(r => (
                  <li key={r.label} className="text-[11px] font-light" style={{ color: panelInk(r.test(form.password) ? '#4ade80' : mt) }}>
                    {r.test(form.password) ? '✓' : '·'} {r.label}
                  </li>
                ))}
              </ul>
            </Field>
          </>
        )}
        <Field label="Rol">
          <Select value={form.role} onValueChange={(v: UserRole) => setForm(f => ({ ...f, role: v }))} disabled={!puedeCambiarRol}>
            <SelectTrigger className="rounded-xl font-light" style={{ background: 'var(--moon-surface-raised)', border: `1px solid ${bd}`, color: panelInk(tx) }}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent style={{ background: 'var(--moon-surface, hsl(var(--card)))', border: `1px solid ${bd}`, borderRadius: '14px' }}>
              {rolesAsignables.map(r => (
                <SelectItem key={r} value={r} className="font-light">{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!puedeCambiarRol && <p className="text-[11px] font-light mt-1" style={{ color: panelInk(mt) }}>Solo el CEO puede cambiar roles.</p>}
        </Field>
        {error && <p className="moon-panel-tone-red text-xs font-light">{error}</p>}
        <button type="submit" disabled={guardando}
          className="moon-panel-primary w-full py-2.5 rounded-xl text-sm font-light transition-all hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
          style={{ background: 'var(--moon-accent)', color: 'var(--moon-accent-ink)' }}>
          {guardando && <Loader2 className="w-4 h-4 animate-spin" />}
          {isEdit ? 'Guardar cambios' : 'Crear usuario'}
        </button>
      </form>
    </DialogContent>
  </Dialog>
);

const Users: React.FC = () => {
  const { currentUser, userProfile, isCEO } = useAuth();
  const [users,       setUsers]       = useState<UserProfile[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [loadError,   setLoadError]   = useState<string | null>(null);
  const [createOpen,  setCreateOpen]  = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [error,       setError]       = useState('');
  const [guardando,   setGuardando]   = useState(false);
  const [borrando,    setBorrando]    = useState<string | null>(null);
  const [busqueda,    setBusqueda]    = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'todos'>('todos');
  const [sortBy, setSortBy] = useState<'nombre' | 'rol'>('nombre');
  const [view, setView] = useState<'lista' | 'tarjetas'>('tarjetas');
  const [form,        setForm]        = useState<Form>(FORM_VACIO);

  // En vivo: lo que cambie el Panel CEO (o Gestión Roles) se ve acá al instante.
  useEffect(() => onSnapshot(
    collection(db, 'users'),
    snap => {
      // Solo el equipo: las cuentas de clientes (rol `client`) son otro sistema.
      const lista = snap.docs.filter(d => esRolDelEquipo(d.data().role)).map(d => ({ uid: d.id, ...d.data(), createdAt: d.data().createdAt?.toDate?.() })) as UserProfile[];
      lista.sort((a, b) => (a.displayName ?? '').localeCompare(b.displayName ?? ''));
      setUsers(lista); setLoadError(null); setLoading(false);
    },
    err => { setLoadError(err.message); setLoading(false); },
  ), []);

  const cerrar = () => { setCreateOpen(false); setEditingUser(null); setForm(FORM_VACIO); setError(''); };
  const yo = currentUser?.uid;
  const autor = userProfile?.displayName || 'Usuario';
  // Nadie puede crear otro CEO desde acá, igual que en Gestión Roles.
  const rolesAsignables = ROLES.filter(r => r !== 'CEO' || form.role === 'CEO');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const falta = REGLAS_CLAVE.find(r => !r.test(form.password));
    if (falta) { setError(`La contraseña necesita: ${falta.label.toLowerCase()}.`); return; }
    if (!isCEO && form.role !== 'Empleado') { setError('Solo el CEO puede crear cuentas con un rol distinto de Empleado.'); return; }
    setGuardando(true);
    try {
      // Con una app secundaria de Firebase: registerUser() iniciaba sesión como
      // el usuario nuevo y sacaba al CEO de su propia sesión.
      await createUserWithRole(form.email.trim(), form.password, form.displayName.trim(), form.role);
      await logActivity('USER_CREATED', { email: form.email, displayName: form.displayName, role: form.role }, yo ?? '', autor).catch(() => {});
      toast.success(`Cuenta creada para ${form.displayName}`);
      cerrar();
    } catch (err) {
      const e = errorDe(err);
      setError(e.code === 'auth/email-already-in-use' ? 'Ese correo ya tiene una cuenta.' : `No se pudo crear: ${e.msg}`);
    } finally { setGuardando(false); }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setGuardando(true); setError('');
    try {
      const cambios: Record<string, unknown> = { displayName: form.displayName.trim() };
      if (isCEO && form.role !== editingUser.role) cambios.role = form.role;
      await updateDoc(doc(db, 'users', editingUser.uid), cambios);
      if (cambios.role) await logActivity('ROLE_CHANGED', { userId: editingUser.uid, newRole: form.role }, yo ?? '', autor).catch(() => {});
      toast.success('Usuario actualizado');
      cerrar();
    } catch (err) {
      const e = errorDe(err);
      setError(e.code === 'permission-denied' ? 'No tienes permiso para editar a este usuario.' : `No se pudo guardar: ${e.msg}`);
    } finally { setGuardando(false); }
  };

  const handleDelete = async (u: UserProfile) => {
    if (!confirm(`¿Eliminar la cuenta de ${u.displayName}? Se borra su acceso y su perfil.`)) return;
    setBorrando(u.uid);
    try {
      // Primero la cuenta de acceso (por la API): si eso falla no se toca el
      // perfil, para no dejar una cuenta que entra pero no tiene datos.
      await deleteAuthUser(u.uid);
      await deleteDoc(doc(db, 'users', u.uid));
      await logActivity('USER_DELETED', { userId: u.uid, userName: u.displayName }, yo ?? '', autor).catch(() => {});
      toast.success(`Cuenta de ${u.displayName} eliminada`);
    } catch (err) {
      toast.error(`No se pudo eliminar: ${errorDe(err).msg}`);
    } finally { setBorrando(null); }
  };

  const startEdit = (u: UserProfile) => {
    setEditingUser(u);
    setForm({ email: u.email, password: '', displayName: u.displayName, role: u.role });
  };

  const q = busqueda.trim().toLowerCase();
  const visibles = users.filter(u => (roleFilter === 'todos' || u.role === roleFilter)
    && (!q || `${u.displayName} ${u.email} ${u.role}`.toLowerCase().includes(q)))
    .sort((a, b) => sortBy === 'rol'
      ? a.role.localeCompare(b.role, 'es') || (a.displayName || '').localeCompare(b.displayName || '', 'es')
      : (a.displayName || '').localeCompare(b.displayName || '', 'es'));

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-7 h-7 border moon-panel-border border-t-zinc-300 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="moon-module moon-module--users space-y-6">
      <EnterpriseFocus eyebrow="Equipo · Directorio" title="Las personas detrás de Moon."
        description="Encuentra a cada integrante, consulta su área y administra sus accesos desde un solo lugar."
        metrics={[
          { label: 'Integrantes', value: users.length, detail: 'Cuentas registradas' },
          { label: 'Áreas con equipo', value: new Set(users.map(u => u.role)).size, detail: 'Roles representados' },
          { label: 'En esta vista', value: visibles.length, detail: roleFilter === 'todos' ? 'Todos los roles' : roleFilter },
        ]}>
        <button type="button" className="enterprise-action enterprise-action--primary" onClick={() => { setForm(FORM_VACIO); setCreateOpen(true); }}><Plus />Nuevo usuario</button>
      </EnterpriseFocus>

      <div className="enterprise-toolbar" aria-label="Opciones del directorio">
        <div className="enterprise-toolbar__search">
          <Search aria-hidden="true" />
          <input aria-label="Buscar en el directorio" value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Nombre, correo o área del integrante" />
        </div>
        <select aria-label="Filtrar usuarios por rol" value={roleFilter} onChange={e => setRoleFilter(e.target.value as UserRole | 'todos')}>
          <option value="todos">Todos los roles</option>
          {ROLES.map(role => <option key={role} value={role}>{role}</option>)}
        </select>
        <select aria-label="Ordenar usuarios" value={sortBy} onChange={e => setSortBy(e.target.value as 'nombre' | 'rol')}>
          <option value="nombre">Nombre: A → Z</option><option value="rol">Agrupar por rol</option>
        </select>
        <div className="enterprise-view-toggle" role="group" aria-label="Vista del directorio">
          <button type="button" title="Tarjetas" aria-label="Ver tarjetas de usuarios" aria-pressed={view === 'tarjetas'} onClick={() => setView('tarjetas')}><LayoutGrid className="w-4 h-4" /></button>
          <button type="button" title="Lista" aria-label="Ver lista de usuarios" aria-pressed={view === 'lista'} onClick={() => setView('lista')}><List className="w-4 h-4" /></button>
        </div>
        {isCEO && <button type="button" className="enterprise-action" disabled={!visibles.length || !!loadError} onClick={() => downloadDirectory(visibles)}><Download />Exportar vista</button>}
        {(q || roleFilter !== 'todos') && <button type="button" className="enterprise-action" onClick={() => { setBusqueda(''); setRoleFilter('todos'); }}>Limpiar filtros</button>}
      </div>

      {loadError && (
        <div className="flex items-center gap-2 p-3 rounded-xl text-sm font-light"
          style={{ background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.2)', color: panelInk('#f87171') }}>
          <AlertCircle className="w-4 h-4 flex-shrink-0" strokeWidth={1.5} /> No se pudo cargar la lista: {loadError}
        </div>
      )}

      {visibles.length === 0 ? (
        <div data-moon-reveal="card" className="moon-panel flex flex-col items-center justify-center py-16 rounded-2xl border-2 border-dashed" style={{ borderColor: bd }}>
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3" style={{ background: 'var(--moon-surface-raised)', border: `1px solid ${bd}` }}>
            <User className="w-5 h-5" style={{ color: panelInk(mt) }} strokeWidth={1} />
          </div>
          <p className="text-sm font-light" style={{ color: panelInk(mt) }}>{q || roleFilter !== 'todos' ? 'Nadie coincide con estos filtros' : 'No hay usuarios registrados'}</p>
        </div>
      ) : (
        <div className={view === 'tarjetas' ? 'enterprise-user-grid' : 'moon-panel rounded-2xl overflow-hidden border'} style={view === 'lista' ? { background: sf, borderColor: bd } : undefined}>
          {visibles.map(u => {
            const rc = ROLE_CONFIG[u.role] ?? ROLE_CONFIG.Empleado;
            const RIcon = rc.icon;
            const initials = u.displayName?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() ?? '?';
            const soyYo = u.uid === yo;
            // Solo el CEO borra (reglas de Firestore), y nunca a sí mismo ni a otro CEO.
            const puedeBorrar = isCEO && !soyYo && u.role !== 'CEO';
            const puedeEditar = isCEO ? u.role !== 'CEO' || soyYo : soyYo;
            return (
              <div data-moon-reveal="row" key={u.uid} className="flex items-center justify-between p-4 gap-4 border-b last:border-b-0 transition-colors hover:bg-white/[0.02]" style={{ borderColor: bd }}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl flex-shrink-0 overflow-hidden flex items-center justify-center" style={{ background: 'var(--moon-surface-raised)', border: `1px solid ${bd}` }}>
                    {u.avatar ? <img src={u.avatar} alt={u.displayName} className="w-full h-full object-cover" /> : <span className="text-xs font-light" style={{ color: panelInk(tx) }}>{initials}</span>}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-light truncate" style={{ color: panelInk(tx) }}>{u.displayName}{soyYo && <span className="ml-2 text-[10px]" style={{ color: panelInk(mt) }}>(tú)</span>}</p>
                    <p className="text-xs font-light truncate" style={{ color: panelInk(mt) }}>{u.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-light px-2.5 py-1 rounded-full"
                    style={{ color: panelInk(rc.color), background: `${rc.color}1a` }}>
                    <RIcon className="w-3 h-3" strokeWidth={1.5} /> {u.role}
                  </span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => startEdit(u)} disabled={!puedeEditar} title={puedeEditar ? 'Editar' : 'No puedes editar a este usuario'}
                      className="w-8 h-8 rounded-xl flex items-center justify-center transition-all hover:bg-white/[0.06] disabled:opacity-30 disabled:pointer-events-none" style={{ color: panelInk(mt) }}>
                      <Edit2 className="w-3.5 h-3.5" strokeWidth={1.5} />
                    </button>
                    <button onClick={() => handleDelete(u)} disabled={!puedeBorrar || borrando === u.uid} title={puedeBorrar ? 'Eliminar' : 'No puedes eliminar a este usuario'}
                      className="w-8 h-8 rounded-xl flex items-center justify-center transition-all hover:bg-red-500/10 hover:text-red-400 disabled:opacity-30 disabled:pointer-events-none" style={{ color: panelInk(mt) }}>
                      {borrando === u.uid ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <FormDialog open={createOpen} onClose={cerrar} onSubmit={handleCreate} title="Crear usuario" isEdit={false}
        form={form} setForm={setForm} puedeCambiarRol={isCEO} rolesAsignables={rolesAsignables} error={error} guardando={guardando} />
      <FormDialog open={!!editingUser} onClose={cerrar} onSubmit={handleUpdate} title="Editar usuario" isEdit
        form={form} setForm={setForm} puedeCambiarRol={isCEO && editingUser?.uid !== yo} rolesAsignables={rolesAsignables} error={error} guardando={guardando} />
    </div>
  );
};

export default Users;
