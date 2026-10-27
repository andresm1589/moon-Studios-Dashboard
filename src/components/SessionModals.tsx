import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, Check, Clock3, LogOut, Monitor, ShieldCheck } from 'lucide-react';
import { BrandLogo } from '@/components/BrandLogo';
import { useSettings } from '@/contexts/SettingsContext';
import './session-modals.css';

// Kept for existing layout imports. Styles now live alongside these components.
export const SESSION_MODAL_STYLES = '';

interface ModalShellProps {
  title: string;
  description: React.ReactNode;
  eyebrow: string;
  children: React.ReactNode;
  visual: React.ReactNode;
}

/** Radix owns focus trapping, background accessibility and focus restoration. */
function ModalShell({ title, description, eyebrow, visual, children }: ModalShellProps) {
  const systemReduced = useReducedMotion();
  const { settings } = useSettings();
  const reduceMotion = systemReduced || settings.animations === false || settings.reduceMotion || settings.screenReader;
  return (
    <Dialog.Root open>
      <Dialog.Portal forceMount>
        <Dialog.Overlay forceMount asChild>
          <motion.div className="moon-session-overlay"
            initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.18 }}>
            <Dialog.Content forceMount asChild
              onEscapeKeyDown={event => event.preventDefault()}
              onPointerDownOutside={event => event.preventDefault()}
              onInteractOutside={event => event.preventDefault()}>
              <motion.section className="moon-session-card"
                initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.985 }}
                transition={{ duration: reduceMotion ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}>
                <div className="moon-session-brand-row">
                  <BrandLogo className="moon-session-brand" />
                  <span><ShieldCheck size={13} aria-hidden="true" /> Sesión protegida</span>
                </div>
                <div className="moon-session-visual">{visual}</div>
                <div className="moon-session-content">
                  <p className="moon-session-eyebrow">{eyebrow}</p>
                  <Dialog.Title className="moon-session-title">{title}</Dialog.Title>
                  <Dialog.Description className="moon-session-description">{description}</Dialog.Description>
                  {children}
                </div>
                <div className="moon-session-footer"><span aria-hidden="true" /> Tu espacio de trabajo, en tus manos.</div>
              </motion.section>
            </Dialog.Content>
          </motion.div>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

interface TabSyncModalProps {
  onStayHere: () => void;
  onGoToOther: () => void;
}

export const TabSyncModal: React.FC<TabSyncModalProps> = ({ onStayHere, onGoToOther }) => (
  <ModalShell eyebrow="Control de sesión" title="Elige dónde continuar"
    description="Tu cuenta está abierta en otra pestaña. Elige el espacio que quieres mantener activo para seguir trabajando."
    visual={(
      <div className="moon-session-devices" aria-hidden="true">
        <div className="moon-session-device is-current"><Monitor size={29} strokeWidth={1.25} /><span><Check size={11} /></span></div>
        <div className="moon-session-connection"><i /><i /><i /></div>
        <div className="moon-session-device"><Monitor size={29} strokeWidth={1.25} /></div>
      </div>
    )}>
    <div className="moon-session-actions">
      <button type="button" className="moon-session-button is-primary" onClick={onStayHere}>
        Quedarme en esta pestaña <ArrowRight size={16} aria-hidden="true" />
      </button>
      <button type="button" className="moon-session-button" onClick={onGoToOther}>
        <Monitor size={15} aria-hidden="true" /> Usar la otra pestaña
      </button>
    </div>
  </ModalShell>
);

interface AutoLogoutModalProps {
  countdown: number;
  totalSeconds: number;
  onStayActive: () => void;
  onLogout?: () => void | Promise<void>;
}

export const AutoLogoutModal: React.FC<AutoLogoutModalProps> = ({ countdown, totalSeconds, onStayActive, onLogout }) => {
  const seconds = Number.isFinite(countdown) ? Math.max(0, Math.ceil(countdown)) : 0;
  const progress = Number.isFinite(totalSeconds) && totalSeconds > 0 ? Math.min(1, seconds / totalSeconds) : 0;
  const circumference = 2 * Math.PI * 44;
  const urgent = seconds <= 10;

  return (
    <ModalShell eyebrow="Pausa de seguridad" title="¿Seguimos creando?"
      description={<>Tu sesión se cerrará por inactividad en <strong>{seconds} segundo{seconds === 1 ? '' : 's'}</strong>. Confirma que sigues aquí para continuar.</>}
      visual={(
        <div className={`moon-session-countdown${urgent ? ' is-urgent' : ''}`} role="timer" aria-label={`${seconds} segundos para cerrar la sesión`}>
          <svg viewBox="0 0 104 104" aria-hidden="true">
            <circle className="moon-session-ring-track" cx="52" cy="52" r="44" />
            <circle className="moon-session-ring-value" cx="52" cy="52" r="44" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress)} />
          </svg>
          <div aria-hidden="true"><span>{seconds}</span><small>segundos</small></div>
        </div>
      )}>
      <div className="moon-session-note"><Clock3 size={14} aria-hidden="true" /><span>La protección por inactividad cuida tu cuenta.</span></div>
      <div className="moon-session-actions">
        <button type="button" className="moon-session-button is-primary" onClick={onStayActive}>
          Seguir conectado <ArrowRight size={16} aria-hidden="true" />
        </button>
        {onLogout && <button type="button" className="moon-session-button" onClick={onLogout}>
          <LogOut size={15} aria-hidden="true" /> Cerrar sesión ahora
        </button>}
      </div>
      <p className="moon-session-announcement" role="status" aria-live="polite" aria-atomic="true">
        {urgent ? 'Quedan diez segundos o menos. Confirma que sigues conectado para mantener tu sesión.' : ''}
      </p>
    </ModalShell>
  );
};
