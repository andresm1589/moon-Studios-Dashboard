import React, { useRef, useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Entrada, Etiqueta } from '../webLuna/ui';
import { bd, sc, mt, tenue, mensajeError } from '../webLuna/comun';

// ─── Campos del editor de eventos ────────────────────────────────────────────

export type LunaSubir = (archivo: File) => Promise<string>;

/** Un campo con su etiqueta encima. */
export const Campo: React.FC<{ label: string; hint?: string; children: React.ReactNode; className?: string }> = ({ label, hint, children, className }) => (
  <label className={`block min-w-0 ${className ?? ''}`}>
    <Etiqueta hint={hint}>{label}</Etiqueta>
    {children}
  </label>
);

/** Texto de una línea. */
export const Texto: React.FC<{ valor: string; onChange: (v: string) => void; max?: number; placeholder?: string }> = ({ valor, onChange, max, placeholder }) => (
  <Entrada value={valor ?? ''} maxLength={max} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
);

/** Número (entero o con decimales). */
export const Numero: React.FC<{ valor: number; onChange: (v: number) => void; min?: number; max?: number; paso?: number }> = ({ valor, onChange, min, max, paso = 1 }) => (
  <Entrada type="number" value={Number.isFinite(valor) ? valor : ''} min={min} max={max} step={paso}
    onChange={e => onChange(e.target.value === '' ? NaN : Number(e.target.value))} />
);

/** Un emoji: el cuadro muestra cómo se ve. */
export const Emoji: React.FC<{ valor: string; onChange: (v: string) => void }> = ({ valor, onChange }) => (
  <div className="flex items-center gap-2">
    <span className="w-10 h-10 flex-shrink-0 rounded-xl flex items-center justify-center text-xl" style={{ background: sc, border: `1px solid ${bd}` }}>{valor || '·'}</span>
    <Entrada value={valor ?? ''} maxLength={16} onChange={e => onChange(e.target.value.trim())} placeholder="🎃" />
  </div>
);

/** Un color #RRGGBB, con selector y texto. */
export const Color: React.FC<{ valor: string; onChange: (v: string) => void }> = ({ valor, onChange }) => (
  <div className="flex items-center gap-2">
    <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(valor) ? valor : '#000000'} onChange={e => onChange(e.target.value.toUpperCase())}
      className="w-10 h-10 rounded-xl cursor-pointer flex-shrink-0" style={{ background: sc, border: `1px solid ${bd}`, padding: 3 }} />
    <Entrada value={valor ?? ''} maxLength={7} onChange={e => onChange(e.target.value.trim())} placeholder="#FF7A1A" />
  </div>
);

/** Una imagen: subirla (Cloudinary, por la API del bot), verla y quitarla. */
export const Imagen: React.FC<{ valor: string | null; onChange: (v: string | null) => void; subir: LunaSubir; alto?: number; ayuda?: string }> = ({ valor, onChange, subir, alto = 72, ayuda }) => {
  const ref = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);
  const elegir = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 2 * 1024 * 1024) { toast.error('La imagen pesa más de 2 MB.'); return; }
    setSubiendo(true);
    try { onChange(await subir(f)); toast.success('Imagen subida'); }
    catch (e) { toast.error(mensajeError(e, 'No se pudo subir la imagen')); }
    finally { setSubiendo(false); if (ref.current) ref.current.value = ''; }
  };
  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className="rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0" style={{ width: alto * (ayuda ? 1.6 : 1), height: alto, background: sc, border: `1px dashed ${bd}` }}>
        {valor ? <img src={valor} alt="" className="w-full h-full object-contain" /> : <ImagePlus className="w-5 h-5" style={{ color: tenue }} strokeWidth={1.5} />}
      </div>
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => ref.current?.click()} disabled={subiendo}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-light transition-all hover:bg-white/5 disabled:opacity-40" style={{ border: `1px solid ${bd}`, color: mt }}>
            {subiendo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImagePlus className="w-3.5 h-3.5" strokeWidth={1.5} />} {valor ? 'Cambiar' : 'Subir imagen'}
          </button>
          {valor && (
            <button type="button" onClick={() => onChange(null)} className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-light hover:bg-white/5" style={{ color: mt }}>
              <X className="w-3.5 h-3.5" strokeWidth={1.5} /> Quitar
            </button>
          )}
        </div>
        <p className="text-[10px] font-light leading-relaxed" style={{ color: tenue }}>{ayuda ?? 'Opcional: si no hay imagen se usa el emoji. PNG con fondo transparente, máx. 2 MB.'}</p>
      </div>
      <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={e => void elegir(e.target.files?.[0])} />
    </div>
  );
};

/** Una lista de frases: una por línea. */
export const Lineas: React.FC<{ valor: string[]; onChange: (v: string[]) => void; filas?: number; max?: number }> = ({ valor, onChange, filas = 5, max }) => {
  const [texto, setTexto] = useState(() => (valor ?? []).join('\n'));
  return (
    <textarea value={texto} rows={filas}
      onChange={e => { setTexto(e.target.value); onChange(e.target.value.split('\n').map(l => l.trim()).filter(Boolean).slice(0, max)); }}
      className="w-full px-3.5 py-2.5 rounded-xl text-sm font-light outline-none leading-relaxed resize-y focus:border-white/20"
      style={{ background: sc, border: `1px solid ${bd}`, color: 'hsl(var(--foreground))' }} />
  );
};
