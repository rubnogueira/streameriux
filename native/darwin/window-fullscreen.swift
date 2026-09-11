// Runtime NSWindow fullscreen for the GPUIX app (no Accessibility / System Events).
//
// GPUIX only reads `fullscreen` at window creation; this dylib toggles the real
// window's full-screen mode in-process via AppKit. Loaded through `bun:ffi` from
// `src/lib/darwin-window-fullscreen.ts`.

import AppKit

private func appWindow() -> NSWindow? {
  if let key = NSApp.keyWindow, key.contentView != nil, key.styleMask.contains(.titled) || key.isVisible {
    return key
  }
  for window in NSApp.windows where window.contentView != nil && window.isVisible {
    if window.className.contains("Panel") { continue }
    return window
  }
  return NSApp.windows.first { $0.contentView != nil }
}

private func onMainSync<T>(_ work: @escaping () -> T) -> T {
  if Thread.isMainThread { return work() }
  return DispatchQueue.main.sync(execute: work)
}

@_cdecl("gpiux_window_is_fullscreen")
public func gpiux_window_is_fullscreen() -> Int32 {
  onMainSync {
    guard let window = appWindow() else { return -1 }
    return window.styleMask.contains(.fullScreen) ? 1 : 0
  }
}

@_cdecl("gpiux_window_set_fullscreen")
public func gpiux_window_set_fullscreen(_ on: Int32) -> Int32 {
  onMainSync {
    guard let window = appWindow() else { return -1 }
    let want = on != 0
    let isFs = window.styleMask.contains(.fullScreen)
    if want != isFs {
      window.toggleFullScreen(nil)
    }
    return window.styleMask.contains(.fullScreen) ? 1 : 0
  }
}
