import { panelInk } from '@/lib/panelColors';
import React, { useState } from 'react';
import {
  Building2, Target, BookOpen, Milestone, Gem, Users, ExternalLink, BarChart3,
  Heart, Shield, Zap, Star, Moon, Code2, Globe, UserRound,
} from 'lucide-react';
import { useDocumento, type DocBase } from './useDocumento';
import { EditorTexto } from './EditorTexto';
import { Acciones, Area, Bloque, Entrada, Etiqueta, Filas, Interruptor, SelectorIdioma, SinIdioma, AyudaFormato } from './ui';
import { WEB, bd, copia, fechaHora, mt, type Lang, type LunaFetch } from './comun';

// ─── Empresa — /about de la web de Luna ──────────────────────────────────────
// Los textos (con la historia, la línea de tiempo, los valores y el equipo)
// van por idioma; las cifras en vivo son de la web y aquí solo se encienden.

interface Hito { anio: string; titulo: string; texto: string }
interface Valor { icono: string; titulo: string; texto: string }
interface Integrante { nombre: string; rol: string; avatar: string | null; enlace: string | null }
interface EmpresaTexto { titulo: string; subtitulo: string; mision: string; vision: string; historia: string; hitos: Hito[]; valores: Valor[]; equipo: Integrante[] }
export interface Empresa extends DocBase { mostrarCifras: boolean; idiomas: Partial<Record<Lang, EmpresaTexto>> }

const ICONOS_VALOR: { id: string; label: string; Icon: React.ElementType }[] = [
  { id: 'corazon', label: 'Corazón', Icon: Heart }, { id: 'escudo', label: 'Escudo', Icon: Shield },
  { id: 'rayo', label: 'Rayo', Icon: Zap }, { id: 'comunidad', label: 'Comunidad', Icon: Users },
  { id: 'estrella', label: 'Estrella', Icon: Star }, { id: 'luna', label: 'Luna', Icon: Moon },
  { id: 'codigo', label: 'Código', Icon: Code2 }, { id: 'globo', label: 'Mundo', Icon: Globe },
];

const limpiar = (d: Empresa) => ({ mostrarCifras: d.mostrarCifras, idiomas: d.idiomas });

