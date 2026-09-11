import { cpSync, existsSync, mkdirSync, rmSync, statSync } from "node:fs";
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
 * node-av's prebuilt native addon. `bun build --compile` bundles node-av's JS
 * but leaves its `require(`@seydx/node-av-${platform}-${arch}/node-av.node`)`
 * as a runtime require it cannot embed (the specifier is a template literal).
 * We ship this package inside the bundle and point NODE_PATH at it. The release
 * is darwin-arm64 only, so the platform is fixed.
 */
export const NATIVE_ADDON_PACKAGE = "@seydx/node-av-darwin-arm64";

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
  const proc = spawnCompile(
    ["bun", "build", "--compile", "--external", "web-audio-api", entry, "--outfile", output],
    {
      cwd,
      stdout: "inherit",
      stderr: "inherit",
    },
  );
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
 * Signs inside-out: nested Mach-O code (the compiled bun binary and the native
 * addon) first, then the bundle. `codesign --deep` is deliberately NOT used —
 * on a bundle whose main executable is the launcher script it produces an
 * inconsistent signature for the nested binary, and macOS then SIGKILLs it on
 * launch. Every path here is optional so the same routine works for both the
 * release layout (launcher + streameriux-bin + native addon) and the dev layout
 * (a single bun binary as the main executable).
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
  const nested = [
    join(appPath, "Contents", "Resources", "node_modules", NATIVE_ADDON_PACKAGE, "node-av.node"),
    join(appPath, "Contents", "MacOS", RELEASE_INNER_BINARY),
  ].filter((path) => existsSync(path));

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
 * `bun --compile` binary resolves its runtime `require`s (node-av's native
 * addon) relative to cwd — so from Finder it can't find the addon and crashes
 * with "Could not load the node-av native binding". Bun reads NODE_PATH only at
 * process start, so it cannot be set from inside the app. This launcher runs
 * first, points NODE_PATH at the addon shipped in Resources, and exec-replaces
 * itself with the real binary (same PID, so the app identity is preserved).
 */
export function renderLauncherScript(): string {
  return `#!/bin/sh
# See renderLauncherScript in scripts/lib/mac-app.ts for why this exists.
DIR="$(cd "$(dirname "$0")" && pwd)"
export NODE_PATH="$DIR/../Resources/node_modules"
exec "$DIR/${RELEASE_INNER_BINARY}" "$@"
`;
}

/**
 * Copy node-av's prebuilt native addon into the bundle so the launcher's
 * NODE_PATH can resolve it. Throws if it is missing, rather than shipping a
 * bundle that crashes on launch.
 */
export function stageNativeAddon(appPath: string, root = ROOT): void {
  const source = join(root, "node_modules", NATIVE_ADDON_PACKAGE);
  if (!existsSync(join(source, "node-av.node"))) {
    throw new Error(
      `Missing ${NATIVE_ADDON_PACKAGE}. Run \`bun install\` on macOS arm64 so the native addon is present.`,
    );
  }
  const dest = join(appPath, "Contents", "Resources", "node_modules", NATIVE_ADDON_PACKAGE);
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(source, dest, { recursive: true });
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

  stageNativeAddon(appPath);

  return ensureBundleMetadata(appPath, RELEASE_BUNDLE_ID);
}
