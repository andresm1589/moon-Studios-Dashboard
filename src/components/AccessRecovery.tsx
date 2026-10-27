import { useState } from 'react';
import { RefreshCw, LogOut, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { logoutUser } from '@/lib/firebase';
import { BrandLogo } from './BrandLogo';

export default function AccessRecovery() {
  const { verifyAccess, accessError } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <main className="moon-access-recovery"><BrandLogo /><section><ShieldAlert size={32} /><span className="moon-eyebrow">ACCESO AL ESTUDIO</span><h1>Confirma tu acceso.</h1><p role="alert">{error || accessError || 'Necesitamos confirmar tu perfil antes de abrir el dashboard.'}</p><div><button disabled={busy} onClick={async () => { setBusy(true); setError(''); try { await verifyAccess(); } catch { /* Context exposes the verification error. */ } finally { setBusy(false); } }}><RefreshCw size={16} className={busy ? 'moon-spin' : ''} />{busy ? 'Verificando…' : 'Reintentar verificación'}</button><button disabled={busy} onClick={async () => { setBusy(true); try { await logoutUser(); } catch { setError('No pudimos cerrar la sesión. Inténtalo de nuevo.'); setBusy(false); } }}><LogOut size={16} />Volver al acceso</button></div></section></main>;
}
