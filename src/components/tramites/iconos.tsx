import { ClipboardList } from 'lucide-react';
import type { IconoTramite } from '@/lib/tramites';
import { ICONO } from './iconosMapa';

export function IconoTipo({ icono }: { icono: IconoTramite }) {
  const Icono = ICONO[icono] ?? ClipboardList;
  return <span className="tr-tipo__icono" aria-hidden="true"><Icono strokeWidth={1.5} /></span>;
}
