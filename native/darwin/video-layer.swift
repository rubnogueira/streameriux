// Hardware-composited video surface for the GPUIX window (README Option A).
//
// GPUIX has no video primitive, so the app normally decodes each frame to a
// bitmap and blits it through an `<img>`; the renderer keeps decoded bitmaps in
// GPU textures and reclaims them lazily, so at video rate memory balloons.
//
// This module sidesteps the renderer entirely: it inserts an
// AVSampleBufferDisplayLayer into the app's own NSWindow and enqueues decoded
// frames straight to it. The window server composites the layer on the GPU —
// one resident surface, no per-frame image cache, no accumulation — and scales
// it for free. Frames arrive as tightly-packed BGRA from the JS side (mediabunny
// decode) via a raw pointer, so there is no extra copy across the FFI boundary.
//
// Exposed as a C ABI (`@_cdecl`) dylib loaded in-process through `bun:ffi`.
// Every UIKit/AppKit touch is marshalled to the main thread.

import AppKit
import AVFoundation
import CoreVideo
import QuartzCore

private final class VideoSurface {
  static let shared = VideoSurface()

  let layer = AVSampleBufferDisplayLayer()
  weak var host: NSView?
  private var formatDesc: CMVideoFormatDescription?
  private var formatWidth: Int32 = 0
  private var formatHeight: Int32 = 0
  private var enqueued = 0
  private var lastEnqueueFailed = false

  func debugInfo() -> String {
    let f = layer.frame
    let hb = host?.bounds ?? .zero
    let idx = (host?.layer?.sublayers?.firstIndex(where: { $0 === layer })).map(String.init) ?? "nil"
    let siblings = host?.layer?.sublayers?.count ?? -1
    return "attached=\(layer.superlayer != nil) hidden=\(layer.isHidden)" +
      " frame=[\(Int(f.origin.x)),\(Int(f.origin.y)),\(Int(f.size.width)),\(Int(f.size.height))]" +
      " host=[\(Int(hb.size.width)),\(Int(hb.size.height))] idx=\(idx)/\(siblings)" +
      " status=\(layer.status.rawValue) ready=\(layer.isReadyForMoreMediaData)" +
      " enqueued=\(enqueued) lastFail=\(lastEnqueueFailed) opaqueHost=\(host?.layer?.isOpaque ?? false)"
  }

  init() {
    layer.videoGravity = .resizeAspect
    layer.backgroundColor = NSColor.black.cgColor
    layer.isOpaque = true
  }

  // Find the app's real content window. GPUIX opens exactly one; skip any
  // borderless/utility panels so we never target a menu or tooltip.
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

  func attach() -> Bool {
    guard let window = appWindow(), let content = window.contentView else { return false }
    content.wantsLayer = true
    guard let root = content.layer else { return false }
    if layer.superlayer !== root {
      layer.removeFromSuperlayer()
      // Insert at the bottom so the video sits BEHIND GPUI's Metal layer. The
      // window is transparent and the app leaves the player pane unpainted, so
      // GPUI's layer is see-through there and the video shows, while GPUI's
      // controls (opaque pixels) composite on top — no occlusion.
      root.insertSublayer(layer, at: 0)
    }
    layer.zPosition = -1
    host = content
    return true
  }

  func detach() {
    layer.flushAndRemoveImage()
    layer.removeFromSuperlayer()
    host = nil
    formatDesc = nil
  }

  // Rect is window-local, top-left origin, logical points (what GPUIX layout
  // reports). Convert to the content view's bottom-left AppKit coordinates.
  func setRect(x: Double, y: Double, w: Double, h: Double) {
    guard let content = host else { return }
    let height = Double(content.bounds.height)
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    layer.frame = CGRect(x: x, y: height - y - h, width: w, height: h)
    CATransaction.commit()
  }

  func setHidden(_ hidden: Bool) {
    layer.isHidden = hidden
    if hidden { layer.flushAndRemoveImage() }
  }

  // 0 = contain (letterbox), 1 = cover (zoom + crop), 2 = fill (stretch).
  func setFit(_ mode: Int32) {
    switch mode {
    case 1: layer.videoGravity = .resizeAspectFill
    case 2: layer.videoGravity = .resize
    default: layer.videoGravity = .resizeAspect
    }
  }

