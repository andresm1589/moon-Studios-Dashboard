// ─── Webs — estilos (sobre los tokens del tema: sirven en oscuro y en claro) ──
// Los tonos translúcidos se mezclan con el color del texto (color-mix), así un
// «5 % de texto» es gris claro en el tema oscuro y gris oscuro en el claro.

const T = 'hsl(var(--foreground))';
const tinte = (p: number) => `color-mix(in srgb, ${T} ${p}%, transparent)`;

export const CSS_WEBS = `
.wb { display: grid; grid-template-columns: 232px minmax(0, 1fr); gap: 20px; align-items: start; }
.wb-nav { position: sticky; top: 12px; display: grid; gap: 18px; padding: 14px 10px; border-radius: 20px; background: hsl(var(--card)); border: 1px solid hsl(var(--border)); }
.wb-nav-marca { display: flex; align-items: center; gap: 10px; padding: 2px 8px 6px; }
.wb-nav-marca b { display: block; font-size: 15px; font-weight: 500; color: ${T}; letter-spacing: -0.01em; }
.wb-nav-marca small { display: block; font-size: 11px; color: hsl(var(--muted-foreground)); }
.wb-grupo { display: grid; gap: 2px; }
.wb-grupo-titulo { display: flex; align-items: center; justify-content: space-between; padding: 0 10px 4px; font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: hsl(var(--muted-foreground)); }
.wb-grupo-titulo a { display: inline-flex; color: hsl(var(--muted-foreground)); opacity: .7; }
.wb-grupo-titulo a:hover { opacity: 1; color: ${T}; }
.wb-item { display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 10px; border-radius: 12px; border: none; background: none; cursor: pointer; text-align: left;
  color: hsl(var(--muted-foreground)); font-size: 13px; font-weight: 300; transition: background .2s, color .2s; }
.wb-item:hover { background: ${tinte(5)}; color: ${T}; }
.wb-item[aria-current="page"] { background: ${tinte(9)}; color: ${T}; font-weight: 400; box-shadow: inset 0 0 0 1px ${tinte(8)}; }
.wb-item svg { flex: none; width: 15px; height: 15px; }
.wb-item span { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wb-insignia { min-width: 18px; height: 18px; padding: 0 5px; border-radius: 999px; display: inline-grid; place-items: center; font-size: 10px; font-weight: 600; color: #fff; background: #ef4444; }

.wb-cuerpo { min-width: 0; display: grid; gap: 16px; }
.wb-cab { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 12px; }
.wb-ruta { display: flex; align-items: center; gap: 6px; font-size: 11px; color: hsl(var(--muted-foreground)); }
.wb-cab h1 { margin: 4px 0 0; display: flex; align-items: center; gap: 10px; font-size: 22px; font-weight: 300; letter-spacing: -0.02em; color: ${T}; }
.wb-cab p { margin: 4px 0 0; font-size: 12.5px; font-weight: 300; color: hsl(var(--muted-foreground)); }
.wb-panel { border-radius: 20px; background: hsl(var(--card)); border: 1px solid hsl(var(--border)); padding: 20px; animation: wbEntra .35s cubic-bezier(.32,.72,0,1); }
.wb-panel-limpio { padding: 0; background: none; border: none; }
@keyframes wbEntra { from { opacity: 0; transform: translateY(8px) } }

/* Piezas comunes */
.wb-btn { display: inline-flex; align-items: center; justify-content: center; gap: 7px; height: 34px; padding: 0 14px; border-radius: 10px; cursor: pointer; font-size: 12px; font-weight: 400;
  color: ${T}; background: ${tinte(5)}; border: 1px solid hsl(var(--border)); transition: background .2s, opacity .2s; text-decoration: none; white-space: nowrap; }
.wb-btn:hover { background: ${tinte(9)}; }
.wb-btn:disabled { opacity: .5; cursor: default; }
.wb-btn svg { width: 14px; height: 14px; }
.wb-btn-fuerte { color: hsl(var(--background)); background: ${T}; border-color: ${T}; }
.wb-btn-fuerte:hover { background: ${T}; opacity: .88; }
.wb-btn-peligro { color: #ef4444; border-color: rgba(239, 68, 68, .3); background: rgba(239, 68, 68, .06); }
.wb-btn-peligro:hover { background: rgba(239, 68, 68, .12); }
.wb-tarjeta { border-radius: 16px; background: hsl(var(--card)); border: 1px solid hsl(var(--border)); }
.wb-panel .wb-tarjeta { background: ${tinte(2.5)}; }
.wb-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.wb-kpi { padding: 14px 16px; }
.wb-kpi-cab { display: flex; align-items: center; justify-content: space-between; font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: hsl(var(--muted-foreground)); }
.wb-kpi-cab svg { width: 14px; height: 14px; }
.wb-kpi b { display: block; margin-top: 10px; font-size: 24px; font-weight: 300; letter-spacing: -0.02em; color: ${T}; }
.wb-kpi small { display: block; margin-top: 2px; font-size: 11px; font-weight: 300; color: hsl(var(--muted-foreground)); }
.wb-h2 { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 13px; font-weight: 400; color: ${T}; }
.wb-h2 svg { width: 15px; height: 15px; color: hsl(var(--muted-foreground)); }
.wb-pill { display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 999px; font-size: 10.5px; font-weight: 500; white-space: nowrap;
  color: var(--c); background: color-mix(in srgb, var(--c) 10%, transparent); border: 1px solid color-mix(in srgb, var(--c) 28%, transparent); }
.wb-con-ico { display: inline-flex; align-items: center; gap: 5px; }
.wb-con-ico svg { flex: none; width: 13px; height: 13px; }
.wb-vacio { display: grid; justify-items: center; gap: 8px; padding: 36px 16px; text-align: center; font-size: 12.5px; font-weight: 300; color: hsl(var(--muted-foreground)); }
.wb-vacio svg { width: 26px; height: 26px; opacity: .5; }
.wb-input { width: 100%; height: 36px; padding: 0 12px; border-radius: 10px; font-size: 12.5px; font-weight: 300; color: ${T}; background: hsl(var(--secondary)); border: 1px solid hsl(var(--border)); outline: none; }
.wb-input:focus { border-color: ${tinte(30)}; }
textarea.wb-input { height: auto; padding: 10px 12px; resize: vertical; line-height: 1.5; }
.wb-buscar { position: relative; flex: 1 1 220px; }
.wb-buscar svg { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); width: 14px; height: 14px; color: hsl(var(--muted-foreground)); pointer-events: none; }
.wb-buscar .wb-input { padding-left: 32px; }
.wb-segmento { display: inline-flex; flex-wrap: wrap; gap: 2px; padding: 3px; border-radius: 12px; background: hsl(var(--secondary)); border: 1px solid hsl(var(--border)); }
.wb-segmento button { display: inline-flex; align-items: center; gap: 6px; padding: 6px 11px; border-radius: 9px; border: none; background: none; cursor: pointer; font-size: 12px; font-weight: 300; color: hsl(var(--muted-foreground)); transition: background .2s, color .2s; }
.wb-segmento button[aria-pressed="true"] { color: ${T}; background: ${tinte(10)}; font-weight: 400; }
.wb-segmento button i { font-style: normal; font-size: 10px; opacity: .7; }
.wb-barra { height: 5px; border-radius: 5px; overflow: hidden; background: ${tinte(8)}; }
.wb-barra i { display: block; height: 100%; border-radius: 5px; background: ${T}; transition: width .8s cubic-bezier(.32,.72,0,1); }

/* Lista de filas */
.wb-lista { display: grid; gap: 6px; }
.wb-fila { display: flex; align-items: center; gap: 12px; width: 100%; padding: 11px 12px; border-radius: 14px; cursor: pointer; text-align: left; color: ${T};
  background: ${tinte(2)}; border: 1px solid hsl(var(--border)); transition: background .2s, border-color .2s; }
.wb-fila:hover { background: ${tinte(5)}; border-color: ${tinte(16)}; }
.wb-fila[aria-current="true"] { border-color: ${tinte(35)}; background: ${tinte(6)}; }
.wb-avatar { flex: none; width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; font-size: 13px; font-weight: 500; color: hsl(var(--background)); background: ${T}; }
.wb-fila-texto { flex: 1; min-width: 0; }
.wb-fila-texto b { display: block; font-size: 13px; font-weight: 400; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wb-fila-texto small { display: flex; align-items: center; gap: 6px; margin-top: 2px; font-size: 11px; font-weight: 300; color: hsl(var(--muted-foreground)); overflow: hidden; white-space: nowrap; }
.wb-monto { flex: none; font-size: 14px; font-weight: 400; color: ${T}; letter-spacing: -0.01em; }
.wb-punto { width: 7px; height: 7px; border-radius: 50%; background: #ef4444; flex: none; }

/* Hoja lateral */
.wb-velo { position: fixed; inset: 0; z-index: 60; background: rgba(0, 0, 0, .45); backdrop-filter: blur(3px); animation: wbAparece .2s ease; }
.wb-hoja { position: fixed; top: 0; right: 0; bottom: 0; z-index: 61; width: min(460px, 100vw); display: flex; flex-direction: column; background: hsl(var(--card)); border-left: 1px solid hsl(var(--border));
  box-shadow: -30px 0 80px -30px rgba(0, 0, 0, .6); animation: wbDesliza .35s cubic-bezier(.32,.72,0,1); }
.wb-hoja-cab { display: flex; align-items: flex-start; gap: 12px; padding: 18px 20px 16px; border-bottom: 1px solid hsl(var(--border)); }
.wb-hoja-cuerpo { flex: 1; overflow-y: auto; padding: 18px 20px; display: grid; align-content: start; gap: 18px; }
.wb-hoja-pie { display: flex; gap: 8px; padding: 14px 20px; border-top: 1px solid hsl(var(--border)); }
.wb-etiqueta { display: block; margin-bottom: 6px; font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: hsl(var(--muted-foreground)); }
.wb-datos { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 0; }
.wb-datos div { padding: 10px 12px; border-radius: 12px; background: ${tinte(4)}; }
.wb-datos dt { font-size: 10.5px; font-weight: 300; color: hsl(var(--muted-foreground)); }
.wb-datos dd { margin: 3px 0 0; font-size: 13px; font-weight: 400; color: ${T}; overflow-wrap: anywhere; }
.wb-cita { margin: 0; padding: 10px 12px; border-left: 2px solid ${tinte(30)}; border-radius: 0 10px 10px 0; background: ${tinte(4)}; font-size: 12.5px; font-weight: 300; line-height: 1.6; color: ${T}; white-space: pre-wrap; }
.wb-interruptor { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px; border-radius: 12px; background: ${tinte(4)}; cursor: pointer; }
.wb-interruptor b { display: block; font-size: 12.5px; font-weight: 400; color: ${T}; }
.wb-interruptor small { display: block; margin-top: 2px; font-size: 11px; font-weight: 300; color: hsl(var(--muted-foreground)); }
.wb-interruptor input { width: 34px; height: 20px; accent-color: #22c55e; cursor: pointer; }
.wb-interruptor[aria-disabled="true"] { opacity: .5; cursor: default; }
@keyframes wbAparece { from { opacity: 0 } }
@keyframes wbDesliza { from { transform: translateX(40px); opacity: 0 } }

@media (max-width: 980px) {
  .wb { grid-template-columns: minmax(0, 1fr); }
  .wb-nav { position: static; display: flex; gap: 6px; overflow-x: auto; padding: 8px; }
  .wb-nav-marca, .wb-grupo-titulo { display: none; }
  .wb-grupo { display: flex; gap: 4px; }
  .wb-item { width: auto; white-space: nowrap; }
  .wb-item span { overflow: visible; }
}
@media (max-width: 760px) { .wb-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
`;
