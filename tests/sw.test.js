import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;

function listJs(dir) {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const rel = `${dir}/${name}`;
    if (statSync(join(root, rel)).isDirectory()) return listJs(rel);
    return name.endsWith('.js') ? [rel] : [];
  });
}

test('断网要存的文件: 每个 js 都在, 写的文件都真的有', () => {
  const sw = readFileSync(join(root, 'sw.js'), 'utf8');
  const files = [...sw.matchAll(/^\s+'([^']+)',$/gm)].map((m) => m[1]);
  // 长篇小说一回一个文件、英汉小词典一个字母一个文件 (LAZY 里的文件夹), 不在名单里, 读到才存; 文件夹要真的有, 里面有文件
  const lazy = JSON.parse(/^const LAZY = (\[.*\]);$/m.exec(sw)[1].replace(/'/g, '"'));
  // 国际象棋引擎 (js/vendor/stockfish/) 也是用到才下载: 轻量版的 .js、.wasm 和完整版的外壳
  assert.deepEqual(lazy, ['js/library/xiyouji/', 'js/library/hant/xiyouji/', 'js/endict/', 'js/vendor/stockfish/']);
  for (const d of lazy) assert.ok(readdirSync(join(root, d)).filter((f) => f.endsWith('.js')).length >= ({ 'js/endict/': 26, 'js/vendor/stockfish/': 2 }[d] ?? 100), d);
  for (const f of ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm', 'stockfish-19-single.js', 'COPYING.txt']) assert.ok(statSync(join(root, 'js/vendor/stockfish', f)).isFile(), f);
  for (const js of listJs('js')) if (!lazy.some((d) => js.startsWith(d))) assert.ok(files.includes(js), `sw.js 里少了 ${js}`);
  for (const f of files) assert.ok(!lazy.some((d) => f.startsWith(d)), `${f} 在 LAZY 里, 不用写进名单`);
  for (const f of files) {
    if (f === './') continue;
    assert.ok(statSync(join(root, f)).isFile(), `sw.js 里的 ${f} 不存在`);
  }
  for (const f of ['index.html', 'css/style.css', 'manifest.webmanifest']) assert.ok(files.includes(f));
});

test('manifest 里的图标都在', () => {
  const m = JSON.parse(readFileSync(join(root, 'manifest.webmanifest'), 'utf8'));
  assert.equal(m.name, '温故');
  for (const icon of m.icons) assert.ok(statSync(join(root, icon.src)).isFile(), icon.src);
});
