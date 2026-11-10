// 把 sw.js 里「断网要存的文件」名单更新成现在所有的网页文件: npm run sw
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const listJs = (dir) =>
  readdirSync(join(root, dir))
    .sort()
    .flatMap((name) => {
      const rel = `${dir}/${name}`;
      if (statSync(join(root, rel)).isDirectory()) return listJs(rel);
      return name.endsWith('.js') ? [rel] : [];
    });

const sw = readFileSync(join(root, 'sw.js'), 'utf8');
// 读到才存的文件夹 (sw.js 的 LAZY: 长篇小说一回一个文件) 不写进名单
const lazy = JSON.parse((/^const LAZY = (\[.*\]);$/m.exec(sw)?.[1] ?? '[]').replace(/'/g, '"'));
const files = ['./', 'index.html', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'img/guardian-powered-black.png', 'img/guardian-powered-white.png', 'css/style.css', ...listJs('js').filter((f) => !lazy.some((d) => f.startsWith(d)))];
const next = sw.replace(/const FILES = \[[\s\S]*?\];/, `const FILES = [\n${files.map((f) => `  '${f}',`).join('\n')}\n];`);
writeFileSync(join(root, 'sw.js'), next);
console.log(`sw.js: ${files.length} 个文件`);
