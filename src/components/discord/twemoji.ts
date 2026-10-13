// Los emojis se dibujan con Twemoji, las mismas imágenes que usa Discord (así
// en el panel se ven igual que en el chat, y no según la fuente de Windows).
// La regla de los nombres de archivo es la de twemoji: sin el selector FE0F,
// salvo que el emoji sea una secuencia unida con ZWJ (200D).
const VERSION = '15.1.0';

export function urlTwemoji(emoji: string): string {
  const texto = emoji.includes('‍') ? emoji : emoji.replace(/️/g, '');
  const puntos = [...texto].map(c => c.codePointAt(0)!.toString(16));
  return `https://cdn.jsdelivr.net/gh/jdecked/twemoji@${VERSION}/assets/svg/${puntos.join('-')}.svg`;
}
