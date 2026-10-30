import SafariServices
import UIKit
import WebKit

// 整个 App 就是一个网页框, 打开装在 App 里的温故网页。
// 浏览器替网页做、网页框不会自己做的事, 在这里补上:
// 确认框、导出文件 (下载)、打印、打开外面的网页、录音的权限、别的 App 让温故打开某一页
final class WebViewController: UIViewController {
  static let exportsDir = FileManager.default.temporaryDirectory.appendingPathComponent("exports", isDirectory: true)

  private var webView: WKWebView!
  private let dimView = UIView() // 网页弹窗时, 把网页上下露出来的两条也调暗 (js/platform.js 的 watchModals)
  private var pendingRoute: String? // 网页还没打开时就要去的页 (#/share/……)
  private var downloads: [ObjectIdentifier: URL] = [:]

  // 外面让 App 打开的链接: wengu://open#/share/……、wengu://open#/sync/connect/……
  func open(_ url: URL) {
    guard url.scheme == AppSchemeHandler.scheme, url.host == "open" else { return }
    let route = "#" + (url.fragment ?? "/")
    guard let webView else {
      pendingRoute = route
      return
    }
    webView.evaluateJavaScript("location.hash = \(Self.jsString(route))")
  }

  override func loadView() {
    view = UIView()
    view.backgroundColor = UIColor(named: "Background")
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    let config = WKWebViewConfiguration()
    config.setURLSchemeHandler(AppSchemeHandler(), forURLScheme: AppSchemeHandler.scheme)
    config.allowsInlineMediaPlayback = true
    config.mediaTypesRequiringUserActionForPlayback = [] // 朗读、录音不用先点一下才能出声
    // 不开网页全屏: 开了的话系统会在上面打出 App 里的网址 (wengu://app/……)。
    // 网页那边看到不能全屏, 就不放全屏按钮 (App 本来就没有地址栏)
    config.userContentController.addUserScript(WKUserScript(source: bootScript, injectionTime: .atDocumentStart, forMainFrameOnly: true))
    config.userContentController.add(WeakMessageHandler(self), name: "wengu")

    webView = WKWebView(frame: .zero, configuration: config)
    webView.isOpaque = false // 网页还没画出来时露出底色, 不闪白
    webView.backgroundColor = UIColor(named: "Background")
    webView.scrollView.contentInsetAdjustmentBehavior = .never
    webView.allowsLinkPreview = false
    webView.allowsBackForwardNavigationGestures = true // 从左边往右滑 = 返回
    webView.navigationDelegate = self
    webView.uiDelegate = self
    #if DEBUG
      if #available(iOS 16.4, *) { webView.isInspectable = true } // Mac 上的 Safari 能检查 App 里的网页
    #endif

    // 调暗用的一层铺满整个屏幕, 垫在网页下面: 只有网页上下露出来的地方看得见
    dimView.frame = view.bounds
    dimView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    dimView.alpha = 0
    dimView.isUserInteractionEnabled = false
    view.addSubview(dimView)

    // 网页放在安全区里: 不钻到刘海、状态栏、底下的横条下面, 那些地方露出和网页一样的底色
    webView.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(webView)
    let safe = view.safeAreaLayoutGuide
    NSLayoutConstraint.activate([
      webView.topAnchor.constraint(equalTo: safe.topAnchor),
      webView.bottomAnchor.constraint(equalTo: safe.bottomAnchor),
      webView.leadingAnchor.constraint(equalTo: safe.leadingAnchor),
      webView.trailingAnchor.constraint(equalTo: safe.trailingAnchor),
    ])

    var start = URLComponents()
    start.scheme = AppSchemeHandler.scheme
    start.host = AppSchemeHandler.host
    start.path = "/index.html"
    start.fragment = pendingRoute.map { String($0.dropFirst()) }
    pendingRoute = nil
    webView.load(URLRequest(url: start.url!))
  }

  // 网页打开前先放进去的: 告诉网页它在 App 里 (js/platform.js、css 里的 html.in-app), 打印交给 App。
  // 加一个空的 touchstart: 不然 iPhone 上按下按钮时 :active (按下变淡) 不生效
  private var bootScript: String {
    let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? ""
    var js = """
      window.wenguApp = Object.freeze({ platform: 'ios', version: \(Self.jsString(version)) });
      window.print = () => webkit.messageHandlers.wengu.postMessage({ type: 'print' });
      document.documentElement.classList.add('in-app');
      document.addEventListener('touchstart', () => {}, { passive: true });
      """
    #if DEBUG
      js += Self.debugScript
    #endif
    return js
  }

