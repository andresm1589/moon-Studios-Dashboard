import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, CalendarClock, Check, CircleAlert, Mail, RefreshCw, ShieldCheck, Ticket, UserRound, Vote } from 'lucide-react';
import { getInvitationState, validateInvitationAcceptance } from './model';
import type { ElectionController, ElectoralInvitation } from './types';

interface Props { system: ElectionController; invitationId: string; portalPath: string }
const invitationPattern = /^[A-Za-z0-9_-]{20,128}$/;
const dateLabel = (date: Date) => Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('es-PE', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Lima' }).format(date) : 'Fecha no disponible';

/** A known, opaque invitation is fetched individually; the participant never lists invitations. */
export default function ElectoralInvitationView({ system, invitationId, portalPath }: Props) {
  const [invitation, setInvitation] = useState<ElectoralInvitation | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [sending, setSending] = useState(false);
  const [revision, setRevision] = useState(0), [now, setNow] = useState(() => new Date());
  const load = useRef(system.loadInvitation), attempt = useRef(0), submitting = useRef(false);
  useEffect(() => { load.current = system.loadInvitation; }, [system.loadInvitation]);
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    const generation = ++attempt.current;
    setInvitation(null); setError(''); setSending(false); setLoading(true);
    if (!invitationPattern.test(invitationId)) { setError('El enlace de invitación no es válido. Pide un enlace nuevo al CEO.'); setLoading(false); return; }
    void load.current(invitationId).then(value => { if (attempt.current === generation) setInvitation(value); })
      .catch(() => { if (attempt.current === generation) setError('No pudimos abrir esta invitación. Verifica el enlace y entra con la cuenta a la que se dirigió, o pide al CEO que revise su disponibilidad.'); })
      .finally(() => { if (attempt.current === generation) setLoading(false); });
    return () => { attempt.current++; };
  }, [invitationId, system.identity.uid, system.identity.role, system.identity.email, system.identity.emailVerified, revision]);

  const election = invitation ? system.elections.find(value => value.id === invitation.electionId) : undefined;
  const status = invitation ? getInvitationState(invitation, now) : null;
  const acceptedByYou = status === 'accepted' && invitation?.acceptedBy === system.identity.uid;
  const previous = invitation ? system.accessRequests.find(value => value.uid === system.identity.uid && value.electionId === invitation.electionId) : undefined;
  let blockedReason = '';
  if (invitation && status === 'active') {
    if (!election) blockedReason = system.loading ? 'Confirmando el proceso de esta invitación…' : 'El proceso de esta invitación no está disponible. Consulta al CEO.';
    else {
      try { validateInvitationAcceptance(invitation, election, system.identity, previous ?? null, now); }
      catch (cause) { blockedReason = cause instanceof Error ? cause.message : 'Esta invitación no admite solicitudes en este momento.'; }
    }
  }
  const accept = async () => {
    if (!invitation || loading || system.busy || submitting.current || blockedReason || status !== 'active') return;
    submitting.current = true; setSending(true); setError('');
    const generation = attempt.current;
    try {
      await system.acceptInvitation(invitation.id);
      if (attempt.current !== generation) return;
      // The committed server record decides acceptance; the UI never fabricates an approval.
      setRevision(value => value + 1);
    } catch (cause) { if (attempt.current === generation) setError(cause instanceof Error ? cause.message : 'No se pudo aceptar la invitación. Vuelve a intentarlo.'); }
    finally { submitting.current = false; if (attempt.current === generation) setSending(false); }
  };
  if (loading) return <section className="el-loading" role="status" aria-live="polite"><RefreshCw className="el-spin" size={28} /><h2>Revisando tu invitación</h2><p>Confirmamos su disponibilidad y la cuenta con la que has entrado.</p></section>;
  if (!invitation) return <section className="el-empty" data-moon-reveal><span className="el-empty-symbol"><Ticket size={26} /></span><h2>No pudimos abrir la invitación</h2><p role="alert">{error}</p><button className="el-button" type="button" onClick={() => setRevision(value => value + 1)}><RefreshCw size={17} />Volver a comprobar</button><Link className="el-text-button" to={portalPath}>Ir al portal de participantes<ArrowUpRight size={16} /></Link></section>;

  return <section className="el-view" data-moon-reveal>
    <header className="el-section-heading"><div><span className="el-kicker"><Ticket size={15} />INVITACIÓN ELECTORAL</span><h2>{acceptedByYou ? 'Tu solicitud está registrada.' : 'Un lugar para tu participación.'}</h2><p>Una invitación para un proceso concreto de Moon Studios.</p></div><Link className="el-button" to={portalPath}>Abrir mi portal<ArrowUpRight size={17} /></Link></header>
    <div className="el-access-grid">
      <article className="el-panel el-access-card">
        <div className="el-card-top"><span className={`el-status ${status === 'active' || acceptedByYou ? 'el-status-approved' : 'el-status-pending'}`}><span />{status === 'active' ? 'Disponible' : status === 'expired' ? 'Vencida' : status === 'revoked' ? 'Revocada' : 'Aceptada'}</span><Ticket size={21} /></div>
        <h3>{invitation.label}</h3><p>{election?.name || 'Proceso electoral'}</p>
        <div className="el-schedule-note"><CalendarClock size={20} /><div><strong>Válida hasta</strong><p>{dateLabel(invitation.expiresAt)} · hora de Perú</p></div></div>
        <div className="el-schedule-note"><UserRound size={20} /><div><strong>Entraste como {system.identity.displayName}</strong><p>{system.identity.email || 'Cuenta autenticada sin correo compartido'}</p>{invitation.email && <p><Mail size={13} aria-hidden="true" /> Invitación dirigida a {invitation.email}</p>}</div></div>
        <div className="el-schedule-note"><Vote size={20} /><div><strong>Permisos que se solicitarán</strong><p>{[invitation.requestedVoter ? 'Votar en este proceso' : '', invitation.requestedCandidate ? 'Presentar una candidatura' : ''].filter(Boolean).join(' · ')}</p></div></div>
        {status === 'active' && <><button type="button" className="el-button el-button-primary" disabled={sending || system.busy || Boolean(blockedReason)} onClick={() => void accept()}>{sending ? <RefreshCw size={17} className="el-spin" /> : <Check size={17} />}{sending ? 'Registrando solicitud…' : 'Aceptar y solicitar participación'}</button>{blockedReason && <p className="el-field-note" role="status">{blockedReason}</p>}</>}
        {status === 'expired' && <p className="el-field-note" role="status">El plazo para aceptar terminó. El CEO puede emitir una nueva invitación si el calendario del proceso lo permite.</p>}
        {status === 'revoked' && <p className="el-field-note" role="status">El CEO retiró este enlace. Solicita una nueva invitación para participar.</p>}
        {status === 'accepted' && <p className="el-field-note" role="status">{acceptedByYou ? 'Aceptaste este enlace. Consulta el estado de tus permisos en tu portal.' : 'Este enlace ya se utilizó. Cada invitación puede aceptarse una sola vez.'}</p>}
      </article>
      <aside className="el-panel el-access-card"><div className="el-card-top"><span className="el-kicker">EL SIGUIENTE PASO</span><ShieldCheck size={22} /></div><h3>La decisión la revisa el CEO.</h3><p>Aceptar la invitación registra tu interés. El CEO revisará por separado el permiso para votar y el permiso para presentar una candidatura.</p><p>Si ya tenías una solicitud, se conserva la decisión existente y se añaden únicamente los permisos nuevos que falten.</p><div className="el-schedule-note"><ShieldCheck size={20} /><div><strong>Tu cuenta conserva su identidad</strong><p>La invitación no te asigna un puesto de trabajo ni permisos para administrar el dashboard.</p></div></div><p className="el-field-note">Las candidaturas se presentan durante el plazo publicado y después pasan por su propia revisión.</p></aside>
    </div>
    {error && <div className="el-alert el-alert-error" role="alert"><CircleAlert size={18} /><span>{error}</span><button className="el-button el-button-small" type="button" disabled={sending || system.busy} onClick={() => setRevision(value => value + 1)}>Revisar disponibilidad</button></div>}
  </section>;
}
