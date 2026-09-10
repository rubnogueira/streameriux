/** Run CLI `main` only when the module is the process entry (test both branches in unit tests). */
export async function runCliEntry(meta: ImportMeta, main: () => Promise<void>): Promise<void> {
  if (meta.main) await main();
}
