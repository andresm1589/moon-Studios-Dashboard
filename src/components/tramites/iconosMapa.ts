import { CalendarClock, ClipboardList, FileBadge, IdCard, Laptop, TreePalm, UserPen, Wallet, type LucideIcon } from 'lucide-react';
import type { IconoTramite } from '@/lib/tramites';

export const ICONO: Record<IconoTramite, LucideIcon> = {
  vacaciones: TreePalm, permiso: CalendarClock, tarjeta: IdCard, datos: UserPen,
  constancia: FileBadge, equipos: Laptop, dinero: Wallet, general: ClipboardList,
};
export const NOMBRE_ICONO: Record<IconoTramite, string> = {
  vacaciones: 'Vacaciones', permiso: 'Calendario', tarjeta: 'Credencial', datos: 'Datos personales',
  constancia: 'Documento', equipos: 'Equipo', dinero: 'Pagos', general: 'General',
};
