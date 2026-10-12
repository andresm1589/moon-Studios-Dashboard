import React, { useMemo, useState } from 'react';
import {
  Palette, Type, Wand2, Gem, Ghost, Award, Store, ScrollText, Flame, Radar, Save, Loader2, X, Undo2, AlertCircle,
} from 'lucide-react';
import { Filas, Interruptor, Seleccion } from '../webLuna/ui';
import { bd, sf, sc, mt, copia, igual } from '../webLuna/comun';
import { Campo, Texto, Numero, Emoji, Color, Imagen, Lineas, type LunaSubir } from './campos';
import {
  ESCENAS, RAREZAS, NOMBRE_RAREZA, COMO, REGLAS, TIPOS_MISION, TIPOS_ARTICULO, LIMITES, SUBCOMANDOS, idLibre,
  type Contenido, type Criatura, type Insignia, type Articulo, type Mision, type DiaBono,
} from './modelo';

// ─── Editor del contenido de un evento ───────────────────────────────────────
// Lo que se ve y se juega: tema, moneda, textos, acción diaria, rarezas,
// criaturas, insignias, tienda, misiones, bonos y apariciones. Sirve para la
// plantilla de un tipo (lo que copian las ediciones nuevas) y para una edición
// concreta. El bot valida todo al guardar y, si algo está mal, dice qué campo.

type Seccion = 'tema' | 'textos' | 'accion' | 'rarezas' | 'criaturas' | 'insignias' | 'tienda' | 'misiones' | 'bonos' | 'apariciones';
const SECCIONES: { id: Seccion; label: string; Icon: React.ElementType }[] = [
  { id: 'tema', label: 'Tema y moneda', Icon: Palette },
  { id: 'textos', label: 'Textos', Icon: Type },
  { id: 'accion', label: 'Acción diaria', Icon: Wand2 },
  { id: 'criaturas', label: 'Criaturas', Icon: Ghost },
  { id: 'rarezas', label: 'Rarezas', Icon: Gem },
  { id: 'insignias', label: 'Insignias', Icon: Award },
  { id: 'tienda', label: 'Tienda', Icon: Store },
  { id: 'misiones', label: 'Misiones', Icon: ScrollText },
  { id: 'bonos', label: 'Bonos', Icon: Flame },
  { id: 'apariciones', label: 'Apariciones', Icon: Radar },
];

const Rejilla: React.FC<{ cols?: number; children: React.ReactNode }> = ({ cols = 2, children }) => (
  <div className={`grid grid-cols-1 gap-3 ${cols === 2 ? 'sm:grid-cols-2' : cols === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-4'}`}>{children}</div>
);
const Nota: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="text-[11px] font-light leading-relaxed" style={{ color: mt }}>{children}</p>
);
const SelRareza: React.FC<{ valor: string; onChange: (v: Criatura['rareza']) => void; c: Contenido }> = ({ valor, onChange, c }) => (
  <Seleccion value={valor} onChange={e => onChange(e.target.value as Criatura['rareza'])}>
    {RAREZAS.map(r => <option key={r} value={r}>{c.rarezas.find(x => x.id === r)?.nombre ?? NOMBRE_RAREZA[r]}</option>)}
  </Seleccion>
);

/** Cómo se ve: los colores, la moneda y una criatura, como un adelanto. */
const Muestra: React.FC<{ c: Contenido; emoji: string }> = ({ c, emoji }) => {
  const mitica = c.criaturas.find(x => x.rareza === 'mitica') ?? c.criaturas[0];
  return (
    <div className="rounded-2xl p-4 flex items-center gap-4 overflow-hidden relative"
      style={{ background: `radial-gradient(120% 140% at 0% 0%, ${c.tema.color}33, transparent 60%), radial-gradient(90% 120% at 100% 100%, ${c.tema.color2}2e, transparent 60%), ${sc}`, border: `1px solid ${c.tema.color}40` }}>
      {c.tema.fondo && <img src={c.tema.fondo} alt="" className="absolute inset-0 w-full h-full object-cover opacity-25" />}
      <span className="relative w-14 h-14 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0" style={{ background: `${c.tema.color}22`, border: `1px solid ${c.tema.color}55` }}>
        {mitica?.imagen ? <img src={mitica.imagen} alt="" className="w-10 h-10 object-contain" /> : (mitica?.emoji ?? emoji)}
      </span>
      <div className="relative min-w-0">
        <p className="text-base font-light text-white truncate">{emoji} {c.textos.titulo}</p>
        <p className="text-[11px] font-light mt-0.5" style={{ color: mt }}>
          ¡Apareció {mitica ? `${mitica.art ? `${mitica.art} ` : ''}${mitica.nombre}` : '…'}! · {c.moneda.emoji} {c.moneda.nombre} · botón «{c.textos.emojiAtrapar} {c.textos.atrapar}»
        </p>
      </div>
    </div>
  );
};