  #if DEBUG
    // 调试版: 网页里的出错信息打到 Xcode 的输出里, 打开时再报一下这个网页框支持什么
    private static let debugScript = """
      (() => {
        const post = (level, text) => { try { webkit.messageHandlers.wengu.postMessage({ type: 'log', level, text: String(text) }); } catch {} };
        for (const level of ['error', 'warn']) {
          const orig = console[level];
          console[level] = (...args) => { post(level, args.map((a) => (a && a.stack) || a).join(' ')); orig.apply(console, args); };
        }
        addEventListener('error', (e) => post('error', `${e.message} @ ${e.filename}:${e.lineno}`));
        addEventListener('unhandledrejection', (e) => post('error', `Promise: ${(e.reason && e.reason.stack) || e.reason}`));
        addEventListener('load', () => post('info', JSON.stringify({
          secure: isSecureContext, subtle: Boolean(crypto.subtle), mic: Boolean(navigator.mediaDevices?.getUserMedia),
          recorder: typeof MediaRecorder !== 'undefined', clipboard: Boolean(navigator.clipboard), share: Boolean(navigator.share),
          idb: typeof indexedDB !== 'undefined', speech: 'speechSynthesis' in window, width: innerWidth, height: innerHeight,
        })));
      })();
      """
  #endif

  static func jsString(_ text: String) -> String {
    let data = try! JSONSerialization.data(withJSONObject: text, options: .fragmentsAllowed)
    return String(decoding: data, as: UTF8.self)
  }

  // 弹窗盖在最上面那层上 (比如开着网页窗口时又要弹确认框)
  @discardableResult
  private func presentOnTop(_ controller: UIViewController) -> Bool {
    var top: UIViewController = self
    while let next = top.presentedViewController, !next.isBeingDismissed { top = next }
    guard top.viewIfLoaded?.window != nil else { return false }
    if let popover = controller.popoverPresentationController { // iPad 上分享菜单是个气泡, 要说从哪冒出来
      popover.sourceView = view
      popover.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 1, height: 1)
      popover.permittedArrowDirections = []
    }
    top.present(controller, animated: true)
    return true
  }

  private func showMessage(_ message: String) {
    let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
    alert.addAction(UIAlertAction(title: "好", style: .default))
    presentOnTop(alert)
  }

  // 外面的网页 (词典、GitHub) 在 App 里弹一个浏览器窗口打开, 别的 (邮件之类) 交给系统
  private func openExternal(_ url: URL) {
    if ["http", "https"].contains(url.scheme?.lowercased() ?? "") {
      let safari = SFSafariViewController(url: url)
      safari.preferredControlTintColor = UIColor(named: "AccentColor")
      presentOnTop(safari)
    } else {
      UIApplication.shared.open(url)
    }
  }

  private func shareFile(_ file: URL) {
    let sheet = UIActivityViewController(activityItems: [file], applicationActivities: nil)
    sheet.completionWithItemsHandler = { _, _, _, _ in
      try? FileManager.default.removeItem(at: file.deletingLastPathComponent())
    }
    presentOnTop(sheet)
  }

  // 打印: 关掉打印窗口时告诉网页 (js/print.js 等 afterprint 再收起要打印的东西)
  private func printPage() {
    let finished = { [weak self] in
      _ = self?.webView.evaluateJavaScript("dispatchEvent(new Event('afterprint'))")
    }
    guard UIPrintInteractionController.isPrintingAvailable else {
      finished()
      return
    }
    let printer = UIPrintInteractionController.shared
    let info = UIPrintInfo.printInfo()
    info.jobName = "温故"
    info.outputType = .general
    printer.printInfo = info
    printer.printFormatter = webView.viewPrintFormatter()
    let done: UIPrintInteractionController.CompletionHandler = { _, _, _ in finished() }
    if traitCollection.userInterfaceIdiom == .pad {
      printer.present(from: CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 1, height: 1), in: view, animated: true, completionHandler: done)
    } else {
      printer.present(animated: true, completionHandler: done)
    }
  }
}

// MARK: 网页发来的消息 (window.print、调试版的出错信息)

extension WebViewController: WKScriptMessageHandler {
  func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
    guard message.frameInfo.isMainFrame, let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
    switch type {
    case "print":
      printPage()
    case "dim":
      // color: [红, 绿, 蓝, 透明度], 跟网页窗口后面那层灰色一样; 没有 = 窗口都关了
      var alpha: CGFloat = 0
      if let c = (body["color"] as? [NSNumber])?.map({ CGFloat($0.doubleValue) }), c.count == 4 {
        dimView.backgroundColor = UIColor(red: c[0] / 255, green: c[1] / 255, blue: c[2] / 255, alpha: 1)
        alpha = c[3]
      }
      UIView.animate(withDuration: 0.15) { self.dimView.alpha = alpha }
    case "log":
      #if DEBUG
        NSLog("[网页 %@] %@", body["level"] as? String ?? "", body["text"] as? String ?? "")
      #endif
    default:
      break
    }
  }
}

