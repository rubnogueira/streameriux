import { LIVE_EDGE_BUFFER, type PlayerState } from "../player";

export const C = {
  canvas: "#0B0B10",
  sidebar: "#121218",
  raised: "#1C1C24",
  overlay: "#FFFFFF12",
  overlayStrong: "#FFFFFF1F",
  border: "#2C2C36",
  text: "#F2F2F7",
  secondary: "#B4B4C0",
  tertiary: "#8A8A98",
  ghost: "#5C5C68",
  accent: "#FF5A4F",
  accentSoft: "#FF5A4F33",
  star: "#F5C451",
  onAccent: "#1A0706",
  live: "#FF4D4F",
  player: "#050508",
  track: "#2E2E38",
  /** Not-yet-reached ("future") portion of the seek bar — darker than {@link C.track}. */
  trackFuture: "#191920",
  thumb: "#FFFFFF",
} as const;

export const FONT = typeof window === "undefined" ? "Helvetica" : "IBM Plex Sans";
export const SIDEBAR_WIDTH = 292;
export const IS_MAC = typeof process !== "undefined" && process.platform === "darwin";
export const SIDEBAR_TOP_INSET = IS_MAC ? 46 : 16;
export const SIDEBAR_SIDE_INSET = 16;
export const PLAYER_HEADER_TOP = IS_MAC ? 22 : 16;
export const PLAYER_HEADER_LEFT = 18;
export const PLAYER_HEADER_LEFT_FULLSCREEN = IS_MAC ? 84 : PLAYER_HEADER_LEFT;
export const CHANNEL_MARK_ASPECT = 16 / 9;
export const LIVE_EDGE_SNAP = LIVE_EDGE_BUFFER + 6;

export const idlePlayer: PlayerState = {
  status: "idle",
  playing: false,
  live: false,
  seekable: false,
  muted: false,
  volume: 0.8,
  time: 0,
  start: 0,
  end: 0,
  unix: false,
  unixOffset: null,
  width: 0,
  height: 0,
  framePath: null,
  warning: null,
  error: null,
  channelId: null,
};
