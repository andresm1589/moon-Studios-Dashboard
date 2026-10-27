/** Exports only the rows already visible to the current user. Formula-like
 * values are escaped so spreadsheet apps treat company content as text. */
export function createWorkspaceCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const cell = (value: string | number | null | undefined) => {
    let text = String(value ?? '');
    if (typeof value === 'string' && /^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  return '\uFEFF' + [headers, ...rows].map(row => row.map(cell).join(';')).join('\r\n');
}

export function exportWorkspaceCsv(name: string, headers: string[], rows: (string | number | null | undefined)[][]): void {
  if (!rows.length) return;
  const url = URL.createObjectURL(new Blob([createWorkspaceCsv(headers, rows)], { type: 'text/csv;charset=utf-8;' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${name}-${new Date().toLocaleDateString('sv-SE')}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
