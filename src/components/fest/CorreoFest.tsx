import { useEffect, useRef, useState } from 'react';
import { EmojiButton } from '@/components/discord/EmojiButton';
import emailjs from '@emailjs/browser';
import { collection, getDocs, type Timestamp } from 'firebase/firestore';
import { AlertCircle, AtSign, CheckCircle, Loader2, Mail, Search, Send, UserCheck, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { db } from '@/lib/firebase';
import { panelInk } from '@/lib/panelColors';

// Correo a los inscritos del registro histórico de MOON FEST 2026 (antes en Webs).
const EJ_SERVICE  = import.meta.env.VITE_EMAILJS_SERVICE_ID  as string;
const EJ_TEMPLATE = import.meta.env.VITE_EMAILJS_TEMPLATE_ID as string;
const EJ_KEY      = import.meta.env.VITE_EMAILJS_PUBLIC_KEY  as string;
const USERS_COL = collection(db, 'moon_studios_fest_2026');
const bd = 'hsl(var(--border))';
const sf = 'hsl(var(--card))';
const sc = 'hsl(var(--secondary))';
const mt = 'hsl(var(--muted-foreground))';

interface FestUser {
  id: string; code: string; firstName: string; lastName: string;
  email: string; phone: string; registeredAt: Timestamp | string | null;
}

export default function CorreoFestPanel() {
  const subjectEmojiRef = useRef<HTMLInputElement>(null), bodyEmojiRef = useRef<HTMLTextAreaElement>(null);

  const [festUsers,     setFestUsers]     = useState<FestUser[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [mode,          setMode]          = useState<'all' | 'one'>('all');
  const [selectedUser,  setSelectedUser]  = useState<FestUser | null>(null);
  const [userSearch,    setUserSearch]    = useState('');
  const [showDropdown,  setShowDropdown]  = useState(false);
  const [subject,       setSubject]       = useState('');
  const [body,          setBody]          = useState('');
  const [fromName,      setFromName]      = useState('Moon Studios');
  const [sending,       setSending]       = useState(false);
  const [progress,      setProgress]      = useState({ current: 0, total: 0 });
  const [done,          setDone]          = useState(false);
  const [failedList,    setFailedList]    = useState<{ name: string; email: string }[]>([]);
  const [formError,     setFormError]     = useState('');

  const ejConfigured = !!(
    EJ_SERVICE  && EJ_SERVICE  !== 'undefined' &&
    EJ_TEMPLATE && EJ_TEMPLATE !== 'undefined' &&
    EJ_KEY      && EJ_KEY      !== 'undefined'
  );

  useEffect(() => {
    getDocs(USERS_COL)
      .then(snap => setFestUsers(snap.docs.map(d => ({ ...d.data(), id: d.id }) as FestUser)))
      .catch(e => { toast.error('Error cargando usuarios'); console.error(e); })
      .finally(() => setLoading(false));
  }, []);

  const recipients      = mode === 'all' ? festUsers : selectedUser ? [selectedUser] : [];
  const validRecipients = recipients.filter(u => u.email?.includes('@'));
  const filtered        = festUsers.filter(u =>
    `${u.firstName} ${u.lastName}`.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.email?.toLowerCase().includes(userSearch.toLowerCase())
  );

  const handleSend = async () => {
    setFormError(''); setFailedList([]); setDone(false);
    if (!ejConfigured)            { setFormError('EmailJS no está configurado.'); return; }
    if (!subject.trim())          { setFormError('El asunto es obligatorio.'); return; }
    if (!body.trim())             { setFormError('El mensaje no puede estar vacío.'); return; }
    if (validRecipients.length === 0) { setFormError('No hay destinatarios con email válido.'); return; }
    if (!confirm(`¿Enviar a ${validRecipients.length} destinatario${validRecipients.length !== 1 ? 's' : ''}?`)) return;

    setSending(true);
    setProgress({ current: 0, total: validRecipients.length });
    const failed: { name: string; email: string }[] = [];

    for (let i = 0; i < validRecipients.length; i++) {
      const user     = validRecipients[i];
      const fullName = `${user.firstName} ${user.lastName}`.trim();
      try {
        await emailjs.send(EJ_SERVICE, EJ_TEMPLATE, {
          to_email:  user.email,
          to_name:   fullName || user.email,
          subject:   subject.trim(),
          message:   body.trim(),
          from_name: fromName.trim() || 'Moon Studios',
        }, EJ_KEY);
      } catch (err) {
        console.error(err);
        failed.push({ name: fullName, email: user.email });
      }
      setProgress({ current: i + 1, total: validRecipients.length });
      if (i < validRecipients.length - 1) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    setSending(false);
    setFailedList(failed);
    setDone(true);
    const sent = validRecipients.length - failed.length;
    if (sent > 0) {
      toast.success(`${sent} email${sent !== 1 ? 's' : ''} enviado${sent !== 1 ? 's' : ''}`);
      setSubject(''); setBody(''); setSelectedUser(null);
    }
    if (failed.length > 0) toast.error(`${failed.length} fallo${failed.length !== 1 ? 's' : ''}`);
  };

  return (
    <div className="space-y-5">
      {!ejConfigured && (
        <div
          className="flex items-start gap-3 p-4 rounded-2xl"
          style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.2)' }}
        >
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: panelInk('#fbbf24') }} strokeWidth={1.5} />
          <div className="space-y-1.5">
            <p className="text-sm font-light" style={{ color: panelInk('#fbbf24') }}>EmailJS no configurado</p>
            <div className="rounded-lg p-3 space-y-1" style={{ background: 'var(--moon-bg)' }}>
              {[
                'VITE_EMAILJS_SERVICE_ID=service_xxxxxxx',
                'VITE_EMAILJS_TEMPLATE_ID=template_xxxxxxx',
                'VITE_EMAILJS_PUBLIC_KEY=xxxxxxxxxxxxxxx',
              ].map(line => (
                <p key={line} className="text-[11px] font-mono" style={{ color: 'rgba(251,191,36,0.5)' }}>{line}</p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Destinatarios */}
      <div data-moon-reveal="card" className="rounded-2xl p-5 space-y-4" style={{ background: sf, border: `1px solid ${bd}` }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AtSign className="w-4 h-4" style={{ color: panelInk(mt) }} strokeWidth={1.5} />
            <p className="text-sm font-light moon-panel-ink">Destinatarios</p>
          </div>
          {!loading && (
            <span className="text-xs font-light px-2.5 py-1 rounded-full" style={{ background: 'color-mix(in srgb, var(--moon-ink) 5%, transparent)', color: panelInk(mt) }}>
              {festUsers.length} registrado{festUsers.length !== 1 ? 's' : ''} · {festUsers.filter(u => u.email?.includes('@')).length} con email
            </span>
          )}
        </div>
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: sc, border: `1px solid ${bd}` }}>
          {([
            { id: 'all' as const, label: 'Todos los registrados',    Icon: Users },
            { id: 'one' as const, label: 'Un usuario específico',    Icon: UserCheck },
          ]).map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => { setMode(id); setSelectedUser(null); setUserSearch(''); }}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-light transition-all"
              style={{
                background: mode === id ? 'color-mix(in srgb, var(--moon-ink) 8%, transparent)' : 'transparent',
                color:      panelInk(mode === id ? 'var(--moon-ink)' : mt),
              }}
            >
              <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />{label}
            </button>
          ))}
        </div>
        {mode === 'all' && !loading && (
          <div
            className="flex items-center gap-2.5 px-4 py-3 rounded-xl"
            style={{ background: 'rgba(74,222,128,0.05)', border: '1px solid rgba(74,222,128,0.15)' }}
          >
            <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: panelInk('#4ade80') }} strokeWidth={1.5} />
            <p className="text-xs font-light" style={{ color: panelInk('#4ade80') }}>
              Se enviará a <strong>{validRecipients.length}</strong> correos válidos
            </p>
          </div>
        )}
        {mode === 'one' && (
          <div className="relative">
            {selectedUser ? (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ background: sc, border: `1px solid ${bd}` }}>
                <div className="w-8 h-8 rounded-full moon-panel-raised border moon-panel-border flex items-center justify-center flex-shrink-0">
                  <span className="moon-panel-ink text-sm font-light">{selectedUser.firstName?.[0]?.toUpperCase() ?? '?'}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="moon-panel-ink text-sm font-light truncate">{selectedUser.firstName} {selectedUser.lastName}</p>
                  <p className="text-xs font-light truncate" style={{ color: panelInk(mt) }}>{selectedUser.email}</p>
                </div>
                <button
                  onClick={() => setSelectedUser(null)}
                  className="w-6 h-6 rounded-md flex items-center justify-center moon-panel-hover"
                  style={{ color: panelInk(mt) }}
                >
                  <X className="w-3.5 h-3.5" strokeWidth={1.5} />
                </button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: panelInk(mt) }} strokeWidth={1.5} />
                  <input
                    value={userSearch}
                    onChange={e => { setUserSearch(e.target.value); setShowDropdown(true); }}
                    onFocus={() => setShowDropdown(true)}
                    onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                    placeholder="Buscar por nombre o email..."
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm font-light outline-none"
                    style={{ background: sc, border: `1px solid ${bd}`, color: 'hsl(var(--foreground))' }}
                  />
                </div>
                {showDropdown && filtered.length > 0 && (
                  <div
                    className="absolute top-full left-0 right-0 mt-1 rounded-xl overflow-hidden z-50 max-h-52 overflow-y-auto"
                    style={{ background: 'hsl(var(--card))', border: `1px solid ${bd}`, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
                  >
                    {filtered.map(u => (
                      <button
                        key={u.id}
                        onMouseDown={() => { setSelectedUser(u); setUserSearch(''); setShowDropdown(false); }}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors moon-panel-hover"
                        style={{ borderBottom: `1px solid ${bd}` }}
                      >
                        <div className="w-7 h-7 rounded-full moon-panel-raised border moon-panel-border flex items-center justify-center flex-shrink-0">
                          <span className="moon-panel-ink text-xs">{u.firstName?.[0]?.toUpperCase() ?? '?'}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="moon-panel-ink text-sm font-light truncate">{u.firstName} {u.lastName}</p>
                          <p className="text-xs font-light truncate" style={{ color: panelInk(mt) }}>{u.email}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Remitente */}
      <div data-moon-reveal="card" className="rounded-2xl p-5 space-y-3" style={{ background: sf, border: `1px solid ${bd}` }}>
        <p className="text-[10px] uppercase tracking-widest font-light" style={{ color: panelInk(mt) }}>Nombre del remitente</p>
        <input
          value={fromName}
          onChange={e => setFromName(e.target.value)}
          placeholder="Moon Studios"
          maxLength={60}
          className="w-full px-3.5 py-2.5 rounded-xl text-sm font-light outline-none"
          style={{ background: sc, border: `1px solid ${bd}`, color: 'hsl(var(--foreground))' }}
          onFocus={e => (e.target.style.borderColor = 'color-mix(in srgb, var(--moon-ink) 20%, transparent)')}
          onBlur={e =>  (e.target.style.borderColor = bd)}
        />
      </div>

      {/* Redactar */}
      <div data-moon-reveal="card" className="rounded-2xl overflow-hidden" style={{ background: sf, border: `1px solid ${bd}` }}>
        <div className="flex items-center gap-2.5 px-5 py-4 border-b" style={{ borderColor: bd }}>
          <Mail className="w-4 h-4" style={{ color: panelInk(mt) }} strokeWidth={1.5} />
          <p className="text-sm font-light moon-panel-ink">Redactar email</p>
        </div>

        {/* Asunto */}
        <div className="px-5 pt-5 pb-4 border-b" style={{ borderColor: 'color-mix(in srgb, var(--moon-ink) 5%, transparent)' }}>
          <p className="text-[10px] uppercase tracking-widest font-light mb-2" style={{ color: panelInk(mt) }}>Asunto</p>
          <input
            ref={subjectEmojiRef}
            value={subject}
            onChange={e => setSubject(e.target.value)}
            maxLength={100}
            placeholder="Ej: ¡Bienvenido al Moon Studios Fest 2026!"
            className="w-full bg-transparent moon-panel-ink text-sm font-light outline-none placeholder:opacity-25"
          />
          <div className="flex items-center justify-between mt-2">
            <EmojiButton value={subject} onChange={setSubject} inputRef={subjectEmojiRef} maxLength={100} disabled={sending} unicodeOnly label="Añadir emoji al asunto del correo de Fest" />
            <span className="text-[10px] font-light" style={{ color: panelInk(subject.length > 85 ? '#f87171' : 'color-mix(in srgb, var(--moon-ink) 15%, transparent)') }}>
              {subject.length}/100
            </span>
          </div>
        </div>

        {/* Mensaje */}
        <div className="px-5 pt-4 pb-3 border-b" style={{ borderColor: 'color-mix(in srgb, var(--moon-ink) 5%, transparent)' }}>
          <p className="text-[10px] uppercase tracking-widest font-light mb-2" style={{ color: panelInk(mt) }}>Mensaje</p>
          <textarea
            ref={bodyEmojiRef}
            value={body}
            onChange={e => setBody(e.target.value)}
            rows={8}
            maxLength={3000}
            placeholder="Escribe el contenido del email..."
            className="w-full bg-transparent moon-panel-ink text-sm font-light outline-none resize-none placeholder:opacity-20 leading-relaxed"
          />
          <div className="flex items-center justify-between mt-1">
            <EmojiButton value={body} onChange={setBody} inputRef={bodyEmojiRef} maxLength={3000} disabled={sending} unicodeOnly label="Añadir emoji al correo de Fest" />
            <span className="text-[10px] font-light" style={{ color: panelInk(body.length > 2700 ? '#f87171' : 'color-mix(in srgb, var(--moon-ink) 15%, transparent)') }}>
              {body.length}/3000
            </span>
          </div>
        </div>

        {/* Progreso */}
        {sending && progress.total > 0 && (
          <div className="px-5 py-4 border-b" style={{ borderColor: 'color-mix(in srgb, var(--moon-ink) 5%, transparent)' }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-light" style={{ color: panelInk(mt) }}>
                Enviando {progress.current} de {progress.total}...
              </span>
              <span className="text-xs font-light" style={{ color: panelInk(mt) }}>
                {Math.round((progress.current / progress.total) * 100)}%
              </span>
            </div>
            <div className="h-1 rounded-full overflow-hidden" style={{ background: 'color-mix(in srgb, var(--moon-ink) 8%, transparent)' }}>
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{ width: `${(progress.current / progress.total) * 100}%`, background: '#818cf8' }}
              />
            </div>
          </div>
        )}

        {/* Resultado */}
        {done && !sending && (
          <div className="px-5 py-4 border-b space-y-2" style={{ borderColor: 'color-mix(in srgb, var(--moon-ink) 5%, transparent)' }}>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-3.5 h-3.5" style={{ color: panelInk('#4ade80') }} strokeWidth={1.5} />
              <p className="text-xs font-light" style={{ color: panelInk('#4ade80') }}>
                {progress.total - failedList.length} email{progress.total - failedList.length !== 1 ? 's' : ''} enviado{progress.total - failedList.length !== 1 ? 's' : ''}
              </p>
            </div>
            {failedList.length > 0 && (
              <div
                className="rounded-xl p-3 space-y-1.5"
                style={{ background: 'rgba(248,113,113,0.05)', border: '1px solid rgba(248,113,113,0.15)' }}
              >
                <p className="text-xs font-light" style={{ color: panelInk('#f87171') }}>
                  {failedList.length} fallo{failedList.length !== 1 ? 's' : ''}:
                </p>
                {failedList.map((e, i) => (
                  <p key={i} className="text-[11px] font-mono" style={{ color: 'rgba(248,113,113,0.65)' }}>
                    {e.name} — {e.email}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Footer con botón enviar */}
        <div className="flex items-center justify-between px-5 py-4">
          <div>
            {formError && (
              <div className="flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: panelInk('#f87171') }} strokeWidth={1.5} />
                <p className="text-xs font-light" style={{ color: panelInk('#f87171') }}>{formError}</p>
              </div>
            )}
          </div>
          <button
            onClick={handleSend}
            disabled={sending || validRecipients.length === 0 || !subject.trim() || !body.trim() || !ejConfigured}
            className="moon-panel-primary flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-light transition-all disabled:opacity-40 hover:opacity-90"
            style={{ background: 'var(--moon-accent)', color: 'var(--moon-accent-ink)' }}
          >
            {sending
              ? <><Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />Enviando {progress.current}/{progress.total}</>
              : <><Send className="w-4 h-4" strokeWidth={1.5} />Enviar{validRecipients.length > 0 ? ` (${validRecipients.length})` : ''}</>}
          </button>
        </div>
      </div>
      <p className="text-[11px] font-light text-center" style={{ color: 'var(--moon-muted)' }}>
        Plan gratuito EmailJS: 200 emails/mes · Los emails llegan directamente al Gmail del registrado
      </p>
    </div>
  );
}
