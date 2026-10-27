import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowRight, Check, CheckCheck, Fingerprint, LoaderCircle, LockKeyhole, LogOut, RefreshCw, ShieldCheck, TriangleAlert, UserRound } from 'lucide-react';
import { BrandLogo } from '@/components/BrandLogo';
import type { UserProfile } from '@/types';
import './auth-welcome.css';

export type AuthVerificationStep = 'session' | 'profile' | 'access';
export type AuthWelcomePhase = 'verifying' | 'confirmed' | 'welcome' | 'error';
export type AuthEntryProfile = Pick<UserProfile, 'uid' | 'email'> & Partial<Omit<UserProfile, 'uid' | 'email'>>;

const STEPS = [
  { id: 'session', label: 'Sesión de acceso', detail: 'Comprobando tu sesión con el servidor.', icon: Fingerprint },
  { id: 'profile', label: 'Identidad del equipo', detail: 'Consultando tu perfil actualizado.', icon: UserRound },
  { id: 'access', label: 'Permisos del espacio', detail: 'Validando el acceso de tu cuenta.', icon: LockKeyhole },
] as const;

export interface AuthWelcomeViewProps {
  profile: AuthEntryProfile;
  phase: AuthWelcomePhase;
  step: AuthVerificationStep;
  error?: string | null;
  qrDataUrl?: string;
  autoEnterSeconds?: number | null;
  onRetry: () => void;
  onCancel: () => void | Promise<void>;
  onEnter: () => void;
}

const initialsFor = (name: string) => name.trim().split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase() || 'MS';

