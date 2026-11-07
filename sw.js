// 断网也能用: 第一次打开时把网页的文件都存下来。
// 有网时先拿新的 (顺便更新存着的), 没网时用存着的。所以不会一直用旧版本。

const CACHE = 'wengu';

// 新加了网页文件要记得写进来 (tests/sw.test.js 会检查)
const FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'icon.svg',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
  'css/style.css',
  'js/aitext.js',
  'js/anki.js',
  'js/app.js',
  'js/arcade.js',
  'js/backup.js',
  'js/blocks.js',
  'js/cardfile.js',
  'js/cardimport.js',
  'js/cardview.js',
  'js/csv.js',
  'js/custom.js',
  'js/diagram.js',
  'js/dict.js',
  'js/dom.js',
  'js/draft.js',
  'js/draftdata.js',
  'js/exam.js',
  'js/examlist.js',
  'js/festival.js',
  'js/games.js',
  'js/gems.js',
  'js/grade.js',
  'js/learn.js',
  'js/library/baijiaxing.js',
  'js/library/books.js',
  'js/library/dizigui.js',
  'js/library/festival-days.js',
  'js/library/festivals.js',
  'js/library/guwen.js',
  'js/library/hant/baijiaxing.js',
  'js/library/hant/dizigui.js',
  'js/library/hant/guwen.js',
  'js/library/hant/lunyu.js',
  'js/library/hant/qianjiashi.js',
  'js/library/hant/qianziwen.js',
  'js/library/hant/sanzijing.js',
  'js/library/hant/shenglvqimeng.js',
  'js/library/hant/songci.js',
  'js/library/hant/tangshi.js',
  'js/library/hant/xiyouji.js',
  'js/library/hant/youxueqionglin.js',
  'js/library/hant/zengguangxianwen.js',
  'js/library/hant/zhuzijiaxun.js',
  'js/library/lunyu.js',
  'js/library/qianjiashi.js',
  'js/library/qianziwen.js',
  'js/library/readings.js',
  'js/library/sanzijing.js',
  'js/library/shenglvqimeng.js',
  'js/library/songci.js',
  'js/library/tangshi.js',
  'js/library/xiyouji.js',
  'js/library/yizhu/guwen.js',
  'js/library/yizhu/qianjiashi.js',
  'js/library/yizhu/songci.js',
  'js/library/yizhu/tangshi.js',
  'js/library/youxueqionglin.js',
  'js/library/zengguangxianwen.js',
  'js/library/zhuzijiaxun.js',
  'js/media.js',
  'js/merge.js',
  'js/mistakeimport.js',
  'js/mistakes.js',
  'js/optimize-worker.js',
  'js/optimize.js',
  'js/parse.js',
  'js/pet.js',
  'js/pinart.js',
  'js/pinball.js',
  'js/pinball3d.js',
  'js/pindmd.js',
  'js/pinsound.js',
  'js/plan.js',
  'js/platform.js',
  'js/print.js',
  'js/qr.js',
  'js/questions.js',
  'js/quiz.js',
  'js/quizlet.js',
  'js/reading.js',
  'js/recorder.js',
  'js/revlog.js',
  'js/rich.js',
  'js/scope.js',
  'js/search.js',
  'js/share.js',
  'js/sound.js',
  'js/speech.js',
  'js/sqlite.js',
  'js/srs.js',
  'js/stats.js',
  'js/store.js',
  'js/sync.js',
  'js/unlock.js',
  'js/vendor/fsrs.js',
  'js/vendor/fzstd.js',
  'js/vendor/qrcode.js',
  'js/vendor/three.js',
  'js/views/aiprompt.js',
  'js/views/arcade.js',
  'js/views/blast.js',
  'js/views/blocks.js',
  'js/views/cardedit.js',
  'js/views/cards.js',
  'js/views/diagram.js',
  'js/views/draft.js',
  'js/views/edit.js',
  'js/views/exam.js',
  'js/views/examlist.js',
  'js/views/export.js',
  'js/views/fileimport.js',
  'js/views/folder.js',
  'js/views/gamehub.js',
  'js/views/gamequiz.js',
  'js/views/gameshell.js',
  'js/views/gems.js',
  'js/views/home.js',
  'js/views/learn.js',
  'js/views/match.js',
  'js/views/menu.js',
  'js/views/mistakeedit.js',
  'js/views/mistakeimport.js',
  'js/views/mistakereview.js',
  'js/views/mistakes.js',
  'js/views/optimize.js',
  'js/views/pet.js',
  'js/views/pinball.js',
  'js/views/plan.js',
  'js/views/quizlet.js',
  'js/views/read.js',
  'js/views/review.js',
  'js/views/search.js',
  'js/views/set.js',
  'js/views/settings.js',
  'js/views/share.js',
  'js/views/stats.js',
  'js/views/sync.js',
  'js/views/wordle.js',
  'js/wordle.js',
  'js/xlsx.js',
  'js/zip.js',
];

// 很大的书 (长篇小说) 一回一个文件, 第一次打开时不全存 (几 MB): 读过哪回就存哪回, 换版本时也不删。
// App 里照样全部放进去 (ios/copy-web.sh 照这一行复制整个文件夹)
const LAZY = ['js/library/xiyouji/', 'js/library/hant/xiyouji/'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(FILES))
      .then(() => self.skipWaiting()),
  );
});

// 换新版本时: 存着的不在名单里的 (以前版本的文件、带 ? 的网址) 删掉, 不会越存越多; 读过的小说章节 (LAZY) 留着
self.addEventListener('activate', (event) => {
  const keep = new Set(FILES.map((f) => new URL(f, self.location).href));
  const lazy = LAZY.map((d) => new URL(d, self.location).href);
  event.waitUntil(
    caches
      .open(CACHE)
      .then(async (cache) => {
        for (const req of await cache.keys()) if (!keep.has(req.url) && !lazy.some((d) => req.url.startsWith(d) && !req.url.includes('?'))) await cache.delete(req);
      })
      .catch(() => {})
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  // no-cache: 每次都问一下网站有没有新的 (没变只回一句「没变」, 很快)。
  // 不加的话浏览器可能直接用自己存的, 刚更新完的十分钟里还拿到旧版本
  event.respondWith(
    fetch(new Request(req, { cache: 'no-cache' }))
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(async () => (await caches.match(req, { ignoreSearch: true })) ?? (await caches.match('index.html')) ?? Response.error()),
  );
});
