import { panelInk } from '@/lib/panelColors';
import React, { useRef, useState } from 'react';
import { Bold, Italic, Heading2, List, Quote, Code2, Link2, ImagePlus, Eye, PenLine, Columns2 } from 'lucide-react';
import { Area, BotonIcono, Etiqueta, VistaPrevia } from './ui';
import { bd, mt, sc } from './comun';

// ─── Editor de texto con formato ─────────────────────────────────────────────
// Un textarea con la barra de formato de la web (negrita, subtítulos, listas,
// enlaces…) y la vista previa tal como se verá. En pantallas anchas puede
// mostrar las dos cosas lado a lado.

type Modo = 'editar' | 'ambos' | 'vista';
type Herramienta = 'negrita' | 'cursiva' | 'subtitulo' | 'lista' | 'cita' | 'codigo' | 'enlace' | 'imagen';
const HERRAMIENTAS: { id: Herramienta; t: string; Icon: React.ElementType }[] = [
  { id: 'negrita', t: 'Negrita', Icon: Bold }, { id: 'cursiva', t: 'Cursiva', Icon: Italic },
  { id: 'subtitulo', t: 'Subtítulo', Icon: Heading2 }, { id: 'lista', t: 'Lista', Icon: List },
  { id: 'cita', t: 'Cita', Icon: Quote }, { id: 'codigo', t: 'Código (comandos)', Icon: Code2 },
  { id: 'enlace', t: 'Enlace', Icon: Link2 }, { id: 'imagen', t: 'Imagen', Icon: ImagePlus },
];

export const EditorTexto: React.FC<{
  etiqueta: string; valor: string; onChange: (v: string) => void; max: number;
  filas?: number; imagenes?: boolean; pista?: React.ReactNode; placeholder?: string;
}> = ({ etiqueta, valor, onChange, max, filas = 8, imagenes, pista, placeholder }) => {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [modo, setModo] = useState<Modo>('editar');

  // Envuelve la selección (o un marcador) y deja seleccionado el texto envuelto.
  const envolver = (antes: string, despues: string, marcador: string) => {
    const el = ref.current; if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    const sel = valor.slice(a, b) || marcador;
    const nuevo = valor.slice(0, a) + antes + sel + despues + valor.slice(b);
    if (nuevo.length > max) return;
    onChange(nuevo);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(a + antes.length, a + antes.length + sel.length); });
  };
  // Antepone un prefijo a cada línea seleccionada (o a la línea del cursor).
  const prefijo = (p: string) => {
    const el = ref.current; if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    const ini = valor.lastIndexOf('\n', a - 1) + 1;
    const bloque = valor.slice(ini, b);
    const hecho = bloque.split('\n').map(l => (l.startsWith(p) ? l.slice(p.length) : p + l)).join('\n');
    const nuevo = valor.slice(0, ini) + hecho + valor.slice(b);
    if (nuevo.length > max) return;
    onChange(nuevo);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(ini, ini + hecho.length); });
  };
  // Inserta un bloque propio, separado por líneas en blanco.
  const bloque = (texto: string) => {
    const el = ref.current; if (!el) return;
    const a = el.selectionStart;
    const antes = valor.slice(0, a).replace(/\n*$/, '');
    const despues = valor.slice(a).replace(/^\n*/, '');
    const nuevo = `${antes}${antes ? '\n\n' : ''}${texto}${despues ? '\n\n' : ''}${despues}`;
    if (nuevo.length > max) return;
    onChange(nuevo);
    const pos = antes.length + (antes ? 2 : 0);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(pos, pos + texto.length); });
  };
  const enlace = () => {
    const url = window.prompt('Dirección del enlace (https://…, mailto:… o una ruta de la web como /premium):', 'https://');
    if (!url || url === 'https://') return;
    envolver('[', `](${url.trim()})`, 'texto del enlace');
  };
  const imagen = () => {
    const url = window.prompt('Dirección de la imagen (tiene que empezar con https://):', 'https://');
    if (!url || !/^https:\/\/\S+$/.test(url.trim())) return;
    const alt = window.prompt('Descripción corta de la imagen (se lee en voz alta y aparece debajo):', '') ?? '';
    bloque(`![${alt.replace(/[[\]]/g, '')}](${url.trim()})`);
  };

  const ejecutar = (h: Herramienta) => {
    if (h === 'negrita') envolver('**', '**', 'texto');
    else if (h === 'cursiva') envolver('*', '*', 'texto');
    else if (h === 'subtitulo') prefijo('## ');
    else if (h === 'lista') prefijo('- ');
    else if (h === 'cita') prefijo('> ');
    else if (h === 'codigo') envolver('`', '`', '/comando');
    else if (h === 'enlace') enlace();
    else imagen();
  };
  const herramientas = imagenes ? HERRAMIENTAS : HERRAMIENTAS.filter(h => h.id !== 'imagen');
  const MODOS: { id: Modo; t: string; Icon: React.ElementType; clase?: string }[] = [
    { id: 'editar', t: 'Escribir', Icon: PenLine },
    { id: 'ambos', t: 'Lado a lado', Icon: Columns2, clase: 'hidden lg:flex' },
    { id: 'vista', t: 'Vista previa', Icon: Eye },
  ];
  const lineas = valor.split('\n').length;

  return (
    <div>
      <Etiqueta hint={<>{valor.length.toLocaleString('es')}/{max.toLocaleString('es')}{pista ? <> · {pista}</> : null}</>}>{etiqueta}</Etiqueta>
      <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${bd}` }}>
        <div className="flex flex-wrap items-center gap-1 px-1.5 py-1 border-b" style={{ background: sc, borderColor: bd }}>
          <div className={`flex flex-wrap gap-0.5 ${modo === 'vista' ? 'opacity-30 pointer-events-none' : ''}`}>
            {herramientas.map(({ id, t, Icon }) => (
              <BotonIcono key={id} title={t} aria-label={t} onMouseDown={e => e.preventDefault()} onClick={() => ejecutar(id)}><Icon className="w-3.5 h-3.5" strokeWidth={1.5} /></BotonIcono>
            ))}
          </div>
          <div className="ml-auto flex gap-0.5 p-0.5 rounded-lg" style={{ background: 'rgba(0,0,0,0.2)' }}>
            {MODOS.map(({ id, t, Icon, clase }) => (
              <button key={id} type="button" onClick={() => setModo(id)} title={t}
                className={`items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-light transition-all ${clase ?? 'flex'}`}
                style={{ background: modo === id ? 'color-mix(in srgb, var(--moon-ink) 9%, transparent)' : 'transparent', color: panelInk(modo === id ? 'var(--moon-ink)' : mt) }}>
                <Icon className="w-3 h-3" strokeWidth={1.5} /> <span className="hidden sm:inline">{t}</span>
              </button>
            ))}
          </div>
        </div>
        <div className={modo === 'ambos' ? 'grid grid-cols-2' : ''}>
          {modo !== 'vista' && (
            <Area ref={ref} rows={Math.min(28, Math.max(filas, lineas + 2))} value={valor} maxLength={max} placeholder={placeholder}
              onChange={e => onChange(e.target.value)}
              className="!rounded-none !border-0 font-mono !text-[13px]" style={{ background: 'transparent' }} />
          )}
          {modo !== 'editar' && (
            <div className={`px-4 py-3 overflow-auto ${modo === 'ambos' ? 'border-l' : ''}`} style={{ borderColor: bd, maxHeight: modo === 'ambos' ? 28 * 26 : undefined, minHeight: filas * 22 }}>
              <VistaPrevia texto={valor} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
