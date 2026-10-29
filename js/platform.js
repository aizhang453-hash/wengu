// 温故装在 iPhone / iPad 的 App 里时 (ios/ 文件夹), App 会在网页打开前放一个 window.wenguApp。
// App 里的网址 (wengu://app/……) 别的设备打不开, 所以分享链接、同步二维码要用网站的网址。

export const SITE = 'https://aizhang453-hash.github.io/wengu/';

export function inApp(win = globalThis) {
  return Boolean(win.wenguApp);
}

// 给别的设备打开的链接用的网址
export function siteBase(win = globalThis) {
  return inApp(win) ? SITE : `${win.location.origin}${win.location.pathname}`;
}

// 在 iPhone / iPad 的浏览器 (或添加到主屏幕的网页) 里, 不在 App 里。
// iPad 的 Safari 默认装成 Mac (userAgent 里是 Macintosh), 靠能不能多点触摸分出来
export function onIosWeb(win = globalThis) {
  if (inApp(win) || !win.navigator) return false;
  const ua = win.navigator.userAgent ?? '';
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && win.navigator.maxTouchPoints > 1);
}

// 让装好的 App 打开某一页 (route 是 #/share/…… 这样的)
export function appLink(route) {
  return `wengu://open${route}`;
}

// App 里: 弹出窗口 (对话框、菜单) 时告诉 App 窗口后面那层灰色是什么颜色,
// App 把网页上下露出来的两条 (状态栏、底下的横条) 也调成一样暗; 窗口都关了再调回来
export function watchModals(win = globalThis) {
  let last;
  const check = () => {
    const dialog = openModal(win.document);
    const color = dialog ? (backdropColor(win.getComputedStyle(dialog, '::backdrop').backgroundColor) ?? [20, 18, 15, 0.55]) : null;
    if (JSON.stringify(color) === JSON.stringify(last)) return;
    last = color;
    win.webkit?.messageHandlers?.wengu?.postMessage({ type: 'dim', color });
  };
  new win.MutationObserver(check).observe(win.document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['open'] });
}

function openModal(doc) {
  try {
    return doc.querySelector('dialog:modal');
  } catch {
    return doc.querySelector('dialog[open]'); // 老的 iOS 不认 :modal
  }
}

// 'rgba(20, 18, 15, 0.55)'、'rgb(20 18 15 / 55%)' → [20, 18, 15, 0.55]; 透明的 → null
export function backdropColor(css) {
  const n = String(css ?? '').match(/[\d.]+%?/g);
  if (!n || n.length < 3) return null;
  const [r, g, b] = n.slice(0, 3).map(Number);
  const a = n[3] === undefined ? 1 : n[3].endsWith('%') ? parseFloat(n[3]) / 100 : Number(n[3]);
  return a > 0 ? [r, g, b, a] : null;
}
