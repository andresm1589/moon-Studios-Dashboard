import { panelInk } from '@/lib/panelColors';
import React, { useState } from 'react';
import {
  MessageCircle, Mail, Share2, Clock, HelpCircle, Megaphone, ExternalLink, Inbox,
  Twitter, Instagram, Music2, Youtube, Github, Globe,
} from 'lucide-react';
import { useDocumento, type DocBase } from './useDocumento';
import { Acciones, Area, Bloque, Entrada, Etiqueta, Filas, Interruptor, Seleccion, SelectorIdioma, SinIdioma } from './ui';
import { WEB, copia, fechaHora, mt, type Lang, type LunaFetch } from './comun';

// ─── Contacto — /contacto de la web de Luna y las redes del pie ──────────────
// La invitación, el correo, el formulario y las redes valen para todos los
// idiomas; los textos, el horario y las preguntas frecuentes van por idioma.

interface Red { tipo: string; url: string; etiqueta: string }
interface ContactoTexto { titulo: string; subtitulo: string; aviso: string; horario: { dias: string; horas: string }[]; faq: { pregunta: string; respuesta: string }[] }
export interface Contacto extends DocBase { discord: string | null; email: string | null; formularioActivo: boolean; redes: Red[]; idiomas: Partial<Record<Lang, ContactoTexto>> }

const REDES: { id: string; label: string; Icon: React.ElementType; ejemplo: string }[] = [
  { id: 'discord', label: 'Discord', Icon: MessageCircle, ejemplo: 'https://discord.gg/…' },
  { id: 'email', label: 'Correo', Icon: Mail, ejemplo: 'mailto:hola@…' },
  { id: 'twitter', label: 'X / Twitter', Icon: Twitter, ejemplo: 'https://x.com/…' },
  { id: 'instagram', label: 'Instagram', Icon: Instagram, ejemplo: 'https://instagram.com/…' },
  { id: 'tiktok', label: 'TikTok', Icon: Music2, ejemplo: 'https://tiktok.com/@…' },
  { id: 'youtube', label: 'YouTube', Icon: Youtube, ejemplo: 'https://youtube.com/@…' },
  { id: 'github', label: 'GitHub', Icon: Github, ejemplo: 'https://github.com/…' },
  { id: 'web', label: 'Web', Icon: Globe, ejemplo: 'https://…' },
];
const red = (tipo: string) => REDES.find(r => r.id === tipo) ?? REDES[REDES.length - 1];

const limpiar = (d: Contacto) => ({
  discord: d.discord, email: d.email, formularioActivo: d.formularioActivo,
  redes: d.redes, idiomas: d.idiomas,
});

