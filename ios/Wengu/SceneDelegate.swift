import UIKit

// App 只有一个窗口 (Info.plist 里写了不开多个窗口: 两个窗口同时改卡片会互相盖掉)
final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?
  private let web = WebViewController()

  func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
    guard let windowScene = scene as? UIWindowScene else { return }
    // 点了 wengu://open#/…… 的链接才打开的 App
    if let url = connectionOptions.urlContexts.first?.url { web.open(url) }
    let window = UIWindow(windowScene: windowScene)
    window.rootViewController = web
    window.tintColor = UIColor(named: "AccentColor")
    window.makeKeyAndVisible()
    self.window = window
  }

  // App 开着的时候点了 wengu://open#/…… 的链接
  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    if let url = URLContexts.first?.url { web.open(url) }
  }
}
