/** CSV oddělený středníkem, UTF-8 s BOM (Excel na Windows). */
export function downloadCsv(filename: string, headers: string[], rows: string[][]): void {
  const esc = (cell: string) => `"${String(cell).replace(/"/g, '""')}"`;
  const lines = [headers.map(esc).join(';'), ...rows.map((r) => r.map((c) => esc(String(c))).join(';'))];
  const bom = '\uFEFF';
  const blob = new Blob([bom + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
