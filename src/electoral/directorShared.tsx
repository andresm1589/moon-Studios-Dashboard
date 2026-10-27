import { useState, type ReactNode } from 'react';
import { ShieldCheck } from 'lucide-react';
import type { Candidate } from './types';

// ─── Piezas compartidas de la dirección electoral ───────────────────────────

export const formatDate = (value?: Date) => value && Number.isFinite(new Date(value).getTime())
  ? new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  : 'Sin registro';
export const candidateLabels = { pending: 'Por revisar', approved: 'Aprobada', rejected: 'No aprobada' } as const;
export const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
export const errorText = (cause: unknown) => cause instanceof Error ? cause.message : 'No se pudo guardar el cambio. Inténtalo de nuevo.';

/** Ejecuta una acción con el bloqueo de la dirección y devuelve si salió bien. */
export type DirectorRun = (action: () => Promise<unknown>, success: string) => Promise<boolean>;

export function Empty({ title, children }: { title: string; children: ReactNode }) {
  return <div className="el-empty"><ShieldCheck size={28} /><h3>{title}</h3><p>{children}</p></div>;
}

export function Portrait({ candidate, large = false }: { candidate: Candidate; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  return <span className={`ed-portrait${large ? ' ed-portrait-large' : ''}`}>
    {candidate.photoURL && !failed ? <img src={candidate.photoURL} alt={candidate.name} onError={() => setFailed(true)} /> : initials(candidate.name)}
  </span>;
}

/** Descarga un CSV que Excel abre bien (BOM UTF-8 y separador coma). */
export function downloadCsv(filename: string, header: string[], rows: (string | number)[][]) {
  const cell = (value: string | number) => {
    const text = String(value ?? '');
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const csv = '﻿' + [header, ...rows].map(row => row.map(cell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' }).format(new Date());
