import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import type { DocumentoTramite } from './tramitesDocumentoModelo';
import { fechaDocumentoTramite, SITIO_VERIFICACION, urlVerificacionPublica } from './tramitesDocumentoFormato';

// Compatibilidad para consumidores anteriores; el preview usa el módulo ligero.
export { fechaDocumentoTramite, urlConsultaDocumentoTramite, urlVerificacionPublica } from './tramitesDocumentoFormato';

const INK = '#171719';
const MUTED = '#626269';
const LINE = '#d9d9d7';
const PAPER = '#ffffff';
const CARD_WIDTH = 85.6;
const CARD_HEIGHT = 53.98;
// Logotipo completo de Moon Studios (marca «mn» + «moon Studios»), proporción 1314 × 310.
const WORDMARK = { oscuro: '/brand/moon-completo-oscuro.png', blanco: '/brand/moon-completo-blanco.png', proporcion: 1314 / 310 };
type Logos = { oscuro: string | null; blanco: string | null };

function texto(value: string): string {
  return value.normalize('NFC').replace(/\r\n?/g, '\n')
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/\u2026/g, '...')
    // Quita caracteres de control que jsPDF dibujar\u00eda como cajas.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
}

async function cargarLogos(): Promise<Logos> {
  const [oscuro, blanco] = await Promise.all([logoPng(WORDMARK.oscuro), logoPng(WORDMARK.blanco)]);
  return { oscuro, blanco };
}

async function logoPng(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return `data:image/png;base64,${btoa(binary)}`;
  } catch {
    // The wordmark remains present if an offline session cannot load the image.
    return null;
  }
}

function font(pdf: jsPDF, size: number, weight: 'normal' | 'bold' = 'normal', color = INK) {
  pdf.setFont('helvetica', weight);
  pdf.setFontSize(size);
  pdf.setTextColor(color);
  pdf.setCharSpace(0);
}

function lines(pdf: jsPDF, value: string, width: number): string[] {
  return pdf.splitTextToSize(texto(value), width) as string[];
}

/** Wraps and reduces a card field without deleting any of its text. */
function ajustarCampoTarjeta(pdf: jsPDF, value: string, width: number, height: number, preferredSize: number, minimumSize: number) {
  let size = preferredSize;
  let result: string[] = [];
  for (; size >= minimumSize; size -= 0.25) {
    pdf.setFontSize(size);
    result = lines(pdf, value, width);
    if (result.length * size * 0.352778 * 1.12 <= height) break;
  }
  if (size < minimumSize) {
    // The domain validation bounds fields; unexpected oversized data must never be clipped.
    throw new Error('El texto de la credencial es demasiado extenso. Acorta el nombre, cargo o área antes de emitirla.');
  }
  return { lines: result, size, lineHeight: size * 0.352778 * 1.12 };
}

function campoTarjeta(pdf: jsPDF, label: string, value: string, x: number, y: number, width: number, height: number, preferredSize = 7.8, minimumSize = 5.75) {
  font(pdf, 5, 'normal', MUTED);
  pdf.text(label, x, y);
  font(pdf, preferredSize, 'bold');
  const fitted = ajustarCampoTarjeta(pdf, value || 'No especificado', width, height, preferredSize, minimumSize);
  pdf.setFontSize(fitted.size);
  // La primera línea baja según su tamaño para no tocar la etiqueta.
  const primera = 1.3 + fitted.size * 0.352778 * 0.78;
  fitted.lines.forEach((line, index) => pdf.text(line, x, y + primera + index * fitted.lineHeight));
}

