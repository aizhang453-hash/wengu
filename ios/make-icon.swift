// 画 App 的图标 (1024×1024, 不透明): swift ios/make-icon.swift
// 跟 icon.svg 一个样子: 印章红的底、白框、宋体的「温」。
// iPhone / iPad 会自己把图标切成圆角, 所以红色铺满, 白框往里收, 不被切到
import AppKit

let size = 1024.0
let out = URL(fileURLWithPath: #filePath).deletingLastPathComponent().appendingPathComponent("Wengu/Assets.xcassets/AppIcon.appiconset/icon-1024.png")

// 不带透明度的画布 (App Store 不收带透明度的图标)
let cg = CGContext(
  data: nil, width: Int(size), height: Int(size), bitsPerComponent: 8, bytesPerRow: 0,
  space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(cgContext: cg, flipped: false)

NSColor(srgbRed: 0xB8 / 255, green: 0x37 / 255, blue: 0x2E / 255, alpha: 1).setFill()
NSRect(x: 0, y: 0, width: size, height: size).fill()

let inset = 176.0
let frame = NSBezierPath(roundedRect: NSRect(x: inset, y: inset, width: size - 2 * inset, height: size - 2 * inset), xRadius: 84, yRadius: 84)
frame.lineWidth = 36
NSColor(white: 1, alpha: 0.85).setStroke()
frame.stroke()

// 按字真正画出来的那块居中 (不是按一行字的高度)
let font = NSFont(name: "STSongti-SC-Bold", size: 460) ?? NSFont.boldSystemFont(ofSize: 460)
let line = CTLineCreateWithAttributedString(NSAttributedString(string: "温", attributes: [
  .font: font, NSAttributedString.Key(kCTForegroundColorAttributeName as String): CGColor.white,
]))
let ink = CTLineGetImageBounds(line, cg)
cg.textPosition = CGPoint(x: (size - ink.width) / 2 - ink.minX, y: (size - ink.height) / 2 - ink.minY)
CTLineDraw(line, cg)

NSGraphicsContext.restoreGraphicsState()
let png = NSBitmapImageRep(cgImage: cg.makeImage()!).representation(using: .png, properties: [:])!
try! png.write(to: out)
print("画好了: \(out.path)")