/** Presentational surface also used by the local, network-free visual preview. */
export function AuthWelcomeView({
  profile, phase, step, error, qrDataUrl, autoEnterSeconds, onRetry, onCancel, onEnter,
}: AuthWelcomeViewProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const verified = phase === 'confirmed' || phase === 'welcome';
  const activeIndex = Math.max(0, STEPS.findIndex(item => item.id === step));
  const firstName = profile.displayName?.trim().split(/\s+/)[0] || 'de vuelta';
  const title = phase === 'error' ? 'No pudimos verificar tu acceso.'
    : phase === 'confirmed' ? 'Acceso confirmado.'
      : phase === 'welcome' ? `Bienvenido, ${firstName}.` : 'Un momento. Estamos preparando tu espacio.';

  useEffect(() => {
    // A phase replaces its controls; keep keyboard focus inside the dialog.
    if (!dialogRef.current?.contains(document.activeElement)) dialogRef.current?.focus({ preventScroll: true });
  }, [phase]);

  const containFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;
    const elements = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex="0"]') ?? []);
    const first = elements[0];
    const last = elements[elements.length - 1];
    if (!first || !last) { event.preventDefault(); return; }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) {
      event.preventDefault(); first.focus();
    }
  };

  return (
    <div className={`moon-auth moon-auth--${phase}`} role="dialog" aria-modal="true" aria-labelledby="moon-auth-title" aria-describedby="moon-auth-status" tabIndex={-1} ref={dialogRef} onKeyDown={containFocus}>
      <div className="moon-auth__ambient" aria-hidden="true" />
      <header className="moon-auth__topbar">
        <BrandLogo className="moon-auth__wordmark" />
        <span className="moon-auth__workspace"><span /> Workspace</span>
        <button type="button" className="moon-auth__exit" onClick={onCancel} aria-label="Volver al inicio de sesión"><LogOut size={15} /><span>Salir</span></button>
      </header>

      <main className="moon-auth__main">
        <section className="moon-auth__visual" aria-hidden="true">
          <div className="moon-auth__scene">
            <div className="moon-auth__coordinate moon-auth__coordinate--top">MOON / IDENTITY</div>
            <div className="moon-auth__orbit moon-auth__orbit--outer"><i /></div>
            <div className="moon-auth__orbit moon-auth__orbit--middle"><i /></div>
            <div className="moon-auth__orbit moon-auth__orbit--inner" />
            <div className="moon-auth__crosshair moon-auth__crosshair--horizontal" />
            <div className="moon-auth__crosshair moon-auth__crosshair--vertical" />
            <div className="moon-auth__core">
              {phase === 'error' ? <TriangleAlert className="moon-auth__core-alert" size={47} strokeWidth={1.15} /> : verified ? (
                <svg className="moon-auth__check" viewBox="0 0 80 80" fill="none"><circle cx="40" cy="40" r="37" /><path d="m24 40 11 11 22-24" /></svg>
              ) : <><BrandLogo compact className="moon-auth__symbol" /><span className="moon-auth__scan" /></>}
            </div>
            <span className="moon-auth__satellite moon-auth__satellite--one"><Fingerprint size={17} /></span>
            <span className="moon-auth__satellite moon-auth__satellite--two"><ShieldCheck size={17} /></span>
            <span className="moon-auth__scene-caption">{verified ? 'CONEXIÓN ESTABLECIDA' : phase === 'error' ? 'VERIFICACIÓN INTERRUMPIDA' : 'ESTABLECIENDO CONEXIÓN'}</span>
          </div>
          <div className="moon-auth__visual-copy">
            <span className="moon-auth__eyebrow">Un equipo. Un espacio.</span>
            <p>Tu siguiente órbita<br /><span>empieza aquí.</span></p>
          </div>
        </section>

        <section className="moon-auth__panel">
          <div className="moon-auth__panel-content" key={phase}>
            <div className="moon-auth__overline">
              {phase === 'error' ? <TriangleAlert size={15} /> : verified ? <ShieldCheck size={15} /> : <LockKeyhole size={15} />}
              <span>{phase === 'error' ? 'Acceso pendiente' : verified ? 'Identidad verificada' : 'Verificación de acceso'}</span>
              <span className="moon-auth__phase-index">{verified ? '03' : String(activeIndex + 1).padStart(2, '0')} / 03</span>
            </div>
            <h1 id="moon-auth-title">{title}</h1>
            <p id="moon-auth-status" className="moon-auth__description" role="status" aria-live="polite">
              {phase === 'error' ? (error || 'La conexión no permitió completar la verificación. Puedes intentarlo otra vez.')
                : verified ? 'Tu sesión y tus permisos están listos. Hagamos que las ideas sigan avanzando.'
                  : 'Validamos tu sesión, tu perfil y tus permisos antes de darte acceso al dashboard.'}
            </p>

            {verified ? (
              <div className="moon-auth__verified-content">
                <div className="moon-auth__identity moon-auth__identity--verified">
                  <div className="moon-auth__avatar">
                    {profile.avatar ? <img src={profile.avatar} alt="" /> : <span>{initialsFor(profile.displayName || '')}</span>}
                    <span className="moon-auth__avatar-check"><Check size={11} strokeWidth={3} /></span>
                  </div>
                  <div className="moon-auth__identity-copy"><strong>{profile.displayName || 'Miembro del equipo'}</strong><span>{profile.email}</span><small>{profile.role} <i /> Moon Studios</small></div>
                </div>
                <div className="moon-auth__credential">
                  <div className="moon-auth__credential-copy"><span className="moon-auth__eyebrow">Tu credencial</span><p>Identidad del equipo,<br />siempre a mano.</p><small>El QR identifica tu perfil. El acceso se valida con tu sesión.</small></div>
                  <div className="moon-auth__qr">{qrDataUrl ? <img src={qrDataUrl} alt="Código QR de identificación de tu perfil" /> : <Fingerprint size={40} strokeWidth={1} aria-label="Identificador del perfil" />}</div>
                </div>
                <button type="button" className="moon-auth__button moon-auth__button--primary" onClick={onEnter}>Entrar a mi espacio <ArrowRight size={17} /></button>
                <p className="moon-auth__automatic">{autoEnterSeconds != null ? <><span className="moon-auth__countdown" key={autoEnterSeconds}>{autoEnterSeconds}</span> Entrarás automáticamente en {autoEnterSeconds} {autoEnterSeconds === 1 ? 'segundo' : 'segundos'}.</> : <><CheckCheck size={14} /> Todo listo para continuar.</>}</p>
              </div>
            ) : (
              <>
                <div className="moon-auth__identity">
                  <div className="moon-auth__avatar">{profile.avatar ? <img src={profile.avatar} alt="" /> : <span>{initialsFor(profile.displayName || '')}</span>}</div>
                  <div className="moon-auth__identity-copy"><strong>{profile.displayName || 'Cuenta del equipo'}</strong><span>{profile.email}</span></div>
                </div>
                <ol className="moon-auth__steps" aria-label="Estado de la verificación">
                  {STEPS.map((item, index) => {
                    const Icon = item.icon;
                    const done = index < activeIndex;
                    const active = index === activeIndex;
                    return <li key={item.id} className={`${done ? 'is-done' : ''} ${active ? 'is-active' : ''} ${active && phase === 'error' ? 'has-error' : ''}`} aria-current={active ? 'step' : undefined}>
                      <span className="moon-auth__step-icon">{done ? <Check size={16} /> : <Icon size={16} />}</span>
                      <span className="moon-auth__step-copy"><strong>{item.label}</strong><small>{done ? 'Comprobado con el servidor' : active ? (phase === 'error' ? 'No se pudo completar este paso' : item.detail) : 'Pendiente'}</small></span>
                      <span className="moon-auth__step-state">{done ? <Check size={14} /> : active ? phase === 'error' ? <TriangleAlert size={16} /> : <LoaderCircle size={16} className="moon-auth__spinner" /> : <span>0{index + 1}</span>}</span>
                    </li>;
                  })}
                </ol>
                {phase === 'error' ? <div className="moon-auth__error-actions"><button className="moon-auth__button moon-auth__button--primary" type="button" onClick={onRetry}><RefreshCw size={16} /> Reintentar verificación</button><button className="moon-auth__button moon-auth__button--quiet" type="button" onClick={onCancel}>Volver al inicio de sesión</button></div>
                  : <div className="moon-auth__waiting"><div className="moon-auth__activity"><span /></div><p><span className="moon-auth__status-dot" /> Esperando la confirmación del servidor</p></div>}
              </>
            )}
          </div>
          <footer className="moon-auth__panel-footer"><ShieldCheck size={13} /><span>Acceso exclusivo para el equipo de Moon Studios</span></footer>
        </section>
      </main>
      <footer className="moon-auth__footer"><span>Moon Studios © {new Date().getFullYear()}</span><span>Ideas que llegan más lejos. <span aria-hidden="true">↗</span></span></footer>
    </div>
  );
}

