/** Ventana [desde, hasta) en la zona configurada, incluyendo el cruce de medianoche. */
export function estaEnHorasDeSilencio(desde: string | undefined, hasta: string | undefined, ahora: Date, zona: string): boolean {
  const formato = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (!desde || !hasta || !formato.test(desde) || !formato.test(hasta) || !Number.isFinite(ahora.getTime())) return false;
  const minutos = (valor: string) => { const [horas, min] = valor.split(':').map(Number); return horas * 60 + min; };
  try {
    const partes = new Intl.DateTimeFormat('en-US', { timeZone: zona, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(ahora);
    const locales = Object.fromEntries(partes.map(p => [p.type, p.value]));
    const actual = Number(locales.hour) * 60 + Number(locales.minute);
    const inicio = minutos(desde), fin = minutos(hasta);
    return inicio <= fin ? actual >= inicio && actual < fin : actual >= inicio || actual < fin;
  } catch { return false; }
}

/** Comparte únicamente una solicitud en vuelo; después vuelve a consultar al SO. */
export function crearSolicitudPermiso(solicitar: () => boolean | Promise<boolean>): () => Promise<boolean> {
  let pendiente: Promise<boolean> | null = null;
  return () => {
    if (pendiente) return pendiente;
    let solicitud: Promise<boolean>;
    // Ejecutar inmediatamente conserva el gesto del usuario requerido por navegadores.
    try { solicitud = Promise.resolve(solicitar()); }
    catch { solicitud = Promise.resolve(false); }
    const actual = solicitud.catch(() => false).finally(() => { if (pendiente === actual) pendiente = null; });
    pendiente = actual;
    return actual;
  };
}
