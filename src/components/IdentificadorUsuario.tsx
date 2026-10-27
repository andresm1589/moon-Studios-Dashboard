import { useState } from 'react';
import { Check, Copy, Fingerprint } from 'lucide-react';
import { codigoEmpleado } from '@/lib/tramites';
import '@/styles/tramites.css';

/** ID visible de una persona: el código de la credencial y el UID completo, ambos copiables. */
export function IdentificadorUsuario({ uid, compacto = false }: { uid: string; compacto?: boolean }) {
  const [copiado, setCopiado] = useState<'codigo' | 'uid' | null>(null);
  const copiar = async (valor: string, cual: 'codigo' | 'uid') => {
    try { await navigator.clipboard.writeText(valor); setCopiado(cual); window.setTimeout(() => setCopiado(actual => actual === cual ? null : actual), 1600); }
    catch { setCopiado(null); }
  };
  const codigo = codigoEmpleado(uid);
  const boton = (valor: string, cual: 'codigo' | 'uid', etiqueta: string) => (
    <button type="button" className="moon-id__copy" onClick={() => void copiar(valor, cual)} aria-label={`Copiar ${etiqueta}`} title={`Copiar ${etiqueta}`}>
      {copiado === cual ? <Check size={13} strokeWidth={1.75} /> : <Copy size={13} strokeWidth={1.5} />}
    </button>
  );
  return (
    <div className={`moon-id${compacto ? ' moon-id--compacto' : ''}`} aria-label="Identificador de usuario">
      <div className="moon-id__fila">
        <Fingerprint size={14} strokeWidth={1.5} aria-hidden="true" />
        <span className="moon-id__etiqueta">ID</span>
        <strong className="moon-id__codigo">{codigo}</strong>
        {boton(codigo, 'codigo', 'el ID')}
      </div>
      {!compacto && (
        <div className="moon-id__fila moon-id__fila--uid">
          <span className="moon-id__etiqueta">UID</span>
          <code title={uid}>{uid}</code>
          {boton(uid, 'uid', 'el UID')}
        </div>
      )}
      <span className="moon-id__aviso" role="status">{copiado ? 'Copiado' : ''}</span>
    </div>
  );
}
