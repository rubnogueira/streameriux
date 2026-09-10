import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { sourcePath } from "../../src/media/native-video";

const nativeRoot = join(dirname(fileURLToPath(import.meta.url)));

const swiftFrameworks = ["AppKit", "AVFoundation", "CoreVideo", "QuartzCore"];

describe.runIf(process.platform === "darwin")("native/darwin/video-layer.swift", () => {
  it("typechecks with swiftc", () => {
    const swift = sourcePath();
    execFileSync(
      "swiftc",
      [
        "-typecheck",
        "-swift-version",
        "5",
        ...swiftFrameworks.flatMap((name) => ["-framework", name]),
        swift,
      ],
      { stdio: "pipe" },
    );
  });

  it("passes the XCTest suite", () => {
    const out = execFileSync("swift", ["test"], {
      cwd: nativeRoot,
      encoding: "utf8",
      env: { ...process.env, SWIFT_DETERMINISTIC_HASHING: "1" },
    });
    expect(out).toMatch(/Executed \d+ tests?, with 0 failures/);
  });
});
