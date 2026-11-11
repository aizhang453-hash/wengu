import AVFoundation
import UIKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {
  func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
    // 上次导出、分享出去的临时文件, 没删掉的清掉
    try? FileManager.default.removeItem(at: WebViewController.exportsDir)
    // 广播 (v1.78): 锁屏、切到别的 App 时接着响 (还要 Info.plist 的 UIBackgroundModes: audio)
    try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
    return true
  }
}
