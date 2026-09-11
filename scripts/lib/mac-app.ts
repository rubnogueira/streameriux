import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { rasterizeSvgToPng } from "../../src/lib/rasterize-svg";
import { APP_VERSION } from "../../src/version";

const SCRIPTS = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(SCRIPTS, "..", "..");
export const APP_NAME = "streameriux";
export const RELEASE_BUNDLE_ID = "dev.streameriux.app";

/**
 * The compiled bun binary sits beside a launcher script in a release bundle, so
 * it cannot also be named `streameriux` (that name is the launcher / the bundle
 * executable). See writeReleaseBundle for why the launcher exists.
 */
export const RELEASE_INNER_BINARY = "streameriux-bin";

/**
 * Packages `bun build --compile` must not try to bundle. `@audio/decode` (pulled
 * in by web-audio-api) lazily `import()`s one optional decoder package per audio
 * codec; most are not installed because the app decodes through mediabunny, not
 * @audio/decode, so bundling them fails to resolve. They are never required at
 * runtime. The trailing `*` is a Bun external glob.
 */
export const COMPILE_EXTERNALS = ["@audio/decode-*"];

/** The `bun build --compile` argv for the app, with a single source of externals. */
export function compileArgs(entry: string, output: string): string[] {
  return [
    "bun",
    "build",
    "--compile",
    ...COMPILE_EXTERNALS.flatMap((name) => ["--external", name]),
    entry,
    "--outfile",
    output,
  ];
}

export type CommandRunner = (command: string, args: string[]) => Promise<boolean>;

export async function run(command: string, args: string[]): Promise<boolean> {
  const proc = Bun.spawn([command, ...args], { stdout: "ignore", stderr: "ignore" });
  return (await proc.exited) === 0;
}

/** Rasterise assets/app-icon.svg to a .icns, keeping the squircle's corners transparent. */
export async function buildAppIcon(
  target: string,
  distWork = join(ROOT, "dist"),
  runCommand: CommandRunner = run,
): Promise<boolean> {
  const svg = join(ROOT, "assets", "app-icon.svg");
  if (!existsSync(svg)) return false;
  const work = join(distWork, ".iconwork");
  const iconset = join(work, "icon.iconset");
  rmSync(work, { recursive: true, force: true });
  mkdirSync(iconset, { recursive: true });

  // NSImage (not qlmanage) so the transparent margin around the icon stays
  // transparent instead of being flattened to a white tile behind the Dock icon.
  const master = join(work, "master.png");
  if (!rasterizeSvgToPng(svg, master, 1024)) return false;

  const sizes = [16, 32, 64, 128, 256, 512, 1024];
  for (const size of sizes) {
    await runCommand("sips", [
      "-z",
      String(size),
      String(size),
      master,
      "--out",
      join(iconset, `icon_${size}x${size}.png`),
    ]);
    const retina = size * 2;
    if (retina <= 1024) {
      await runCommand("sips", [
        "-z",
        String(retina),
        String(retina),
        master,
        "--out",
        join(iconset, `icon_${size}x${size}@2x.png`),
      ]);
    }
  }

  const ok = await runCommand("iconutil", ["-c", "icns", iconset, "-o", target]);
  rmSync(work, { recursive: true, force: true });
  return ok && existsSync(target);
}