async function crearCredencial(documento: DocumentoTramite, logos: Logos): Promise<jsPDF> {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [CARD_WIDTH, CARD_HEIGHT], compress: true });
  // El QR abre la consulta pública con el ID y el tipo ya completos.
  const qr = await QRCode.toDataURL(urlVerificacionPublica(documento), {
    width: 600, margin: 4, errorCorrectionLevel: 'M', color: { dark: '#171719', light: '#ffffff' },
  });
  const dibujarBase = () => {
    pdf.setFillColor(PAPER);
    pdf.rect(0, 0, CARD_WIDTH, CARD_HEIGHT, 'F');
    pdf.setDrawColor(LINE);
    pdf.setLineWidth(0.2);
    pdf.roundedRect(0.7, 0.7, CARD_WIDTH - 1.4, CARD_HEIGHT - 1.4, 2.8, 2.8, 'S');
  };
  dibujarBase();
  pdf.setFillColor(INK);
  pdf.roundedRect(0.7, 0.7, CARD_WIDTH - 1.4, 12, 2.8, 2.8, 'F');
  pdf.rect(0.7, 7, CARD_WIDTH - 1.4, 5.7, 'F');
  if (logos.blanco) pdf.addImage(logos.blanco, 'PNG', 4.5, 3.4, 6 * WORDMARK.proporcion, 6);
  else { font(pdf, 9.3, 'bold', '#ffffff'); pdf.text('moon Studios', 4.5, 8); }
  font(pdf, 4.5, 'normal', '#cdcdcf');
  // align: 'right' no descuenta el espaciado entre letras: se calcula el ancho a mano.
  const rotulo = 'CREDENCIAL DE EQUIPO', espaciado = 0.45;
  pdf.setCharSpace(espaciado);
  pdf.text(rotulo, CARD_WIDTH - 4.5 - pdf.getTextWidth(rotulo) - espaciado * (rotulo.length - 1), 6.2);
  pdf.setCharSpace(0);
  font(pdf, 4.2, 'normal', '#9a9a9f');
  pdf.text('01 / FRENTE', CARD_WIDTH - 4.5, 9.4, { align: 'right' });

  campoTarjeta(pdf, 'NOMBRE DEL TITULAR', documento.destinatarioNombre, 4.5, 16.6, 76.6, 11.2, 11, 6);
  campoTarjeta(pdf, 'CARGO', documento.cargo, 4.5, 30.6, 37, 10.3, 7.5, 5);
  campoTarjeta(pdf, 'ÁREA', documento.area, 45.5, 30.6, 35.6, 10.3, 7.5, 5);
  pdf.setDrawColor(LINE);
  pdf.line(4.5, 43.5, CARD_WIDTH - 4.5, 43.5);
  campoTarjeta(pdf, 'CÓDIGO DE EQUIPO', documento.destinatarioCodigo, 4.5, 46.3, 40, 3.6, 6.5, 5.75);
  font(pdf, 4.7, 'normal', MUTED);
  pdf.text('VIGENTE HASTA', CARD_WIDTH - 4.5, 46.3, { align: 'right' });
  font(pdf, 6.1, 'bold');
  pdf.text(documento.vigenteHasta ? fechaDocumentoTramite(documento.vigenteHasta) : 'Sin fecha establecida', CARD_WIDTH - 4.5, 49.5, { align: 'right' });

  pdf.addPage([CARD_WIDTH, CARD_HEIGHT], 'landscape');
  dibujarBase();
  font(pdf, 7.4, 'bold');
  const cardTitle = ajustarCampoTarjeta(pdf, documento.titulo, 59, 6.4, 7.4, 6);
  pdf.setFontSize(cardTitle.size);
  cardTitle.lines.forEach((line, i) => pdf.text(line, 4.5, 6.5 + i * cardTitle.lineHeight));
  font(pdf, 4.5, 'normal', MUTED);
  pdf.text('02 / REVERSO', CARD_WIDTH - 4.5, 7.5, { align: 'right' });
  pdf.addImage(qr, 'PNG', 3.4, 12.5, 24, 24);
  campoTarjeta(pdf, 'REFERENCIA DEL DOCUMENTO', documento.folio, 30, 14.2, 51, 6.4, 6.5, 5.5);
  campoTarjeta(pdf, 'EMITIDO POR', documento.emitidoPorNombre, 30, 24.4, 51, 8.9, 6.5, 4.75);
  font(pdf, 5, 'normal', MUTED);
  pdf.text(`Emisión: ${fechaDocumentoTramite(documento.emitidoAt)}`, 4.5, 38.4);
  font(pdf, 5.1, 'bold');
  pdf.text(`Verifícala en ${SITIO_VERIFICACION}`, 4.5, 41.1);
  font(pdf, 4.8, 'normal', MUTED);
  const note = ajustarCampoTarjeta(pdf, documento.contenido, 76.6, 9.5, 5, 4.75);
  pdf.setFontSize(note.size);
  note.lines.forEach((line, i) => pdf.text(line, 4.5, 44 + i * note.lineHeight));
  return pdf;
}