// 网页框会一直拿着消息的接收者, 中间隔一层, 不然两个互相拿着谁都放不掉
private final class WeakMessageHandler: NSObject, WKScriptMessageHandler {
  weak var target: WKScriptMessageHandler?
  init(_ target: WKScriptMessageHandler) { self.target = target }
  func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
    target?.userContentController(userContentController, didReceive: message)
  }
}

// MARK: 去哪个网址、下载

extension WebViewController: WKNavigationDelegate {
  func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping @MainActor @Sendable (WKNavigationActionPolicy) -> Void) {
    // <a download> (导出、备份): 让网页框下载, 下好了弹分享菜单
    if navigationAction.shouldPerformDownload {
      decisionHandler(.download)
      return
    }
    guard let url = navigationAction.request.url else {
      decisionHandler(.allow)
      return
    }
    let scheme = url.scheme?.lowercased() ?? ""
    if scheme == AppSchemeHandler.scheme {
      if url.host == "open" { // 网页里点了 wengu://open#/…… (一般不会)
        open(url)
        decisionHandler(.cancel)
      } else {
        decisionHandler(.allow)
      }
    } else if ["blob", "data", "about"].contains(scheme) {
      decisionHandler(.allow)
    } else if ["http", "https"].contains(scheme), navigationAction.targetFrame?.isMainFrame == false {
      decisionHandler(.allow) // 网页里嵌的小框
    } else {
      openExternal(url)
      decisionHandler(.cancel)
    }
  }

  func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse, decisionHandler: @escaping @MainActor @Sendable (WKNavigationResponsePolicy) -> Void) {
    decisionHandler(navigationResponse.canShowMIMEType ? .allow : .download)
  }

  func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
    download.delegate = self
  }

  func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
    download.delegate = self
  }

  // 网页框在后台被系统关掉了 (内存不够), 回来时重新打开
  func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
    webView.reload()
  }
}

extension WebViewController: WKDownloadDelegate {
  func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping @MainActor @Sendable (URL?) -> Void) {
    let dir = Self.exportsDir.appendingPathComponent(UUID().uuidString, isDirectory: true)
    do {
      try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    } catch {
      completionHandler(nil)
      return
    }
    let file = dir.appendingPathComponent(suggestedFilename.isEmpty ? "温故导出" : suggestedFilename)
    downloads[ObjectIdentifier(download)] = file
    completionHandler(file)
  }

  func downloadDidFinish(_ download: WKDownload) {
    guard let file = downloads.removeValue(forKey: ObjectIdentifier(download)) else { return }
    shareFile(file) // 「存储到文件」、隔空投送、发给别的 App
  }

  func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
    downloads.removeValue(forKey: ObjectIdentifier(download))
    showMessage("文件未能导出：\(error.localizedDescription)")
  }
}

// MARK: 弹窗、新窗口、麦克风

extension WebViewController: WKUIDelegate {
  // target="_blank" 的链接 (词典、GitHub)
  func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
    if let url = navigationAction.request.url { openExternal(url) }
    return nil
  }

  func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping @MainActor @Sendable () -> Void) {
    let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
    alert.addAction(UIAlertAction(title: "好", style: .default) { _ in completionHandler() })
    if !presentOnTop(alert) { completionHandler() }
  }

  // confirm(): 删除前问一句「确定吗」
  func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping @MainActor @Sendable (Bool) -> Void) {
    let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
    alert.addAction(UIAlertAction(title: "取消", style: .cancel) { _ in completionHandler(false) })
    alert.addAction(UIAlertAction(title: "确定", style: .default) { _ in completionHandler(true) })
    if !presentOnTop(alert) { completionHandler(false) }
  }

  func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping @MainActor @Sendable (String?) -> Void) {
    let alert = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
    alert.addTextField { $0.text = defaultText }
    alert.addAction(UIAlertAction(title: "取消", style: .cancel) { _ in completionHandler(nil) })
    alert.addAction(UIAlertAction(title: "确定", style: .default) { _ in completionHandler(alert.textFields?.first?.text ?? "") })
    if !presentOnTop(alert) { completionHandler(nil) }
  }

  // 录音: 温故自己的网页要用麦克风就给 (系统第一次还会问一遍用户)
  @available(iOS 15.0, *)
  func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping @MainActor @Sendable (WKPermissionDecision) -> Void) {
    decisionHandler(origin.protocol == AppSchemeHandler.scheme ? .grant : .deny)
  }
}