export const ContactoEditor: React.FC<{ lunaFetch: LunaFetch; inicial: Contacto; onSucio: (s: boolean) => void }> = ({ lunaFetch, inicial, onSucio }) => {
  const { original, borrador: d, cambiar, hayCambios, guardando, guardar, restaurar, descartar } = useDocumento(lunaFetch, inicial, limpiar, 'Contacto', onSucio);
  const [lang, setLang] = useState<Lang>('es');
  const t = d.idiomas[lang];
  const cambiarTexto = (f: (t: ContactoTexto) => void) => cambiar(x => { const tx = x.idiomas[lang]; if (tx) f(tx); });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11px] font-light" style={{ color: panelInk(mt) }}>
          {original.predeterminado ? 'Contenido predeterminado (nunca se editó)' : `Editado · ${fechaHora(original.actualizadoEn)}`}
        </p>
        <a href={`${WEB}/contacto`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-xs font-light transition-all moon-panel-hover" style={{ color: panelInk(mt) }}>
          <ExternalLink className="w-3.5 h-3.5" strokeWidth={1.5} /> Ver /contacto en la web
        </a>
      </div>

      <Bloque Icon={Inbox} titulo="Canales" texto="Valen para todos los idiomas." color="#818cf8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Etiqueta hint="el botón principal de la página">Invitación de Discord</Etiqueta>
            <Entrada value={d.discord ?? ''} maxLength={200} placeholder="https://discord.gg/…" onChange={e => cambiar(x => { x.discord = e.target.value.trim() || null; })} />
          </div>
          <div>
            <Etiqueta>Correo de soporte</Etiqueta>
            <Entrada type="email" value={d.email ?? ''} maxLength={120} placeholder="soporte@…" onChange={e => cambiar(x => { x.email = e.target.value.trim() || null; })} />
          </div>
        </div>
        <Interruptor activo={d.formularioActivo} onChange={v => cambiar(x => { x.formularioActivo = v; })}
          titulo="Formulario de contacto"
          texto="Los mensajes llegan a Mensajería con la etiqueta «Luna NET». Apagado, la página muestra solo Discord y el correo." />
      </Bloque>

      <Bloque Icon={Share2} titulo="Redes" texto="Aparecen en /contacto y en el pie de toda la web (una por tipo, hasta 6). Usa solo cuentas reales de Luna o de Moon Studios." color="#38bdf8">
        <Filas<Red> items={d.redes} max={12} onChange={v => cambiar(x => { x.redes = v; })}
          nuevo={() => ({ tipo: 'web', url: 'https://', etiqueta: '' })}
          textoNuevo="Añadir red" vacio="Sin redes: el pie de página no muestra íconos."
          titulo={r => r.etiqueta || red(r.tipo).label}
          render={(r, c) => {
            const { Icon, ejemplo } = red(r.tipo);
            return (
              <div className="grid grid-cols-1 sm:grid-cols-[160px_minmax(0,1fr)_minmax(0,0.8fr)] gap-3">
                <div>
                  <Etiqueta>Tipo</Etiqueta>
                  <div className="relative">
                    <Icon className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" strokeWidth={1.5} style={{ color: panelInk('#38bdf8') }} />
                    <Seleccion value={r.tipo} onChange={e => c(x => { x.tipo = e.target.value; })} className="!pl-8">
                      {REDES.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </Seleccion>
                  </div>
                </div>
                <div><Etiqueta>Dirección</Etiqueta><Entrada value={r.url} maxLength={300} placeholder={ejemplo} onChange={e => c(x => { x.url = e.target.value.trim(); })} /></div>
                <div><Etiqueta hint="opcional">Nombre</Etiqueta><Entrada value={r.etiqueta} maxLength={40} placeholder="Discord de Luna NET" onChange={e => c(x => { x.etiqueta = e.target.value; })} /></div>
              </div>
            );
          }} />
      </Bloque>

      <SelectorIdioma lang={lang} setLang={setLang} tiene={l => !!d.idiomas[l]} onQuitar={() => cambiar(x => { delete x.idiomas[lang]; })} />

      {!t ? (
        <SinIdioma lang={lang} onCrear={() => cambiar(x => { if (x.idiomas.es) x.idiomas[lang] = copia(x.idiomas.es); })} />
      ) : (
        <>
          <Bloque Icon={Megaphone} titulo="Textos de la página" color="#a5b4fc">
            <div><Etiqueta hint={`${t.titulo.length}/80`}>Título</Etiqueta><Entrada value={t.titulo} maxLength={80} onChange={e => cambiarTexto(x => { x.titulo = e.target.value; })} /></div>
            <div><Etiqueta hint={`${t.subtitulo.length}/400`}>Subtítulo</Etiqueta><Area rows={2} value={t.subtitulo} maxLength={400} onChange={e => cambiarTexto(x => { x.subtitulo = e.target.value; })} /></div>
            <div><Etiqueta hint={`${t.aviso.length}/300 · junto al botón de Discord`}>Aviso</Etiqueta><Area rows={2} value={t.aviso} maxLength={300} onChange={e => cambiarTexto(x => { x.aviso = e.target.value; })} /></div>
          </Bloque>

          <Bloque Icon={Clock} titulo="Horario de atención" texto="Escribe la zona horaria en las horas, p. ej. «(hora de Lima)»." color="#facc15">
            <Filas items={t.horario} max={7} onChange={v => cambiarTexto(x => { x.horario = v; })}
              nuevo={() => ({ dias: '', horas: '' })} textoNuevo="Añadir franja" vacio="Sin horario: la tarjeta no se muestra."
              titulo={h => [h.dias, h.horas].filter(Boolean).join(' · ')}
              render={(h, c) => (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><Etiqueta>Días</Etiqueta><Entrada value={h.dias} maxLength={60} placeholder="Lunes a viernes" onChange={e => c(x => { x.dias = e.target.value; })} /></div>
                  <div><Etiqueta>Horas</Etiqueta><Entrada value={h.horas} maxLength={60} placeholder="10:00 – 22:00 (hora de Lima)" onChange={e => c(x => { x.horas = e.target.value; })} /></div>
                </div>
              )} />
          </Bloque>

          <Bloque Icon={HelpCircle} titulo="Preguntas frecuentes" texto="Las respuestas admiten **negrita**, `código` y [enlaces](/wiki)." color="#4ade80">
            <Filas items={t.faq} max={20} onChange={v => cambiarTexto(x => { x.faq = v; })}
              nuevo={() => ({ pregunta: '', respuesta: '' })} textoNuevo="Añadir pregunta" vacio="Sin preguntas: la sección no se muestra."
              titulo={f => f.pregunta}
              render={(f, c) => (
                <>
                  <div><Etiqueta>Pregunta</Etiqueta><Entrada value={f.pregunta} maxLength={200} onChange={e => c(x => { x.pregunta = e.target.value; })} /></div>
                  <div><Etiqueta hint={`${f.respuesta.length}/1500`}>Respuesta</Etiqueta><Area rows={3} value={f.respuesta} maxLength={1500} onChange={e => c(x => { x.respuesta = e.target.value; })} /></div>
                </>
              )} />
          </Bloque>
        </>
      )}

      <Acciones hayCambios={hayCambios} guardando={guardando} onDescartar={descartar} onGuardar={guardar}
        onRestaurar={restaurar} restaurarDeshabilitado={original.predeterminado} textoGuardar="Publicar contacto" />
    </div>
  );
};
