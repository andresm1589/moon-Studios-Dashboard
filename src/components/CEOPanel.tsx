import { panelInk } from '@/lib/panelColors';
import { EnterpriseFocus } from '@/components/EnterpriseFocus';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useSettings } from '@/contexts/SettingsContext';
import EmployeeProfileModal   from '@/components/EmployeeProfileModal';
import EmployeeCredentialModal from '@/components/EmployeeCredentialModal';
import BarcodeScannerModal    from '@/components/BarcodeScannerModal';
import EmployeeContractModal  from '@/components/EmployeeContractModal';
import GestorTareas            from '@/components/tareas/GestorTareas';
import { 
  subscribeToUsers, subscribeToTasks,
  logActivity, updateUserProfile,
  deleteUserData, createUserWithRole
} from '@/lib/firebase';
import { toast } from 'sonner';
import { supabase, REPORTS_BUCKET } from '@/lib/supabaseclient';
import { collection, getDocs, query, orderBy, onSnapshot, doc, deleteDoc, writeBatch, addDoc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { 
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogDescription, DialogFooter 
} from '@/components/ui/dialog';
import { 
  Users, CheckSquare, Trash2, Plus, UserPlus,
  RefreshCw, Search, Mail, User, Shield, Eye, EyeOff,
  CheckCircle, AlertCircle, Lock, Calendar,
  ChevronRight,
  FileText, Download, File, XCircle, Filter, Clock, 
  CheckCheck, QrCode, ScanLine, Image as ImageIcon, 
  ChevronLeft, MonitorPlay,
  Play, Pause, ZoomIn, ZoomOut, Maximize2,
  ChevronUp, ChevronDown, X, Info, Link,
  TrendingUp, Activity, ArrowUpRight,
} from 'lucide-react';
import type { UserProfile, UserRole } from '@/types';
import { Timestamp } from '@/lib/firebase';
import { deleteAuthUser } from '@/services/discordApi';

/* ─── ESTILOS GLOBALES ─── */
const cardBg       = 'var(--moon-surface, #111111)';
const borderColor  = 'var(--moon-line, #27272a)';
const textPrimary  = 'var(--moon-ink, #fafafa)';
const textMuted    = 'var(--moon-muted, #a1a1aa)';
const surfaceHover = 'var(--moon-surface-raised, #1f1f23)';
const surfaceSubtle= 'var(--surface-subtle, #0c0c0e)';

/* ─── TIPOS ─── */
interface NewUserForm {
  email: string;
  password: string;
  confirmPassword: string;
  displayName: string;
  role: UserRole;
}

interface FormError {
  field: string;
  message: string;
}


interface TaskReport {
  id: string;
  taskId: string;
  taskTitle: string;
  userId: string;
  userName: string;
  userRole: string;
  status: 'completed' | 'in-progress' | 'not-completed';
  comment: string;
  reason?: string;
  files: { url: string; name: string; type: string; size?: number }[];
  createdAt: any;
  reportPath?: string;
}

interface Banner {
  id: string;
  url: string;
  titulo: string;
  descripcion?: string;
  creadoEn: any;
}

// El Panel CEO guarda el orden de los banners en `orden`; los que no lo tienen
// (anteriores a eso) van al final, del más nuevo al más viejo.
const ordenarBanners = <T extends { orden?: number; creadoEn?: { toMillis?: () => number } }>(lista: T[]): T[] =>
  [...lista].sort((a, b) => {
    const oa = typeof a.orden === 'number' ? a.orden : Number.MAX_SAFE_INTEGER;
    const ob = typeof b.orden === 'number' ? b.orden : Number.MAX_SAFE_INTEGER;
    if (oa !== ob) return oa - ob;
    return (b.creadoEn?.toMillis?.() ?? 0) - (a.creadoEn?.toMillis?.() ?? 0);
  });

// Un documento de taskReports con la forma que usa este panel. Incluye el
// motivo (reason) de "no completado", que antes se perdía al leerlo.
function aReporte(id: string, data: Record<string, unknown>): TaskReport {
  const adj = Array.isArray(data.attachments) ? data.attachments as { url?: string; name?: string; type?: string; size?: number }[] : [];
  return {
    id, taskId: String(data.taskId || ''), taskTitle: String(data.taskTitle || ''),
    userId: String(data.reportedBy || ''), userName: String(data.reporterName || ''),
    userRole: String(data.reporterRole || ''), status: (data.reportStatus as TaskReport['status']) || 'in-progress',
    comment: String(data.comment || ''), reason: data.reason ? String(data.reason) : undefined,
    files: adj.map(a => ({ url: a.url || '', name: a.name || 'archivo', type: a.type || 'application/octet-stream', size: a.size || 0 })),
    createdAt: data.createdAt,
    reportPath: `${data.taskId}/${data.reportedBy}`,
  };
}

/* ─── CONSTANTES ─── */
const passwordRules = [
  { id: 'length',  label: 'Mínimo 8 caracteres',   test: (p: string) => p.length >= 8 },
  { id: 'upper',   label: 'Al menos una mayúscula', test: (p: string) => /[A-Z]/.test(p) },
  { id: 'number',  label: 'Al menos un número',     test: (p: string) => /\d/.test(p) },
];

const ROLE_PALETTE = [
  { color: 'moon-panel-tone-purple', bg: 'moon-panel-fill-purple', border: 'border-purple-800/60' },
  { color: 'moon-panel-tone-blue',   bg: 'moon-panel-fill-blue',   border: 'border-blue-800/60'   },
  { color: 'moon-panel-muted',   bg: 'moon-panel-raised',   border: 'moon-panel-border'   },
  { color: 'moon-panel-tone-green',bg: 'moon-panel-fill-green',border: 'border-emerald-800/60'},
  { color: 'moon-panel-tone-amber', bg: 'moon-panel-fill-amber', border: 'border-yellow-800/60' },
  { color: 'moon-panel-tone-pink',   bg: 'moon-panel-fill-pink',   border: 'border-pink-800/60'   },
  { color: 'moon-panel-tone-orange', bg: 'moon-panel-fill-orange', border: 'border-orange-800/60' },
];

const FIXED_ROLES: UserRole[] = ['CEO', 'Administración', 'Empleado', 'Contador', 'Diseño', 'Secretaría', 'Programación'];

const REPORT_STATUS_CONFIG = {
  completed:       { label: 'Completada',    color: 'moon-panel-tone-green', bg: 'moon-panel-fill-green', border: 'border-emerald-800/60', icon: CheckCheck,  accent: '#34d399' },
  'in-progress':   { label: 'En Desarrollo', color: 'moon-panel-tone-blue',    bg: 'moon-panel-fill-blue',    border: 'border-blue-800/60',    icon: Clock,       accent: '#60a5fa' },
  'not-completed': { label: 'No Completada', color: 'moon-panel-tone-red',     bg: 'moon-panel-fill-red',     border: 'border-red-800/60',     icon: XCircle,     accent: '#f87171' },
};

const ALL_ROLES_LIST: UserRole[] = ['CEO','Administración','Diseño','Secretaría','Programación','Contador','Empleado'];
// Roles que el CEO puede asignar: el de CEO no se reparte desde el panel
// (igual que en Gestión de Roles).
const ASSIGNABLE_ROLES: UserRole[] = ALL_ROLES_LIST.filter(r => r !== 'CEO');

// Firebase y la API del bot lanzan objetos con code/message; se leen sin `any`.
const infoError = (e: unknown) => (e ?? {}) as { code?: string; message?: string };

// Si el bot dice que la cuenta de Auth ya no existe, el perfil igual se puede borrar.
// Sin "404" a secas: si la ruta no existe en el bot también daría 404 y se
// volvería a borrar el perfil dejando vivo el login.
const esUsuarioInexistente = (msg: string) => /user-not-found|usuario no existe|no existe el usuario/i.test(msg);

const getRoleConfig = (role: string, allRoles: string[]) => {
  const idx = allRoles.indexOf(role);
  return { label: role, ...ROLE_PALETTE[idx % ROLE_PALETTE.length] };
};

/* ─── PASSWORD STRENGTH ─── */
const PasswordStrength: React.FC<{ password: string }> = ({ password }) => {
  if (!password) return null;
  const passed = passwordRules.filter(r => r.test(password)).length;
  const colors = ['bg-red-500', 'bg-amber-500', 'bg-emerald-500'];
  const labels = ['Débil', 'Regular', 'Fuerte'];
  return (
    <div className="space-y-2 mt-2">
      <div className="flex gap-1.5">
        {[0, 1, 2].map(i => (
          <div key={i} className={`h-0.5 flex-1 rounded-full transition-all duration-500 ${i < passed ? colors[passed - 1] : 'bg-[var(--moon-line)]'}`} />
        ))}
      </div>
      {passed > 0 && (
        <p className={`text-xs font-extralight ${passed === 3 ? 'moon-panel-tone-green' : passed === 2 ? 'moon-panel-tone-amber' : 'moon-panel-tone-red'}`}>
          {labels[passed - 1]}
        </p>
      )}
      <div className="space-y-1">
        {passwordRules.map(rule => (
          <div key={rule.id} className={`flex items-center gap-1.5 text-xs font-extralight transition-colors duration-200 ${rule.test(password) ? 'moon-panel-tone-green' : 'text-[color:var(--moon-muted)]'}`}>
            <CheckCircle className="w-3 h-3" />{rule.label}
          </div>
        ))}
      </div>
    </div>
  );
};

/* ─── STAT CARD ─── */
const StatCard: React.FC<{
  label: string; value: string | number; icon: React.FC<any>;
  accent: string; trend?: string; delay?: number;
}> = ({ label, value, icon: Icon, accent, trend, delay = 0 }) => (
  <div data-moon-reveal="metric"
    className="ceo-stat-glow ceo-count-pop relative overflow-hidden rounded-2xl border p-4 sm:p-5"
    style={{
      background: 'var(--moon-surface, var(--surface-subtle))',
      borderColor: `${accent}25`,
      animationDelay: `${delay}ms`,
    }}
  >
    <div className="absolute inset-0 opacity-5" style={{ background: `radial-gradient(circle at 80% 20%, ${accent}, transparent 60%)` }} />
    <div className="flex items-start justify-between">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] sm:text-xs font-extralight uppercase tracking-widest mb-1.5 sm:mb-2 truncate" style={{ color: panelInk(accent) }}>
          {label}
        </p>
        <p className="text-2xl sm:text-3xl font-extralight" style={{ color: 'var(--moon-ink)' }}>{value}</p>
        {trend && (
          <p className="text-[10px] sm:text-xs font-extralight mt-1 sm:mt-1.5 flex items-center gap-1" style={{ color: 'var(--moon-muted)' }}>
            <ArrowUpRight className="w-3 h-3 flex-shrink-0" style={{ color: panelInk(accent) }} />
            <span className="truncate">{trend}</span>
          </p>
        )}
      </div>
      <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0 ml-2"
        style={{ background: `${accent}15`, border: `1px solid ${accent}25` }}>
        <Icon className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: panelInk(accent) }} />
      </div>
    </div>
  </div>
);

