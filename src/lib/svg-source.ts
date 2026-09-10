/**
 * GPUI `<svg source>` expects SVG markup. Bun embeds `import … with { type: "text" }`
 * as raw XML; Vite/Vitest inlines the same imports as `data:image/svg+xml` URLs.
 */
export function inlineSvgMarkup(source: string): string {
  const trimmed = source.trim();
  if (trimmed.startsWith("<")) return trimmed;
  const lower = trimmed.toLowerCase();
  if (!lower.startsWith("data:image/svg+xml")) return trimmed;

  const base64Marker = ";base64,";
  const base64Index = lower.indexOf(base64Marker);
  if (base64Index !== -1) {
    const payload = trimmed.slice(base64Index + base64Marker.length);
    return Buffer.from(payload, "base64").toString("utf8");
  }

  const comma = trimmed.indexOf(",");
  if (comma === -1) return trimmed;
  return decodeURIComponent(trimmed.slice(comma + 1));
}
