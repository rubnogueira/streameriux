/** @vitest-environment jsdom */
import { act, useState, type Dispatch, type SetStateAction } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StreamPlayer } from "../player";
import { renderHookProbe } from "../test-fixtures/render-hook";
import * as native from "./native-video";
import { useNativeVideo } from "./use-native-video";

vi.mock("@gpuix/react", () => ({
  useWindowSize: () => ({ width: 1280, height: 720 }),
}));

type NativeHookState = {
  enabled: boolean;
  player: StreamPlayer | null;
  fit: "contain" | "cover";
};

const controller: {
  setState?: Dispatch<SetStateAction<NativeHookState>>;
} = {};

async function renderNativeHook(initial: NativeHookState) {
  const hook = await renderHookProbe(() => {
    const [state, setState] = useState(initial);
    controller.setState = setState;
    return useNativeVideo(state.player, {
      enabled: state.enabled,
      leftInset: 84,
      videoFit: state.fit,
    });
  });
  return {
    get value() {
      return hook.latest;
    },
    update: async (next: Partial<NativeHookState>) => {
      await act(async () => {
        controller.setState?.((current) => ({ ...current, ...next }));
        await Promise.resolve();
      });
      await hook.rerender();
    },
    unmount: () => hook.unmount(),
  };
}

describe("useNativeVideo", () => {
  const nv = {
    attach: vi.fn(() => true),
    detach: vi.fn(),
    setRect: vi.fn(),
    setHidden: vi.fn(),
    setFit: vi.fn(),
    present: vi.fn(),
    setPlaying: vi.fn(),
    debug: vi.fn(() => ""),
  };

  afterEach(() => {
    vi.restoreAllMocks();
    controller.setState = undefined;
  });

  it("stays inactive when native video is unavailable", async () => {
    vi.spyOn(native, "nativeVideoSupported").mockReturnValue(false);
    vi.spyOn(native, "loadNativeVideo").mockReturnValue(null);
    const player = { setNativeSink: vi.fn() } as unknown as StreamPlayer;
    const hook = await renderNativeHook({ enabled: true, player, fit: "contain" });
    expect(hook.value).toBe(false);
    hook.unmount();
  });

  it("engages the native sink and updates layout", async () => {
    vi.spyOn(native, "nativeVideoSupported").mockReturnValue(true);
    vi.spyOn(native, "loadNativeVideo").mockReturnValue(nv);
    const player = { setNativeSink: vi.fn() } as unknown as StreamPlayer;
    const hook = await renderNativeHook({ enabled: true, player, fit: "contain" });
    expect(hook.value).toBe(true);
    expect(player.setNativeSink).toHaveBeenCalled();
    expect(nv.attach).toHaveBeenCalled();
    await hook.update({ fit: "cover" });
    expect(nv.setFit).toHaveBeenCalledWith(1);
    hook.unmount();
    expect(nv.detach).toHaveBeenCalled();
  });

  it("disengages when disabled", async () => {
    vi.spyOn(native, "nativeVideoSupported").mockReturnValue(true);
    vi.spyOn(native, "loadNativeVideo").mockReturnValue(nv);
    const player = { setNativeSink: vi.fn() } as unknown as StreamPlayer;
    const hook = await renderNativeHook({ enabled: true, player, fit: "contain" });
    await hook.update({ enabled: false });
    expect(nv.detach).toHaveBeenCalled();
    hook.unmount();
  });
});
