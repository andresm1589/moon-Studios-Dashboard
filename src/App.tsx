import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import type { Permission } from '@/types';
import { SettingsProvider, useSettings } from '@/contexts/SettingsContext';
import Login from '@/components/Login';
import TitleBar from '@/components/TitleBar';
// La conferencia activa sigue al navegar por el dashboard (ventanita / ventana flotante).
import { SalaActivaProvider } from '@/components/conferencias/SalaActivaProvider';
import UpdateNotifier from '@/components/UpdateNotifier';
import { BrandLogo } from '@/components/BrandLogo';
import { Loader2 } from 'lucide-react';
import WorkspaceNotFound from '@/components/WorkspaceNotFound';
import AccessRecovery from '@/components/AccessRecovery';
import { Toaster } from 'sonner';
import { interceptarEnlacesExternos } from '@/lib/escritorio';

// Load each tool when opened, keeping the access screen and workspace lighter.
const DashboardLayout = React.lazy(() => import('@/components/DashboardLayout'));
const DashboardHome = React.lazy(() => import('@/components/DashboardHome'));
const Calendar = React.lazy(() => import('@/components/Calendar'));
const MisTareas = React.lazy(() => import('@/components/MisTareas'));
const DiscordBot = React.lazy(() => import('@/components/DiscordBot'));
const Announcements = React.lazy(() => import('@/components/Announcements'));
const Users = React.lazy(() => import('@/components/Users'));
const Settings = React.lazy(() => import('@/components/Settings'));
const CEOPanel = React.lazy(() => import('@/components/CEOPanel'));
const Correo = React.lazy(() => import('@/components/Correo'));
const Hilos = React.lazy(() => import('@/components/Hilos'));
const HilosObserverView = React.lazy(() => import('@/components/Hilos').then(module => ({ default: module.HilosObserverView })));
const Mensajeria = React.lazy(() => import('@/components/Mensajeria'));
const Contador = React.lazy(() => import('@/components/Contador'));
const Webs = React.lazy(() => import('@/Pages/Webs'));
const PanelProgramacion = React.lazy(() => import('@/components/PanelProgramacion'));
const Proyectos = React.lazy(() => import('@/components/Proyectos'));
const ElectionsPanel = React.lazy(() => import('@/components/ElectionsPanel'));
const PanelAdmin = React.lazy(() => import('@/components/PanelAdmin'));
const PanelDiseno = React.lazy(() => import('@/components/PanelDiseno'));
const PanelRoles = React.lazy(() => import('@/components/PanelRoles'));
const PanelSecretaria = React.lazy(() => import('@/components/PanelSecretaria'));
const Tramites = React.lazy(() => import('@/components/tramites/Tramites'));
const Conferencias = React.lazy(() => import('@/components/conferencias/Conferencias'));
const AccesoAdministracion = React.lazy(() => import('@/components/AccesoAdministracion'));

// Hook para detectar Tauri
const useIsTauri = () => {
  const [isTauri, setIsTauri] = React.useState(false);
  React.useEffect(() => {
    setIsTauri(typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window);
  }, []);
  return isTauri;
};

const HilosObserverWrapper: React.FC = () => {
  const { hiloId } = useParams<{ hiloId: string }>();
  return <HilosObserverView hiloId={hiloId || ''} />;
};

const PageLoader = () => (
  <div className="moon-page-loader" role="status">
    <BrandLogo /><span><Loader2 size={15} className="moon-spin" /> Preparando tu espacio</span>
  </div>
);

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, userProfile, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!currentUser) return <Navigate to="/" replace />;
  if (!userProfile) return <AccessRecovery />;
  return <>{children}</>;
};

// Entra quien tenga el permiso del panel en ROLE_PERMISSIONS (el CEO, a todos).
const PermisoRoute: React.FC<{ children: React.ReactNode; permiso: Permission }> = ({ children, permiso }) => {
  const { loading, puede } = useAuth();
  if (loading) return <PageLoader />;
  if (!puede(permiso)) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
};