function crearDocumentoA4(documento: DocumentoTramite, logos: Logos): jsPDF {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const left = 22;
  const width = 166;
  const bottom = 264;
  let y = 53;
  let page = 0;
  const header = () => {
    page += 1;
    pdf.setFillColor(PAPER);
    pdf.rect(0, 0, 210, 297, 'F');
    pdf.setDrawColor(INK);
    pdf.setLineWidth(0.7);
    pdf.line(left, 15, 188, 15);
    if (logos.oscuro) pdf.addImage(logos.oscuro, 'PNG', left, 21, 9.5 * WORDMARK.proporcion, 9.5);
    else { font(pdf, 13, 'bold'); pdf.text('moon Studios', left, 27.5); }
    font(pdf, 6.5, 'normal', MUTED);
    pdf.setCharSpace(1.05);
    pdf.text('PERSONAS Y EQUIPO', left, 36);
    pdf.setCharSpace(0);
    font(pdf, 6.3, 'normal', MUTED);
    pdf.text('DOCUMENTO INTERNO', 188, 26.5, { align: 'right' });
    font(pdf, 6.8, 'bold');
    lines(pdf, documento.folio, 69).forEach((line, i) => pdf.text(line, 188, 31.5 + i * 3, { align: 'right' }));
    if (page > 1) {
      font(pdf, 7.5, 'normal', MUTED);
      pdf.text('CONTINUACIÓN DEL DOCUMENTO', left, 47);
      y = 56;
    }
  };
  const siguiente = () => {
    pdf.addPage();
    header();
  };
  const espacio = (height: number) => {
    if (y + height > bottom) siguiente();
  };
  const escribir = (value: string, size = 10.5, lineHeight = 5.8, weight: 'normal' | 'bold' = 'normal', color = INK) => {
    font(pdf, size, weight, color);
    const wrapped = lines(pdf, value, width);
    for (const line of wrapped) {
      espacio(lineHeight);
      // A page header changes the current font, so restore it for every body line.
      font(pdf, size, weight, color);
      pdf.text(line, left, y);
      y += lineHeight;
    }
  };
  const etiqueta = (value: string) => {
    espacio(17);
    font(pdf, 7, 'normal', MUTED);
    pdf.setCharSpace(0.85);
    pdf.text(value, left, y);
    pdf.setCharSpace(0);
    y += 6;
  };
  const campo = (label: string, value: string, size = 10.5) => {
    if (!value) return;
    etiqueta(label);
    escribir(value, size, size > 12 ? 7.5 : 5.8);
    y += 5;
  };
  const fila = (fields: [string, string][]) => {
    const columns = fields.filter(([, value]) => value);
    if (!columns.length) return;
    const columnWidth = (width - 10 * (columns.length - 1)) / columns.length;
    font(pdf, 10.5);
    const wrapped = columns.map(([, value]) => lines(pdf, value, columnWidth));
    const height = 6 + Math.max(...wrapped.map(value => value.length)) * 5.8 + 5;
    espacio(height);
    columns.forEach(([label], index) => {
      const x = left + index * (columnWidth + 10);
      font(pdf, 7, 'normal', MUTED);
      pdf.setCharSpace(0.6);
      pdf.text(label, x, y);
      font(pdf, 10.5);
      wrapped[index].forEach((line, n) => pdf.text(line, x, y + 6 + n * 5.8));
    });
    y += height;
  };
  header();
  font(pdf, 8, 'normal', MUTED);
  pdf.setCharSpace(1.25);
  pdf.text(documento.plantilla === 'constancia' ? 'CONSTANCIA' : 'RESPUESTA A TU SOLICITUD', left, y);
  pdf.setCharSpace(0);
  y += 12;
  escribir(documento.titulo, 25, 10, 'bold');
  y += 7;
  espacio(12);
  pdf.setDrawColor(LINE);
  pdf.setLineWidth(0.3);
  pdf.line(left, y, 188, y);
  y += 11;
  campo('EMITIDO PARA', documento.destinatarioNombre, 15);
  fila([['CÓDIGO DE EQUIPO', documento.destinatarioCodigo], ['VIGENTE HASTA', documento.vigenteHasta ? fechaDocumentoTramite(documento.vigenteHasta) : '']]);
  fila([['CARGO', documento.cargo], ['ÁREA', documento.area]]);
  y += 3;
  const paragraphs = texto(documento.contenido).split('\n');
  let lastParagraph = -1;
  paragraphs.forEach((value, index) => { if (value.trim()) lastParagraph = index; });
  for (const [index, paragraph] of paragraphs.entries()) {
    if (!paragraph.trim()) {
      y += 4;
      continue;
    }
    font(pdf, 10.7);
    const count = lines(pdf, paragraph, width).length;
    // Keep a short final paragraph with its issuer, and avoid a single orphan body line.
    if (index === lastParagraph && count * 5.6 + 52 < bottom - 56) espacio(count * 5.6 + 52);
    else if (count > 1) espacio(11.2);
    escribir(paragraph, 10.7, 5.6);
    y += 3;
  }
  y += 5;
  espacio(44);
  pdf.setDrawColor(LINE);
  pdf.line(left, y, 188, y);
  y += 10;
  campo('EMITIDO POR', documento.emitidoPorNombre);
  escribir(`Fecha de emisión: ${fechaDocumentoTramite(documento.emitidoAt)}`, 9, 5.2, 'normal', MUTED);
  y += 5;
  escribir(documento.plantilla === 'constancia'
    ? `Verifica este documento en ${SITIO_VERIFICACION} con el ID ${documento.destinatarioCodigo} (Constancia laboral).`
    : 'Disponible en el panel privado de Moon Studios. Consulta la solicitud original para revisar su estado e historial.', 8, 4.5, 'normal', MUTED);
  const total = pdf.getNumberOfPages();
  for (let n = 1; n <= total; n++) {
    pdf.setPage(n);
    pdf.setDrawColor(LINE);
    pdf.setLineWidth(0.2);
    pdf.line(left, 278, 188, 278);
    font(pdf, 7, 'normal', MUTED);
    pdf.text('MOON STUDIOS / TRÁMITES', left, 284);
    pdf.text(`${n} / ${total}`, 188, 284, { align: 'right' });
  }
  return pdf;
}

