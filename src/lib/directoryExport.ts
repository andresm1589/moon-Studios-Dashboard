/** CSV compatible con Excel; los valores de usuarios se mantienen como texto. */
export function directoryCsv(rows: readonly { displayName?: string; email?: string; role?: string }[]): string {
  const cell = (value: string | undefined) => {
    const text = String(value ?? '');
    const safe = /^[\s]*[=+@-]/.test(text) ? `'${text}` : text;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  return '\uFEFF' + [['Nombre', 'Correo', 'Rol'], ...rows.map(u => [u.displayName, u.email, u.role])]
    .map(row => row.map(cell).join(',')).join('\r\n');
}

export function downloadDirectory(rows: readonly { displayName?: string; email?: string; role?: string }[]) {
  const url = URL.createObjectURL(new Blob([directoryCsv(rows)], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `moon-directorio-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
