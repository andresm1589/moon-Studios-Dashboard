/**
 * EmployeeProfileModal.tsx
 * Vista de perfil completo de un empleado
 * Fix: roles dinámicos — ya no crashea con roles no registrados
 */
import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { User, Mail, Shield, Calendar, Hash, Briefcase, Phone } from 'lucide-react';
import type { UserProfile } from '@/types';
import { codigoEmpleado } from '@/lib/tramites';

/* ── Roles base conocidos ─────────────────────────────────────────────────── */
const KNOWN_ROLES: Record<string, { color: string; bg: string; border: string }> = {
  CEO:            { color: 'text-purple-400', bg: 'bg-purple-950/60', border: 'border-purple-800/60' },
  Administración: { color: 'text-blue-400',   bg: 'bg-blue-950/60',   border: 'border-blue-800/60'  },
  Empleado:       { color: 'text-zinc-400',   bg: 'bg-zinc-800/60',   border: 'border-zinc-700/60'  },
};

/* ── Paleta de fallback (para cualquier rol futuro) ───────────────────────── */
const FALLBACK_PALETTE = [
  { color: 'text-emerald-400', bg: 'bg-emerald-950/60', border: 'border-emerald-800/60' },
  { color: 'text-yellow-400',  bg: 'bg-yellow-950/60',  border: 'border-yellow-800/60'  },
  { color: 'text-pink-400',    bg: 'bg-pink-950/60',    border: 'border-pink-800/60'    },
  { color: 'text-orange-400',  bg: 'bg-orange-950/60',  border: 'border-orange-800/60'  },
  { color: 'text-cyan-400',    bg: 'bg-cyan-950/60',    border: 'border-cyan-800/60'    },
  { color: 'text-rose-400',    bg: 'bg-rose-950/60',    border: 'border-rose-800/60'    },
  { color: 'text-sky-400',     bg: 'bg-sky-950/60',     border: 'border-sky-800/60'     },
  { color: 'text-amber-400',   bg: 'bg-amber-950/60',   border: 'border-amber-800/60'   },
];

/**
 * Devuelve siempre una config válida.
 * Para roles desconocidos, deriva un color estable basado en un hash simple del nombre,
 * así "Contador" siempre tendrá el mismo color en toda la app.
 */
const getRoleConfig = (role: string) => {
  if (!role) return { label: '—', color: 'text-zinc-500', bg: 'bg-zinc-900/60', border: 'border-zinc-800/60' };
  if (KNOWN_ROLES[role]) return { label: role, ...KNOWN_ROLES[role] };

  // Hash simple: suma de char codes para un índice consistente
  let hash = 0;
  for (let i = 0; i < role.length; i++) {
    hash = (hash << 5) - hash + role.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % FALLBACK_PALETTE.length;
  return { label: role, ...FALLBACK_PALETTE[idx] };
};

/* ── Props ───────────────────────────────────────────────────────────────── */
interface Props {
  open: boolean;
  onClose: () => void;
  user: UserProfile | null;
}

/* ── Componente ──────────────────────────────────────────────────────────── */
const EmployeeProfileModal: React.FC<Props> = ({ open, onClose, user }) => {
  if (!user) return null;

  const roleCfg = getRoleConfig(user.role);

  const fields = [
    { icon: User,     label: 'Nombre completo',  value: user.displayName || '—' },
    { icon: Mail,     label: 'Correo',            value: user.email || '—' },
    { icon: Phone,    label: 'Teléfono',          value: (user as any).phone || '—' },
    { icon: Shield,   label: 'Rol',               value: user.role || '—' },
    { icon: Hash,     label: 'ID Moon Studios',   value: codigoEmpleado(user.uid) },
    { icon: Hash,     label: 'UID',               value: user.uid },
    {
      icon: Calendar,
      label: 'Fecha de registro',
      value: (user as any).createdAt?.toDate
        ? new Date((user as any).createdAt.toDate()).toLocaleDateString('es-PE', {
            day: '2-digit', month: 'long', year: 'numeric',
          })
        : '—',
    },
    {
      icon: Briefcase,
      label: 'Estado',
      value: (user as any).isActive !== false ? 'Activo' : 'Inactivo',
    },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="font-extralight text-lg flex items-center gap-2">
            <User className="w-4 h-4 text-zinc-400" /> Perfil del Empleado
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Header de perfil */}
          <div className="flex items-center gap-4 p-4 bg-zinc-900/50 rounded-lg border border-zinc-800">
            <div className="w-14 h-14 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center flex-shrink-0 overflow-hidden">
              {(user as any).avatar ? (
                <img
                  src={(user as any).avatar}
                  alt={user.displayName}
                  className="w-full h-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              ) : (
                <span className="text-white text-2xl font-extralight">
                  {user.displayName?.[0]?.toUpperCase() ?? '?'}
                </span>
              )}
            </div>

            <div>
              <p className="text-white font-extralight text-lg leading-snug">{user.displayName}</p>
              <p className="text-zinc-500 text-sm font-extralight">{user.email}</p>
              <Badge
                className={`${roleCfg.bg} ${roleCfg.color} ${roleCfg.border} border font-extralight mt-1.5 text-xs`}
              >
                {roleCfg.label}
              </Badge>
            </div>
          </div>

          {/* Campos */}
          <div className="space-y-2">
            {fields.map(({ icon: Icon, label, value }) => (
              <div
                key={label}
                className="flex items-start gap-3 px-3 py-2.5 bg-zinc-900/30 rounded-md border border-zinc-800/60"
              >
                <Icon className="w-4 h-4 text-zinc-500 flex-shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-zinc-500 text-xs font-extralight uppercase tracking-wider">{label}</p>
                  <p className="text-zinc-200 text-sm font-extralight mt-0.5 break-all">{value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default EmployeeProfileModal;