import { lazy, Suspense, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { LoaderCircle, Smile, X } from 'lucide-react';
import { insertEmojiText } from './emoji-text';
import { useEmojiReducedMotion } from './emoji-motion';
import type { EmojiPropio } from './emoji-types';
import './emoji-ui.css';

const Picker = lazy(() => import('./SelectorEmojis').then(module => ({ default: module.SelectorEmojis })));
const NONE: EmojiPropio[] = [];
type TextField = HTMLInputElement | HTMLTextAreaElement;
export interface EmojiButtonProps {
  value: string;
  onChange: (value: string) => void;
  inputRef?: RefObject<TextField | null>;
  maxLength?: number;
  disabled?: boolean;
  theme?: 'auto' | 'dark' | 'light';
  label?: string;
  className?: string;
  unicodeOnly?: boolean;
  propios?: EmojiPropio[];
}

/** Selector local: nunca consulta la API administrativa de Discord. */
export function EmojiButton({ value, onChange, inputRef, maxLength, disabled, theme = 'auto', label = 'Añadir emoji', className, unicodeOnly = false, propios = NONE }: EmojiButtonProps) {
  const [open, setOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const reducedMotion = useEmojiReducedMotion();
  const selection = useRef({ start: value.length, end: value.length });
  const pending = useRef<{ value: string; at: number } | null>(null);
  const remember = () => {
    const input = inputRef?.current;
    selection.current = { start: input?.selectionStart ?? value.length, end: input?.selectionEnd ?? value.length };
  };
  useLayoutEffect(() => {
    if (!pending.current || pending.current.value !== value) return;
    const at = pending.current.at;
    pending.current = null;
    const input = inputRef?.current;
    if (!input) return;
    input.focus({ preventScroll: true });
    try { input.setSelectionRange(at, at); } catch { /* Los inputs sin selección admiten la inserción al final. */ }
  }, [value, open, inputRef]);
  const choose = (emoji: string) => {
    if (disabled || (unicodeOnly && /^<a?:/.test(emoji))) return;
    const input = inputRef?.current;
    const maximum = maxLength ?? (input && input.maxLength >= 0 ? input.maxLength : undefined);
    const result = insertEmojiText(value, emoji, selection.current.start, selection.current.end, maximum);
    if (!result.inserted) { setNotice('No queda espacio para este emoji.'); return; }
    pending.current = { value: result.value, at: result.selectionEnd };
    onChange(result.value);
    setNotice(''); setOpen(false);
  };
  return <Popover.Root open={open} onOpenChange={next => { if (next) { remember(); setNotice(''); } setOpen(next); }}>
    <Popover.Trigger asChild><button type="button" className={`ms-emoji-button${className ? ` ${className}` : ''}`} aria-label={label} title={label} disabled={disabled} onPointerDown={remember}><Smile size={19} aria-hidden="true" /></button></Popover.Trigger>
    <Popover.Portal><Popover.Content className="ms-emoji-popover" data-emoji-theme={theme} data-emoji-picker="true" data-emoji-motion={reducedMotion ? 'off' : 'on'} side="top" align="end" sideOffset={8} collisionPadding={12} aria-label="Emojis" onClick={event => event.stopPropagation()} onCloseAutoFocus={event => { if (pending.current || inputRef?.current === document.activeElement) event.preventDefault(); }}>
      <div className="ms-emoji-popover-head"><strong>Un emoji dice más.</strong><Popover.Close className="ms-emoji-close" aria-label="Cerrar emojis"><X size={17} /></Popover.Close></div>
      <Suspense fallback={<div className="ms-emoji-loading" role="status"><LoaderCircle size={20} />Preparando emojis…</div>}><Picker propios={unicodeOnly ? NONE : propios} onElegir={choose} compact ocultarPropiosVacios /></Suspense>
      {notice && <p className="ms-emoji-limit" role="status">{notice}</p>}
    </Popover.Content></Popover.Portal>
  </Popover.Root>;
}
