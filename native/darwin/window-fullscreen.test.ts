import { execFileSync } from "node:child_process";
import { describe, it } from "vitest";
import { swiftSourcePath } from "../../src/lib/darwin-window-fullscreen";

describe.runIf(process.platform === "darwin")("native/darwin/window-fullscreen.swift", () => {
  it("typechecks with swiftc", () => {
    const swift = swiftSourcePath();
    execFileSync("swiftc", ["-typecheck", "-swift-version", "5", "-framework", "AppKit", swift], {
      stdio: "pipe",
    });
  });
});
