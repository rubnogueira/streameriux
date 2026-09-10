import { version } from "../package.json";

/**
 * Single source of truth for the app version. Everything that needs it — the
 * in-app label, the macOS bundle Info.plist, and the GitHub release workflow —
 * derives it from `package.json` so there is never a second number to bump.
 */
export const APP_VERSION: string = version;
