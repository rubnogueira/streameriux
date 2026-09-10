import { describe, expect, it } from "vitest";
import { inlineSvgMarkup } from "./svg-source";

const SAMPLE = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';

describe("inlineSvgMarkup", () => {
  it("returns markup unchanged", () => {
    expect(inlineSvgMarkup(SAMPLE)).toBe(SAMPLE);
  });

  it("decodes percent-encoded data URLs", () => {
    const data = `data:image/svg+xml,${encodeURIComponent(SAMPLE)}`;
    expect(inlineSvgMarkup(data)).toBe(SAMPLE);
  });

  it("decodes base64 data URLs", () => {
    const data = `data:image/svg+xml;base64,${Buffer.from(SAMPLE).toString("base64")}`;
    expect(inlineSvgMarkup(data)).toBe(SAMPLE);
  });

  it("passes through non-svg values", () => {
    expect(inlineSvgMarkup("/path/icon.svg")).toBe("/path/icon.svg");
  });
});
