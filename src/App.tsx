import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import type { Permission } from '@/types';
import { SettingsProvider, useSettings } from '@/contexts/SettingsContext';
import Login from '@/components/Login';
import DashboardLayout from '@/components/DashboardLayout';
import DashboardHome from '@/components/DashboardHome';
import Calendar from '@/components/Calendar';
import MisTareas from '@/components/MisTareas';
import DiscordBot from '@/components/DiscordBot';
import Announcements from '@/components/Announcements';
import Users from '@/components/Users';
import Settings from '@/components/Settings';
import CEOPanel from '@/components/CEOPanel';
import Correo from '@/components/Correo';
import Hilos, { HilosObserverView } from '@/components/Hilos';
import Mensajeria from '@/components/Mensajeria';
import Contador from '@/components/Contador';
import Webs from '@/Pages/Webs';
import PanelProgramacion from '@/components/PanelProgramacion';
import Proyectos from '@/components/Proyectos';
import PanelAdmin      from '@/components/PanelAdmin';
import PanelDiseno     from '@/components/PanelDiseno';
import PanelRoles      from '@/components/PanelRoles';
import PanelSecretaria from '@/components/PanelSecretaria';
import TitleBar from '@/components/TitleBar';
import UpdateNotifier from '@/components/UpdateNotifier';
import { Toaster } from 'sonner';
import { interceptarEnlacesExternos } from '@/lib/escritorio';

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
  <div style={{ height: '100%', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <span style={{ color: '#fff', fontWeight: 200 }}>Cargando...</span>
  </div>
);

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!currentUser) return <Navigate to="/" replace />;
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
            <Routes>
              <Route path="/" element={<Login />} />
              <Route path="/hilos/observe/:hiloId" element={<HilosObserverWrapper />} />
              <Route path="/dashboard" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
                <Route index element={<DashboardHome />} />
                <Route path="calendar"      element={<Calendar />} />
                <Route path="tareas"        element={<MisTareas />} />
                <Route path="discord"       element={<DiscordBot />} />
                <Route path="announcements" element={<Announcements />} />
                <Route path="correo"        element={<Correo />} />
                <Route path="hilos"         element={<Hilos />} />
                <Route path="mensajeria"    element={<Mensajeria />} />
                <Route path="proyectos" element={<Proyectos />} />
                <Route path="settings"      element={<Settings />} />
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
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Router>
        </div>
      </SettingsProvider>
    </AuthProvider>
  );
}

export default App;