export function renderInfoPlist(options: {
  bundleId: string;
  displayName?: string;
  hasIcon: boolean;
  appSleepDisabled?: boolean;
}): string {
  const name = options.displayName ?? APP_NAME;
  const iconLine = options.hasIcon ? "  <key>CFBundleIconFile</key><string>AppIcon</string>\n" : "";
  const napLine = options.appSleepDisabled ? "  <key>NSAppSleepDisabled</key><true/>\n" : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>${name}</string>
  <key>CFBundleDisplayName</key><string>${name}</string>
  <key>CFBundleExecutable</key><string>${APP_NAME}</string>
  <key>CFBundleIdentifier</key><string>${options.bundleId}</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>${APP_VERSION}</string>
  <key>CFBundleVersion</key><string>${APP_VERSION}</string>
  <key>NSHighResolutionCapable</key><true/>
${napLine}  <key>LSApplicationCategoryType</key><string>public.app-category.video</string>
${iconLine}</dict>
</plist>
`;
}

export function needsCompile(entry: string, output: string): boolean {
  if (!existsSync(output)) return true;
  return statSync(entry).mtimeMs > statSync(output).mtimeMs;
}

export type CompileSpawn = (
  args: string[],
  options: { cwd: string; stdout: "inherit"; stderr: "inherit" },
) => { exited: Promise<number> };

export async function compileApp(
  entry: string,
  output: string,
  options: {
    spawn?: CompileSpawn;
    exit?: (code: number) => never;
    cwd?: string;
  } = {},
): Promise<void> {
  const spawnCompile = options.spawn ?? ((args, spawnOpts) => Bun.spawn(args, spawnOpts));
  const exit = options.exit ?? ((code) => process.exit(code));
  const cwd = options.cwd ?? ROOT;
  mkdirSync(dirname(output), { recursive: true });
  const proc = spawnCompile(compileArgs(entry, output), {
    cwd,
    stdout: "inherit",
    stderr: "inherit",
  });
  if ((await proc.exited) !== 0) exit(1);
}

/**
 * Ad-hoc code-sign the finished bundle. Bun's `--compile` only leaves a raw
 * `linker-signed` signature on the executable (Identifier=a.out, Info.plist not
 * bound, no sealed resources). Dropped into a .app that adds an Info.plist, that
 * signature becomes inconsistent — and once a download stamps the quarantine
 * attribute, Gatekeeper rejects it as "damaged and can't be opened" rather than
 * showing the ordinary unsigned-app prompt. Re-signing seals the Info.plist and
 * writes Contents/_CodeSignature/CodeResources so the bundle is coherent.
 *
 * Signs inside-out: nested Mach-O code (the compiled bun binary and every
 * shipped `.node` addon) first, then the bundle. `codesign --deep` is
 * deliberately NOT used — on a bundle whose main executable is the launcher
 * script it produces an inconsistent signature for the nested binary, and macOS
 * then SIGKILLs it on launch. The nested list is discovered, so the same
 * routine works for both the release layout (launcher + streameriux-bin +
 * however many native addons) and the dev layout (a single bun binary as the
 * main executable, no nested code).
 *
 * Must run AFTER the Info.plist and icon are in place. This is ad-hoc, not
 * notarised: users still get the standard "unidentified developer" prompt
 * (right-click → Open, or System Settings → Privacy & Security → Open Anyway),
 * but no longer the dead-end "damaged" dialog. Real notarisation needs a paid
 * Apple Developer ID.
 */
export async function codesignBundle(
  appPath: string,
  bundleId: string,
  runCommand: CommandRunner = run,
): Promise<boolean> {
  const innerBinary = join(appPath, "Contents", "MacOS", RELEASE_INNER_BINARY);
  const nested = [
    ...(existsSync(innerBinary) ? [innerBinary] : []),
    ...findNodeBinaries(join(appPath, "Contents", "Resources", "node_modules")),
  ];

  for (const path of nested) {
    if (!(await runCommand("codesign", ["--force", "--sign", "-", path]))) return false;
  }

  return runCommand("codesign", ["--force", "--sign", "-", "--identifier", bundleId, appPath]);
}

export async function ensureBundleMetadata(appPath: string, bundleId: string): Promise<boolean> {
  const resources = join(appPath, "Contents", "Resources");
  mkdirSync(resources, { recursive: true });
  const hasIcon = await buildAppIcon(join(resources, "AppIcon.icns"));
  await Bun.write(
    join(appPath, "Contents", "Info.plist"),
    renderInfoPlist({ bundleId, hasIcon, appSleepDisabled: true }),
  );
  // Seal the bundle last, once the Info.plist and icon exist. Without this the
  // downloaded .app is reported as damaged; see codesignBundle for the details.
  if (!(await codesignBundle(appPath, bundleId))) {
    throw new Error(
      `codesign failed for ${appPath}. The bundle would be reported as "damaged" once downloaded.`,
    );
  }
  return hasIcon;
}

/**
 * The bundle's main executable. A Finder launch gives the app cwd=`/`, and a
 * `bun --compile` binary resolves its runtime `require`s (the native addons)
 * relative to cwd — so from Finder it can't find them and crashes (e.g. "Could
 * not load the node-av native binding", or silent loss of audio output). Bun
 * reads NODE_PATH only at process start, so it cannot be set from inside the
 * app. This launcher runs first, points NODE_PATH at the addons shipped in
 * Resources, and exec-replaces itself with the real binary (same PID, so the
 * app identity is preserved).
 */
export function renderLauncherScript(): string {
  return `#!/bin/sh
# See renderLauncherScript in scripts/lib/mac-app.ts for why this exists.
DIR="$(cd "$(dirname "$0")" && pwd)"
export NODE_PATH="$DIR/../Resources/node_modules"
exec "$DIR/${RELEASE_INNER_BINARY}" "$@"
`;
}

function readPackageJson(dir: string): Record<string, unknown> | null {
  const file = join(dir, "package.json");
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function runtimeDependencyNames(pkg: Record<string, unknown> | null): string[] {
  if (!pkg) return [];
  const deps = (pkg.dependencies ?? {}) as Record<string, unknown>;
  const optional = (pkg.optionalDependencies ?? {}) as Record<string, unknown>;
  return [...Object.keys(deps), ...Object.keys(optional)];
}

/**
 * Discover every native addon package (one shipping a `.node` file) in the
 * app's production dependency closure. Walking from package.json `dependencies`
 * (never devDependencies) excludes build-time native tools like oxlint/oxfmt,
 * and following `optionalDependencies` picks up the per-platform binary packages
 * (napi-rs style) that only install for the current platform. This is why adding
 * a new native dependency needs no change here — it is found automatically.
 */
export function findNativePackages(root = ROOT): string[] {
  const nodeModules = join(root, "node_modules");
  const hasNativeBinary = (name: string): boolean => {
    try {
      return readdirSync(join(nodeModules, name)).some((file) => file.endsWith(".node"));
    } catch {
      return false;
    }
  };

  const queue = runtimeDependencyNames(readPackageJson(root));
  const seen = new Set<string>();
  const natives = new Set<string>();
  while (queue.length > 0) {
    const name = queue.shift() as string;
    if (seen.has(name)) continue;
    seen.add(name);
    if (!existsSync(join(nodeModules, name))) continue;
    if (hasNativeBinary(name)) natives.add(name);
    for (const dep of runtimeDependencyNames(readPackageJson(join(nodeModules, name)))) {
      if (!seen.has(dep)) queue.push(dep);
    }
  }
  return [...natives].sort();
}

/**
 * Copy one native addon package into the bundle and normalise it to a CommonJS
 * entry that `require`s its `.node`. A compiled bun binary resolves runtime
 * requires from NODE_PATH, but only for an explicit `<pkg>/file.node` subpath —
 * NOT for a bare `require('<pkg>')` whose package.json `main` is the `.node`
 * file. napi-rs loaders use both styles, so every staged package gets an
 * `index.js` (the only extension Bun's compiled resolver honours as `main`) that
 * forwards to the `.node`, with `type` dropped so that entry stays CommonJS.
 */
export function stageNativeAddon(name: string, appPath: string, root = ROOT): void {
  const source = join(root, "node_modules", name);
  const dest = join(appPath, "Contents", "Resources", "node_modules", name);
  mkdirSync(dirname(dest), { recursive: true });
  rmSync(dest, { recursive: true, force: true });
  cpSync(source, dest, { recursive: true });

  const pkg = readPackageJson(dest) ?? {};
  const declaredMain = typeof pkg.main === "string" ? pkg.main.replace(/^\.\//, "") : undefined;
  const binary =
    declaredMain?.endsWith(".node") === true
      ? declaredMain
      : readdirSync(dest).find((file) => file.endsWith(".node"));
  if (!binary) throw new Error(`No .node binary found in ${name}`);

  writeFileSync(
    join(dest, "index.js"),
    `module.exports = require(${JSON.stringify(`./${binary}`)});\n`,
  );
  pkg.main = "index.js";
  delete pkg.type;
  writeFileSync(join(dest, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
}

/**
 * Stage every native addon in the app's dependency closure; returns their names.
 * `skipIfPresent` leaves already-staged packages untouched — dev re-runs reuse
 * the bundle, so this avoids recopying tens of MB of binaries each launch.
 */
export function stageNativeAddons(
  appPath: string,
  root = ROOT,
  { skipIfPresent = false }: { skipIfPresent?: boolean } = {},
): string[] {
  const names = findNativePackages(root);
  if (names.length === 0) {
    throw new Error(
      "No native addon packages found. Run `bun install` so runtime native deps are present.",
    );
  }
  const resources = join(appPath, "Contents", "Resources", "node_modules");
  for (const name of names) {
    if (skipIfPresent && existsSync(join(resources, name, "index.js"))) continue;
    stageNativeAddon(name, appPath, root);
  }
  return names;
}

/** Absolute path to a bundle's staged native-addon node_modules (the launcher's NODE_PATH). */
export function bundleNodePath(appPath: string): string {
  return join(appPath, "Contents", "Resources", "node_modules");
}

/** Every `.node` file under a directory, recursively (for inside-out signing). */
export function findNodeBinaries(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...findNodeBinaries(full));
    else if (entry.name.endsWith(".node")) found.push(full);
  }
  return found;
}

export async function writeReleaseBundle(
  appPath: string,
  binaryPath: string,
  runCommand: CommandRunner = run,
): Promise<boolean> {
  const macos = join(appPath, "Contents", "MacOS");
  const launcher = join(macos, APP_NAME);
  const innerBinary = join(macos, RELEASE_INNER_BINARY);
  rmSync(appPath, { recursive: true, force: true });
  mkdirSync(macos, { recursive: true });

  // The compiled binary sits beside a launcher script that fixes up NODE_PATH
  // before exec-ing it; the launcher is the bundle's CFBundleExecutable.
  await Bun.write(innerBinary, Bun.file(binaryPath));
  await runCommand("chmod", ["+x", innerBinary]);
  await Bun.write(launcher, renderLauncherScript());
  await runCommand("chmod", ["+x", launcher]);

  stageNativeAddons(appPath);

  return ensureBundleMetadata(appPath, RELEASE_BUNDLE_ID);
}
