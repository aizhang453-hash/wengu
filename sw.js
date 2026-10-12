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
  'js/app.js',
  'js/backup.js',
  'js/blocks.js',
  'js/cardview.js',
  'js/dom.js',
  'js/exam.js',
  'js/games.js',
  'js/gems.js',
  'js/grade.js',
  'js/learn.js',
  'js/media.js',
  'js/parse.js',
  'js/print.js',
  'js/questions.js',
  'js/recorder.js',
  'js/rich.js',
  'js/search.js',
  'js/sound.js',
  'js/speech.js',
  'js/srs.js',
  'js/store.js',
  'js/views/blast.js',
  'js/views/blocks.js',
  'js/views/cards.js',
  'js/views/edit.js',
  'js/views/exam.js',
  'js/views/folder.js',
  'js/views/gamelist.js',
  'js/views/gamequiz.js',
  'js/views/gems.js',
  'js/views/home.js',
  'js/views/learn.js',
  'js/views/match.js',
  'js/views/review.js',
  'js/views/search.js',
  'js/views/set.js',
  'js/views/wordle.js',
  'js/wordle.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(FILES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
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