interface Props {
  user: AuthEntryProfile;
  verifyAccess: (onStep: (step: AuthVerificationStep) => void) => Promise<UserProfile>;
  onComplete: (profile: UserProfile) => void;
  onCancel: () => void | Promise<void>;
  /** Set to null to require an explicit click; verification always comes first. */
  autoEnterMs?: number | null;
}

export default function ScanAuthModal({ user, verifyAccess, onComplete, onCancel, autoEnterMs = 3000 }: Props) {
  const [phase, setPhase] = useState<AuthWelcomePhase>('verifying');
  const [step, setStep] = useState<AuthVerificationStep>('session');
  const [profile, setProfile] = useState(user);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [qrDataUrl, setQrDataUrl] = useState<string>();
  const [autoEnterSeconds, setAutoEnterSeconds] = useState<number | null>(null);
  const verifyRef = useRef(verifyAccess);
  const completeRef = useRef(onComplete);
  const cancelRef = useRef(onCancel);
  const mountedRef = useRef(false);
  const attemptRef = useRef(attempt);
  const completedRef = useRef(false);
  const verifiedRef = useRef<UserProfile | null>(null);
  const requestRef = useRef<{ attempt: number; promise: Promise<UserProfile> } | null>(null);
  verifyRef.current = verifyAccess;
  completeRef.current = onComplete;
  cancelRef.current = onCancel;
  attemptRef.current = attempt;
  const isVerified = phase === 'confirmed' || phase === 'welcome';

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    setPhase('verifying');
    setStep('session');
    setError(null);
    verifiedRef.current = null;
    // Reuse the same in-flight request during React Strict Mode's effect replay.
    // UI callbacks are refs, so ordinary parent renders do not restart validation.
    if (requestRef.current?.attempt !== attempt) {
      requestRef.current = { attempt, promise: Promise.resolve().then(() => verifyRef.current(nextStep => {
        if (mountedRef.current && attemptRef.current === attempt) setStep(nextStep);
      })) };
    }
    requestRef.current.promise.then(verifiedProfile => {
      if (cancelled || !mountedRef.current || completedRef.current) return;
      verifiedRef.current = verifiedProfile;
      setProfile(verifiedProfile);
      setStep('access');
      setPhase('confirmed');
    }).catch(reason => {
      if (cancelled || !mountedRef.current || completedRef.current) return;
      setError(reason instanceof Error && reason.message ? reason.message : 'No se pudo verificar tu acceso. Revisa tu conexión e inténtalo nuevamente.');
      setPhase('error');
    });
    return () => { cancelled = true; mountedRef.current = false; };
  }, [attempt]);

  const enter = useCallback(() => {
    if (!verifiedRef.current || completedRef.current || !mountedRef.current) return;
    completedRef.current = true;
    completeRef.current(verifiedRef.current);
  }, []);

  const cancel = useCallback(async () => {
    if (completedRef.current) return;
    completedRef.current = true;
    verifiedRef.current = null;
    try { await cancelRef.current(); }
    catch {
      if (!mountedRef.current) return;
      completedRef.current = false;
      setError('No pudimos cerrar la sesión. Vuelve a intentarlo o verifica tu acceso para continuar.');
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    if (phase !== 'confirmed') return;
    const timer = window.setTimeout(() => setPhase('welcome'), 650);
    return () => window.clearTimeout(timer);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'welcome' || autoEnterMs == null || autoEnterMs <= 0) { setAutoEnterSeconds(null); return; }
    const deadline = Date.now() + autoEnterMs;
    setAutoEnterSeconds(Math.ceil(autoEnterMs / 1000));
    const countdown = window.setInterval(() => setAutoEnterSeconds(Math.max(1, Math.ceil((deadline - Date.now()) / 1000))), 250);
    const timer = window.setTimeout(enter, autoEnterMs);
    return () => { window.clearInterval(countdown); window.clearTimeout(timer); };
  }, [phase, autoEnterMs, enter]);

  useEffect(() => {
    if (!isVerified) return;
    let cancelled = false;
    // This is a local identification card, never an authentication factor or a
    // reason to grant access. It does not write credential data to Firestore.
    import('qrcode').then(QRCode => QRCode.toDataURL(JSON.stringify({ uid: profile.uid, name: profile.displayName, role: profile.role }), {
      width: 176, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#111111', light: '#ffffff' },
    })).then(url => { if (!cancelled) setQrDataUrl(url); }).catch(() => { /* The verified session is independent of the optional QR. */ });
    return () => { cancelled = true; };
  }, [isVerified, profile.uid, profile.displayName, profile.role]);

  return <AuthWelcomeView profile={profile} phase={phase} step={step} error={error} qrDataUrl={qrDataUrl} autoEnterSeconds={autoEnterSeconds} onRetry={() => { if (!completedRef.current) setAttempt(current => current + 1); }} onCancel={cancel} onEnter={enter} />;
}
