import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, ArrowRight, Eye, EyeOff, ShieldCheck, Loader2, Mail, CheckCircle2 } from 'lucide-react';
import { auth, loginUser, resetUserPassword, logoutUser } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { BrandLogo } from '@/components/BrandLogo';
import ScanAuthModal, { type AuthEntryProfile } from '@/components/Scanauthmodal';
import type { UserProfile } from '@/types';
import './login.css';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [authedUser, setAuthedUser] = useState<AuthEntryProfile | null>(null);
  const [view, setView] = useState<'login' | 'forgot'>('login');
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState('');
  const navigate = useNavigate();
  const { currentUser, userProfile, verifyAccess, accessError } = useAuth();
  useEffect(() => {
    const sessionUid = auth.currentUser?.uid;
    if (authedUser && sessionUid !== authedUser.uid) { setAuthedUser(null); setLoading(false); }
    if (currentUser && currentUser.uid === sessionUid && view === 'login' && (!authedUser || authedUser.uid !== sessionUid)) {
      setAuthedUser(userProfile?.uid === sessionUid ? userProfile : { uid: currentUser.uid, email: currentUser.email || '', displayName: currentUser.displayName || undefined, avatar: currentUser.photoURL || undefined });
    }
  }, [currentUser, userProfile, view, authedUser]);
  const enterWorkspace = useCallback((profile: UserProfile) => { if (auth.currentUser?.uid === profile.uid) navigate('/dashboard', { replace: true }); else { setAuthedUser(null); setLoading(false); setError('La sesión cambió. Vuelve a iniciar sesión.'); } }, [navigate]);
  const cancelAccess = useCallback(async () => {
    try { await logoutUser(); setAuthedUser(null); setLoading(false); setPassword(''); setError(''); }
    catch { throw new Error('No pudimos cerrar la sesión. Comprueba tu conexión e inténtalo de nuevo.'); }
  }, []);
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;
    setError('');
    if (!email.trim() || !password) { setError('Ingresa tu correo electrónico y contraseña para continuar.'); return; }
    setLoading(true);
    try {
      const credential = await loginUser(email.trim(), password);
      if (auth.currentUser?.uid !== credential.user.uid) throw new Error('La sesión cambió.');
      setAuthedUser({ uid: credential.user.uid, email: credential.user.email || email.trim(), displayName: credential.user.displayName || undefined, avatar: credential.user.photoURL || undefined });
    } catch { setError('No pudimos iniciar sesión. Revisa tu correo y contraseña e inténtalo de nuevo.'); setLoading(false); }
  };
  const handleResetPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (resetLoading) return;
    setResetError('');
    if (!resetEmail.trim()) { setResetError('Ingresa tu correo electrónico.'); return; }
    setResetLoading(true);
    try { await resetUserPassword(resetEmail.trim()); setResetSent(true); }
    catch (err: unknown) { if ((err as { code?: string })?.code === 'auth/invalid-email') setResetError('El formato del correo no es válido.'); else setResetSent(true); }
    finally { setResetLoading(false); }
  };
  const backToLogin = () => { setView('login'); setResetSent(false); setResetError(''); };
  return <div className={`moon-login${authedUser ? ' is-verifying' : ''}`}>
    {authedUser && <ScanAuthModal key={authedUser.uid} user={authedUser} verifyAccess={verifyAccess} onComplete={enterWorkspace} onCancel={cancelAccess} />}
    <aside className="moon-login-story" aria-label="Moon Studios, espacio de trabajo" inert={!!authedUser}>
      <BrandLogo variant="light" className="moon-login-brand" />
      <div className="moon-login-art" aria-hidden="true"><div className="moon-login-orbit" /><div className="moon-login-orbit moon-login-orbit-two" /><div className="moon-login-orbit moon-login-orbit-three" /><div className="moon-login-moon"><BrandLogo variant="light" compact /></div><span className="moon-login-coordinate">12° S / 77° O</span><span className="moon-login-art-caption">EL SIGUIENTE PASO<br />EMPIEZA AQUÍ.</span></div>
      <div className="moon-login-story-copy"><span className="moon-eyebrow">UN EQUIPO. UNA ÓRBITA.</span><h2>Grandes ideas.<br /><span>Trabajo en equipo.</span></h2><p>El espacio donde conectamos personas, proyectos y todo lo que estamos construyendo.</p></div>
      <div className="moon-login-story-footer"><span>MOON STUDIOS © {new Date().getFullYear()}</span><span>PORTAL CORPORATIVO <ArrowUpRight size={13} /></span></div>
    </aside>
    <main className="moon-login-main" inert={!!authedUser}>
      <header className="moon-login-top"><BrandLogo className="moon-login-mobile-brand" /><a href="https://moon-studios.netlify.app/" target="_blank" rel="noopener noreferrer">Visitar el estudio <ArrowUpRight size={15} /></a></header>
      <div className="moon-login-form-wrap">
        <div className="moon-login-access"><span /> ESPACIO DE TRABAJO</div>
        {view === 'login' ? <>
          <h1>Tu equipo,<br /><span>más cerca.</span></h1><p className="moon-login-intro">Bienvenido de nuevo. Entra a tu espacio de Moon Studios.</p>
          {(error || accessError) && <div className="moon-login-error" role="alert"><p>{error || accessError}</p>{currentUser && !authedUser && <button type="button" onClick={() => { void verifyAccess().catch(() => {}); }}>Reintentar verificación</button>}</div>}
          <form onSubmit={handleSubmit} className="moon-login-form" aria-busy={loading}>
            <label htmlFor="moon-email">Correo electrónico</label><input id="moon-email" type="email" autoComplete="username" placeholder="nombre@ejemplo.com" value={email} onChange={event => setEmail(event.target.value)} required disabled={loading} />
            <div className="moon-login-label-row"><label htmlFor="moon-password">Contraseña</label><button type="button" onClick={() => { setView('forgot'); setResetEmail(email); setError(''); }}>¿La olvidaste?</button></div>
            <div className="moon-login-password"><input id="moon-password" type={showPass ? 'text' : 'password'} autoComplete="current-password" placeholder="Ingresa tu contraseña" value={password} onChange={event => setPassword(event.target.value)} required disabled={loading} /><button type="button" aria-label={showPass ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={showPass} onClick={() => setShowPass(value => !value)}>{showPass ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
            <button className="moon-login-submit" type="submit" disabled={loading}>{loading ? <><Loader2 className="moon-spin" size={18} /> Verificando acceso</> : <>Entrar al dashboard <ArrowRight size={18} /></>}</button>
          </form>
        </> : <>
          <button className="moon-login-back" onClick={backToLogin}><ArrowLeft size={16} /> Volver al acceso</button>
          {!resetSent ? <>
            <h1>Recupera<br /><span>tu acceso.</span></h1><p className="moon-login-intro">Te enviaremos un enlace para crear una nueva contraseña.</p>
            {resetError && <p className="moon-login-error" role="alert">{resetError}</p>}
            <form onSubmit={handleResetPassword} className="moon-login-form" aria-busy={resetLoading}>
              <label htmlFor="moon-reset-email">Correo electrónico</label><input id="moon-reset-email" type="email" autoComplete="email" value={resetEmail} onChange={event => setResetEmail(event.target.value)} placeholder="nombre@ejemplo.com" required autoFocus disabled={resetLoading} />
              <button type="submit" className="moon-login-submit" disabled={resetLoading}>{resetLoading ? <><Loader2 className="moon-spin" size={18} /> Enviando enlace</> : <>Enviar enlace <Mail size={18} /></>}</button>
            </form>
          </> : <div className="moon-login-reset-success" role="status"><CheckCircle2 size={36} /><h1>Revisa<br /><span>tu correo.</span></h1><p className="moon-login-intro">Si existe una cuenta asociada a <strong>{resetEmail}</strong>, recibirás un enlace para restablecer tu contraseña. Revisa también la carpeta de spam.</p><button className="moon-login-submit" onClick={backToLogin}>Volver a iniciar sesión <ArrowRight size={18} /></button><button className="moon-login-back" onClick={() => setResetSent(false)}>Intentar con otro correo</button></div>}
        </>}
        <div className="moon-login-trust"><ShieldCheck size={17} /><p>Acceso exclusivo para el equipo.<br /><span>Tus permisos y tu espacio, siempre conectados.</span></p></div>
      </div>
      <footer className="moon-login-footer"><span>CREAR. CONECTAR. CRECER.</span><span>MOON / WORKSPACE</span></footer>
    </main>
  </div>;
}
