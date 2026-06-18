/** Příkazy pro doplnění produktů z ceníků (spouštět v kořeni projektu, s `DATABASE_URL` v `.env`). */

export type CenikImportRow = { command: string; description: string };

export const CENIK_IMPORT_COMMANDS: CenikImportRow[] = [
  { command: 'npm run import:cenik:horizontalni', description: 'Horizontální žaluzie' },
  { command: 'npm run import:cenik:plise', description: 'Plisé žaluzie' },
  { command: 'npm run import:cenik:vertikalni', description: 'Vertikální žaluzie SONIA / VANESA / VIOLA (m² podle výšky)' },
  { command: 'npm run import:xlsx:cenik', description: 'Vertikální látky z XLSX (m²)' },
  { command: 'npm run import:xlsx:dn-roletky', description: 'Rolety Den a noc Collete' },
  { command: 'npm run import:textilni:zaluzie:jazz', description: 'Textilní žaluzie JAZZ EXPERT (skupiny 1–5)' },
  { command: 'npm run import:pdf:ext50-int50', description: 'Žaluzie EXT 50 / INT 50 (PDF)' },
  { command: 'npm run import:pdf:venkovni-rolety-radix', description: 'Venkovní rolety RADIX (PDF)' },
  { command: 'npm run import:screenova:roleta:union-l', description: 'Screenová roleta UNION L' },
];