  // Copy one BGRA frame into a fresh pixel buffer and enqueue it for immediate
  // display. `stride` is the source row length in bytes (may exceed width*4).
  //
  // A CVPixelBufferPool is deliberately NOT used: a pool blocks the caller when
  // its buffers are still held by enqueued-but-undisplayed samples, which stalls
  // the frame loop. Creating a fresh IOSurface-backed buffer each frame never
  // blocks; the OS frees it once the sample is displayed, so only the handful of
  // frames in flight are ever resident.
  func present(_ src: UnsafeRawPointer, width: Int32, height: Int32, stride: Int32) {
    guard width > 0, height > 0 else { return }

    let attrs: [String: Any] = [kCVPixelBufferIOSurfacePropertiesKey as String: [:]]
    var pixelBuffer: CVPixelBuffer?
    guard CVPixelBufferCreate(nil, Int(width), Int(height), kCVPixelFormatType_32BGRA, attrs as CFDictionary, &pixelBuffer) == kCVReturnSuccess,
          let buffer = pixelBuffer else { return }

    CVPixelBufferLockBaseAddress(buffer, [])
    if let dst = CVPixelBufferGetBaseAddress(buffer) {
      let dstStride = CVPixelBufferGetBytesPerRow(buffer)
      let rowBytes = Int(width) * 4
      let srcStride = Int(stride)
      if dstStride == srcStride && dstStride == rowBytes {
        memcpy(dst, src, rowBytes * Int(height))
      } else {
        for row in 0..<Int(height) {
          memcpy(dst.advanced(by: row * dstStride), src.advanced(by: row * srcStride), rowBytes)
        }
      }
    }
    CVPixelBufferUnlockBaseAddress(buffer, [])

    if formatDesc == nil || formatWidth != width || formatHeight != height {
      var desc: CMVideoFormatDescription?
      CMVideoFormatDescriptionCreateForImageBuffer(allocator: nil, imageBuffer: buffer, formatDescriptionOut: &desc)
      formatDesc = desc
      formatWidth = width
      formatHeight = height
    }
    guard let desc = formatDesc else { return }

    var timing = CMSampleTimingInfo(
      duration: .invalid,
      presentationTimeStamp: .invalid,
      decodeTimeStamp: .invalid
    )
    var sample: CMSampleBuffer?
    guard CMSampleBufferCreateForImageBuffer(
      allocator: nil,
      imageBuffer: buffer,
      dataReady: true,
      makeDataReadyCallback: nil,
      refcon: nil,
      formatDescription: desc,
      sampleTiming: &timing,
      sampleBufferOut: &sample
    ) == noErr, let sampleBuffer = sample else { return }

    if let attachments = CMSampleBufferGetSampleAttachmentsArray(sampleBuffer, createIfNecessary: true),
       CFArrayGetCount(attachments) > 0 {
      let dict = unsafeBitCast(CFArrayGetValueAtIndex(attachments, 0), to: CFMutableDictionary.self)
      CFDictionarySetValue(
        dict,
        Unmanaged.passUnretained(kCMSampleAttachmentKey_DisplayImmediately).toOpaque(),
        Unmanaged.passUnretained(kCFBooleanTrue).toOpaque()
      )
    }

    if layer.status == .failed { layer.flush() }
    if layer.isReadyForMoreMediaData {
      layer.enqueue(sampleBuffer)
      enqueued += 1
      lastEnqueueFailed = false
    } else {
      lastEnqueueFailed = true
    }
  }
}

private func onMain(_ work: @escaping () -> Void) {
  if Thread.isMainThread { work() } else { DispatchQueue.main.async(execute: work) }
}

private func onMainSync<T>(_ work: @escaping () -> T) -> T {
  if Thread.isMainThread { return work() }
  return DispatchQueue.main.sync(execute: work)
}

@_cdecl("gpiux_video_attach")
public func gpiux_video_attach() -> Int32 {
  onMainSync { VideoSurface.shared.attach() ? 1 : 0 }
}

@_cdecl("gpiux_video_detach")
public func gpiux_video_detach() {
  onMain { VideoSurface.shared.detach() }
}

@_cdecl("gpiux_video_set_rect")
public func gpiux_video_set_rect(_ x: Double, _ y: Double, _ w: Double, _ h: Double) {
  onMain { VideoSurface.shared.setRect(x: x, y: y, w: w, h: h) }
}

@_cdecl("gpiux_video_set_hidden")
public func gpiux_video_set_hidden(_ hidden: Int32) {
  onMain { VideoSurface.shared.setHidden(hidden != 0) }
}

@_cdecl("gpiux_video_set_fit")
public func gpiux_video_set_fit(_ mode: Int32) {
  onMain { VideoSurface.shared.setFit(mode) }
}

@_cdecl("gpiux_video_present")
public func gpiux_video_present(_ ptr: UnsafeRawPointer, _ width: Int32, _ height: Int32, _ stride: Int32) {
  // Enqueue happens on the main run loop where the layer lives.
  let bytes = Int(stride) * Int(height)
  let copy = UnsafeMutableRawPointer.allocate(byteCount: bytes, alignment: 16)
  copy.copyMemory(from: ptr, byteCount: bytes)
  onMain {
    VideoSurface.shared.present(copy, width: width, height: height, stride: stride)
    copy.deallocate()
  }
}

// App Nap throttles a backgrounded/minimized process, which stalls the decode
// and audio loops so playback appears to pause. Hold a `userInitiated` activity
// assertion while playing to keep the process running when the window is hidden
// (the packaged .app also sets NSAppSleepDisabled; this covers `bun run dev`).
private var playbackActivity: NSObjectProtocol?

@_cdecl("gpiux_video_set_playing")
public func gpiux_video_set_playing(_ playing: Int32) {
  onMain {
    if playing != 0 {
      if playbackActivity == nil {
        playbackActivity = ProcessInfo.processInfo.beginActivity(
          options: [.userInitiatedAllowingIdleSystemSleep],
          reason: "Media playback"
        )
      }
    } else if let token = playbackActivity {
      ProcessInfo.processInfo.endActivity(token)
      playbackActivity = nil
    }
  }
}

private var debugBuffer: [CChar] = []

@_cdecl("gpiux_video_debug")
public func gpiux_video_debug() -> UnsafePointer<CChar> {
  let info = onMainSync { VideoSurface.shared.debugInfo() }
  debugBuffer = Array(info.utf8CString)
  return UnsafePointer(debugBuffer)
}
