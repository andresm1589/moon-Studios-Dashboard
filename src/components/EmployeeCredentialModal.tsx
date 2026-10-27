/**
 * EmployeeCredentialModal.tsx
 * Credencial A4 landscape — diseño minimalista (negro, blanco, gris)
 * Incluye foto real del empleado, QR, código de barras, fecha/hora de generación
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Download, QrCode, Loader2 } from 'lucide-react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { UserProfile, UserRole } from '@/types';
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';

const ROLE_LABELS: Record<string, string> = {
  CEO:            'CEO',
  Administración: 'Administración',
  Empleado:       'Empleado',
};

interface Props {
  open: boolean;
  onClose: () => void;
  user: UserProfile | null;
  companyLogoUrl?: string;
}

const EmployeeCredentialModal: React.FC<Props> = ({ open, onClose, user, companyLogoUrl = '/brand/moon-credential.png' }) => {
  const qrCanvasRef  = useRef<HTMLCanvasElement>(null);
  const barCanvasRef = useRef<HTMLCanvasElement>(null);
  const [generating, setGenerating] = useState(false);
  const [qrReady,    setQrReady]    = useState(false);
  const [barReady,   setBarReady]   = useState(false);
  const [savedCode,  setSavedCode]  = useState<string | null>(null);

  const getPayload = useCallback((u: UserProfile) =>
    JSON.stringify({ uid: u.uid, name: u.displayName, role: u.role }), []);

  const loadOrCreateCode = useCallback(async (u: UserProfile): Promise<string> => {
    const userRef  = doc(db, 'users', u.uid);
    const snapshot = await getDoc(userRef);
    const data     = snapshot.data();
    if (data?.credentialPayload) return data.credentialPayload as string;
    const payload = getPayload(u);
    await updateDoc(userRef, { credentialPayload: payload });
    return payload;
  }, [getPayload]);

  const drawQR = useCallback((payload: string) => {
    if (!qrCanvasRef.current) return;
    QRCode.toCanvas(qrCanvasRef.current, payload, {
      width: 140, margin: 1,
      color: { dark: '#000000', light: '#ffffff' },
    }, (err) => { if (!err) setQrReady(true); });
  }, []);

  const drawBarcode = useCallback((uid: string) => {
    if (!barCanvasRef.current) return;
    try {
      JsBarcode(barCanvasRef.current, uid, {
        format: 'CODE128', width: 2, height: 50,
        displayValue: true, fontSize: 9,
        background: '#ffffff', lineColor: '#000000',
      });
      setBarReady(true);
    } catch { /* uid corto en dev */ }
  }, []);

  useEffect(() => {
    if (!open || !user) return;
    setQrReady(false); setBarReady(false); setSavedCode(null);
    const timer = setTimeout(async () => {
      try {
        const payload = await loadOrCreateCode(user);
        setSavedCode(payload);
        drawQR(payload);
        drawBarcode(user.uid);
      } catch {
        const payload = getPayload(user);
        setSavedCode(payload);
        drawQR(payload);
        drawBarcode(user.uid);
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [open, user, loadOrCreateCode, drawQR, drawBarcode, getPayload]);

  const downloadQR = () => {
    const canvas = qrCanvasRef.current;
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `QR_${user?.displayName?.replace(/\s+/g, '_') ?? 'empleado'}.png`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const downloadBarcode = () => {
    const canvas = barCanvasRef.current;
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `Barcode_${user?.displayName?.replace(/\s+/g, '_') ?? 'empleado'}.png`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  /* ─────────────────────────────────────────────────────────────────
     PDF A4 LANDSCAPE — columna izq con foto real, columna der con QR
  ───────────────────────────────────────────────────────────────── */
  const downloadCredentialPDF = async () => {
    if (!user) return;
    setGenerating(true);
    
    try {
      const W = 297, H = 210; // A4 landscape
      const docPDF = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

      const now       = new Date();
      const dateStr   = now.toLocaleDateString('es-PE', { day: '2-digit', month: 'long', year: 'numeric' });
      const timeStr   = now.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
      const roleLabel = ROLE_LABELS[user.role as UserRole] ?? user.role;

      /* ── Fondo total negro ── */
      docPDF.setFillColor(8, 8, 10);
      docPDF.rect(0, 0, W, H, 'F');

      /* ══ COLUMNA IZQUIERDA (0–120 mm) ══ */
      docPDF.setFillColor(20, 20, 24);
      docPDF.rect(0, 0, 120, 52, 'F');

      /* Logo empresa */
      if (companyLogoUrl) {
        try {
          const imgData = await urlToBase64(companyLogoUrl);
          const ext = companyLogoUrl.toLowerCase().includes('.png') ? 'PNG' : 'JPEG';
          docPDF.addImage(imgData, ext, 12, 10, 24, 24);
        } catch { /* sin logo */ }
      }

      /* Nombre empresa */
      docPDF.setTextColor(255, 255, 255);
      docPDF.setFontSize(15);
      docPDF.setFont('helvetica', 'bold');
      docPDF.text('MOON STUDIOS', companyLogoUrl ? 42 : 12, 22);
      docPDF.setFontSize(6.5);
      docPDF.setFont('helvetica', 'normal');
      docPDF.setTextColor(120, 120, 130);
      docPDF.text('CREDENCIAL OFICIAL DE EMPLEADO', companyLogoUrl ? 42 : 12, 29);

      docPDF.setDrawColor(40, 40, 50);
      docPDF.setLineWidth(0.3);
      docPDF.line(0, 52, 120, 52);

      /* ── FOTO DE PERFIL (ARREGLADO PROFESIONAL) ── */
const cx = 60;
const cy = 100;
const r  = 32;

if (user.avatar) {
  try {
    const circularAvatar = await getCircularCroppedImage(user.avatar);

    // Sombra suave
    docPDF.setFillColor(0, 0, 0);
    docPDF.circle(cx + 2, cy + 2, r + 3, 'F');

    // Anillo gris exterior
    docPDF.setFillColor(35, 35, 40);
    docPDF.circle(cx, cy, r + 4, 'F');

    // Imagen ya recortada
    docPDF.addImage(
      circularAvatar,
      'PNG',
      cx - r,
      cy - r,
      r * 2,
      r * 2
    );

    // Borde blanco limpio
    docPDF.setDrawColor(255, 255, 255);
    docPDF.setLineWidth(1.2);
    docPDF.circle(cx, cy, r, 'S');

  } catch (err) {
    console.warn('Error cargando avatar:', err);
    drawAvatarPlaceholder(docPDF, cx, cy, r, user.displayName);
  }
} else {
  drawAvatarPlaceholder(docPDF, cx, cy, r, user.displayName);
}

      /* Nombre */
      docPDF.setTextColor(240, 240, 245);
      docPDF.setFontSize(15);
      docPDF.setFont('helvetica', 'bold');
      docPDF.text(user.displayName ?? '—', cx, 156, { align: 'center', maxWidth: 108 });

      /* Email */
      docPDF.setFontSize(8);
      docPDF.setFont('helvetica', 'normal');
      docPDF.setTextColor(110, 110, 120);
      docPDF.text(user.email ?? '—', cx, 164, { align: 'center', maxWidth: 108 });

      /* Badge rol */
      const bW = 50, bH = 9;
      docPDF.setFillColor(30, 30, 36);
      docPDF.setDrawColor(60, 60, 70);
      docPDF.setLineWidth(0.3);
      docPDF.roundedRect(cx - bW / 2, 170, bW, bH, 2, 2, 'FD');
      docPDF.setTextColor(180, 180, 200);
      docPDF.setFontSize(7.5);
      docPDF.setFont('helvetica', 'bold');
      docPDF.text(roleLabel.toUpperCase(), cx, 170 + 6.3, { align: 'center' });

      /* Fecha abajo */
      docPDF.setFontSize(6);
      docPDF.setFont('helvetica', 'normal');
      docPDF.setTextColor(60, 60, 70);
      docPDF.text(`Emitido: ${dateStr} · ${timeStr}`, cx, 196, { align: 'center' });

      /* Línea divisora vertical */
      docPDF.setDrawColor(30, 30, 38);
      docPDF.setLineWidth(0.4);
      docPDF.line(120, 0, 120, H);

      /* ══ COLUMNA DERECHA (120–297 mm) ══ */
      docPDF.setFillColor(12, 12, 16);
      docPDF.rect(120, 0, 177, H, 'F');
      docPDF.setFillColor(18, 18, 22);
      docPDF.rect(120, 0, 177, 52, 'F');
      docPDF.setDrawColor(40, 40, 50);
      docPDF.setLineWidth(0.3);
      docPDF.line(120, 52, W, 52);

      docPDF.setFontSize(7);
      docPDF.setFont('helvetica', 'normal');
      docPDF.setTextColor(80, 80, 90);
      docPDF.text(`REF: MS-${user.uid.slice(0, 8).toUpperCase()}`, W - 14, 18, { align: 'right' });
      docPDF.text(dateStr, W - 14, 26, { align: 'right' });
      docPDF.text(timeStr, W - 14, 33, { align: 'right' });

      docPDF.setFontSize(7.5);
      docPDF.setFont('helvetica', 'bold');
      docPDF.setTextColor(80, 80, 95);
      docPDF.text('CÓDIGOS DE VERIFICACIÓN', 140, 22);

      /* QR */
      if (qrCanvasRef.current) {
        try {
          const qrData = qrCanvasRef.current.toDataURL('image/png');
          docPDF.setFillColor(255, 255, 255);
          docPDF.setDrawColor(35, 35, 42);
          docPDF.setLineWidth(0.3);
          docPDF.roundedRect(130, 60, 74, 74, 3, 3, 'FD');
          docPDF.addImage(qrData, 'PNG', 133, 63, 68, 68);
        } catch { /* canvas no listo */ }
      }
      docPDF.setFontSize(6.5);
      docPDF.setFont('helvetica', 'normal');
      docPDF.setTextColor(80, 80, 95);
      docPDF.text('CÓDIGO QR', 167, 140, { align: 'center' });

      /* Barcode */
      if (barCanvasRef.current) {
        try {
          const barData = barCanvasRef.current.toDataURL('image/png');
          docPDF.setFillColor(255, 255, 255);
          docPDF.setDrawColor(35, 35, 42);
          docPDF.setLineWidth(0.3);
          docPDF.roundedRect(214, 78, 70, 42, 3, 3, 'FD');
          docPDF.addImage(barData, 'PNG', 216, 80, 66, 38);
        } catch { /* canvas no listo */ }
      }
      docPDF.setFontSize(6.5);
      docPDF.text('CÓDIGO DE BARRAS', 249, 126, { align: 'center' });

      /* UID */
      docPDF.setDrawColor(30, 30, 38);
      docPDF.setLineWidth(0.25);
      docPDF.line(130, 148, W - 14, 148);
      docPDF.setFontSize(6.5);
      docPDF.setFont('helvetica', 'bold');
      docPDF.setTextColor(70, 70, 85);
      docPDF.text('ID DE USUARIO', 130, 156);
      docPDF.setFont('courier', 'normal');
      docPDF.setFontSize(7.5);
      docPDF.setTextColor(130, 130, 150);
      const uid = user.uid;
      if (uid.length > 24) {
        docPDF.text(uid.slice(0, 24), 130, 163);
        docPDF.text(uid.slice(24), 130, 169);
      } else {
        docPDF.text(uid, 130, 163);
      }

      /* Footer */
      docPDF.setFillColor(14, 14, 18);
      docPDF.rect(120, H - 20, 177, 20, 'F');
      docPDF.setDrawColor(30, 30, 38);
      docPDF.setLineWidth(0.25);
      docPDF.line(120, H - 20, W, H - 20);
      docPDF.setFontSize(6);
      docPDF.setFont('helvetica', 'normal');
      docPDF.setTextColor(55, 55, 65);
      docPDF.text('Documento oficial Moon Studios · No transferible · Uso exclusivo interno', W - 14, H - 12, { align: 'right' });
      docPDF.setTextColor(70, 70, 80);
      docPDF.text(`Generado: ${dateStr} ${timeStr}`, W - 14, H - 7, { align: 'right' });

      const ds = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
      docPDF.save(`Credencial_${user.displayName?.replace(/\s+/g, '_') ?? 'empleado'}_${ds}.pdf`);

    } catch (e) {
      console.error('Error generando PDF:', e);
      alert('Error al generar el PDF. Por favor intenta de nuevo.');
    } finally {
      setGenerating(false);
    }
  };

  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-extralight text-lg flex items-center gap-2">
            <QrCode className="w-4 h-4 text-zinc-400" /> Credencial de {user.displayName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Vista previa de foto */}
          <div className="flex items-center gap-4 p-3 bg-zinc-900/50 rounded-lg border border-zinc-800">
            <div className="w-12 h-12 rounded-full overflow-hidden bg-zinc-800 border border-zinc-700 flex-shrink-0 flex items-center justify-center">
              {user.avatar ? (
                <img src={user.avatar} alt={user.displayName} className="w-full h-full object-cover" />
              ) : (
                <span className="text-white font-extralight text-lg">{user.displayName?.[0]?.toUpperCase()}</span>
              )}
            </div>
            <div>
              <p className="text-white font-extralight text-sm">{user.displayName}</p>
              <p className="text-zinc-500 text-xs font-extralight">{user.email}</p>
              <p className="text-zinc-600 text-xs font-extralight mt-0.5">
                {user.avatar ? '✓ Foto de perfil disponible' : '⚠ Sin foto — se usará inicial en el PDF'}
              </p>
            </div>
          </div>

          {savedCode && (
            <div className="px-3 py-1.5 bg-zinc-900/60 border border-zinc-800 rounded text-xs text-zinc-500 font-extralight flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
              Código fijo guardado — permanente para este empleado
            </div>
          )}

          {/* QR */}
          <div className="space-y-2">
            <p className="text-zinc-500 text-xs font-extralight uppercase tracking-wider">Código QR</p>
            <div className="flex items-center gap-4">
              <div className="bg-white p-2 rounded-lg flex-shrink-0">
                <canvas ref={qrCanvasRef} />
              </div>
              <Button variant="outline" size="sm" onClick={downloadQR} disabled={!qrReady}
                className="border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800 font-extralight flex-1">
                <Download className="w-3.5 h-3.5 mr-1.5" /> Descargar QR (PNG)
              </Button>
            </div>
          </div>

          {/* Código de barras */}
          <div className="space-y-2">
            <p className="text-zinc-500 text-xs font-extralight uppercase tracking-wider">Código de Barras</p>
            <div className="bg-white p-3 rounded-lg overflow-hidden">
              <canvas ref={barCanvasRef} className="max-w-full" />
            </div>
            <Button variant="outline" size="sm" onClick={downloadBarcode} disabled={!barReady}
              className="border-zinc-700 text-zinc-400 hover:text-white hover:bg-zinc-800 font-extralight w-full">
              <Download className="w-3.5 h-3.5 mr-1.5" /> Descargar Barras (PNG)
            </Button>
          </div>

          {/* PDF A4 */}
          <div className="pt-2 border-t border-zinc-800">
            <Button onClick={downloadCredentialPDF} disabled={generating}
              className="w-full bg-white text-black hover:bg-zinc-200 font-extralight">
              {generating
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generando PDF...</>
                : <><Download className="w-4 h-4 mr-2" />Descargar Credencial PDF (A4)</>}
            </Button>
            <p className="text-zinc-600 text-xs font-extralight text-center mt-1.5">
              Formato A4 · Foto de perfil · QR · Código de barras · Fecha y hora de emisión
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

/* ── Placeholder de avatar cuando no hay foto ── */
function drawAvatarPlaceholder(doc: any, cx: number, cy: number, r: number, displayName?: string) {
  doc.setFillColor(30, 30, 35);
  doc.circle(cx, cy, r + 3, 'F');
  doc.setFillColor(45, 45, 52);
  doc.circle(cx, cy, r, 'F');

  if (displayName) {
    doc.setTextColor(160, 160, 180);
    doc.setFontSize(26);
    doc.setFont('helvetica', 'bold');
    doc.text(displayName[0].toUpperCase(), cx, cy + 9, { align: 'center' });
  } else {
    doc.setFillColor(80, 80, 90);
    doc.circle(cx, cy - 9, 13, 'F');
    doc.setFillColor(80, 80, 90);
    doc.ellipse(cx, cy + 22, 17, 10, 'F');
  }

  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.6);
  doc.circle(cx, cy, r, 'S');
}

/* ── Carga de imagen como base64 ── */
async function urlToBase64(url: string): Promise<string> {
  const res  = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function getCircularCroppedImage(url: string, size: number = 800): Promise<string> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;

  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = reject;
  });

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No canvas context');

  // Recorte circular real
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  // Dibujar imagen centrada y cubierta
  const minSide = Math.min(img.width, img.height);
  const sx = (img.width - minSide) / 2;
  const sy = (img.height - minSide) / 2;

  ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);

  return canvas.toDataURL('image/png');
}



export default EmployeeCredentialModal;
