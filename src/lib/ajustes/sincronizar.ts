import { limpiarCambios, normalizarAjustes, type CacheAjustes, type Settings } from './modelo';

export type EstadoGuardado = 'guardado' | 'guardando' | 'error';
export interface VistaAjustes { settings: Settings; estado: EstadoGuardado; sincronizado: boolean }
interface OpcionesSincronizacion {
  uid: string;
  cache: CacheAjustes;
  write: (uid: string, cambios: Partial<Settings>) => Promise<void>;
  persist: (uid: string, cache: CacheAjustes) => void;
  changed: (vista: VistaAjustes) => void;
  failed?: (error: unknown) => void;
  online?: () => boolean;
  debounceMs?: number;
  retryMs?: number;
}

/** Una cola pertenece a UNA cuenta durante toda su vida, incluso en peticiones en vuelo. */
export class SincronizadorAjustes {
  private settings: Settings;
  private pending: Partial<Settings>;
  private inFlight: Partial<Settings> = {};
  private task: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  private ready = false;
  private confirmed = false;
  private readFailed = false;
  private retries = 0;
  private estado: EstadoGuardado = 'guardado';
  private opciones: OpcionesSincronizacion;

  constructor(opciones: OpcionesSincronizacion) {
    this.opciones = opciones;
    this.pending = limpiarCambios(opciones.cache.pending);
    this.settings = normalizarAjustes({ ...opciones.cache.settings, ...this.pending });
    if (Object.keys(this.pending).length) this.estado = 'guardando';
  }

  private emit() {
    if (this.disposed) return;
    this.opciones.persist(this.opciones.uid, { settings: this.settings, pending: { ...this.inFlight, ...this.pending } });
    this.opciones.changed({ settings: this.settings, estado: this.estado, sincronizado: this.confirmed });
  }

  private schedule(delay = this.opciones.debounceMs ?? 400) {
    if (this.disposed) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = null; void this.flush(); }, delay);
  }

  /** El remoto puede llegar antes de la confirmación; los cambios locales prevalecen. */
  receive(crudo: unknown, desdeCache = false) {
    if (this.disposed) return;
    this.ready = true;
    this.confirmed = !desdeCache;
    this.readFailed = false;
    this.settings = normalizarAjustes({ ...normalizarAjustes(crudo), ...this.inFlight, ...this.pending });
    if (!this.task && !Object.keys(this.pending).length) this.estado = 'guardado';
    this.emit();
    if (Object.keys(this.pending).length && !this.task) this.schedule();
  }

  receiveError(error: unknown) {
    if (this.disposed) return;
    this.ready = false;
    this.confirmed = false;
    this.readFailed = true;
    this.estado = 'error';
    this.emit();
    this.opciones.failed?.(error);
  }

  update(crudo: unknown) {
    if (this.disposed) return;
    const cambios = limpiarCambios(crudo);
    if (!Object.keys(cambios).length) return;
    this.pending = { ...this.pending, ...cambios };
    this.settings = normalizarAjustes({ ...this.settings, ...cambios });
    this.estado = this.readFailed ? 'error' : 'guardando';
    this.emit();
    this.schedule();
  }

  /** Serializa escrituras: una respuesta lenta jamás repone un valor más viejo. */
  async flush(): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.disposed) return;
    if (this.task) {
      await this.task;
      if (!this.disposed && this.estado !== 'error' && Object.keys(this.pending).length) await this.flush();
      return;
    }
    if (!this.ready || !Object.keys(this.pending).length) return;
    if (this.opciones.online?.() === false) {
      this.estado = 'error'; this.emit(); return;
    }
    this.inFlight = this.pending;
    this.pending = {};
    this.estado = 'guardando';
    this.emit();
    let failed = false;
    let retryable = true;
    this.task = (async () => {
      try {
        await this.opciones.write(this.opciones.uid, this.inFlight);
        if (this.disposed) return;
        this.inFlight = {};
        this.retries = 0;
        this.estado = Object.keys(this.pending).length ? 'guardando' : 'guardado';
      } catch (error) {
        if (this.disposed) return;
        failed = true;
        const codigo = typeof error === 'object' && error !== null && 'code' in error ? String(error.code).split('/').pop() : '';
        retryable = !['permission-denied', 'unauthenticated', 'not-found', 'invalid-argument'].includes(codigo ?? '');
        this.pending = { ...this.inFlight, ...this.pending };
        this.inFlight = {};
        this.estado = 'error';
        this.retries++;
        if (this.retries === 1) this.opciones.failed?.(error);
      } finally {
        if (!this.disposed) this.emit();
      }
    })();
    await this.task;
    this.task = null;
    if (!this.disposed && Object.keys(this.pending).length) {
      if (failed) {
        if (retryable) this.schedule(Math.min(30_000, (this.opciones.retryMs ?? 1500) * 2 ** Math.min(this.retries - 1, 5)));
      } else await this.flush();
    }
  }

  dispose() {
    // Cache already contains in-flight + pending, captured with its original UID.
    this.disposed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
