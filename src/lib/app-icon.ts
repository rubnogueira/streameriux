import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import darkIconSvg from "../../assets/app-icon.svg" with { type: "text" };
import lightIconSvg from "../../assets/app-icon-light.svg" with { type: "text" };
import { rasterizeSvgToPng } from "./rasterize-svg";
import { inlineSvgMarkup } from "./svg-source";

export type MacAppearance = "light" | "dark";

const ICON_DIR = join(tmpdir(), "gpiux-streamer-app-icons");
mkdirSync(ICON_DIR, { recursive: true });

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export function appIconAsset(appearance: MacAppearance): string {
  return join(ROOT, "assets", appearance === "light" ? "app-icon-light.svg" : "app-icon.svg");
}

/** The appearance-specific icon SVG, bundled as text so it is available in the compiled binary. */
export function appIconSvgSource(appearance: MacAppearance): string {
  const raw = appearance === "light" ? lightIconSvg : darkIconSvg;
  return inlineSvgMarkup(raw);
}

/** Reads macOS menu-bar appearance (Light when the key is unset). */
export function readMacAppearance(): MacAppearance {
  if (typeof process === "undefined" || process.platform !== "darwin") return "dark";
  try {
    const value = execFileSync("defaults", ["read", "-g", "AppleInterfaceStyle"], {
      encoding: "utf8",
    }).trim();
    return value === "Dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

/**
 * Rasterise the appearance-specific icon SVG to a cached PNG GPUI can paint via
 * `<img>` — the same artwork as the Dock icon, so the sidebar brand mark matches.
 * Complex multi-stop SVGs do not render through GPUIX's `<svg>` element. The SVG
 * text is bundled (not read from `assets/`) so this also works inside the compiled
 * binary, and it renders with a transparent background (via {@link rasterizeSvgToPng})
 * so the squircle's rounded corners never show as a white tile.
 */
export function ensureAppIconPng(appearance: MacAppearance, size = 56): string | undefined {
  const source = appIconSvgSource(appearance);
  const key = createHash("sha1").update(source).update(String(size)).digest("hex").slice(0, 16);
  const png = join(ICON_DIR, `app-icon-${appearance}-${key}.png`);
  if (existsSync(png)) return png;

  if (typeof process === "undefined" || process.platform !== "darwin") return undefined;

  // Materialise the bundled SVG to a temp file so the rasteriser (which reads a
  // path) works even when assets/ is not on disk beside the compiled binary.
  const svgPath = join(ICON_DIR, `app-icon-${appearance}-${key}.svg`);
  try {
    if (!existsSync(svgPath)) writeFileSync(svgPath, source);
  } catch {
    return undefined;
  }
  return rasterizeSvgToPng(svgPath, png, size) ? png : undefined;
}

