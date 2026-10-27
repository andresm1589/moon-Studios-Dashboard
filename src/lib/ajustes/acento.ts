const rgb = (hex: string): number[] => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const luminancia = (hex: string) => rgb(hex).map(c => c / 255).map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4).reduce((a, c, i) => a + c * [.2126, .7152, .0722][i], 0);
export const contrasteColores = (a: string, b: string): number => {
  const x = luminancia(a), y = luminancia(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
};
const mezclar = (color: string, destino: number, factor: number) => `#${rgb(color).map(c => Math.round(c + (destino - c) * factor).toString(16).padStart(2, '0')).join('')}`;

/** Acento para texto legible en ambas superficies, sin modificar la elección guardada. */
export function coloresAcento(color: string, oscuro: boolean) {
  const fondos = oscuro ? ['#0c0d0e', '#1d1f21'] : ['#ffffff', '#f3f3f0'];
  const apto = (c: string) => fondos.every(fondo => contrasteColores(c, fondo) >= 4.5);
  let ink = color;
  if (!apto(ink)) {
    let bajo = 0, alto = 1;
    for (let i = 0; i < 20; i++) {
      const medio = (bajo + alto) / 2;
      if (apto(mezclar(color, oscuro ? 255 : 0, medio))) alto = medio;
      else bajo = medio;
    }
    ink = mezclar(color, oscuro ? 255 : 0, alto);
  }
  const on = contrasteColores(color, '#000000') >= contrasteColores(color, '#ffffff') ? '#000000' : '#ffffff';
  return { ink, on };
}