/* ─── COMPONENTE PRINCIPAL ─── */
const CEOPanel: React.FC = () => {
  const { userProfile } = useAuth();
  const { settings } = useSettings();
  const accent = settings?.accentColor || '#6366f1';





  /* ── Estado ── */
  // Desde el Calendario ("Crear tarea este día") llega la fecha de la tarea nueva.
  const location = useLocation();
  const fechaNuevaTarea = (location.state as { nuevaTarea?: string } | null)?.nuevaTarea;
  const [workspaceTab, setWorkspaceTab] = useState(fechaNuevaTarea ? 'tasks' : 'employees');
  useEffect(() => { if (fechaNuevaTarea) setWorkspaceTab('tasks'); }, [fechaNuevaTarea]);
  const [users,           setUsers]           = useState<UserProfile[]>([]);
  const [tasks,           setTasks]           = useState<any[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [searchUser,      setSearchUser]      = useState('');
  const [showAddUser,     setShowAddUser]      = useState(false);
  const [isCreatingUser,  setIsCreatingUser]   = useState(false);
  const [isDeletingUser,  setIsDeletingUser]   = useState<string | null>(null);
  const [mounted,         setMounted]          = useState(false);
  const [showPassword,    setShowPassword]     = useState(false);
  const [showConfirm,     setShowConfirm]      = useState(false);
  const [createSuccess,   setCreateSuccess]    = useState<string | null>(null);
  const [formErrors,      setFormErrors]       = useState<FormError[]>([]);
  const [profileUser,     setProfileUser]      = useState<UserProfile | null>(null);
  const [showProfile,     setShowProfile]      = useState(false);
  const [credentialUser,  setCredentialUser]   = useState<UserProfile | null>(null);
  const [showCredential,  setShowCredential]   = useState(false);
  const [showScanner,     setShowScanner]      = useState(false);
  const [contractUser,    setContractUser]     = useState<UserProfile | null>(null);
  const [showContract,    setShowContract]     = useState(false);
  const [refreshing,      setRefreshing]       = useState(false);
  const [reports,         setReports]          = useState<TaskReport[]>([]);
  const [reportsLoading,  setReportsLoading]   = useState(true);
  const [reportFilter,    setReportFilter]     = useState<'all' | 'completed' | 'in-progress' | 'not-completed'>('all');
  const [reportSearch,    setReportSearch]     = useState('');
  const [selectedReport,  setSelectedReport]   = useState<TaskReport | null>(null);
  const [showReportDetail,setShowReportDetail] = useState(false);
  const [viewerFile,      setViewerFile]       = useState<{ url: string; name: string; type: string } | null>(null);
  const [showViewer,      setShowViewer]       = useState(false);
  const [newUser, setNewUser] = useState<NewUserForm>({
    email: '', password: '', confirmPassword: '', displayName: '', role: 'Empleado'
  });
  const [banners,          setBanners]          = useState<Banner[]>([]);
  const [bannerForm,       setBannerForm]       = useState({ url: '', titulo: '', descripcion: '' });
  const [showBannerModal,  setShowBannerModal]  = useState(false);
  const [savingBanner,     setSavingBanner]     = useState(false);
  const [bannerActivo,     setBannerActivo]     = useState(0);
  const [bannersLoading,   setBannersLoading]   = useState(false);
  const [bannerSettings, setBannerSettings] = useState({
    autoplay: true, interval: 5000, transition: 'fade',
    showIndicators: true, showControls: true, pauseOnHover: true, quality: 'auto',
  });
  const [zoomLevel,          setZoomLevel]          = useState(1);
  const [isDragging,         setIsDragging]         = useState(false);
  const [dragStart,          setDragStart]          = useState({ x: 0, y: 0 });
  const [imageOffset,        setImageOffset]        = useState({ x: 0, y: 0 });
  const [imageDimensions,    setImageDimensions]    = useState({ width: 0, height: 0, naturalWidth: 0, naturalHeight: 0 });
  const [lightboxOpen,       setLightboxOpen]       = useState(false);
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);
  const [isPlaying,          setIsPlaying]          = useState(true);
  const [hoveringBanner,     setHoveringBanner]     = useState(false);
  const [saveSuccessModal,   setSaveSuccessModal]   = useState(false);
  const [activeEmployeeTab,  setActiveEmployeeTab]  = useState<'list' | 'grid'>('list');
  /* ── NUEVO: modal de cambio de rol en mobile ── */
  const [roleChangeUser,     setRoleChangeUser]     = useState<UserProfile | null>(null);
  const [showRoleModal,      setShowRoleModal]      = useState(false);

  const carouselRef = useRef<NodeJS.Timeout | null>(null);
  const imageRef    = useRef<HTMLImageElement>(null);

  /* ── Derivados ── */
  const allRoles = Array.from(new Set([...FIXED_ROLES, ...users.map(u => u.role)])).filter(Boolean);

  /* ── Callbacks ── */
  // Usuarios y tareas en vivo (lo mismo que ven Usuarios, Gestión Roles, el
  // Inicio y el Calendario). `fetchData` queda para los llamados que ya había.
  const fetchData = useCallback(async () => {}, []);
  useEffect(() => {
    let pendientes = 2;
    const listo = () => { pendientes -= 1; if (pendientes <= 0) setLoading(false); };
    const u1 = subscribeToUsers(u => { setUsers(u as UserProfile[]); listo(); }, e => { console.error(e); toast.error('No se pudieron cargar los usuarios'); listo(); });
    const u2 = subscribeToTasks(t => { setTasks(t); listo(); }, e => { console.error(e); toast.error('No se pudieron cargar las tareas'); listo(); });
    return () => { u1(); u2(); };
  }, []);

  // Reportes en vivo: el CEO ve el reporte de un empleado apenas lo envía.
  // `fetchReports` queda para el botón de actualizar que ya existía.
  const fetchReports = useCallback(async () => {}, []);
  useEffect(() => onSnapshot(query(collection(db, 'taskReports'), orderBy('createdAt', 'desc')),
    snap => { setReports(snap.docs.map(d => aReporte(d.id, d.data()))); setReportsLoading(false); },
    e => { console.error('Error escuchando reportes:', e); toast.error('No se pudieron cargar los reportes'); setReportsLoading(false); }), []);

  const fetchBanners = useCallback(async () => {
    setBannersLoading(true);
    try {
      const snap = await getDocs(query(collection(db, 'dashboard_banners'), orderBy('creadoEn', 'desc')));
      // Mismo orden que el Inicio: el que se guardó con "Guardar" (campo orden).
      setBanners(ordenarBanners(snap.docs.map(d => ({ id: d.id, ...d.data() } as Banner))));
      const configSnap = await getDoc(doc(db, 'dashboard_config', 'banner_settings'));
      if (configSnap.exists()) {
        const cfg = configSnap.data();
        setBannerSettings(s => ({ ...s, interval: cfg.interval ?? s.interval, quality: cfg.quality ?? s.quality }));
        setIsPlaying(cfg.autoplay ?? true);
      }
    } catch (e) { console.error(e); toast.error('No se pudieron cargar los banners'); }
    finally { setBannersLoading(false); }
  }, []);

  /* ── Effects ── */
  useEffect(() => { setMounted(true); return () => setMounted(false); }, []);
  useEffect(() => { fetchData(); fetchReports(); fetchBanners(); }, [fetchData, fetchReports, fetchBanners]);
  useEffect(() => {
    if (!isPlaying || banners.length <= 1 || hoveringBanner) return;
    carouselRef.current = setInterval(() => setBannerActivo(p => (p + 1) % banners.length), bannerSettings.interval);
    return () => { if (carouselRef.current) clearInterval(carouselRef.current); };
  }, [isPlaying, banners.length, hoveringBanner, bannerSettings.interval]);

  /* ── Helpers ── */
  const openFileViewer = (file: { url: string; name: string; type: string }) => { setViewerFile(file); setShowViewer(true); };

  const validateForm = (): boolean => {
    const errors: FormError[] = [];
    if (!newUser.displayName.trim()) errors.push({ field: 'displayName', message: 'El nombre es obligatorio' });
    if (!newUser.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newUser.email)) errors.push({ field: 'email', message: 'Ingresa un correo válido' });
    if (!passwordRules.every(r => r.test(newUser.password))) errors.push({ field: 'password', message: 'La contraseña no cumple los requisitos' });
    if (newUser.password !== newUser.confirmPassword) errors.push({ field: 'confirmPassword', message: 'Las contraseñas no coinciden' });
    setFormErrors(errors);
    return errors.length === 0;
  };

  const getFieldError = (field: string) => formErrors.find(e => e.field === field)?.message;

  // El registro de actividad es secundario: si falla, la acción ya se hizo y no
  // debe mostrarse como error (antes "Error al eliminar tarea" con la tarea ya borrada).
  const registrar = (action: string, details: Record<string, unknown>, fallbackName = '') =>
    logActivity(action, details, userProfile?.uid || '', userProfile?.displayName || fallbackName)
      .catch(e => console.warn('logActivity falló:', e));

  const handleCreateUser = async () => {
    if (!validateForm()) return;
    setIsCreatingUser(true); setCreateSuccess(null);
    try {
      await createUserWithRole(newUser.email, newUser.password, newUser.displayName, newUser.role);
      await registrar('USER_CREATED', { email: newUser.email, displayName: newUser.displayName, role: newUser.role });
      setCreateSuccess(`✓ ${newUser.displayName} creado correctamente`);
      setTimeout(() => { setShowAddUser(false); setCreateSuccess(null); resetForm(); fetchData(); }, 1500);
    } catch (error: any) {
      const msg = error.code === 'auth/email-already-in-use' ? 'Este correo ya está registrado'
        : error.code === 'auth/invalid-email' ? 'El formato del correo no es válido'
        : error.message || 'Error al crear el usuario';
      setFormErrors([{ field: 'email', message: msg }]);
    } finally { setIsCreatingUser(false); }
  };

  const resetForm = () => {
    setNewUser({ email: '', password: '', confirmPassword: '', displayName: '', role: 'Empleado' });
    setFormErrors([]); setCreateSuccess(null); setShowPassword(false); setShowConfirm(false);
  };

  const handleDeleteUser = async (uid: string, name: string) => {
    if (!confirm(`¿Eliminar a ${name || uid}?\n\nEsto borrará su cuenta completamente.`)) return;
    setIsDeletingUser(uid);
    try {
      // Primero la cuenta de acceso (API del bot). Si eso falla, el perfil se
      // queda: antes se borraba el perfil y el login seguía funcionando.
      try { await deleteAuthUser(uid); }
      catch (err) {
        if (!esUsuarioInexistente(String(infoError(err).message ?? ''))) throw err;
      }
      await deleteUserData(uid);
      await registrar('USER_DELETED', { userId: uid, userName: name || uid }, 'CEO');
      toast.success(`${name || 'Usuario'} eliminado`);
    } catch (err) {
      const error = infoError(err);
      toast.error(error.code === 'permission-denied'
        ? 'No tienes permiso para eliminar este usuario'
        : `No se pudo eliminar el usuario: ${error.message || 'error desconocido'}`);
    }
    finally { setIsDeletingUser(null); }
  };

  // Igual que Gestión de Roles: nadie cambia su propio rol, el rol CEO no se
  // asigna desde aquí y el rol de otro CEO no se toca.
  const puedeCambiarRol = (u: UserProfile) => u.uid !== userProfile?.uid && u.role !== 'CEO';

  const handleChangeRole = async (uid: string, newRole: UserRole) => {
    const target = users.find(u => u.uid === uid);
    if (uid === userProfile?.uid) { toast.error('No puedes cambiar tu propio rol'); return; }
    if (target?.role === 'CEO')   { toast.error('No se puede cambiar el rol de un CEO'); return; }
    if (newRole === 'CEO')        { toast.error('El rol CEO no se puede asignar desde aquí'); return; }
    if (target?.role === newRole) return;
    try {
      await updateUserProfile(uid, { role: newRole });
      await registrar('ROLE_CHANGED', { userId: uid, newRole });
      toast.success(`Rol actualizado a ${newRole}`);
    } catch (err) {
      toast.error(infoError(err).code === 'permission-denied' ? 'No tienes permiso para cambiar roles' : 'Error al cambiar el rol');
    }
  };

  const handleDeleteReport = async (reportId: string, reportPath: string) => {
    if (!confirm('¿Eliminar este reporte permanentemente?\n\nSe borrarán también los archivos adjuntos.')) return;
    try {
      if (reportPath) {
        const { data: filesList } = await supabase.storage.from(REPORTS_BUCKET).list(reportPath);
        if (filesList && filesList.length > 0) {
          await supabase.storage.from(REPORTS_BUCKET).remove(filesList.map((f: any) => `${reportPath}/${f.name}`));
        }
      }
      await deleteDoc(doc(db, 'taskReports', reportId));
      await registrar('REPORT_DELETED', { reportId }, 'CEO');
      toast.success('Reporte eliminado');
    } catch (error) { console.error('Error deleting report:', error); toast.error('Error al eliminar el reporte'); }
  };

  const handleDownloadFile = async (url: string, filename: string) => {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl; link.download = filename;
      document.body.appendChild(link); link.click(); link.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (error) { console.error('Error downloading:', error); toast.error('Error al descargar el archivo'); }
  };

  const handleSaveBanner = async () => {
    if (!bannerForm.url || !bannerForm.titulo) return;
    setSavingBanner(true);
    try {
      await addDoc(collection(db, 'dashboard_banners'), { url: bannerForm.url, titulo: bannerForm.titulo, descripcion: bannerForm.descripcion, creadoEn: Timestamp.now() });
      setBannerForm({ url: '', titulo: '', descripcion: '' });
      setShowBannerModal(false);
      toast.success('Banner publicado');
      fetchBanners();
    } catch (e) { console.error(e); toast.error('No se pudo publicar el banner'); }
    finally { setSavingBanner(false); }
  };

  const handleDeleteBanner = async (id: string) => {
    if (!confirm('¿Eliminar este banner del dashboard?')) return;
    try { await deleteDoc(doc(db, 'dashboard_banners', id)); setBannerActivo(0); toast.success('Banner eliminado'); fetchBanners(); }
    catch (e) { console.error(e); toast.error('No se pudo eliminar el banner'); }
  };

  /* ── Derivados render ── */
  const reportStats = {
    total: reports.length,
    completed: reports.filter(r => r.status === 'completed').length,
    inProgress: reports.filter(r => r.status === 'in-progress').length,
    notCompleted: reports.filter(r => r.status === 'not-completed').length,
  };
  const completionRate = reportStats.total > 0 ? Math.round((reportStats.completed / reportStats.total) * 100) : 0;

  const filteredReports = reports.filter(report => {
    const matchesFilter = reportFilter === 'all' || report.status === reportFilter;
    const matchesSearch = report.taskTitle?.toLowerCase().includes(reportSearch.toLowerCase()) ||
      report.userName?.toLowerCase().includes(reportSearch.toLowerCase()) ||
      report.comment?.toLowerCase().includes(reportSearch.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const filteredUsers = users.filter(u =>
    u.displayName?.toLowerCase().includes(searchUser.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchUser.toLowerCase())
  );

  if (loading || !mounted) return (
    <div className="flex items-center justify-center h-64 ceo-fade-scale">
      <div className="flex flex-col items-center gap-4">
        <div className="ceo-spin-elegant">
          <RefreshCw className="w-8 h-8 animate-spin" style={{ color: panelInk(accent) }} />
        </div>
        <div className="space-y-2 w-48">
          <div className="ceo-skeleton h-2 w-full rounded" />
          <div className="ceo-skeleton h-2 w-3/4 rounded mx-auto" />
        </div>
        <p className="text-xs font-extralight" style={{ color: panelInk(textMuted) }}>Cargando panel...</p>
      </div>
    </div>
  );

  return (
    <section className="moon-module moon-module--ceopanel">
      <style>{`
        /* ═══════════════════════════════════════════════
           ANIMACIONES PROFESIONALES — compatibles con
           cualquier tema (dark/light/system)
           Los keyframes llevan prefijo "ceo": este <style> es
           global mientras el panel está montado y pisaba los
           "shimmer"/"slideUp" del layout y del aviso de updates.
           ═══════════════════════════════════════════════ */

        @keyframes ceoSlideUp      { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
        @keyframes ceoFadeScale    { from{opacity:0;transform:scale(0.96)} to{opacity:1;transform:scale(1)} }
        @keyframes ceoProgress     { from{transform:scaleX(0)} to{transform:scaleX(1)} }
        @keyframes ceoModalEnter   { from{opacity:0;transform:scale(0.94) translateY(12px)} to{opacity:1;transform:scale(1) translateY(0)} }
        @keyframes ceoListItemIn   { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes ceoShimmer      { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
        @keyframes ceoGlowPulse    { 0%,100%{box-shadow:0 0 6px ${accent}40} 50%{box-shadow:0 0 18px ${accent}70} }
        @keyframes ceoCountPop     { 0%{transform:scale(0.8);opacity:0} 80%{transform:scale(1.05)} 100%{transform:scale(1);opacity:1} }
        @keyframes ceoSpinIn       { from{transform:rotate(-90deg);opacity:0} to{transform:rotate(0);opacity:1} }
        @keyframes ceoBadgeBounce  { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-3px)} }

        .ceo-slide-up    { animation: none; }
        .ceo-fade-scale  { animation: ceoFadeScale 0.24s cubic-bezier(0.16,1,0.3,1) forwards; }
        .ceo-modal-enter { animation: ceoModalEnter 0.28s cubic-bezier(0.16,1,0.3,1) forwards; }

        /* Stagger lists */
        .ceo-stagger > * {
          opacity: 1;
          animation: none;
        }
        .ceo-stagger > *:nth-child(1)  { animation-delay: 0ms; }
        .ceo-stagger > *:nth-child(2)  { animation-delay: 40ms; }
        .ceo-stagger > *:nth-child(3)  { animation-delay: 80ms; }
        .ceo-stagger > *:nth-child(4)  { animation-delay: 120ms; }
        .ceo-stagger > *:nth-child(5)  { animation-delay: 160ms; }
        .ceo-stagger > *:nth-child(6)  { animation-delay: 200ms; }
        .ceo-stagger > *:nth-child(7)  { animation-delay: 240ms; }
        .ceo-stagger > *:nth-child(8)  { animation-delay: 280ms; }
        .ceo-stagger > *:nth-child(9)  { animation-delay: 320ms; }
        .ceo-stagger > *:nth-child(10) { animation-delay: 360ms; }
        .ceo-stagger > *:nth-child(11) { animation-delay: 400ms; }
        .ceo-stagger > *:nth-child(12) { animation-delay: 440ms; }

        /* Tab triggers */
        .ceo-tab-trigger {
          transition: all 0.25s cubic-bezier(0.16,1,0.3,1);
          border-bottom: 2px solid transparent;
          border-radius: 0 !important;
          white-space: nowrap;
          position: relative;
        }
        .ceo-tab-trigger[data-state="active"] {
          background: transparent !important;
          border-bottom-color: ${accent} !important;
          color: ${textPrimary} !important;
        }
        .ceo-tab-trigger::after {
          content: '';
          position: absolute;
          bottom: -2px; left: 50%; right: 50%;
          height: 2px;
          background: ${accent};
          transition: all 0.3s cubic-bezier(0.16,1,0.3,1);
        }
        .ceo-tab-trigger[data-state="active"]::after {
          left: 0; right: 0;
        }

        /* Row hover sin movimiento lateral */
        .ceo-row-hover:hover {
          background: ${accent}08 !important;
          border-color: ${accent}22 !important;
        }

        /* Task card hover */
        .ceo-task-card {
          transition: all 0.3s cubic-bezier(0.16,1,0.3,1);
        }
        .ceo-task-card:hover {
          border-color: ${accent}55 !important;
          box-shadow: 0 8px 32px ${accent}14;
          transform: translateY(-2px);
        }

        /* Report card hover */
        .ceo-report-card {
          transition: all 0.3s cubic-bezier(0.16,1,0.3,1);
        }
        .ceo-report-card:hover {
          border-color: ${accent}55 !important;
          box-shadow: 0 8px 32px ${accent}12;
          transform: translateY(-1px);
        }

        /* Search focus */
        .ceo-search input:focus {
          border-color: ${accent}66 !important;
          box-shadow: 0 0 0 3px ${accent}18 !important;
          transition: all 0.2s ease;
        }

        /* Accent button */
        .ceo-btn-accent {
          background: ${accent} !important;
          color: var(--accent-on-user, var(--moon-accent-ink)) !important;
          border: none !important;
          transition: all 0.2s cubic-bezier(0.16,1,0.3,1);
          position: relative;
          overflow: hidden;
        }
        .ceo-btn-accent:hover {
          opacity: 0.9;
          transform: translateY(-1px);
          box-shadow: 0 4px 16px ${accent}40;
        }
        .ceo-btn-accent:active {
          transform: scale(0.97) translateY(0);
          transition-duration: 0.08s;
        }
        .ceo-btn-accent:disabled {
          opacity: 0.45 !important;
          cursor: not-allowed !important;
          transform: none !important;
          box-shadow: none !important;
        }

        /* User avatar */
        .ceo-user-avatar {
          background: linear-gradient(135deg, ${accent}30, ${accent}08);
          border: 1px solid ${accent}30;
          transition: all 0.3s ease;
        }
        .ceo-user-avatar:hover {
          border-color: ${accent}60;
          box-shadow: 0 0 12px ${accent}25;
        }

        /* Scrollbar */
        .ceo-scroll::-webkit-scrollbar { width: 5px; }
        .ceo-scroll::-webkit-scrollbar-track { background: transparent; }
        .ceo-scroll::-webkit-scrollbar-thumb { background: ${accent}35; border-radius: 10px; }
        .ceo-scroll::-webkit-scrollbar-thumb:hover { background: ${accent}55; }

        /* Tabs scroll mobile */
        .ceo-tabs-list {
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
        }
        .ceo-tabs-list::-webkit-scrollbar { display: none; }

        /* ═══════════════════════════════════════════════
           RADIX UI — solo los menús de ESTE panel
           Antes estas reglas iban sobre [role="listbox"],
           [role="option"] y el wrapper de popper de toda la
           app mientras el panel estaba montado. Ahora van
           sobre la clase .ceo-listbox de los SelectContent
           de aquí. (Las de [data-radix-dialog-*] se quitaron:
           Radix no pone esos atributos, nunca aplicaban.)
           ═══════════════════════════════════════════════ */
        [data-radix-popper-content-wrapper]:has(> .ceo-listbox) {
          z-index: 9999 !important;
        }
        /* El listbox SIEMPRE usa las variables del tema con fallback sólido */
        .ceo-listbox[role="listbox"] {
          background: var(--moon-surface, #18181b) !important;
          border: 1px solid var(--moon-line, #27272a) !important;
          box-shadow: 0 16px 40px rgba(0,0,0,0.4) !important;
        }
        .ceo-listbox [role="option"] {
          transition: background 0.15s ease;
        }
        .ceo-listbox [role="option"][data-state="checked"],
        .ceo-listbox [role="option"]:hover {
          background: ${accent}15 !important;
        }

        /* Employee row */
        .ceo-employee-row {
          transition: background 0.2s ease, border-color 0.2s ease;
        }
        .ceo-employee-row:hover {
          background: ${accent}08;
        }

        /* Mobile role badge */
        .role-badge-mobile {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 11px;
          padding: 2px 8px;
          border-radius: 9999px;
          border-width: 1px;
          border-style: solid;
          font-weight: 200;
          white-space: nowrap;
          transition: all 0.2s ease;
        }

        /* Stat card glow */
        .ceo-stat-glow {
          transition: all 0.35s cubic-bezier(0.16,1,0.3,1);
        }
        .ceo-stat-glow:hover {
          transform: translateY(-3px) scale(1.01);
          box-shadow: 0 12px 40px rgba(0,0,0,0.3);
        }

        /* Skeleton shimmer */
        .ceo-skeleton {
          background: linear-gradient(90deg, var(--moon-surface-raised,#1f1f23) 25%, var(--moon-line,#27272a) 50%, var(--moon-surface-raised,#1f1f23) 75%);
          background-size: 200% 100%;
          animation: ceoShimmer 1.5s infinite;
          border-radius: 8px;
        }

        /* Badge bounce */
        .ceo-badge-bounce {
          animation: ceoBadgeBounce 2s ease-in-out infinite;
        }

        /* Glow pulse */
        .ceo-glow-pulse {
          animation: ceoGlowPulse 2s ease-in-out infinite;
        }

        /* Card lift */
        .ceo-card-lift {
          transition: transform 0.3s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.3s ease;
        }
        .ceo-card-lift:hover {
          transform: translateY(-4px);
          box-shadow: 0 16px 48px rgba(0,0,0,0.4);
        }

        /* Button press */
        .ceo-btn-press {
          transition: transform 0.15s ease, box-shadow 0.2s ease;
        }
        .ceo-btn-press:active {
          transform: scale(0.96);
        }

        /* Count animation */
        .ceo-count-pop {
          animation: ceoCountPop 0.5s cubic-bezier(0.16,1,0.3,1) forwards;
        }

        /* Spinner elegant */
        .ceo-spin-elegant {
          animation: ceoSpinIn 0.6s cubic-bezier(0.16,1,0.3,1) forwards;
        }
      `}</style>

      <div className="space-y-4 sm:space-y-6">
        {/* ── HEADER ── */}
        <EnterpriseFocus eyebrow="Dirección · Moon Studios" title="Panel de dirección"
          description="Coordina al equipo, supervisa las entregas y administra las comunicaciones de la empresa."
          metrics={[
            { label: 'Equipo', value: users.length, detail: 'Ver integrantes', onClick: () => setWorkspaceTab('employees') },
            { label: 'Tareas', value: tasks.length, detail: 'Abrir planificación', onClick: () => setWorkspaceTab('tasks') },
            { label: 'Reportes', value: reportStats.total, detail: 'Revisar entregas del equipo', onClick: () => { setReportFilter('all'); setReportSearch(''); setWorkspaceTab('reports'); } },
          ]}>
          <button type="button" className="enterprise-action" disabled={refreshing}
            onClick={async () => {
              setRefreshing(true);
              try { await Promise.all([fetchData(), fetchReports(), fetchBanners()]); }
              finally { setRefreshing(false); }
            }}
          >
            <RefreshCw className={refreshing ? 'animate-spin' : ''} />{refreshing ? 'Actualizando…' : 'Actualizar datos'}
          </button>
          <button type="button" className="enterprise-action enterprise-action--primary" onClick={() => { setWorkspaceTab('employees'); setShowAddUser(true); }}><UserPlus />Incorporar integrante</button>
        </EnterpriseFocus>

        {/* ── TABS ── */}
        <Tabs value={workspaceTab} onValueChange={setWorkspaceTab}>
          <TabsList
            className="ceo-tabs-list w-full justify-start gap-0 rounded-none border-b p-0 h-auto flex"
            style={{ background: 'transparent', borderColor }}
          >
            {[
              { value: 'employees', label: 'Empleados', icon: Users },
              { value: 'tasks',     label: 'Tareas',    icon: CheckSquare },
              { value: 'reports',   label: 'Reportes',  icon: FileText, badge: reportStats.total },
              { value: 'banners',   label: 'Banners',   icon: MonitorPlay, badge: banners.length },
            ].map(tab => {
              const Icon = tab.icon;
              return (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="ceo-tab-trigger flex items-center gap-1.5 px-3 sm:px-5 py-2.5 sm:py-3 text-xs sm:text-sm font-extralight rounded-none data-[state=active]:shadow-none flex-shrink-0"
                  style={{ color: panelInk(textMuted), background: 'transparent' }}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {/* FIX: labels siempre visibles en todos los tamaños */}
                  <span className="text-xs">{tab.label}</span>
                  {tab.badge !== undefined && tab.badge > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-extralight"
                      style={{ background: `${accent}20`, color: panelInk(accent) }}>
                      {tab.badge}
                    </span>
                  )}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {/* ══════════════════════════════════════════
              PESTAÑA: EMPLEADOS
          ══════════════════════════════════════════ */}
          <TabsContent value="employees" className="mt-4 sm:mt-6 space-y-4 sm:space-y-5 ceo-slide-up">

            {/* Stats rápidas */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
              {[
                { label: 'Total Equipo',   value: users.length, icon: Users, accent: accent },
                { label: 'Roles Activos',  value: allRoles.filter(r => users.some(u => u.role === r)).length, icon: Shield, accent: '#a78bfa' },
                { label: 'Tareas Activas', value: tasks.filter(t => t.status !== 'completed').length, icon: Activity, accent: '#34d399' },
                { label: 'Reportes Hoy',   value: reports.filter(r => {
                  const d = r.createdAt?.toDate ? r.createdAt.toDate() : new Date(r.createdAt);
                  return new Date().toDateString() === d.toDateString();
                }).length, icon: TrendingUp, accent: '#fb923c' },
              ].map((stat, i) => (
                <StatCard key={stat.label} {...stat} delay={i * 60} />
              ))}
            </div>

            {/* Barra de búsqueda y acciones */}
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              <div className="relative flex-1 ceo-search">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: panelInk(textMuted) }} />
                <Input
                  value={searchUser}
                  onChange={(e) => setSearchUser(e.target.value)}
                  placeholder="Buscar por nombre o correo…"
                  className="pl-10 font-extralight transition-all"
                  style={{ background: cardBg, border: `1px solid ${borderColor}`, color: panelInk(textPrimary) }}
                />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Toggle lista/grid */}
                <div className="flex rounded-xl overflow-hidden border" style={{ borderColor }}>
                  {(['list','grid'] as const).map(view => (
                    <button key={view} onClick={() => setActiveEmployeeTab(view)}
                      className="px-3 py-2 text-xs font-extralight transition-all"
                      style={{
                        background: activeEmployeeTab === view ? `${accent}20` : 'transparent',
                        color: panelInk(activeEmployeeTab === view ? accent : textMuted),
                      }}>
                      {view === 'list' ? '≡' : '⊞'}
                    </button>
                  ))}
                </div>
                <Button variant="outline" onClick={() => setShowScanner(true)}
                  className="ceo-btn-press font-extralight border-[color:var(--moon-line)] text-[color:var(--moon-muted)] hover:text-[color:var(--moon-ink)] hover:bg-[var(--surface-subtle)] text-xs sm:text-sm">
                  <ScanLine className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Escanear</span>
                </Button>
                <button onClick={() => { resetForm(); setShowAddUser(true); }}
                  className="ceo-btn-accent ceo-btn-press flex items-center gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-extralight">
                  <UserPlus className="w-4 h-4" />
                  <span className="hidden sm:inline">Agregar</span>
                </button>
              </div>
            </div>

            {/* Tabla/Grid empleados */}
            <div data-moon-reveal="card" className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${borderColor}`, background: cardBg }}>
              <div className="px-4 sm:px-5 py-3 border-b flex items-center justify-between" style={{ borderColor }}>
                <p className="text-xs font-extralight uppercase tracking-widest" style={{ color: panelInk(textMuted) }}>
                  {filteredUsers.length} de {users.length} empleado{users.length !== 1 ? 's' : ''}
                </p>
                <div className="w-16 h-1 rounded-full overflow-hidden" style={{ background: `${accent}15` }}>
                  <div className="h-full rounded-full" style={{ width: users.length > 0 ? '100%' : '0', background: accent }} />
                </div>
              </div>

              {filteredUsers.length === 0 ? (
                <div className="p-12 text-center" style={{ color: panelInk(textMuted) }}>
                  <Users className="w-10 h-10 mx-auto mb-3 opacity-20" strokeWidth={1} />
                  <p className="font-extralight text-sm">No se encontraron usuarios</p>
                </div>
              ) : activeEmployeeTab === 'grid' ? (
                /* GRID VIEW */
                <div className="ceo-stagger grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 p-3 sm:p-4">
                  {filteredUsers.map((user, i) => {
                    const roleCfg = getRoleConfig(user.role, allRoles);
                    return (
                      <div data-moon-reveal="card" key={user.uid}
                        className="ceo-card-lift rounded-xl p-3 sm:p-4 border cursor-pointer"
                        style={{ background: surfaceSubtle, borderColor, animationDelay: `${i * 40}ms` }}
                        onClick={() => { setProfileUser(user); setShowProfile(true); }}>
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl overflow-hidden flex items-center justify-center ceo-user-avatar flex-shrink-0">
                            {user.avatar
                              ? <img src={user.avatar} alt={user.displayName} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                              : <span className="font-extralight text-lg sm:text-xl" style={{ color: panelInk(accent) }}>{user.displayName?.[0]?.toUpperCase()}</span>
                            }
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-extralight truncate text-sm" style={{ color: panelInk(textPrimary) }}>{user.displayName}</p>
                            <p className="text-xs font-extralight truncate" style={{ color: panelInk(textMuted) }}>{user.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <Badge className={`${roleCfg.bg} ${roleCfg.color} ${roleCfg.border} border font-extralight text-xs`}>
                            {roleCfg.label}
                          </Badge>
                          <div className="flex items-center gap-1">
                            {/* Cambiar rol en grid - mobile friendly */}
                            <button onClick={(e) => { e.stopPropagation(); setRoleChangeUser(user); setShowRoleModal(true); }}
                              disabled={!puedeCambiarRol(user)}
                              className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--moon-surface-raised)] disabled:opacity-40 disabled:pointer-events-none"
                              style={{ color: panelInk(textMuted) }} title="Cambiar rol">
                              <Shield className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); setCredentialUser(user); setShowCredential(true); }}
                              className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--moon-surface-raised)]"
                              style={{ color: panelInk(textMuted) }}>
                              <QrCode className="w-3.5 h-3.5" />
                            </button>
                            {user.uid !== userProfile?.uid && (
                              <button onClick={(e) => { e.stopPropagation(); handleDeleteUser(user.uid, user.displayName); }}
                                disabled={isDeletingUser === user.uid}
                                className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-red-950/40"
                                style={{ color: 'rgb(248 113 113)' }}>
                                {isDeletingUser === user.uid ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* LIST VIEW — FIX COMPLETO: funciona en mobile y PC */
                <div className="ceo-stagger">
                  {filteredUsers.map((user) => {
                    const roleCfg = getRoleConfig(user.role, allRoles);
                    return (
                      <div data-moon-reveal="row" key={user.uid}
                        className="ceo-employee-row flex items-center gap-2 sm:gap-3 px-3 sm:px-5 py-3 border-b"
                        style={{ borderColor }}>

                        {/* Avatar */}
                        <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl overflow-hidden flex items-center justify-center flex-shrink-0 ceo-user-avatar">
                          {user.avatar
                            ? <img src={user.avatar} alt={user.displayName} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            : <span className="font-extralight text-sm" style={{ color: panelInk(accent) }}>{user.displayName?.[0]?.toUpperCase()}</span>
                          }
                        </div>

                        {/* Info: nombre + email */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="font-extralight text-sm truncate" style={{ color: panelInk(textPrimary) }}>
                              {user.displayName}
                            </p>
                            {user.uid === userProfile?.uid && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-extralight flex-shrink-0"
                                style={{ background: `${accent}15`, color: panelInk(accent) }}>Tú</span>
                            )}
                          </div>
                          {/* FIX: email visible en mobile también */}
                          <p className="text-xs font-extralight truncate" style={{ color: panelInk(textMuted) }}>{user.email}</p>
                        </div>

                        {/* Badge de rol — visible en todos los tamaños */}
                        <div className="flex-shrink-0 hidden sm:block">
                          <span className={`role-badge-mobile ${roleCfg.bg} ${roleCfg.color} ${roleCfg.border}`}>
                            {roleCfg.label}
                          </span>
                        </div>

                        {/* Acciones */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {/* Ver perfil */}
                          <button onClick={() => { setProfileUser(user); setShowProfile(true); }}
                            className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--moon-surface-raised)]"
                            style={{ color: panelInk(textMuted) }} title="Ver perfil">
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {/* Credencial QR */}
                          <button onClick={() => { setCredentialUser(user); setShowCredential(true); }}
                            className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--moon-surface-raised)]"
                            style={{ color: panelInk(textMuted) }} title="Credencial">
                            <QrCode className="w-3.5 h-3.5" />
                          </button>

                          {/* Contrato — FIX: visible en mobile también */}
                          <button onClick={() => { setContractUser(user); setShowContract(true); }}
                            className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--moon-surface-raised)]"
                            style={{ color: panelInk(textMuted) }} title="Contratos">
                            <FileText className="w-3.5 h-3.5" />
                          </button>

                          {/* FIX: Cambio de rol — en PC usa Select, en mobile usa botón con modal */}
                          <div className="hidden lg:block">
                            <Select
                              value={user.role}
                              onValueChange={(v: UserRole) => handleChangeRole(user.uid, v)}
                              disabled={!puedeCambiarRol(user)}
                            >
                              <SelectTrigger
                                className="w-36 font-extralight text-sm"
                                style={{
                                  border: `1px solid ${borderColor}`,
                                  background: surfaceSubtle,
                                  color: panelInk(textPrimary),
                                }}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              {/* FIX: fondo sólido en el dropdown */}
                              <SelectContent className="ceo-listbox"
                                style={{
                                  background: 'var(--moon-surface, #18181b)',
                                  border: `1px solid ${borderColor}`,
                                  zIndex: 9999,
                                }}
                              >
                                {/* CEO solo aparece si ya es el rol del usuario (para que se vea en el trigger). */}
                                {ALL_ROLES_LIST.filter(r => r !== 'CEO' || r === user.role).map(role => {
                                  const cfg = getRoleConfig(role, allRoles);
                                  return (
                                    <SelectItem key={role} value={role} className="font-extralight" style={{ color: panelInk(textPrimary) }}>
                                      <span className={`flex items-center gap-2 ${cfg.color}`}>
                                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'currentColor' }} />
                                        {role}
                                      </span>
                                    </SelectItem>
                                  );
                                })}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* FIX: botón de rol en tablet/mobile (< lg) */}
                          <button
                            onClick={() => { setRoleChangeUser(user); setShowRoleModal(true); }}
                            disabled={!puedeCambiarRol(user)}
                            className="lg:hidden w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--moon-surface-raised)] disabled:opacity-40"
                            style={{ color: panelInk(textMuted) }}
                            title="Cambiar rol"
                          >
                            <Shield className="w-3.5 h-3.5" />
                          </button>

                          {/* Eliminar */}
                          {user.uid !== userProfile?.uid && (
                            <button
                              onClick={() => handleDeleteUser(user.uid, user.displayName)}
                              disabled={isDeletingUser === user.uid}
                              className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-red-950/40 moon-panel-tone-red hover:text-red-300">
                              {isDeletingUser === user.uid
                                ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                : <Trash2 className="w-3.5 h-3.5" />}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* ── Modal cambio de rol (mobile/tablet) ── */}
            <Dialog open={showRoleModal} onOpenChange={setShowRoleModal}>
              <DialogContent
                style={{ background: cardBg, borderColor, color: panelInk(textPrimary) }}
                className="w-[calc(100vw-2rem)] max-w-sm border rounded-2xl"
              >
                <DialogHeader>
                  <DialogTitle className="font-extralight text-base flex items-center gap-2">
                    <Shield className="w-5 h-5" style={{ color: panelInk(accent) }} />
                    Cambiar Rol
                  </DialogTitle>
                  <DialogDescription className="font-extralight text-sm" style={{ color: panelInk(textMuted) }}>
                    {roleChangeUser?.displayName}
                  </DialogDescription>
                </DialogHeader>
                <div className="grid grid-cols-1 gap-2 py-2">
                  {ASSIGNABLE_ROLES.map(role => {
                    const cfg = getRoleConfig(role, allRoles);
                    const isActive = roleChangeUser?.role === role;
                    return (
                      <button
                        key={role}
                        onClick={async () => {
                          if (roleChangeUser) {
                            await handleChangeRole(roleChangeUser.uid, role as UserRole);
                            setShowRoleModal(false);
                            setRoleChangeUser(null);
                          }
                        }}
                        className="flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left"
                        style={{
                          background: isActive ? `${accent}15` : surfaceSubtle,
                          borderColor: isActive ? `${accent}55` : borderColor,
                        }}
                      >
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.color}`} style={{ background: 'currentColor' }} />
                        <span className={`font-extralight text-sm flex-1 ${cfg.color}`}>{role}</span>
                        {isActive && <CheckCircle className="w-4 h-4" style={{ color: panelInk(accent) }} />}
                      </button>
                    );
                  })}
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => { setShowRoleModal(false); setRoleChangeUser(null); }}
                    className="font-extralight w-full" style={{ color: panelInk(textMuted) }}>
                    Cancelar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Dialog: Crear usuario */}
            <Dialog open={showAddUser} onOpenChange={(open) => { if (!isCreatingUser) { setShowAddUser(open); if (!open) resetForm(); } }}>
              <DialogContent
                style={{ background: cardBg, borderColor, color: panelInk(textPrimary) }}
                className="w-[calc(100vw-2rem)] max-w-md border rounded-2xl"
                onPointerDownOutside={(e) => { if (isCreatingUser) e.preventDefault(); }}>
                <DialogHeader>
                  <DialogTitle className="font-extralight text-base sm:text-lg flex items-center gap-2">
                    <UserPlus className="w-5 h-5" style={{ color: panelInk(accent) }} /> Crear Nuevo Usuario
                  </DialogTitle>
                  <DialogDescription className="font-extralight text-sm" style={{ color: panelInk(textMuted) }}>
                    El usuario podrá iniciar sesión con las credenciales que definas.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3 sm:space-y-4 py-2 max-h-[65vh] overflow-y-auto ceo-scroll pr-1">
                  {[
                    { label: 'Nombre completo', field: 'displayName', value: newUser.displayName, set: (v: string) => setNewUser({...newUser, displayName: v}), icon: User, placeholder: 'Ej: Juan Pérez', type: 'text' },
                    { label: 'Correo electrónico', field: 'email', value: newUser.email, set: (v: string) => setNewUser({...newUser, email: v}), icon: Mail, placeholder: 'usuario@empresa.com', type: 'email' },
                  ].map(({ label, field, value, set, icon: Icon, placeholder, type }) => (
                    <div key={field} className="space-y-1.5">
                      <Label className="font-extralight flex items-center gap-2 text-xs" style={{ color: panelInk(textMuted) }}>
                        <Icon className="w-3.5 h-3.5" /> {label}
                      </Label>
                      <Input type={type} value={value} onChange={(e) => set(e.target.value)}
                        placeholder={placeholder} disabled={isCreatingUser}
                        className={`font-extralight ${getFieldError(field) ? 'border-red-800' : ''}`}
                        style={{ background: surfaceSubtle, border: `1px solid ${getFieldError(field) ? '#991b1b' : borderColor}`, color: panelInk(textPrimary) }} />
                      {getFieldError(field) && (
                        <p className="moon-panel-tone-red text-xs font-extralight flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" />{getFieldError(field)}
                        </p>
                      )}
                    </div>
                  ))}
                  {[
                    { label: 'Contraseña', field: 'password', value: newUser.password, set: (v: string) => setNewUser({...newUser, password: v}), show: showPassword, setShow: setShowPassword, showStrength: true },
                    { label: 'Confirmar contraseña', field: 'confirmPassword', value: newUser.confirmPassword, set: (v: string) => setNewUser({...newUser, confirmPassword: v}), show: showConfirm, setShow: setShowConfirm, showStrength: false },
                  ].map(({ label, field, value, set, show, setShow, showStrength }) => (
                    <div key={field} className="space-y-1.5">
                      <Label className="font-extralight flex items-center gap-2 text-xs" style={{ color: panelInk(textMuted) }}>
                        <Lock className="w-3.5 h-3.5" /> {label}
                      </Label>
                      <div className="relative">
                        <Input type={show ? 'text' : 'password'} value={value} onChange={(e) => set(e.target.value)}
                          placeholder="Mínimo 8 caracteres" disabled={isCreatingUser}
                          className={`font-extralight pr-10 ${getFieldError(field) ? 'border-red-800' : ''}`}
                          style={{ background: surfaceSubtle, border: `1px solid ${getFieldError(field) ? '#991b1b' : borderColor}`, color: panelInk(textPrimary) }} />
                        <button type="button" onClick={() => setShow(!show)}
                          className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: panelInk(textMuted) }}>
                          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      {showStrength && <PasswordStrength password={value} />}
                      {!showStrength && value && newUser.password === value && (
                        <p className="moon-panel-tone-green text-xs font-extralight flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Las contraseñas coinciden</p>
                      )}
                      {getFieldError(field) && (
                        <p className="moon-panel-tone-red text-xs font-extralight flex items-center gap-1"><AlertCircle className="w-3 h-3" />{getFieldError(field)}</p>
                      )}
                    </div>
                  ))}
                  <div className="space-y-1.5">
                    <Label className="font-extralight flex items-center gap-2 text-xs" style={{ color: panelInk(textMuted) }}>
                      <Shield className="w-3.5 h-3.5" /> Rol del usuario
                    </Label>
                    <Select value={newUser.role} onValueChange={(v: UserRole) => setNewUser({...newUser, role: v})} disabled={isCreatingUser}>
                      <SelectTrigger className="font-extralight" style={{ background: surfaceSubtle, border: `1px solid ${borderColor}`, color: panelInk(textPrimary) }}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="ceo-listbox" style={{ background: 'var(--moon-surface, #18181b)', border: `1px solid ${borderColor}`, zIndex: 9999 }}>
                        {allRoles.filter(r => r !== 'CEO').map(role => (
                          <SelectItem key={role} value={role} className="font-extralight" style={{ color: panelInk(textPrimary) }}>{role}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {createSuccess && (
                    <div className="p-3 rounded-xl flex items-center gap-2" style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.3)' }}>
                      <CheckCircle className="w-4 h-4 moon-panel-tone-green shrink-0" />
                      <p className="moon-panel-tone-green text-sm font-extralight">{createSuccess}</p>
                    </div>
                  )}
                </div>
                <DialogFooter className="flex-col sm:flex-row gap-2">
                  <Button variant="ghost" onClick={() => setShowAddUser(false)} disabled={isCreatingUser}
                    className="font-extralight w-full sm:w-auto" style={{ color: panelInk(textMuted) }}>Cancelar</Button>
                  <button onClick={handleCreateUser} disabled={isCreatingUser}
                    className="ceo-btn-accent flex items-center justify-center gap-2 px-5 py-2 rounded-xl text-sm font-extralight transition-all w-full sm:w-auto">
                    {isCreatingUser ? <><RefreshCw className="w-4 h-4 animate-spin" />Creando...</> : <><UserPlus className="w-4 h-4" />Crear Usuario</>}
                  </button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>

          {/* ══════════════════════════════════════════
              PESTAÑA: TAREAS
          ══════════════════════════════════════════ */}
          <TabsContent value="tasks" className="mt-4 sm:mt-6 ceo-slide-up">
            {/* Gestor completo: filtros, tablero, vencimientos y reportes por tarea. */}
            <GestorTareas perfil={userProfile} fechaNueva={fechaNuevaTarea} onVerArchivo={openFileViewer} />
          </TabsContent>

          {/* ══════════════════════════════════════════
              PESTAÑA: REPORTES
          ══════════════════════════════════════════ */}
          <TabsContent value="reports" className="mt-4 sm:mt-6 space-y-4 sm:space-y-5 ceo-slide-up">

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
              <StatCard label="Total Reportes"  value={reportStats.total}       icon={FileText}   accent={accent}   delay={0}   />
              <StatCard label="Completadas"     value={reportStats.completed}   icon={CheckCheck} accent="#34d399" delay={60}  trend={`${completionRate}% completado`} />
              <StatCard label="En Desarrollo"   value={reportStats.inProgress}  icon={Clock}      accent="#60a5fa" delay={120} />
              <StatCard label="No Completadas"  value={reportStats.notCompleted}icon={XCircle}    accent="#f87171" delay={180} />
            </div>

            {reportStats.total > 0 && (
              <div data-moon-reveal="card" className="moon-panel rounded-2xl p-3 sm:p-4 border" style={{ background: cardBg, borderColor }}>
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <p className="text-xs sm:text-sm font-extralight" style={{ color: panelInk(textMuted) }}>Progreso general</p>
                  <p className="text-xs sm:text-sm font-extralight" style={{ color: panelInk(accent) }}>{completionRate}% completado</p>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: `${accent}15` }}>
                  <div className="h-full rounded-full transition-all duration-1000"
                    style={{ width: `${completionRate}%`, background: `linear-gradient(90deg, ${accent}, ${accent}aa)` }} />
                </div>
                <div className="flex flex-wrap gap-3 sm:gap-4 mt-2 sm:mt-3">
                  {[
                    { label: 'Completadas', count: reportStats.completed,   color: '#34d399' },
                    { label: 'En progreso', count: reportStats.inProgress,  color: '#60a5fa' },
                    { label: 'Pendientes',  count: reportStats.notCompleted,color: '#f87171' },
                  ].map(s => (
                    <div key={s.label} className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: s.color }} />
                      <span className="text-[10px] sm:text-xs font-extralight" style={{ color: panelInk(textMuted) }}>{s.label} ({s.count})</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2 sm:gap-3">
              <div className="relative ceo-search">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: panelInk(textMuted) }} />
                <Input value={reportSearch} onChange={(e) => setReportSearch(e.target.value)}
                  placeholder="Buscar por tarea, usuario o comentario…"
                  className="pl-10 font-extralight"
                  style={{ background: cardBg, border: `1px solid ${borderColor}`, color: panelInk(textPrimary) }} />
              </div>
              <div className="flex items-center gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                <Filter className="w-3.5 h-3.5 flex-shrink-0" style={{ color: panelInk(textMuted) }} />
                {[
                  { value: 'all',           label: 'Todos' },
                  { value: 'completed',     label: 'Completadas' },
                  { value: 'in-progress',   label: 'En progreso' },
                  { value: 'not-completed', label: 'No completadas' },
                ].map(f => (
                  <button key={f.value} onClick={() => setReportFilter(f.value as any)}
                    className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-extralight transition-all"
                    style={{
                      background: reportFilter === f.value ? `${accent}20` : 'transparent',
                      color:      panelInk(reportFilter === f.value ? accent : textMuted),
                      border:     `1px solid ${reportFilter === f.value ? `${accent}44` : borderColor}`,
                    }}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {reportsLoading ? (
              <div className="flex items-center justify-center py-16 gap-3">
                <RefreshCw className="w-6 h-6 animate-spin" style={{ color: panelInk(accent) }} />
                <p className="text-sm font-extralight" style={{ color: panelInk(textMuted) }}>Cargando reportes…</p>
              </div>
            ) : filteredReports.length === 0 ? (
              <div data-moon-reveal="card" className="moon-panel flex flex-col items-center justify-center py-16 text-center rounded-2xl border-2 border-dashed" style={{ borderColor }}>
                <FileText className="w-12 h-12 mb-3 opacity-15" style={{ color: panelInk(accent) }} strokeWidth={1} />
                <p className="font-extralight" style={{ color: panelInk(textMuted) }}>
                  {reports.length === 0 ? 'No hay reportes enviados aún' : 'No se encontraron reportes'}
                </p>
              </div>
            ) : (
              <div className="ceo-stagger space-y-2">
                {filteredReports.map((report, i) => {
                  const statusCfg = REPORT_STATUS_CONFIG[report.status];
                  const StatusIcon = statusCfg.icon;
                  return (
                    <div data-moon-reveal="card" key={report.id}
                      className="moon-panel ceo-report-card rounded-2xl border p-3 sm:p-4 cursor-pointer transition-all duration-200 group"
                      style={{ background: cardBg, borderColor, animationDelay: `${i * 35}ms` }}
                      onClick={() => { setSelectedReport(report); setShowReportDetail(true); }}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 sm:gap-3 mb-2">
                            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                              style={{ background: `${statusCfg.accent}15`, border: `1px solid ${statusCfg.accent}30` }}>
                              <StatusIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" style={{ color: panelInk(statusCfg.accent) }} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <h3 className="font-extralight truncate text-sm" style={{ color: panelInk(textPrimary) }}>{report.taskTitle}</h3>
                              <div className="flex items-center flex-wrap gap-2 text-[10px] sm:text-xs font-extralight mt-0.5" style={{ color: panelInk(textMuted) }}>
                                <span className="flex items-center gap-1"><User className="w-3 h-3" />{report.userName}</span>
                                <span className="flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  {report.createdAt?.toDate
                                    ? new Date(report.createdAt.toDate()).toLocaleDateString('es-PE')
                                    : new Date(report.createdAt).toLocaleDateString('es-PE')}
                                </span>
                                {report.files?.length > 0 && (
                                  <span className="flex items-center gap-1"><Download className="w-3 h-3" />{report.files.length} archivo{report.files.length !== 1 ? 's' : ''}</span>
                                )}
                              </div>
                            </div>
                          </div>
                          {report.comment && (
                            <p className="text-xs sm:text-sm font-extralight line-clamp-2 pl-9 sm:pl-11" style={{ color: panelInk(textMuted) }}>"{report.comment}"</p>
                          )}
                          {report.files && report.files.length > 0 && (
                            <div className="flex items-center gap-1.5 sm:gap-2 mt-2 sm:mt-3 pl-9 sm:pl-11">
                              {report.files.slice(0, 4).map((file, idx) => (
                                <button key={idx}
                                  onClick={(e) => { e.stopPropagation(); openFileViewer(file); }}
                                  className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg overflow-hidden border transition-all hover:scale-110"
                                  style={{ background: surfaceHover, borderColor }}
                                  title={file.name}>
                                  {file.type.startsWith('image/') ? (
                                    <img src={file.url} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                      <File className="w-3.5 h-3.5" style={{ color: panelInk(textMuted) }} />
                                    </div>
                                  )}
                                </button>
                              ))}
                              {report.files.length > 4 && (
                                <span className="text-xs font-extralight" style={{ color: panelInk(textMuted) }}>+{report.files.length - 4}</span>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col sm:flex-row items-end sm:items-center gap-1.5 sm:gap-2 flex-shrink-0">
                          <span className={`text-[10px] sm:text-xs font-extralight px-2 sm:px-2.5 py-1 rounded-full border ${statusCfg.bg} ${statusCfg.color} ${statusCfg.border} whitespace-nowrap`}>
                            {statusCfg.label}
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteReport(report.id, (report as any).reportPath); }}
                              className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:bg-red-950/40 opacity-0 group-hover:opacity-100"
                              style={{ color: panelInk(textMuted) }}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            <ChevronRight className="w-4 h-4" style={{ color: panelInk(textMuted) }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Dialog: Detalle del reporte */}
            <Dialog open={showReportDetail} onOpenChange={setShowReportDetail}>
              <DialogContent
                style={{ background: cardBg, borderColor, color: panelInk(textPrimary) }}
                className="w-[calc(100vw-2rem)] max-w-2xl max-h-[90vh] overflow-y-auto ceo-scroll border rounded-2xl">
                {selectedReport && (() => {
                  const cfg = REPORT_STATUS_CONFIG[selectedReport.status];
                  const Icon = cfg.icon;
                  return (
                    <>
                      <DialogHeader>
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                            style={{ background: `${cfg.accent}15`, border: `1px solid ${cfg.accent}30` }}>
                            <Icon className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: panelInk(cfg.accent) }} />
                          </div>
                          <div className="min-w-0">
                            <DialogTitle className="font-extralight text-base sm:text-lg truncate">{selectedReport.taskTitle}</DialogTitle>
                            <DialogDescription className="font-extralight text-xs" style={{ color: panelInk(textMuted) }}>
                              {selectedReport.userName} · {selectedReport.createdAt?.toDate
                                ? new Date(selectedReport.createdAt.toDate()).toLocaleString('es-PE')
                                : new Date(selectedReport.createdAt).toLocaleString('es-PE')}
                            </DialogDescription>
                          </div>
                        </div>
                      </DialogHeader>
                      <div className="space-y-4 sm:space-y-5 py-2">
                        <div>
                          <p className="text-xs font-extralight uppercase tracking-wider mb-2" style={{ color: panelInk(textMuted) }}>Estado</p>
                          <div className={`p-3 rounded-xl border ${cfg.bg} ${cfg.border}`}>
                            <p className={`font-extralight text-sm ${cfg.color}`}>{cfg.label}</p>
                          </div>
                        </div>
                        {selectedReport.reason && (
                          <div>
                            <p className="text-xs font-extralight uppercase tracking-wider mb-2" style={{ color: panelInk('#f87171') }}>Motivo de no completarla</p>
                            <div className="p-3 sm:p-4 rounded-xl border font-extralight whitespace-pre-wrap text-sm"
                              style={{ background: 'rgba(248,113,113,0.06)', borderColor: 'rgba(248,113,113,0.2)', color: panelInk(textPrimary) }}>
                              {selectedReport.reason}
                            </div>
                          </div>
                        )}
                        {selectedReport.comment && (
                          <div>
                            <p className="text-xs font-extralight uppercase tracking-wider mb-2" style={{ color: panelInk(textMuted) }}>Comentario / Avance</p>
                            <div className="p-3 sm:p-4 rounded-xl border font-extralight whitespace-pre-wrap text-sm"
                              style={{ background: surfaceSubtle, borderColor, color: panelInk(textPrimary) }}>
                              {selectedReport.comment}
                            </div>
                          </div>
                        )}
                        {selectedReport.files && selectedReport.files.length > 0 && (
                          <div>
                            <p className="text-xs font-extralight uppercase tracking-wider mb-2" style={{ color: panelInk(textMuted) }}>
                              Archivos Adjuntos ({selectedReport.files.length})
                            </p>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                              {selectedReport.files.map((file, idx) => {
                                const isImage = file.type?.startsWith('image/');
                                const isVideo = file.type?.startsWith('video/');
                                return (
                                  <div key={idx}
                                    className="group relative rounded-xl overflow-hidden border cursor-pointer transition-colors hover:border-[var(--tr-linea-2,rgba(255,255,255,0.15))]"
                                    style={{ background: surfaceSubtle, borderColor }}
                                    onClick={() => openFileViewer(file)}>
                                    {isImage && (
                                      <div className="aspect-[4/3] w-full overflow-hidden">
                                        <img src={file.url} alt={file.name} className="w-full h-full object-cover transition-transform group-hover:scale-105"
                                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                      </div>
                                    )}
                                    {isVideo && (
                                      <div className="aspect-[4/3] w-full flex items-center justify-center" style={{ background: '#000' }}>
                                        <Play className="w-8 h-8 opacity-60" style={{ color: panelInk(textPrimary) }} />
                                      </div>
                                    )}
                                    {!isImage && !isVideo && (
                                      <div className="aspect-[4/3] w-full flex items-center justify-center" style={{ background: surfaceSubtle }}>
                                        <File className="w-8 h-8 opacity-30" style={{ color: panelInk(textPrimary) }} />
                                      </div>
                                    )}
                                    <div className="p-2 sm:p-3">
                                      <p className="text-xs sm:text-sm font-extralight truncate" style={{ color: panelInk(textPrimary) }}>{file.name}</p>
                                      {file.size && file.size > 0 && (
                                        <p className="text-xs font-extralight" style={{ color: panelInk(textMuted) }}>{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                                      )}
                                      <div className="flex gap-2 mt-2">
                                        <button onClick={(e) => { e.stopPropagation(); openFileViewer(file); }}
                                          className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-extralight transition-all hover:bg-[var(--moon-surface-raised)]"
                                          style={{ border: `1px solid ${borderColor}`, color: panelInk(textMuted) }}>
                                          <Eye className="w-3 h-3" /> Ver
                                        </button>
                                        <button onClick={(e) => { e.stopPropagation(); handleDownloadFile(file.url, file.name); }}
                                          className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-extralight transition-all hover:bg-[var(--moon-surface-raised)]"
                                          style={{ border: `1px solid ${borderColor}`, color: panelInk(textMuted) }}>
                                          <Download className="w-3 h-3" /> Descargar
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                      <DialogFooter>
                        <button onClick={() => setShowReportDetail(false)}
                          className="ceo-btn-accent w-full sm:w-auto px-5 py-2.5 rounded-xl text-sm font-extralight transition-all">
                          Cerrar
                        </button>
                      </DialogFooter>
                    </>
                  );
                })()}
              </DialogContent>
            </Dialog>
          </TabsContent>

          {/* ══════════════════════════════════════════
              PESTAÑA: BANNERS
          ══════════════════════════════════════════ */}
          <TabsContent value="banners" className="mt-4 sm:mt-6 space-y-4 sm:space-y-6 ceo-slide-up">
            <div className="flex flex-col gap-3">
              <div>
                <p className="font-extralight text-sm sm:text-base flex items-center gap-2" style={{ color: panelInk(textPrimary) }}>
                  <MonitorPlay className="w-5 h-5 flex-shrink-0" style={{ color: panelInk(accent) }} />
                  Banners del Dashboard
                </p>
                <p className="font-extralight text-xs sm:text-sm mt-0.5" style={{ color: panelInk(textMuted) }}>
                  {banners.length} banners · Autoplay: {isPlaying ? 'ON' : 'OFF'}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={async () => {
                    if (banners.length === 0) return;
                    setSavingBanner(true);
                    try {
                      if (banners.length > 0) {
                        const batch = writeBatch(db);
                        banners.forEach((banner, index) => {
                          batch.update(doc(db, 'dashboard_banners', banner.id), { orden: index, actualizadoEn: Timestamp.now() });
                        });
                        await batch.commit();
                      }
                      await setDoc(doc(db, 'dashboard_config', 'banner_settings'), {
                        autoplay: isPlaying, interval: bannerSettings.interval, quality: bannerSettings.quality,
                        actualizadoEn: Timestamp.now(), actualizadoPor: userProfile?.displayName || 'CEO',
                      });
                      try {
                        await logActivity('BANNERS_CONFIG_SAVED', { interval: bannerSettings.interval, autoplay: isPlaying }, userProfile?.uid || '', userProfile?.displayName || 'CEO');
                      } catch (logError) { console.warn('logActivity falló:', logError); }
                      setSaveSuccessModal(true);
                    } catch (error) { console.error('Error saving banners:', error); toast.error('No se pudieron guardar los banners'); }
                    finally { setSavingBanner(false); }
                  }}
                  disabled={savingBanner || banners.length === 0}
                  className="ceo-btn-press flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-extralight border disabled:opacity-40"
                  style={{ borderColor: '#34d39940', color: panelInk('#34d399'), background: 'rgba(52,211,153,0.08)' }}>
                  {savingBanner ? <><RefreshCw className="w-3 h-3 animate-spin" />Guardando...</> : <><CheckCircle className="w-3 h-3" />Guardar</>}
                </button>
                <Select value={bannerSettings.interval.toString()} onValueChange={(v) => setBannerSettings(s => ({...s, interval: parseInt(v)}))}>
                  <SelectTrigger className="w-20 font-extralight text-xs" style={{ background: surfaceSubtle, border: `1px solid ${borderColor}`, color: panelInk(textPrimary) }}>
                    <Clock className="w-3 h-3 mr-1" /><SelectValue />
                  </SelectTrigger>
                  <SelectContent className="ceo-listbox" style={{ background: 'var(--moon-surface, #18181b)', border: `1px solid ${borderColor}`, zIndex: 9999 }}>
                    {[['3000','3s'],['5000','5s'],['7000','7s'],['10000','10s']].map(([v,l]) => (
                      <SelectItem key={v} value={v} className="font-extralight text-xs" style={{ color: panelInk(textPrimary) }}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <button onClick={() => setIsPlaying(!isPlaying)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-extralight transition-all border"
                  style={{ borderColor, color: panelInk(isPlaying ? '#34d399' : textMuted), background: 'transparent' }}>
                  {isPlaying ? <><Pause className="w-3 h-3" />Pausar</> : <><Play className="w-3 h-3" />Reanudar</>}
                </button>
                <button onClick={() => setShowBannerModal(true)}
                  className="ceo-btn-accent ceo-btn-press flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-xl text-xs font-extralight ml-auto">
                  <Plus className="w-3.5 h-3.5" /> Nuevo Banner
                </button>
              </div>
            </div>

            {banners.length > 0 && (
              <div data-moon-reveal="card"
                className="moon-panel relative w-full rounded-2xl overflow-hidden border group"
                style={{ borderColor }}
                onMouseEnter={() => setHoveringBanner(true)}
                onMouseLeave={() => setHoveringBanner(false)}
              >
                <div className="relative w-full" style={{ height: '200px' }}>
                  <style>{`@media(min-width:640px){.ceo-carousel-inner{height:320px!important;}}`}</style>
                  <div className="ceo-carousel-inner w-full relative overflow-hidden rounded-2xl" style={{ height: '200px' }}>
                    {banners.map((b, idx) => (
                      <div key={b.id}
                        className={`absolute inset-0 transition-all duration-700 ease-out ${idx === bannerActivo ? 'opacity-100 scale-100' : 'opacity-0 scale-105'}`}>
                        <img src={b.url} alt={b.titulo} className="w-full h-full object-cover cursor-pointer"
                          onClick={() => { setCurrentBannerIndex(idx); setLightboxOpen(true); setZoomLevel(1); setImageOffset({x:0,y:0}); }} />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                        <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-6">
                          <div className="flex items-end justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <span className="inline-block mb-1 sm:mb-2 px-2 py-0.5 rounded-full text-[10px] font-extralight"
                                style={{ background: `${accent}30`, color: panelInk(accent), border: `1px solid ${accent}40` }}>
                                {idx + 1} / {banners.length}
                              </span>
                              <h3 className="font-extralight text-lg sm:text-2xl mb-0.5 sm:mb-1 truncate" style={{ color: 'var(--moon-media-ink)' }}>{b.titulo}</h3>
                              {b.descripcion && <p className="font-extralight text-xs sm:text-sm opacity-90 truncate hidden sm:block" style={{ color: 'rgba(255,255,255,0.8)' }}>{b.descripcion}</p>}
                            </div>
                            <button onClick={(e) => { e.stopPropagation(); setCurrentBannerIndex(idx); setLightboxOpen(true); setZoomLevel(1); }}
                              className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-extralight backdrop-blur-sm transition-all hover:bg-white/20 flex-shrink-0"
                              style={{ background: 'var(--moon-media-shade)', border: '1px solid rgba(255,255,255,0.2)', color: 'var(--moon-media-ink)' }}>
                              <Maximize2 className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Ver HD</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                    {banners.length > 1 && (
                      <>
                        <button onClick={() => { setBannerActivo(p => (p - 1 + banners.length) % banners.length); setIsPlaying(false); setTimeout(() => setIsPlaying(true), 10000); }}
                          className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 moon-media-overlay bg-black/40 hover:bg-black/70 moon-panel-ink rounded-full w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                          <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
                        </button>
                        <button onClick={() => { setBannerActivo(p => (p + 1) % banners.length); setIsPlaying(false); setTimeout(() => setIsPlaying(true), 10000); }}
                          className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 moon-media-overlay bg-black/40 hover:bg-black/70 moon-panel-ink rounded-full w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
                          <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
                        </button>
                        <div className="absolute bottom-2 sm:bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 sm:gap-2">
                          {banners.map((_, idx) => (
                            <button key={idx} onClick={() => { setBannerActivo(idx); }}
                              className="h-1 rounded-full bg-white transition-all"
                              style={{ width: idx === bannerActivo ? 24 : 6, opacity: idx === bannerActivo ? 1 : 0.5 }} />
                          ))}
                        </div>
                      </>
                    )}
                    {isPlaying && (
                      <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: 'rgba(255,255,255,0.1)' }}>
                        <div className="h-full animate-[ceoProgress_5s_linear_infinite]"
                          style={{ background: accent, animationDuration: `${bannerSettings.interval}ms`, transformOrigin: 'left' }} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {bannersLoading ? (
              <div className="flex justify-center py-12 gap-3">
                <RefreshCw className="w-6 h-6 animate-spin" style={{ color: panelInk(accent) }} />
              </div>
            ) : banners.length === 0 ? (
              <div data-moon-reveal="card" className="moon-panel flex flex-col items-center justify-center py-16 rounded-2xl border-2 border-dashed cursor-pointer transition-all"
                style={{ borderColor }} onClick={() => setShowBannerModal(true)}>
                <ImageIcon className="w-12 h-12 mb-3 opacity-15" style={{ color: panelInk(accent) }} />
                <p className="font-extralight text-sm" style={{ color: panelInk(textMuted) }}>No hay banners. Toca para agregar.</p>
              </div>
            ) : (
              <div className="ceo-stagger grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {banners.map((banner, idx) => (
                  <div data-moon-reveal="card" key={banner.id}
                    className="moon-panel ceo-card-lift rounded-2xl overflow-hidden border group"
                    style={{
                      background: cardBg, borderColor,
                      boxShadow: idx === bannerActivo ? `0 0 0 2px ${accent}50` : 'none',
                    }}>
                    <div className="relative aspect-video overflow-hidden" style={{ background: surfaceSubtle }}>
                      <img src={banner.url} alt={banner.titulo} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" />
                      <div className="absolute inset-0 moon-media-overlay bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <button onClick={() => { setCurrentBannerIndex(idx); setLightboxOpen(true); setZoomLevel(1); }}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-extralight transition-all hover:bg-white/20"
                          style={{ border: '1px solid rgba(255,255,255,0.3)', color: 'var(--moon-media-ink)', background: 'var(--moon-media-shade)' }}>
                          <ZoomIn className="w-3.5 h-3.5" /> Zoom
                        </button>
                        <button onClick={() => setBannerActivo(idx)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-extralight transition-all hover:bg-white/20"
                          style={{ border: '1px solid rgba(255,255,255,0.3)', color: 'var(--moon-media-ink)', background: 'var(--moon-media-shade)' }}>
                          <Eye className="w-3.5 h-3.5" /> Ver
                        </button>
                      </div>
                      {idx === bannerActivo && (
                        <div className="absolute top-2 left-2">
                          <span className="ceo-glow-pulse px-2 py-0.5 rounded-full text-[10px] font-extralight flex items-center gap-1"
                            style={{ background: `${accent}90`, color: 'var(--moon-media-ink)', borderRadius: '9999px' }}>
                            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" /> Activo
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-extralight text-sm truncate flex-1" style={{ color: panelInk(textPrimary) }}>{banner.titulo}</p>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button onClick={() => { if (idx > 0) { const nb = [...banners]; [nb[idx],nb[idx-1]]=[nb[idx-1],nb[idx]]; setBanners(nb); if(bannerActivo===idx)setBannerActivo(idx-1); } }}
                            disabled={idx === 0} className="w-6 h-6 rounded flex items-center justify-center transition-colors hover:bg-[var(--moon-surface-raised)] disabled:opacity-30" style={{ color: panelInk(textMuted) }}>
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => { if (idx < banners.length - 1) { const nb = [...banners]; [nb[idx],nb[idx+1]]=[nb[idx+1],nb[idx]]; setBanners(nb); if(bannerActivo===idx)setBannerActivo(idx+1); } }}
                            disabled={idx === banners.length - 1} className="w-6 h-6 rounded flex items-center justify-center transition-colors hover:bg-[var(--moon-surface-raised)] disabled:opacity-30" style={{ color: panelInk(textMuted) }}>
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => handleDeleteBanner(banner.id)}
                            className="w-6 h-6 rounded flex items-center justify-center transition-colors hover:bg-red-950/40 hover:text-red-400" style={{ color: panelInk(textMuted) }}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Lightbox */}
            <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
              <DialogContent showCloseButton={false} data-fondo="oscuro" className="moon-media-overlay bg-black/95 border-0 !w-screen !h-[100dvh] !max-w-none !max-h-none p-0 gap-0 overflow-hidden rounded-none">
                <div className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-3 sm:px-4 py-3 bg-gradient-to-b from-black/80 to-transparent">
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="font-extralight text-xs sm:text-sm moon-panel-ink truncate">{banners[currentBannerIndex]?.titulo}</p>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extralight flex-shrink-0" style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)' }}>
                      {currentBannerIndex + 1}/{banners.length}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                    {imageDimensions.naturalWidth > 0 && (
                      <span className="text-xs font-extralight hidden md:block" style={{ color: 'rgba(255,255,255,0.5)' }}>
                        {imageDimensions.naturalWidth}×{imageDimensions.naturalHeight}
                      </span>
                    )}
                    <div className="flex items-center gap-0.5 sm:gap-1 rounded-xl p-1 border" style={{ background: 'rgba(0,0,0,0.5)', borderColor: 'rgba(255,255,255,0.1)' }}>
                      <button onClick={() => setZoomLevel(z => Math.max(0.5, z - 0.25))} className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg transition-colors hover:bg-white/10" style={{ color: 'rgba(255,255,255,0.7)' }}>
                        <ZoomOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </button>
                      <span className="text-xs font-extralight w-10 text-center" style={{ color: 'rgba(255,255,255,0.7)' }}>{Math.round(zoomLevel * 100)}%</span>
                      <button onClick={() => setZoomLevel(z => Math.min(4, z + 0.25))} className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-lg transition-colors hover:bg-white/10" style={{ color: 'rgba(255,255,255,0.7)' }}>
                        <ZoomIn className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      </button>
                    </div>
                    <button onClick={() => { setZoomLevel(1); setImageOffset({x:0,y:0}); }} className="px-2 sm:px-3 py-1.5 rounded-xl text-xs font-extralight transition-colors hover:bg-white/10 hidden sm:block" style={{ color: 'rgba(255,255,255,0.6)' }}>Reset</button>
                    <button onClick={() => setLightboxOpen(false)} className="w-8 h-8 flex items-center justify-center rounded-xl transition-colors hover:bg-white/10 ml-1" style={{ color: 'rgba(255,255,255,0.9)' }}>
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                <div
                  className="w-full h-full flex items-center justify-center overflow-hidden"
                  style={{ cursor: zoomLevel > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
                  onMouseDown={(e) => { if(zoomLevel>1){setIsDragging(true);setDragStart({x:e.clientX-imageOffset.x,y:e.clientY-imageOffset.y});} }}
                  onMouseMove={(e) => { if(isDragging&&zoomLevel>1)setImageOffset({x:e.clientX-dragStart.x,y:e.clientY-dragStart.y}); }}
                  onMouseUp={() => setIsDragging(false)}
                  onMouseLeave={() => setIsDragging(false)}
                  onWheel={(e) => { e.preventDefault(); setZoomLevel(z => Math.max(0.5, Math.min(4, z + (e.deltaY>0?-0.1:0.1)))); }}
                  onTouchStart={(e) => { if(e.touches.length===1&&zoomLevel>1){setIsDragging(true);setDragStart({x:e.touches[0].clientX-imageOffset.x,y:e.touches[0].clientY-imageOffset.y});} }}
                  onTouchMove={(e) => { if(isDragging&&zoomLevel>1&&e.touches.length===1)setImageOffset({x:e.touches[0].clientX-dragStart.x,y:e.touches[0].clientY-dragStart.y}); }}
                  onTouchEnd={() => setIsDragging(false)}
                >
                  {banners[currentBannerIndex] && (
                    <img ref={imageRef} src={banners[currentBannerIndex].url} alt={banners[currentBannerIndex].titulo}
                      className="max-w-full max-h-full object-contain select-none"
                      style={{ transform: `scale(${zoomLevel}) translate(${imageOffset.x/zoomLevel}px,${imageOffset.y/zoomLevel}px)`, transition: isDragging ? 'none' : 'transform 0.2s' }}
                      onLoad={(e) => { const img = e.target as HTMLImageElement; setImageDimensions({width:img.width,height:img.height,naturalWidth:img.naturalWidth,naturalHeight:img.naturalHeight}); }}
                      onClick={() => { if(zoomLevel===1)setZoomLevel(2);else{setZoomLevel(1);setImageOffset({x:0,y:0});} }}
                      draggable={false} />
                  )}
                </div>

                {banners.length > 1 && (
                  <>
                    <button onClick={() => { setCurrentBannerIndex(i=>(i-1+banners.length)%banners.length); setZoomLevel(1); setImageOffset({x:0,y:0}); }}
                      className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 moon-media-overlay bg-black/50 hover:bg-black/70 moon-panel-ink rounded-full w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center">
                      <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
                    </button>
                    <button onClick={() => { setCurrentBannerIndex(i=>(i+1)%banners.length); setZoomLevel(1); setImageOffset({x:0,y:0}); }}
                      className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 moon-media-overlay bg-black/50 hover:bg-black/70 moon-panel-ink rounded-full w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center">
                      <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
                    </button>
                    <div className="absolute bottom-0 left-0 right-0 p-3 sm:p-4 bg-gradient-to-t from-black/90 to-transparent">
                      <div className="flex items-center justify-center gap-1.5 sm:gap-2 overflow-x-auto ceo-scroll">
                        {banners.map((b, idx) => (
                          <button key={b.id} onClick={() => { setCurrentBannerIndex(idx); setZoomLevel(1); setImageOffset({x:0,y:0}); }}
                            className="relative flex-shrink-0 w-12 h-8 sm:w-16 sm:h-10 rounded-lg overflow-hidden border-2 transition-all"
                            style={{ borderColor: idx===currentBannerIndex ? accent : 'transparent', opacity: idx===currentBannerIndex ? 1 : 0.5 }}>
                            <img src={b.url} alt="" className="w-full h-full object-cover" />
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </DialogContent>
            </Dialog>

            {/* Modal nuevo banner */}
            <Dialog open={showBannerModal} onOpenChange={setShowBannerModal}>
              <DialogContent style={{ background: cardBg, borderColor, color: panelInk(textPrimary) }} className="w-[calc(100vw-2rem)] max-w-lg border rounded-2xl">
                <DialogHeader>
                  <DialogTitle className="font-extralight text-base sm:text-lg flex items-center gap-2">
                    <ImageIcon className="w-5 h-5" style={{ color: panelInk(accent) }} /> Nuevo Banner
                  </DialogTitle>
                  <DialogDescription className="font-extralight text-sm" style={{ color: panelInk(textMuted) }}>
                    Optimizado para 1200×400px. Formatos: JPG, PNG, WebP.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3 sm:space-y-4 py-2 max-h-[60vh] overflow-y-auto ceo-scroll pr-1">
                  <div className="space-y-1.5">
                    <Label className="font-extralight text-xs uppercase flex items-center gap-2" style={{ color: panelInk(textMuted) }}>
                      <Link className="w-3 h-3" /> URL de la imagen *
                    </Label>
                    <Input value={bannerForm.url} onChange={e => setBannerForm(f => ({...f, url: e.target.value}))}
                      placeholder="https://…"
                      style={{ background: surfaceSubtle, border: `1px solid ${borderColor}`, color: panelInk(textPrimary) }}
                      className="font-extralight" />
                    {bannerForm.url && (
                      <div className="rounded-xl overflow-hidden border mt-2" style={{ borderColor }}>
                        <img src={bannerForm.url} alt="preview" className="w-full h-28 sm:h-32 object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                      </div>
                    )}
                    <p className="text-xs font-extralight flex items-center gap-1" style={{ color: panelInk(textMuted) }}>
                      <Info className="w-3 h-3" /> Recomendado: 1200×400px, menos de 500KB
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="font-extralight text-xs uppercase" style={{ color: panelInk(textMuted) }}>Título *</Label>
                    <Input value={bannerForm.titulo} onChange={e => setBannerForm(f => ({...f, titulo: e.target.value}))}
                      placeholder="Ej: Nueva Temporada 2024" maxLength={60}
                      style={{ background: surfaceSubtle, border: `1px solid ${borderColor}`, color: panelInk(textPrimary) }}
                      className="font-extralight" />
                    <div className="flex justify-between text-xs font-extralight" style={{ color: panelInk(textMuted) }}>
                      <span>Máx. 60 caracteres</span>
                      <span>{bannerForm.titulo.length}/60</span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="font-extralight text-xs uppercase" style={{ color: panelInk(textMuted) }}>Descripción (opcional)</Label>
                    <Textarea value={bannerForm.descripcion} onChange={e => setBannerForm(f => ({...f, descripcion: e.target.value}))}
                      placeholder="Descripción breve…" rows={2} maxLength={120}
                      style={{ background: surfaceSubtle, border: `1px solid ${borderColor}`, color: panelInk(textPrimary) }}
                      className="font-extralight resize-none" />
                    <div className="text-xs font-extralight text-right" style={{ color: panelInk(textMuted) }}>{bannerForm.descripcion?.length||0}/120</div>
                  </div>
                </div>
                <DialogFooter className="flex-col sm:flex-row gap-2">
                  <Button variant="ghost" onClick={() => setShowBannerModal(false)} className="font-extralight w-full sm:w-auto" style={{ color: panelInk(textMuted) }}>Cancelar</Button>
                  <button onClick={handleSaveBanner} disabled={savingBanner || !bannerForm.url || !bannerForm.titulo}
                    className="ceo-btn-accent w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-extralight transition-all">
                    {savingBanner ? <><RefreshCw className="w-4 h-4 animate-spin" />Publicando...</> : <><CheckCircle className="w-4 h-4" />Publicar</>}
                  </button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </TabsContent>
        </Tabs>

        {/* ── Modal éxito banners ── */}
        <Dialog open={saveSuccessModal} onOpenChange={setSaveSuccessModal}>
          <DialogContent style={{ background: cardBg, borderColor, color: panelInk(textPrimary) }} className="w-[calc(100vw-2rem)] max-w-sm border text-center rounded-2xl">
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(52,211,153,0.15)', border: '1px solid rgba(52,211,153,0.3)' }}>
                <CheckCircle className="w-7 h-7 sm:w-8 sm:h-8 moon-panel-tone-green" />
              </div>
              <div>
                <h3 className="font-extralight text-base sm:text-lg" style={{ color: panelInk(textPrimary) }}>Cambios guardados</h3>
                <p className="font-extralight text-sm mt-1" style={{ color: panelInk(textMuted) }}>
                  La configuración del carrusel y el orden de banners se guardaron correctamente.
                </p>
              </div>
              <div className="w-full rounded-xl border divide-y" style={{ background: surfaceSubtle, borderColor }}>
                {[
                  { label: 'Autoplay', value: isPlaying ? 'Activado' : 'Desactivado', color: isPlaying ? '#34d399' : textMuted },
                  { label: 'Intervalo', value: `${bannerSettings.interval/1000}s`, color: textPrimary },
                  { label: 'Banners', value: `${banners.length} ordenados`, color: textPrimary },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between px-4 py-2.5" style={{ borderColor }}>
                    <span className="font-extralight text-xs" style={{ color: panelInk(textMuted) }}>{item.label}</span>
                    <span className="font-extralight text-xs" style={{ color: panelInk(item.color) }}>{item.value}</span>
                  </div>
                ))}
              </div>
              <button onClick={() => setSaveSuccessModal(false)}
                className="ceo-btn-accent w-full py-2.5 rounded-xl text-sm font-extralight transition-all">
                Entendido
              </button>
            </div>
          </DialogContent>
        </Dialog>

        {/* ── Viewer de archivos ── */}
        <Dialog open={showViewer} onOpenChange={setShowViewer}>
          {/* Tamaño acotado: antes ocupaba el 95 % de la pantalla y la imagen
              quedaba enorme. El fondo oscuro es a propósito (data-fondo). */}
          <DialogContent showCloseButton={false} data-fondo="oscuro"
            style={{ background: '#0b0b0e', borderColor }}
            className="w-[calc(100vw-2rem)] sm:w-[min(88vw,1040px)] max-w-none sm:max-w-none h-[min(84dvh,780px)] max-h-none overflow-hidden p-0 gap-0 rounded-2xl">
            {viewerFile && (
              <div className="flex flex-col h-full">
                <div className="flex items-center justify-between px-3 sm:px-5 py-2.5 sm:py-3 border-b flex-shrink-0" style={{ borderColor }}>
                  <p className="font-extralight text-xs sm:text-sm truncate pr-3 flex-1" style={{ color: 'var(--moon-ink)' }}>{viewerFile.name}</p>
                  <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                    <button onClick={() => handleDownloadFile(viewerFile.url, viewerFile.name)}
                      className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-extralight border transition-all hover:bg-[var(--moon-surface-raised)]"
                      style={{ borderColor, color: 'var(--moon-muted)' }}>
                      <Download className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Descargar</span>
                    </button>
                    <button onClick={() => setShowViewer(false)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors hover:bg-[var(--moon-surface-raised)]"
                      style={{ color: 'var(--moon-muted)' }}>
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="flex-1 flex items-center justify-center overflow-auto p-2 sm:p-4">
                  {viewerFile.type.startsWith('image/') && (
                    <img src={viewerFile.url} alt={viewerFile.name} className="max-w-full max-h-full object-contain rounded-lg" style={{ maxHeight: 'calc(min(84dvh, 780px) - 90px)' }} />
                  )}
                  {viewerFile.type.startsWith('video/') && (
                    <video src={viewerFile.url} controls className="max-w-full max-h-full rounded-xl">Tu navegador no soporta videos.</video>
                  )}
                  {viewerFile.type === 'application/pdf' && (
                    <iframe src={viewerFile.url} className="w-full border-0 rounded-xl" style={{ height: 'calc(min(84dvh, 780px) - 80px)', minHeight: '300px' }} title={viewerFile.name} />
                  )}
                  {viewerFile.type.startsWith('audio/') && (
                    <div className="flex flex-col items-center gap-4">
                      <File className="w-16 h-16 sm:w-20 sm:h-20" style={{ color: 'var(--moon-muted)' }} />
                      <audio src={viewerFile.url} controls className="w-full max-w-xs sm:max-w-md" />
                    </div>
                  )}
                  {!viewerFile.type.startsWith('image/') && !viewerFile.type.startsWith('video/') && !viewerFile.type.startsWith('audio/') && viewerFile.type !== 'application/pdf' && (
                    <div className="flex flex-col items-center gap-4" style={{ color: 'var(--moon-muted)' }}>
                      <File className="w-16 h-16 sm:w-20 sm:h-20 opacity-30" />
                      <p className="font-extralight text-sm">Vista previa no disponible</p>
                      <button onClick={() => handleDownloadFile(viewerFile.url, viewerFile.name)}
                        className="ceo-btn-accent flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-extralight">
                        <Download className="w-4 h-4" /> Descargar archivo
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* ── Modales externos ── */}
        <EmployeeProfileModal open={showProfile} onClose={() => { setShowProfile(false); setProfileUser(null); }} user={profileUser} />
        <EmployeeCredentialModal open={showCredential} onClose={() => { setShowCredential(false); setCredentialUser(null); }} user={credentialUser}
          companyLogoUrl="/brand/moon-credential.png" />
        <BarcodeScannerModal open={showScanner} onClose={() => setShowScanner(false)} allUsers={users} />
        <EmployeeContractModal open={showContract} onClose={() => { setShowContract(false); setContractUser(null); }} user={contractUser} />
      </div>
    </section>
  );
};

export default CEOPanel;
