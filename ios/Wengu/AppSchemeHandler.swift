import UniformTypeIdentifiers
import WebKit

// 用 wengu://app/…… 的网址, 把装在 App 里的网页文件 (copy-web.sh 复制进来的 web 文件夹) 交给网页框。
// 不直接用 file:// 打开: 浏览器不让 file:// 的网页加载 JavaScript 模块, 温故的代码都是模块
final class AppSchemeHandler: NSObject, WKURLSchemeHandler {
  static let scheme = "wengu"
  static let host = "app"

  private let root = Bundle.main.resourceURL!.appendingPathComponent("web", isDirectory: true).standardizedFileURL

  func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
    guard let url = task.request.url else {
      task.didFailWithError(URLError(.badURL))
      return
    }
    var path = url.path
    if path.isEmpty || path.hasSuffix("/") { path += "index.html" }
    let file = root.appendingPathComponent(String(path.drop(while: { $0 == "/" }))).standardizedFileURL
    // 只给 web 文件夹里的文件 (网址里写 ../ 也跑不出去)
    let data = file.path.hasPrefix(root.path + "/") ? try? Data(contentsOf: file) : nil
    let body = data ?? Data("没有这个文件".utf8)
    let response = HTTPURLResponse(
      url: url,
      statusCode: data == nil ? 404 : 200,
      httpVersion: "HTTP/1.1",
      headerFields: [
        "Content-Type": data == nil ? "text/plain; charset=utf-8" : Self.mimeType(file.pathExtension),
        "Content-Length": String(body.count),
        "Cache-Control": "no-cache",
      ]
    )!
    task.didReceive(response)
    task.didReceive(body)
    task.didFinish()
  }

  func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}

  // 类型要对, 不然浏览器不肯把 .js 当模块跑
  static func mimeType(_ ext: String) -> String {
    switch ext.lowercased() {
    case "html": return "text/html; charset=utf-8"
    case "js", "mjs": return "text/javascript; charset=utf-8"
    case "css": return "text/css; charset=utf-8"
    case "json": return "application/json; charset=utf-8"
    case "webmanifest": return "application/manifest+json; charset=utf-8"
    case "svg": return "image/svg+xml"
    case "png": return "image/png"
    default: return UTType(filenameExtension: ext)?.preferredMIMEType ?? "application/octet-stream"
    }
  }
}
