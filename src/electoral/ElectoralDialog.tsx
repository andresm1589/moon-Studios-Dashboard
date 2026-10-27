import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

export function Dialog({ title, children, onClose, busy = false }: { title: string; children: ReactNode; onClose: () => void; busy?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, []);
  return <dialog ref={ref} className="el-dialog" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className="el-dialog-head"><div><span className="el-kicker">MOON / ELECCIONES</span><h2 id={titleId}>{title}</h2></div><button className="el-icon-button" type="button" aria-label="Cerrar ventana" disabled={busy} onClick={onClose}><X size={20} /></button></div>
    {children}
  </dialog>;
}
