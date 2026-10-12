// 检查源代码里容易犯的错
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const files = (dir) =>
  readdirSync(join(root, dir)).flatMap((name) => {
    const rel = `${dir}/${name}`;
    return statSync(join(root, rel)).isDirectory() ? files(rel) : rel.endsWith('.js') ? [rel] : [];
  });

// 浏览器自带的 replaceChildren 会把 null 显示成「null」这几个字 (宝石、Wordle 都出过这个 bug),
// 可能没有东西的时候要用 dom.js 的 fill
test('replaceChildren 的参数里不能直接放 null', () => {
  const bad = [];
  for (const f of files('js')) {
    const s = readFileSync(join(root, f), 'utf8');
    for (const m of s.matchAll(/\.replaceChildren\(/g)) {
      let depth = 1;
      let j = m.index + m[0].length;
      let top = '';
      let d = 0;
      while (depth && j < s.length) {
        const ch = s[j++];
        if (ch === '(') depth++;
        if (ch === ')') depth--;
        if (!depth) break;
        if ('([{'.includes(ch)) d++;
        if (d === 0) top += ch;
        if (')]}'.includes(ch)) d--;
      }
      if (/\bnull\b/.test(top)) bad.push(`${f}:${s.slice(0, m.index).split('\n').length}`);
    }
  }
  assert.deepEqual(bad, []);
});
