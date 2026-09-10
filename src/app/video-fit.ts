import type { VideoFit } from "../media/native-video";
import type { IconName } from "./icons";

/** Normal letterbox → zoomed crop → vertical stretch. */
export const VIDEO_FIT_CYCLE: VideoFit[] = ["contain", "cover", "fill"];

export function cycleVideoFit(current: VideoFit): VideoFit {
  const index = VIDEO_FIT_CYCLE.indexOf(current);
  const next = index < 0 ? 0 : (index + 1) % VIDEO_FIT_CYCLE.length;
  return VIDEO_FIT_CYCLE[next]!;
}

export function videoFitLabel(fit: VideoFit): string {
  switch (fit) {
    case "contain":
      return "Normal";
    case "cover":
      return "Zoomed";
    case "fill":
      return "Vertical fit";
  }
}

export function videoFitIcon(fit: VideoFit): IconName {
  switch (fit) {
    case "contain":
      return "shrinkVertical";
    case "cover":
      return "sparkle";
    case "fill":
      return "expandVertical";
  }
}

export function videoFitTestId(fit: VideoFit): string {
  return `video-fit-${fit}`;
}
