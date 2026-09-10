import { describe, expect, it } from "vitest";
import { EMPTY_FRAME_LAYERS, pushFrameLayers } from "./video-picture";

describe("pushFrameLayers", () => {
  it("clears layers and alternates front buffers", () => {
    expect(pushFrameLayers(EMPTY_FRAME_LAYERS, null)).toEqual(EMPTY_FRAME_LAYERS);
    const first = pushFrameLayers(EMPTY_FRAME_LAYERS, "data:image/a");
    expect(first.front).toBe("b");
    expect(first.b).toBe("data:image/a");
    const second = pushFrameLayers(first, "data:image/b");
    expect(second.front).toBe("a");
    expect(second.a).toBe("data:image/b");
  });
});
