import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { Download, History, LoaderCircle, Search } from 'lucide-react';
import { db } from '@/lib/firebase';
import { getFestError } from '@/lib/fest/client';
import { csvCell, downloadCsv, festDate } from './managementUtils';

interface LegacyAttendee { id: string; code: string; firstName: string; lastName: string; email: string; phone: string; registeredAt: Date | null }
const text = (value: unknown) => typeof value === 'string' ? value : '';

export function FestLegacyHistory({ operatorUid }: { operatorUid: string }) {
  const [state, setState] = useState<{ uid: string; rows: LegacyAttendee[] | null; error: string } | null>(null);
  const [search, setSearch] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    void getDocs(collection(db, 'moon_studios_fest_2026')).then(snapshot => {
      const rows = snapshot.docs.map(item => {
        const data = item.data();
        let registeredAt: Date | null = null;
        try { if (typeof data.registeredAt?.toDate === 'function') registeredAt = data.registeredAt.toDate(); else if (typeof data.registeredAt === 'string') registeredAt = new Date(data.registeredAt); } catch { /* Legacy metadata may be absent. */ }
        if (registeredAt && !Number.isFinite(registeredAt.getTime())) registeredAt = null;
        return { id: item.id, code: text(data.code), firstName: text(data.firstName), lastName: text(data.lastName), email: text(data.email), phone: text(data.phone), registeredAt };
      });
      if (active) setState({ uid: operatorUid, rows, error: '' });
    }).catch(cause => { if (active) setState({ uid: operatorUid, rows: null, error: getFestError(cause) }); });
    return () => { active = false; };
  }, [operatorUid, retry]);
  const current = state?.uid === operatorUid ? state : null;
  const rows = useMemo(() => (current?.rows ?? []).filter(row => `${row.firstName} ${row.lastName} ${row.email} ${row.code}`.toLocaleLowerCase('es').includes(search.trim().toLocaleLowerCase('es'))), [current?.rows, search]);
  const exportRows = () => {
    const csv = [['Código original', 'Nombre', 'Apellidos', 'Correo', 'Teléfono', 'Inscripción (Lima)'], ...rows.map(row => [row.code, row.firstName, row.lastName, row.email, row.phone, row.registeredAt ? festDate(row.registeredAt) : ''])].map(row => row.map(csvCell).join(',')).join('\r\n');
    downloadCsv(`\uFEFF${csv}`, 'Moon-Fest_historial-2026.csv');
  };
  return <section><div className="fm-section-heading"><div><span className="fm-eyebrow">ARCHIVO / INSCRIPCIONES ANTERIORES</span><h2>Historial 2026.</h2><p>Los registros originales permanecen disponibles para consulta.</p></div><button type="button" className="fm-button" disabled={!rows.length} onClick={exportRows}><Download size={16} />Exportar resultados</button></div><div className="fm-tip"><History size={20} /><p>Este archivo conserva el sistema anterior. Las nuevas ediciones tienen sus propias inscripciones y entradas en <strong>Inscritos y acceso</strong>.</p></div><label className="fm-search fm-search--full"><Search size={18} /><span className="sr-only">Buscar registros anteriores</span><input value={search} onChange={change => setSearch(change.target.value)} placeholder="Buscar en el historial por nombre, correo o código…" /></label>
    {current?.error ? <div className="fm-empty"><h3>No pudimos cargar el historial.</h3><p>{current.error}</p><button type="button" className="fm-button" onClick={() => setRetry(value => value + 1)}>Reintentar</button></div> : !current?.rows ? <div className="fm-empty" role="status"><LoaderCircle className="fm-spin" /><p>Abriendo el archivo anterior…</p></div> : !rows.length ? <div className="fm-empty"><History /><h3>{current.rows.length ? 'Sin coincidencias.' : 'Todavía no hay registros anteriores.'}</h3><p>{current.rows.length ? 'Prueba otra búsqueda.' : 'Aquí aparecerán los registros del sistema Moon Fest 2026.'}</p></div> : <><p className="fm-inline-note">{rows.length} registros · Archivo de consulta</p><div className="fm-table-wrap"><table className="fm-table"><thead><tr><th>Asistente</th><th>Código original</th><th>Teléfono</th><th>Registrado</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td><strong>{row.firstName} {row.lastName}</strong><span>{row.email || 'Sin correo registrado'}</span></td><td><code>{row.code || 'Sin código'}</code></td><td>{row.phone || '—'}</td><td>{row.registeredAt ? festDate(row.registeredAt) : 'Sin fecha'}</td></tr>)}</tbody></table></div></>}
  </section>;
}