export const EmpresaEditor: React.FC<{ lunaFetch: LunaFetch; inicial: Empresa; onSucio: (s: boolean) => void }> = ({ lunaFetch, inicial, onSucio }) => {
  const { original, borrador: d, cambiar, hayCambios, guardando, guardar, restaurar, descartar } = useDocumento(lunaFetch, inicial, limpiar, 'Sobre nosotros', onSucio);
  const [lang, setLang] = useState<Lang>('es');
  const t = d.idiomas[lang];
  const cambiarTexto = (f: (t: EmpresaTexto) => void) => cambiar(x => { const tx = x.idiomas[lang]; if (tx) f(tx); });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11px] font-light" style={{ color: panelInk(mt) }}>
          {original.predeterminado ? 'Contenido predeterminado (nunca se editó)' : `Editado · ${fechaHora(original.actualizadoEn)}`}
        </p>
        <a href={`${WEB}/about`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs font-light transition-all moon-panel-hover" style={{ color: panelInk(mt) }}>
          <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.5} /> Ver /about en la web
        </a>
      </div>

      <Interruptor activo={d.mostrarCifras} onChange={v => cambiar(x => { x.mostrarCifras = v; })} color="#a5b4fc"
        titulo="Cifras en vivo"
        texto="Servidores, personas y comandos de Luna, contados en el momento. No hace falta escribir números a mano." />

      <SelectorIdioma lang={lang} setLang={setLang} tiene={l => !!d.idiomas[l]} onQuitar={() => cambiar(x => { delete x.idiomas[lang]; })} />

      {!t ? (
        <SinIdioma lang={lang} onCrear={() => cambiar(x => { if (x.idiomas.es) x.idiomas[lang] = copia(x.idiomas.es); })} />
      ) : (
        <>
          <Bloque Icon={Building2} titulo="Encabezado" texto="Lo primero que se ve en la página." color="#a5b4fc">
            <div>
              <Etiqueta hint={`${t.titulo.length}/80`}>Título</Etiqueta>
              <Entrada value={t.titulo} maxLength={80} onChange={e => cambiarTexto(x => { x.titulo = e.target.value; })} />
            </div>
            <div>
              <Etiqueta hint={`${t.subtitulo.length}/400`}>Subtítulo</Etiqueta>
              <Area rows={2} value={t.subtitulo} maxLength={400} onChange={e => cambiarTexto(x => { x.subtitulo = e.target.value; })} />
            </div>
          </Bloque>

          <Bloque Icon={Target} titulo="Misión y visión" color="#4ade80">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Etiqueta hint={`${t.mision.length}/700`}>Misión</Etiqueta>
                <Area rows={4} value={t.mision} maxLength={700} onChange={e => cambiarTexto(x => { x.mision = e.target.value; })} />
              </div>
              <div>
                <Etiqueta hint={`${t.vision.length}/700`}>Visión</Etiqueta>
                <Area rows={4} value={t.vision} maxLength={700} onChange={e => cambiarTexto(x => { x.vision = e.target.value; })} />
              </div>
            </div>
          </Bloque>

          <Bloque Icon={BookOpen} titulo="Historia" texto="El relato de cómo nació y creció Luna. Admite formato." color="#fb923c">
            <AyudaFormato />
            <EditorTexto etiqueta="Texto" valor={t.historia} max={8000} filas={8} onChange={v => cambiarTexto(x => { x.historia = v; })} />
          </Bloque>

          <Bloque Icon={Milestone} titulo="Línea de tiempo" texto="Los momentos clave, en orden. Se muestran junto a la historia." color="#38bdf8">
            <Filas<Hito> items={t.hitos} max={20} onChange={v => cambiarTexto(x => { x.hitos = v; })}
              nuevo={() => ({ anio: String(new Date().getFullYear()), titulo: '', texto: '' })}
              textoNuevo="Añadir hito" vacio="Sin hitos: la línea de tiempo no se muestra."
              titulo={h => [h.anio, h.titulo].filter(Boolean).join(' · ')}
              render={(h, c) => (
                <>
                  <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3">
                    <div><Etiqueta>Año / fecha</Etiqueta><Entrada value={h.anio} maxLength={12} onChange={e => c(x => { x.anio = e.target.value; })} placeholder="2026" /></div>
                    <div><Etiqueta>Título</Etiqueta><Entrada value={h.titulo} maxLength={80} onChange={e => c(x => { x.titulo = e.target.value; })} /></div>
                  </div>
                  <div><Etiqueta hint={`${h.texto.length}/400`}>Texto</Etiqueta><Area rows={2} value={h.texto} maxLength={400} onChange={e => c(x => { x.texto = e.target.value; })} /></div>
                </>
              )} />
          </Bloque>

          <Bloque Icon={Gem} titulo="Valores" texto="Hasta 8 tarjetas con ícono." color="#f472b6">
            <Filas<Valor> items={t.valores} max={8} onChange={v => cambiarTexto(x => { x.valores = v; })}
              nuevo={() => ({ icono: 'estrella', titulo: '', texto: '' })}
              textoNuevo="Añadir valor" vacio="Sin valores: la sección no se muestra."
              titulo={v => v.titulo}
              render={(v, c) => (
                <>
                  <div>
                    <Etiqueta>Ícono</Etiqueta>
                    <div className="flex flex-wrap gap-1.5">
                      {ICONOS_VALOR.map(({ id, label, Icon }) => (
                        <button key={id} type="button" title={label} aria-label={label} onClick={() => c(x => { x.icono = id; })}
                          className="w-9 h-9 rounded-lg flex items-center justify-center transition-all moon-panel-hover"
                          style={{ border: `1px solid ${v.icono === id ? 'rgba(244,114,182,0.6)' : bd}`, background: v.icono === id ? 'rgba(244,114,182,0.1)' : 'transparent' }}>
                          <Icon className="w-4 h-4" strokeWidth={1.5} style={{ color: panelInk(v.icono === id ? '#f472b6' : mt) }} />
                        </button>
                      ))}
                    </div>
                  </div>
                  <div><Etiqueta>Título</Etiqueta><Entrada value={v.titulo} maxLength={60} onChange={e => c(x => { x.titulo = e.target.value; })} /></div>
                  <div><Etiqueta hint={`${v.texto.length}/300`}>Texto</Etiqueta><Area rows={2} value={v.texto} maxLength={300} onChange={e => c(x => { x.texto = e.target.value; })} /></div>
                </>
              )} />
          </Bloque>

          <Bloque Icon={Users} titulo="Equipo" texto="Opcional. Sin integrantes, la sección no aparece." color="#facc15">
            <Filas<Integrante> items={t.equipo} max={24} onChange={v => cambiarTexto(x => { x.equipo = v; })}
              nuevo={() => ({ nombre: '', rol: '', avatar: null, enlace: null })}
              textoNuevo="Añadir integrante" vacio="Sin integrantes."
              titulo={m => [m.nombre, m.rol].filter(Boolean).join(' · ')}
              render={(m, c) => (
                <div className="flex gap-3">
                  <div className="w-14 h-14 rounded-full flex-shrink-0 overflow-hidden flex items-center justify-center" style={{ border: `1px solid ${bd}`, background: 'color-mix(in srgb, var(--moon-ink) 3%, transparent)' }}>
                    {m.avatar && /^https:\/\//.test(m.avatar)
                      ? <img src={m.avatar} alt="" className="w-full h-full object-cover" />
                      : <UserRound className="w-6 h-6" strokeWidth={1.25} style={{ color: panelInk(mt) }} />}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 flex-1 min-w-0">
                    <div><Etiqueta>Nombre</Etiqueta><Entrada value={m.nombre} maxLength={60} onChange={e => c(x => { x.nombre = e.target.value; })} /></div>
                    <div><Etiqueta>Rol</Etiqueta><Entrada value={m.rol} maxLength={80} onChange={e => c(x => { x.rol = e.target.value; })} placeholder="Desarrollo" /></div>
                    <div><Etiqueta hint="https://">Foto</Etiqueta><Entrada value={m.avatar ?? ''} maxLength={500} onChange={e => c(x => { x.avatar = e.target.value || null; })} placeholder="https://…" /></div>
                    <div><Etiqueta hint="https://">Enlace</Etiqueta><Entrada value={m.enlace ?? ''} maxLength={500} onChange={e => c(x => { x.enlace = e.target.value || null; })} placeholder="https://…" /></div>
                  </div>
                </div>
              )} />
          </Bloque>
        </>
      )}

      <div className="flex items-start gap-2 px-3.5 py-3 rounded-xl text-[11px] font-light leading-relaxed" style={{ border: `1px solid ${bd}`, color: panelInk(mt) }}>
        <BarChart3 className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" style={{ color: panelInk('#a5b4fc') }} strokeWidth={1.5} />
        <span>Las funciones de Luna que aparecen en la página (seguridad, música, eventos…) salen de la wiki y se actualizan con cada versión de la web.</span>
      </div>

      <Acciones hayCambios={hayCambios} guardando={guardando} onDescartar={descartar} onGuardar={guardar}
        onRestaurar={restaurar} restaurarDeshabilitado={original.predeterminado} textoGuardar="Publicar «Sobre nosotros»" />
    </div>
  );
};
