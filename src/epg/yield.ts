/** Yield the main thread so UI can paint between heavy EPG steps. */
export function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
