/** Catálogo permitido por la pantalla que usa el selector; no implica acceso a la API del bot. */
export interface EmojiPropio {
  id: string;
  nombre: string;
  animado: boolean;
  codigo: string;
  url: string;
  origen: string;
  borrable: boolean;
}