export const EditorContenido: React.FC<{
  titulo: string;
  emoji: string;
  inicial: Contenido;
  subir: LunaSubir;
  onGuardar: (c: Contenido) => Promise<void>;
  onCerrar: () => void;
  /** Botones extra en la barra (p. ej. «Volver a la plantilla»). */
  extra?: React.ReactNode;
  aviso?: React.ReactNode;
}> = ({ titulo, emoji, inicial, subir, onGuardar, onCerrar, extra, aviso }) => {
  const [c, setC] = useState<Contenido>(() => copia(inicial));
  const [sec, setSec] = useState<Seccion>('tema');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cambios = !igual(c, inicial);
  const cambiar = (f: (x: Contenido) => void) => setC(prev => { const n = copia(prev); f(n); return n; });
  const enVenta = c.articulos.length + c.insignias.filter(i => i.como === 'tienda').length;
  const pesoTotal = useMemo(() => c.rarezas.filter(r => c.criaturas.some(x => x.rareza === r.id)).reduce((s, r) => s + (r.peso || 0), 0) || 1, [c]);

  const guardar = async () => {
    setGuardando(true); setError(null);
    try { await onGuardar(c); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar'); }
    finally { setGuardando(false); }
  };

  return (
    <div className="rounded-2xl" style={{ background: sf, border: `1px solid ${bd}` }}>
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b" style={{ borderColor: bd }}>
        <div className="min-w-0">
          <h3 className="text-sm font-light text-white truncate">{emoji} {titulo}</h3>
          <p className="text-[11px] font-light" style={{ color: mt }}>Se aplica en Discord y en la web apenas guardas.</p>
        </div>
        <button type="button" onClick={() => { if (!cambios || window.confirm('¿Cerrar sin guardar los cambios?')) onCerrar(); }}
          className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/5" style={{ color: mt }} title="Cerrar"><X className="w-4 h-4" strokeWidth={1.5} /></button>
      </header>

      <div className="p-4 space-y-4">
        {aviso}
        <Muestra c={c} emoji={emoji} />

        <nav className="flex flex-wrap gap-1 p-1 rounded-xl" style={{ background: sc, border: `1px solid ${bd}` }}>
          {SECCIONES.map(({ id, label, Icon }) => (
            <button key={id} type="button" onClick={() => setSec(id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-light transition-all"
              style={{ background: sec === id ? 'rgba(255,255,255,0.08)' : 'transparent', color: sec === id ? 'white' : mt }}>
              <Icon className="w-3.5 h-3.5" strokeWidth={1.5} style={{ color: sec === id ? c.tema.color : undefined }} />{label}
            </button>
          ))}
        </nav>

        {sec === 'tema' && (
          <div className="space-y-4">
            <Rejilla>
              <Campo label="Escena de las tarjetas" hint="el dibujo de fondo en Discord">
                <Seleccion value={c.tema.escena} onChange={e => cambiar(x => { x.tema.escena = e.target.value; })}>
                  {ESCENAS.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </Seleccion>
              </Campo>
              <Campo label="Imagen de fondo" hint="reemplaza la escena">
                <Imagen valor={c.tema.fondo} onChange={v => cambiar(x => { x.tema.fondo = v; })} subir={subir} alto={56}
                  ayuda="Opcional: una imagen horizontal (2:1 o más ancha). Se usa en las tarjetas de Discord y de fondo en la web." />
              </Campo>
              <Campo label="Color principal"><Color valor={c.tema.color} onChange={v => cambiar(x => { x.tema.color = v; })} /></Campo>
              <Campo label="Color secundario"><Color valor={c.tema.color2} onChange={v => cambiar(x => { x.tema.color2 = v; })} /></Campo>
            </Rejilla>
            <Rejilla cols={3}>
              <Campo label="Moneda (plural)" hint="dulces, galletas…"><Texto valor={c.moneda.nombre} max={20} onChange={v => cambiar(x => { x.moneda.nombre = v; })} /></Campo>
              <Campo label="Moneda (singular)"><Texto valor={c.moneda.singular} max={20} onChange={v => cambiar(x => { x.moneda.singular = v; })} /></Campo>
              <Campo label="Emoji de la moneda"><Emoji valor={c.moneda.emoji} onChange={v => cambiar(x => { x.moneda.emoji = v; })} /></Campo>
            </Rejilla>
          </div>
        )}

        {sec === 'textos' && (
          <div className="space-y-4">
            <Rejilla>
              <Campo label="Título" hint="máx. 60"><Texto valor={c.textos.titulo} max={60} onChange={v => cambiar(x => { x.textos.titulo = v; })} /></Campo>
              <Campo label="Despedida" hint="al cerrar el evento"><Texto valor={c.textos.despedida} max={80} onChange={v => cambiar(x => { x.textos.despedida = v; })} /></Campo>
            </Rejilla>
            <Campo label="Descripción" hint="**negrita** como en Discord · máx. 400">
              <textarea value={c.textos.lema} maxLength={400} rows={3} onChange={e => cambiar(x => { x.textos.lema = e.target.value; })}
                className="w-full px-3.5 py-2.5 rounded-xl text-sm font-light outline-none leading-relaxed resize-y" style={{ background: sc, border: `1px solid ${bd}`, color: 'hsl(var(--foreground))' }} />
            </Campo>
            <Rejilla cols={4}>
              <Campo label="Una criatura se llama" hint="criatura, personaje…"><Texto valor={c.textos.criatura} max={24} onChange={v => cambiar(x => { x.textos.criatura = v; })} /></Campo>
              <Campo label="En plural"><Texto valor={c.textos.criaturas} max={24} onChange={v => cambiar(x => { x.textos.criaturas = v; })} /></Campo>
              <Campo label="Botón de atrapar"><Texto valor={c.textos.atrapar} max={20} onChange={v => cambiar(x => { x.textos.atrapar = v; })} /></Campo>
              <Campo label="Emoji del botón"><Emoji valor={c.textos.emojiAtrapar} onChange={v => cambiar(x => { x.textos.emojiAtrapar = v; })} /></Campo>
            </Rejilla>
            <Rejilla cols={3}>
              <Campo label="Nombre de la tienda"><Texto valor={c.textos.tienda} max={40} onChange={v => cambiar(x => { x.textos.tienda = v; })} /></Campo>
              <Campo label="Nombre del bestiario"><Texto valor={c.textos.bestiario} max={40} onChange={v => cambiar(x => { x.textos.bestiario = v; })} /></Campo>
              <Campo label="Cuando se escapa"><Texto valor={c.textos.escapo} max={150} onChange={v => cambiar(x => { x.textos.escapo = v; })} /></Campo>
            </Rejilla>
          </div>
        )}

        {sec === 'accion' && (
          <div className="space-y-4">
            <Interruptor activo={c.accion.activa} onChange={v => cambiar(x => { x.accion.activa = v; })}
              titulo="Acción diaria" texto="Un subcomando que se juega cada pocas horas (truco o trato, abrir un regalo…). Da premios, a veces quita, y sube la racha si se juega días seguidos." />
            {c.accion.activa && <>
              <Rejilla cols={4}>
                <Campo label="Subcomando" hint="ej. truco">
                  <Texto valor={c.accion.sub} max={20} onChange={v => cambiar(x => { x.accion.sub = v.toLowerCase().replace(/[^a-z]/g, ''); })} />
                </Campo>
                <Campo label="Nombre"><Texto valor={c.accion.nombre} max={40} onChange={v => cambiar(x => { x.accion.nombre = v; })} /></Campo>
                <Campo label="Emoji"><Emoji valor={c.accion.emoji} onChange={v => cambiar(x => { x.accion.emoji = v; })} /></Campo>
                <Campo label="Cada cuántas horas"><Numero valor={c.accion.horas} min={1} max={24} onChange={v => cambiar(x => { x.accion.horas = v; })} /></Campo>
              </Rejilla>
              {SUBCOMANDOS.includes(c.accion.sub) && <Nota><span style={{ color: '#facc15' }}>«{c.accion.sub}» ya es un subcomando del evento: elige otro nombre.</span></Nota>}
              <Campo label="Descripción" hint="máx. 200"><Texto valor={c.accion.desc} max={200} onChange={v => cambiar(x => { x.accion.desc = v; })} /></Campo>
              <Rejilla cols={4}>
                <Campo label="Título: premio"><Texto valor={c.accion.titulos.bueno} max={40} onChange={v => cambiar(x => { x.accion.titulos.bueno = v; })} /></Campo>
                <Campo label="Título: gran premio"><Texto valor={c.accion.titulos.grande} max={40} onChange={v => cambiar(x => { x.accion.titulos.grande = v; })} /></Campo>
                <Campo label="Título: mala suerte"><Texto valor={c.accion.titulos.malo} max={40} onChange={v => cambiar(x => { x.accion.titulos.malo = v; })} /></Campo>
                <Campo label="Título: sorpresa"><Texto valor={c.accion.titulos.criatura} max={40} onChange={v => cambiar(x => { x.accion.titulos.criatura = v; })} /></Campo>
              </Rejilla>
              <Rejilla>
                <Campo label="Texto del gran premio"><Texto valor={c.accion.grande} max={200} onChange={v => cambiar(x => { x.accion.grande = v; })} /></Campo>
                <Campo label="Texto de la sorpresa" hint="{criatura} = la que sale"><Texto valor={c.accion.criatura} max={200} onChange={v => cambiar(x => { x.accion.criatura = v; })} /></Campo>
              </Rejilla>
              <Rejilla>
                <Campo label="Frases de premio" hint="una por línea"><Lineas valor={c.accion.buenos} max={LIMITES.frases} onChange={v => cambiar(x => { x.accion.buenos = v; })} /></Campo>
                <Campo label="Frases de mala suerte" hint="una por línea"><Lineas valor={c.accion.malos} max={LIMITES.frases} onChange={v => cambiar(x => { x.accion.malos = v; })} /></Campo>
              </Rejilla>
            </>}
          </div>
        )}

        {sec === 'rarezas' && (
          <div className="space-y-2">
            <Nota>La probabilidad es relativa: se reparte entre las rarezas que tienen criaturas. Las comunes alcanzan para varias personas; la mítica, para una.</Nota>
            {c.rarezas.map((r, i) => {
              const tiene = c.criaturas.some(x => x.rareza === r.id);
              return (
                <div key={r.id} className="grid grid-cols-2 sm:grid-cols-[1.2fr_1fr_0.8fr_0.8fr_0.8fr_0.7fr] gap-2 items-end p-3 rounded-xl" style={{ border: `1px solid ${bd}` }}>
                  <Campo label={NOMBRE_RAREZA[r.id]}><Texto valor={r.nombre} max={20} onChange={v => cambiar(x => { x.rarezas[i].nombre = v; })} /></Campo>
                  <Campo label="Color"><Color valor={r.color} onChange={v => cambiar(x => { x.rarezas[i].color = v; })} /></Campo>
                  <Campo label="Peso" hint={tiene ? `${Math.round((r.peso / pesoTotal) * 1000) / 10} %` : 'sin criaturas'}>
                    <Numero valor={r.peso} min={0} max={1000} paso={0.5} onChange={v => cambiar(x => { x.rarezas[i].peso = v; })} />
                  </Campo>
                  <Campo label="Premio mín."><Numero valor={r.premio[0]} min={0} onChange={v => cambiar(x => { x.rarezas[i].premio[0] = v; })} /></Campo>
                  <Campo label="Premio máx."><Numero valor={r.premio[1]} min={0} onChange={v => cambiar(x => { x.rarezas[i].premio[1] = v; })} /></Campo>
                  <Campo label="Personas"><Numero valor={r.cupos} min={1} max={10} onChange={v => cambiar(x => { x.rarezas[i].cupos = v; })} /></Campo>
                </div>
              );
            })}
          </div>
        )}

        {sec === 'criaturas' && (
          <Filas<Criatura>
            items={c.criaturas} max={LIMITES.criaturas} textoNuevo="Nueva criatura" vacio="Todavía no hay criaturas."
            onChange={l => cambiar(x => { x.criaturas = l; })}
            nuevo={() => ({ id: idLibre('criatura', c.criaturas.map(x => x.id)), art: 'un', nombre: 'Nueva criatura', emoji: '✨', imagen: null, rareza: 'comun', frase: 'Apareció de la nada.' })}
            titulo={x => `${x.emoji} ${x.nombre} · ${NOMBRE_RAREZA[x.rareza]}`}
            render={(x, set) => (
              <div className="space-y-3">
                <Rejilla cols={4}>
                  <Campo label="Nombre"><Texto valor={x.nombre} max={40} onChange={v => set(y => { y.nombre = v; })} /></Campo>
                  <Campo label="Artículo" hint="un, una, el…"><Texto valor={x.art} max={6} onChange={v => set(y => { y.art = v; })} /></Campo>
                  <Campo label="Emoji"><Emoji valor={x.emoji} onChange={v => set(y => { y.emoji = v; })} /></Campo>
                  <Campo label="Rareza"><SelRareza c={c} valor={x.rareza} onChange={v => set(y => { y.rareza = v; })} /></Campo>
                </Rejilla>
                <Rejilla>
                  <Campo label="Frase"><Texto valor={x.frase} max={120} onChange={v => set(y => { y.frase = v; })} /></Campo>
                  <Campo label="Id" hint="no cambiar si ya se atrapó"><Texto valor={x.id} max={24} onChange={v => set(y => { y.id = v.toLowerCase().replace(/[^a-z0-9_]/g, ''); })} /></Campo>
                </Rejilla>
                <Rejilla>
                  <Campo label="Imagen"><Imagen valor={x.imagen} onChange={v => set(y => { y.imagen = v; })} subir={subir} /></Campo>
                  <Interruptor activo={!!x.corona} onChange={v => set(y => { if (v) y.corona = true; else delete y.corona; })} titulo="Con corona" texto="Se dibuja una corona sobre ella en la tarjeta." />
                </Rejilla>
              </div>
            )}
          />
        )}

        {sec === 'insignias' && (
          <div className="space-y-3">
            <Nota>Las insignias se guardan para siempre con el prefijo del evento y el año (p. ej. nv26_rey). «{'{anio}'}» en el nombre se reemplaza por el año de la edición.</Nota>
            <Filas<Insignia>
              items={c.insignias} max={LIMITES.insignias} textoNuevo="Nueva insignia" vacio="Todavía no hay insignias."
              onChange={l => cambiar(x => { x.insignias = l; })}
              nuevo={() => ({ clave: idLibre('insignia', c.insignias.map(x => x.clave)), nombre: 'Nueva insignia', emoji: '🏅', imagen: null, rareza: 'rara', como: 'logro', desc: 'Atrapa 50 criaturas.', regla: { tipo: 'atrapadas', valor: 50 } })}
              titulo={x => `${x.emoji} ${x.nombre} · ${COMO.find(k => k.id === x.como)?.nombre ?? x.como}`}
              render={(x, set) => {
                const regla = REGLAS.find(r => r.id === x.regla?.tipo);
                return (
                  <div className="space-y-3">
                    <Rejilla cols={4}>
                      <Campo label="Nombre"><Texto valor={x.nombre} max={40} onChange={v => set(y => { y.nombre = v; })} /></Campo>
                      <Campo label="Emoji"><Emoji valor={x.emoji} onChange={v => set(y => { y.emoji = v; })} /></Campo>
                      <Campo label="Rareza"><SelRareza c={c} valor={x.rareza} onChange={v => set(y => { y.rareza = v; })} /></Campo>
                      <Campo label="Cómo se consigue">
                        <Seleccion value={x.como} onChange={e => set(y => {
                          y.como = e.target.value as Insignia['como'];
                          if (y.como === 'tienda') { y.precio = y.precio ?? 1500; delete y.regla; }
                          else if (y.como === 'top') { y.regla = { tipo: 'top', valor: 10 }; delete y.precio; }
                          else if (y.como === 'logro') { y.regla = y.regla?.tipo && y.regla.tipo !== 'top' ? y.regla : { tipo: 'atrapadas', valor: 50 }; delete y.precio; }
                          else { delete y.regla; delete y.precio; }
                        })}>
                          {COMO.map(k => <option key={k.id} value={k.id}>{k.nombre}</option>)}
                        </Seleccion>
                      </Campo>
                    </Rejilla>
                    <Campo label="Descripción"><Texto valor={x.desc} max={140} onChange={v => set(y => { y.desc = v; })} /></Campo>
                    <Rejilla cols={3}>
                      {x.como === 'tienda' && <Campo label="Precio" hint={c.moneda.nombre}><Numero valor={x.precio ?? 0} min={1} onChange={v => set(y => { y.precio = v; })} /></Campo>}
                      {x.como === 'logro' && <>
                        <Campo label="Se gana cuando…">
                          <Seleccion value={x.regla?.tipo ?? 'atrapadas'} onChange={e => set(y => {
                            const r = REGLAS.find(k => k.id === e.target.value)!;
                            y.regla = { tipo: r.id, ...(r.valor === 'numero' ? { valor: 10 } : r.valor === 'fecha' ? { valor: '12-25' } : r.valor === 'rareza' ? { valor: 'legendaria' } : {}) };
                          })}>
                            {REGLAS.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                          </Seleccion>
                        </Campo>
                        {regla?.valor === 'numero' && <Campo label="N"><Numero valor={Number(x.regla?.valor ?? 1)} min={1} onChange={v => set(y => { y.regla = { tipo: y.regla!.tipo, valor: v }; })} /></Campo>}
                        {regla?.valor === 'fecha' && <Campo label="Día (MM-DD)"><Texto valor={String(x.regla?.valor ?? '')} max={5} placeholder="10-31" onChange={v => set(y => { y.regla = { tipo: y.regla!.tipo, valor: v }; })} /></Campo>}
                        {regla?.valor === 'rareza' && <Campo label="Rareza mínima"><SelRareza c={c} valor={String(x.regla?.valor ?? 'legendaria')} onChange={v => set(y => { y.regla = { tipo: y.regla!.tipo, valor: v }; })} /></Campo>}
                      </>}
                      {x.como === 'top' && <Campo label="Para el top…" hint="1 = solo el primer puesto"><Numero valor={Number(x.regla?.valor ?? 10)} min={1} max={100} onChange={v => set(y => { y.regla = { tipo: 'top', valor: v }; })} /></Campo>}
                      <Campo label="Clave" hint="no cambiar si ya se entregó"><Texto valor={x.clave} max={24} onChange={v => set(y => { y.clave = v.toLowerCase().replace(/[^a-z0-9_]/g, ''); })} /></Campo>
                    </Rejilla>
                    <Campo label="Imagen"><Imagen valor={x.imagen} onChange={v => set(y => { y.imagen = v; })} subir={subir} /></Campo>
                  </div>
                );
              }}
            />
          </div>
        )}

        {sec === 'tienda' && (
          <div className="space-y-3">
            <Nota>
              En venta: <span style={{ color: enVenta > LIMITES.tienda ? '#f87171' : 'white' }}>{enVenta}/{LIMITES.tienda}</span> entre artículos e insignias de tienda (Discord no muestra más).
              Las insignias de tienda se agregan desde «Insignias».
            </Nota>
            <Filas<Articulo>
              items={c.articulos} max={LIMITES.articulos} textoNuevo="Nuevo artículo" vacio="La tienda no tiene artículos."
              onChange={l => cambiar(x => { x.articulos = l; })}
              nuevo={() => ({ id: idLibre('articulo', c.articulos.map(x => x.id)), nombre: 'Bolsa de monedas', emoji: '💰', precio: 100, tipo: 'monedas', monedas: 600, desc: '600 monedas para la economía de Luna.' })}
              titulo={x => `${x.emoji} ${x.nombre} · ${x.precio} ${c.moneda.emoji}`}
              render={(x, set) => (
                <div className="space-y-3">
                  <Rejilla cols={4}>
                    <Campo label="Nombre"><Texto valor={x.nombre} max={40} onChange={v => set(y => { y.nombre = v; })} /></Campo>
                    <Campo label="Emoji"><Emoji valor={x.emoji} onChange={v => set(y => { y.emoji = v; })} /></Campo>
                    <Campo label="Precio" hint={c.moneda.nombre}><Numero valor={x.precio} min={1} onChange={v => set(y => { y.precio = v; })} /></Campo>
                    <Campo label="Tipo">
                      <Seleccion value={x.tipo} onChange={e => set(y => {
                        y.tipo = e.target.value as Articulo['tipo'];
                        delete y.monedas; delete y.boost; delete y.horas;
                        if (y.tipo === 'monedas') y.monedas = 600;
                        if (y.tipo === 'boost') { y.boost = 'xp'; y.horas = 2; }
                      })}>
                        {TIPOS_ARTICULO.map(k => <option key={k.id} value={k.id}>{k.nombre}</option>)}
                      </Seleccion>
                    </Campo>
                  </Rejilla>
                  <Rejilla cols={3}>
                    {x.tipo === 'monedas' && <Campo label="Monedas que da"><Numero valor={x.monedas ?? 0} min={1} onChange={v => set(y => { y.monedas = v; })} /></Campo>}
                    {x.tipo === 'boost' && <>
                      <Campo label="Potencia">
                        <Seleccion value={x.boost} onChange={e => set(y => { y.boost = e.target.value as 'xp' | 'moneda'; })}>
                          <option value="xp">XP ×1,5</option><option value="moneda">{c.moneda.nombre} ×2 al atrapar</option>
                        </Seleccion>
                      </Campo>
                      <Campo label="Horas"><Numero valor={x.horas ?? 1} min={1} max={48} onChange={v => set(y => { y.horas = v; })} /></Campo>
                    </>}
                    {x.tipo === 'cofre' && <Nota>Al abrirlo da {c.moneda.nombre}, monedas, una criatura, un potenciador o (muy rara vez) la insignia secreta.</Nota>}
                    <Campo label="Id"><Texto valor={x.id} max={24} onChange={v => set(y => { y.id = v.toLowerCase().replace(/[^a-z0-9_]/g, ''); })} /></Campo>
                  </Rejilla>
                  <Campo label="Descripción"><Texto valor={x.desc} max={140} onChange={v => set(y => { y.desc = v; })} /></Campo>
                </div>
              )}
            />
          </div>
        )}

        {sec === 'misiones' && (
          <div className="space-y-3">
            <div className="max-w-xs">
              <Campo label="Misiones por día" hint="se eligen al azar, las mismas para todos">
                <Numero valor={c.misionesPorDia} min={1} max={Math.min(5, c.misiones.length)} onChange={v => cambiar(x => { x.misionesPorDia = v; })} />
              </Campo>
            </div>
            <Filas<Mision>
              items={c.misiones} max={LIMITES.misiones} textoNuevo="Nueva misión" vacio="Todavía no hay misiones."
              onChange={l => cambiar(x => { x.misiones = l; })}
              nuevo={() => ({ id: idLibre('mision', c.misiones.map(x => x.id)), tipo: 'atrapar', nombre: 'Cazador', emoji: '🎯', desc: 'Atrapa 3 criaturas', meta: 3, premio: 60 })}
              titulo={x => `${x.emoji} ${x.nombre} · +${x.premio} ${c.moneda.emoji}`}
              render={(x, set) => (
                <div className="space-y-3">
                  <Rejilla cols={4}>
                    <Campo label="Nombre"><Texto valor={x.nombre} max={40} onChange={v => set(y => { y.nombre = v; })} /></Campo>
                    <Campo label="Emoji"><Emoji valor={x.emoji} onChange={v => set(y => { y.emoji = v; })} /></Campo>
                    <Campo label="Qué cuenta">
                      <Seleccion value={x.tipo} onChange={e => set(y => { y.tipo = e.target.value as Mision['tipo']; })}>
                        {TIPOS_MISION.map(k => <option key={k.id} value={k.id}>{k.nombre}</option>)}
                      </Seleccion>
                    </Campo>
                    <Campo label="Id"><Texto valor={x.id} max={24} onChange={v => set(y => { y.id = v.toLowerCase().replace(/[^a-z0-9_]/g, ''); })} /></Campo>
                  </Rejilla>
                  <Rejilla cols={3}>
                    <Campo label="Descripción"><Texto valor={x.desc} max={100} onChange={v => set(y => { y.desc = v; })} /></Campo>
                    <Campo label="Meta"><Numero valor={x.meta} min={1} onChange={v => set(y => { y.meta = v; })} /></Campo>
                    <Campo label="Premio" hint={c.moneda.nombre}><Numero valor={x.premio} min={1} onChange={v => set(y => { y.premio = v; })} /></Campo>
                  </Rejilla>
                </div>
              )}
            />
          </div>
        )}

        {sec === 'bonos' && (
          <div className="space-y-4">
            <Interruptor activo={c.bonos.finDeSemana.activo} onChange={v => cambiar(x => { x.bonos.finDeSemana.activo = v; })}
              titulo="Bono de fin de semana" texto={`Sábados y domingos (hora de Lima) se multiplican ${c.moneda.nombre} y XP.`} />
            {c.bonos.finDeSemana.activo && (
              <Rejilla cols={3}>
                <Campo label="Nombre"><Texto valor={c.bonos.finDeSemana.nombre} max={40} onChange={v => cambiar(x => { x.bonos.finDeSemana.nombre = v; })} /></Campo>
                <Campo label="Emoji"><Emoji valor={c.bonos.finDeSemana.emoji} onChange={v => cambiar(x => { x.bonos.finDeSemana.emoji = v; })} /></Campo>
                <Campo label="Multiplicador"><Numero valor={c.bonos.finDeSemana.mult} min={1} max={5} paso={0.05} onChange={v => cambiar(x => { x.bonos.finDeSemana.mult = v; })} /></Campo>
              </Rejilla>
            )}
            <Filas<DiaBono>
              items={c.bonos.dias} max={LIMITES.bonosDias} textoNuevo="Nuevo día especial" vacio="Sin días especiales."
              onChange={l => cambiar(x => { x.bonos.dias = l; })}
              nuevo={() => ({ fecha: '12-25', mult: 2, nombre: 'Día especial', emoji: '⭐', masCriaturas: false })}
              titulo={x => `${x.emoji} ${x.nombre} · ${x.fecha} · ×${x.mult}`}
              render={(x, set) => (
                <div className="space-y-3">
                  <Rejilla cols={4}>
                    <Campo label="Día (MM-DD)"><Texto valor={x.fecha} max={5} placeholder="10-31" onChange={v => set(y => { y.fecha = v; })} /></Campo>
                    <Campo label="Nombre"><Texto valor={x.nombre} max={40} onChange={v => set(y => { y.nombre = v; })} /></Campo>
                    <Campo label="Emoji"><Emoji valor={x.emoji} onChange={v => set(y => { y.emoji = v; })} /></Campo>
                    <Campo label="Multiplicador"><Numero valor={x.mult} min={1} max={5} paso={0.25} onChange={v => set(y => { y.mult = v; })} /></Campo>
                  </Rejilla>
                  <Interruptor activo={x.masCriaturas} onChange={v => set(y => { y.masCriaturas = v; })} titulo={`Más ${c.textos.criaturas}`} texto="Ese día salen el doble de seguido." />
                </div>
              )}
            />
          </div>
        )}

        {sec === 'apariciones' && (
          <div className="space-y-3">
            <Nota>Cuándo aparece una criatura en un servidor: tiene que haber conversación (mensajes de varias personas) y pasar un tiempo mínimo desde la anterior. Después, cuanto más se espera, más probable.</Nota>
            <Rejilla cols={4}>
              <Campo label="Minutos entre una y otra"><Numero valor={c.apariciones.minutos} min={2} max={120} onChange={v => cambiar(x => { x.apariciones.minutos = v; })} /></Campo>
              <Campo label="Mensajes necesarios"><Numero valor={c.apariciones.mensajes} min={1} max={200} onChange={v => cambiar(x => { x.apariciones.mensajes = v; })} /></Campo>
              <Campo label="Personas distintas"><Numero valor={c.apariciones.autores} min={1} max={20} onChange={v => cambiar(x => { x.apariciones.autores = v; })} /></Campo>
              <Campo label="Segundos para atraparla"><Numero valor={c.apariciones.segundos} min={15} max={600} onChange={v => cambiar(x => { x.apariciones.segundos = v; })} /></Campo>
            </Rejilla>
          </div>
        )}
      </div>

      <footer className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-t rounded-b-2xl" style={{ background: sf, borderColor: bd }}>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => { setC(copia(inicial)); setError(null); }} disabled={!cambios || guardando}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-light transition-all hover:bg-white/5 disabled:opacity-40" style={{ border: `1px solid ${bd}`, color: mt }}>
            <Undo2 className="w-3.5 h-3.5" strokeWidth={1.5} /> Descartar cambios
          </button>
          {extra}
        </div>
        <div className="flex items-center gap-3 min-w-0">
          {error
            ? <span className="flex items-center gap-1.5 text-[11px] font-light min-w-0" style={{ color: '#f87171' }}><AlertCircle className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={1.5} /><span className="truncate" title={error}>{error}</span></span>
            : cambios && <span className="text-[11px] font-light" style={{ color: '#facc15' }}>Cambios sin guardar</span>}
          <button type="button" onClick={guardar} disabled={guardando || !cambios}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-light transition-all hover:opacity-90 disabled:opacity-40 flex-shrink-0" style={{ background: '#fff', color: '#000' }}>
            {guardando ? <><Loader2 className="w-4 h-4 animate-spin" /> Guardando…</> : <><Save className="w-4 h-4" strokeWidth={1.5} /> Guardar</>}
          </button>
        </div>
      </footer>
    </div>
  );
};
