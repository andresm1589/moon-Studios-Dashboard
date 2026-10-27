import { useIsTauri } from '../hooks/useIsTauri';
import { getCurrentWindow } from "@tauri-apps/api/window";
import { BrandLogo } from './BrandLogo';

const getWindow = () => {
  try {
    return getCurrentWindow();
  } catch {
    return null;
  }
};

export const TITLEBAR_HEIGHT = 42;

export default function TitleBar() {
  const isTauri = useIsTauri();

  if (!isTauri) return null;

  const handleMinimize = async () => {
    const win = getWindow();
    if (win) await win.minimize();
  };

  const handleMaximize = async () => {
    const win = getWindow();
    if (win) await win.toggleMaximize();
  };

  const handleClose = async () => {
    const win = getWindow();
    if (win) await win.close();
  };

  return (
    <div
      data-tauri-drag-region
      style={{
        height: `${TITLEBAR_HEIGHT}px`,
        background: "var(--moon-surface)",
        borderBottom: "1px solid var(--moon-line)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 16px",
        userSelect: "none",
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
      }}
    >
      {/* Logo + Nombre */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <BrandLogo compact style={{ width: '22px', height: '22px', pointerEvents: 'none' }} />
        <span
          style={{
            fontSize: "12px",
            fontWeight: 500,
            letterSpacing: "-0.01em",
            color: "var(--moon-ink)",
            fontFamily: "inherit",
          }}
        >
          moon{" "}
          <span style={{ color: "var(--moon-muted)", fontWeight: 400 }}>Studios</span>
        </span>
      </div>

      {/* Centro: título */}
      <span
        data-tauri-drag-region
        style={{
          fontSize: "11px",
          fontWeight: 400,
          color: "var(--moon-muted)",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          fontFamily: "Inter, sans-serif",
          position: "absolute",
          left: "50%",
          transform: "translateX(-50%)",
          pointerEvents: "none",
        }}
      >
        Portal Corporativo
      </span>

      {/* Botones de ventana */}
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <WindowButton onClick={handleMinimize} title="Minimizar">
          <svg width="10" height="1" viewBox="0 0 10 1" fill="none">
            <line x1="0" y1="0.5" x2="10" y2="0.5" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </WindowButton>

        <WindowButton onClick={handleMaximize} title="Maximizar">
          <svg width="9" height="9" viewBox="0 0 9 9" fill="none">
            <rect x="0.75" y="0.75" width="7.5" height="7.5" rx="1" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </WindowButton>

        <WindowButton onClick={handleClose} title="Cerrar" isClose>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </WindowButton>
      </div>
    </div>
  );
}

function WindowButton({
  onClick,
  title,
  children,
  isClose = false,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  isClose?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      style={{
        width: "28px",
        height: "28px",
        borderRadius: "6px",
        border: "none",
        background: "transparent",
        color: "var(--moon-muted)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        transition: "background 0.15s ease",
        outline: "none",
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = isClose
          ? "rgba(80, 80, 80, 0.6)"
          : "#1c1c1c";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "transparent";
      }}
      onMouseDown={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = isClose
          ? "rgba(50, 50, 50, 0.8)"
          : "#2a2a2a";
      }}
      onMouseUp={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = isClose
          ? "rgba(80, 80, 80, 0.6)"
          : "#1c1c1c";
      }}
    >
      {children}
    </button>
  );
}
