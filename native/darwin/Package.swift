// swift-tools-version: 5.9
import PackageDescription

let package = Package(
  name: "GpiuxVideoLayer",
  platforms: [.macOS(.v12)],
  targets: [
    .target(
      name: "GpiuxVideoLayer",
      path: ".",
      exclude: ["Tests", "Package.swift", "video-layer.test.ts"],
      sources: ["video-layer.swift"],
      linkerSettings: [
        .linkedFramework("AppKit"),
        .linkedFramework("AVFoundation"),
        .linkedFramework("CoreVideo"),
        .linkedFramework("QuartzCore"),
      ]
    ),
    .testTarget(
      name: "VideoLayerTests",
      dependencies: ["GpiuxVideoLayer"],
      path: "Tests/VideoLayerTests"
    ),
  ]
)
