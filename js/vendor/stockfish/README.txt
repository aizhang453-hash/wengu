Stockfish 19 (国际象棋引擎, 「干鳕鱼」) 的网页版 —— 轻量、单线程的那一种 (不用特别的网站设置, GitHub Pages 和 iPad App 里都能跑)。

  stockfish-19-lite-single.js   引擎的外壳 (在 Web Worker 里跑, 用 UCI 协议说话)
  stockfish-19-lite-single.wasm 引擎本身 (编译成 WebAssembly)
  stockfish-19-single.js        完整版的外壳 (设置里换成完整版才用; 完整版的 stockfish-19-single.wasm 有 99 MB,
                                不放在仓库里, 换的时候从 unpkg.com 下载 npm 包 stockfish@19.0.1 里的那个, 核对指纹后存在浏览器里)
  COPYING.txt                   GNU 通用公共许可证第 3 版 (GPL-3.0) 原文

来源: npm 包 stockfish@19.0.1 的 bin/ 里原样拿来的, 没有改动。
  sha256 (base64): js   zLEw1/8pQIUxxH2Fmkn5HVnU9ILQWlPrGjIxpPYkyRo=
                   wasm 7k8RW9stMsrflsraEEoFtewlfXrW9XWCGQtJvHHwlt4=
  完整版           js   gHHe6HMS90gFqFnekz4aHvRlV5qxpR+9WXOIzc6dRE0=
                   wasm mRvt4vJT67CP8B/MSCcPS5yOZrEtW9X41vUus+Ozp0A=
源代码:
  Stockfish.js (Nathan Rugg 编译的网页版)  https://github.com/nmrugg/stockfish.js/tree/v19.0.1
  Stockfish (官方)                         https://github.com/official-stockfish/Stockfish

这两个文件按 GPL-3.0 发布 (跟温故自己的代码分开, 温故只是用 postMessage 跟它说话)。
