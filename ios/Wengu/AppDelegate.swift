import UIKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
  func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
    // 上次导出、分享出去的临时文件, 没删掉的清掉
    try? FileManager.default.removeItem(at: WebViewController.exportsDir)
    return true
  }
}