/** Builds the actual deliverable. No storage, email, account or request is mutated. */
export async function crearPdfTramite(documento: DocumentoTramite): Promise<jsPDF> {
  if (!documento.destinatarioNombre.trim() || !documento.folio.trim() || !documento.solicitudId.trim()
    || !(documento.emitidoAt instanceof Date) || !Number.isFinite(documento.emitidoAt.getTime())) {
    throw new Error('El documento no tiene los datos de emisión necesarios. Vuelve a abrir el trámite.');
  }
  const logos = await cargarLogos();
  const pdf = documento.plantilla === 'credencial'
    ? await crearCredencial(documento, logos)
    : crearDocumentoA4(documento, logos);
  pdf.setProperties({
    title: texto(documento.titulo), author: 'Moon Studios',
    subject: `${documento.folio} / Documento de trámite`, creator: 'Moon Studios - Panel de Trámites',
    keywords: 'Moon Studios, trámites, documento interno',
  });
  pdf.setCreationDate(documento.emitidoAt);
  return pdf;
}

export async function descargarDocumentoTramite(documento: DocumentoTramite): Promise<void> {
  const pdf = await crearPdfTramite(documento);
  const folio = documento.folio.replace(/[^a-z0-9_-]/gi, '_');
  const tipo = documento.plantilla === 'credencial' ? 'Credencial' : 'Documento';
  pdf.save(`Moon-Studios_${tipo}_${folio}.pdf`);
}
