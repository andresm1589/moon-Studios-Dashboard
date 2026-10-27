// App de Windows: la ventana se achica a una ventanita siempre encima de las
// demás apps para seguir la conferencia mientras se trabaja en otra cosa.
// Al salir del modo flotante vuelve al tamaño y lugar de antes.
import { currentMonitor, getCurrentWindow, LogicalSize, PhysicalPosition, type PhysicalSize } from '@tauri-apps/api/window';

const ANCHO = 380, ALTO = 270;
let previa: { tamano: PhysicalSize; lugar: PhysicalPosition; maximizada: boolean } | null = null;

export async function activarFlotante(): Promise<void> {
  const w = getCurrentWindow();
  previa = { tamano: await w.outerSize(), lugar: await w.outerPosition(), maximizada: await w.isMaximized() };
  if (previa.maximizada) await w.unmaximize();
  await w.setMinSize(new LogicalSize(300, 200));
  await w.setSize(new LogicalSize(ANCHO, ALTO));
  const monitor = await currentMonitor();
  if (monitor) {
    // Esquina inferior derecha, sobre la barra de tareas.
    const e = monitor.scaleFactor;
    await w.setPosition(new PhysicalPosition(
      monitor.position.x + monitor.size.width - Math.round((ANCHO + 24) * e),
      monitor.position.y + monitor.size.height - Math.round((ALTO + 72) * e),
    ));
  }
  await w.setAlwaysOnTop(true);
}

export async function desactivarFlotante(): Promise<void> {
  const w = getCurrentWindow();
  await w.setAlwaysOnTop(false);
  await w.setMinSize(new LogicalSize(1280, 800));
  if (previa) {
    await w.setSize(previa.tamano);
    await w.setPosition(previa.lugar);
    if (previa.maximizada) await w.maximize();
  } else await w.setSize(new LogicalSize(1440, 900));
  previa = null;
}