/** Los avisos (toasts) en el tema elegido: antes eran siempre oscuros. */
function AvisosConTema({ top }: { top: number }) {
  const { isDark } = useSettings();
  return <Toaster theme={isDark ? 'dark' : 'light'} richColors closeButton position="bottom-right" offset={{ top, bottom: 16 }} />;
}

function App() {
  const isTauri = useIsTauri();
  // En la app de escritorio, los enlaces externos se abrían dentro de la ventana.
  React.useEffect(() => interceptarEnlacesExternos(), []);
  const titleBarHeight = isTauri ? 42 : 0;

  // Exponer el offset del TitleBar como variable CSS global.
  // Todos los overlays con `position:fixed` deben usar
  // `top: var(--titlebar-offset)` en lugar de `inset:0`
  // para no quedar por debajo de la barra de ventana en Tauri.
  React.useEffect(() => {
    document.documentElement.style.setProperty(
      '--titlebar-offset',
      isTauri ? '42px' : '0px',
    );
  }, [isTauri]);

  return (
    <AuthProvider>
      <SettingsProvider>
        <UpdateNotifier />
        {/* TitleBar solo aparece en Tauri */}
        <TitleBar />
        {/* Avisos flotantes (toast). Muchos paneles llaman a toast() de sonner,
            pero el Toaster no estaba montado: ningún aviso se veía. */}
        <AvisosConTema top={titleBarHeight + 12} />


        {/* Contenido: top dinámico según si hay TitleBar o no */}
        <div style={{
          position: 'fixed',
          top: `${titleBarHeight}px`,
          left: 0,
          right: 0,
          bottom: 0,
          overflow: 'hidden',
        }}>
          <Router>
            <React.Suspense fallback={<PageLoader />}><Routes>
              <Route path="/" element={<Login />} />
              <Route path="/hilos/observe/:hiloId" element={<HilosObserverWrapper />} />
              <Route path="/dashboard" element={<ProtectedRoute><SalaActivaProvider><DashboardLayout /></SalaActivaProvider></ProtectedRoute>}>
                <Route index element={<DashboardHome />} />
                <Route path="calendar"      element={<Calendar />} />
                <Route path="tareas"        element={<MisTareas />} />
                <Route path="discord"       element={<DiscordBot />} />
                <Route path="announcements" element={<Announcements />} />
                <Route path="correo"        element={<Correo />} />
                <Route path="hilos"         element={<Hilos />} />
                <Route path="mensajeria"    element={<Mensajeria />} />
                <Route path="proyectos" element={<Proyectos />} />
                <Route path="elecciones/*" element={<ElectionsPanel />} />
                <Route path="settings"      element={<Settings />} />
                <Route path="tramites"      element={<Tramites />} />
              <Route path="conferencias" element={<Conferencias />} />
                <Route path="administracion" element={<PermisoRoute permiso="acceso"><AccesoAdministracion /></PermisoRoute>} />
                <Route path="webs"          element={<PermisoRoute permiso="webs"><Webs /></PermisoRoute>} />
                <Route path="users"         element={<PermisoRoute permiso="admin"><Users /></PermisoRoute>} />
                <Route path="ceo-panel"     element={<PermisoRoute permiso="ceo"><CEOPanel /></PermisoRoute>} />
                <Route path="contador"      element={<PermisoRoute permiso="contador"><Contador /></PermisoRoute>} />
                <Route path="programacion"  element={<PermisoRoute permiso="programacion"><PanelProgramacion /></PermisoRoute>} />
                <Route path="admin"         element={<PermisoRoute permiso="admin"><PanelAdmin /></PermisoRoute>} />
                <Route path="diseno"        element={<PermisoRoute permiso="diseno"><PanelDiseno /></PermisoRoute>} />
                <Route path="roles"         element={<PermisoRoute permiso="roles"><PanelRoles /></PermisoRoute>} />
                <Route path="secretaria"    element={<PermisoRoute permiso="secretaria"><PanelSecretaria /></PermisoRoute>} />
              </Route>
              <Route path="*" element={<WorkspaceNotFound />} />
            </Routes></React.Suspense>
          </Router>
        </div>
      </SettingsProvider>
    </AuthProvider>
  );
}

export default App;
