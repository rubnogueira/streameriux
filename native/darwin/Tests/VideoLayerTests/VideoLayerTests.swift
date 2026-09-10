import AppKit
import GpiuxVideoLayer
import XCTest

private func enqueuedCount(_ debug: String) -> Int? {
  guard let marker = debug.range(of: "enqueued=") else { return nil }
  let tail = debug[marker.upperBound...]
  return Int(tail.prefix(while: { $0.isNumber }))
}

private func debugString() -> String {
  String(cString: gpiux_video_debug())
}

private func spinMainRunLoop(seconds: TimeInterval = 0.05) {
  RunLoop.main.run(until: Date(timeIntervalSinceNow: seconds))
}

private func makeHostWindow() -> NSWindow {
  let window = NSWindow(
    contentRect: NSRect(x: 0, y: 0, width: 640, height: 360),
    styleMask: [.titled, .closable, .miniaturizable],
    backing: .buffered,
    defer: false
  )
  window.title = "GpiuxVideoLayerTests"
  let content = NSView(frame: NSRect(x: 0, y: 0, width: 640, height: 360))
  window.contentView = content
  window.makeKeyAndOrderFront(nil)
  spinMainRunLoop()
  return window
}

final class VideoLayerTests: XCTestCase {
  private static var hostWindow: NSWindow?
  private static var configuredApp = false

  override func setUp() {
    super.setUp()
    if !Self.configuredApp {
      NSApplication.shared.setActivationPolicy(.accessory)
      Self.configuredApp = true
    }
    if Self.hostWindow == nil {
      Self.hostWindow = makeHostWindow()
    }
    gpiux_video_detach()
    gpiux_video_set_playing(0)
    spinMainRunLoop()
  }

  override func tearDown() {
    gpiux_video_detach()
    gpiux_video_set_playing(0)
    spinMainRunLoop()
    super.tearDown()
  }

  override class func tearDown() {
    gpiux_video_detach()
    gpiux_video_set_playing(0)
    hostWindow?.orderOut(nil)
    hostWindow?.close()
    hostWindow = nil
    super.tearDown()
  }

  func testDebugBeforeAttach() {
    XCTAssertTrue(debugString().contains("attached=false"))
  }

  func testAttachDetachAndReattach() {
    XCTAssertEqual(gpiux_video_attach(), 1)
    XCTAssertTrue(debugString().contains("attached=true"))

    gpiux_video_set_rect(10, 20, 100, 80)
    spinMainRunLoop()
    XCTAssertTrue(debugString().contains("frame=[10,"))

    XCTAssertEqual(gpiux_video_attach(), 1)

    gpiux_video_detach()
    spinMainRunLoop()
    XCTAssertTrue(debugString().contains("attached=false"))
  }

  func testSetRectNoOpWithoutHost() {
    gpiux_video_set_rect(0, 0, 10, 10)
    spinMainRunLoop()
    XCTAssertTrue(debugString().contains("attached=false"))
  }

  func testSetHiddenAndFitModes() {
    XCTAssertEqual(gpiux_video_attach(), 1)

    gpiux_video_set_fit(0)
    gpiux_video_set_fit(1)
    gpiux_video_set_fit(2)
    gpiux_video_set_fit(99)
    spinMainRunLoop()

    gpiux_video_set_hidden(1)
    spinMainRunLoop()
    gpiux_video_set_hidden(0)
    spinMainRunLoop()
  }

  func testPresentFrameUpdatesEnqueueCount() {
    XCTAssertEqual(gpiux_video_attach(), 1)
    gpiux_video_set_rect(0, 0, 640, 360)

    let width: Int32 = 4
    let height: Int32 = 2
    let rowBytes = Int(width) * 4
    let pixels = [UInt8](repeating: 0xFF, count: rowBytes * Int(height))
    pixels.withUnsafeBytes { raw in
      gpiux_video_present(raw.baseAddress!, width, height, Int32(rowBytes))
    }
    spinMainRunLoop(seconds: 0.1)

    let after = debugString()
    XCTAssertTrue(after.contains("enqueued=1"), after)

    let padded = [UInt8](repeating: 0x80, count: (rowBytes + 8) * Int(height))
    let paddedStride = rowBytes + 8
    padded.withUnsafeBytes { raw in
      gpiux_video_present(raw.baseAddress!, width, height, Int32(paddedStride))
    }
    spinMainRunLoop(seconds: 0.1)
    XCTAssertTrue(debugString().contains("enqueued=2"))
  }

  func testPresentIgnoresNonPositiveDimensions() {
    XCTAssertEqual(gpiux_video_attach(), 1)
    let before = enqueuedCount(debugString())
    var byte: UInt8 = 0
    withUnsafeBytes(of: &byte) { raw in
      gpiux_video_present(raw.baseAddress!, 0, 1, 4)
      gpiux_video_present(raw.baseAddress!, 1, 0, 4)
    }
    spinMainRunLoop()
    XCTAssertEqual(enqueuedCount(debugString()), before)
  }

  func testPlaybackActivityAssertion() {
    gpiux_video_set_playing(1)
    spinMainRunLoop()
    gpiux_video_set_playing(1)
    spinMainRunLoop()
    gpiux_video_set_playing(0)
    spinMainRunLoop()
    gpiux_video_set_playing(0)
    spinMainRunLoop()
  }
}
