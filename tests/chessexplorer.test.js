// 开局浏览器 (v1.86): 局面的钥匙、小文件怎么读、盘数怎么写; 算统计的程序怎么读棋谱、分数怎么分档
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { Chess } from '../js/vendor/chess.js';
import { exKey, parseShard, EX_DBS } from '../js/chessexplorer.js';
import { countText } from '../js/views/chess.js';
import { sanTokens, ccFromLichess, bandOf } from '../tools/chess-explorer.mjs';

test('开局浏览器: 局面的钥匙不看步数, 分到 256 个小文件里', () => {
  const g = new Chess();
  g.move('e4');
  const a = exKey(g.fen());
  assert.deepEqual(exKey(g.fen().replace(/ 0 1$/, ' 7 30')), a);
  assert.match(a.shard, /^[0-9a-f]{2}$/);
  assert.match(a.key, /^[0-9a-z]{5,7}[0-9a-z]{4}$/);
  // 走法次序不同、到了同一个局面: 钥匙一样
  const x = new Chess();
  ['e4', 'e5', 'Nf3', 'Nc6'].forEach((m) => x.move(m));
  const y = new Chess();
  ['Nf3', 'Nc6', 'e4', 'e5'].forEach((m) => y.move(m));
  assert.equal(exKey(x.fen()).key, exKey(y.fen()).key);
  assert.notEqual(exKey(x.fen()).key, a.key);
});

test('开局浏览器: 读小文件; 盘数写成中文的样子', () => {
  const m = parseShard('abc1234 e2e4,183000,48,45 d2d4,101000,49,44\nzz9 g1f3,8,50,25');
  assert.deepEqual(m.get('abc1234')[0], { uci: 'e2e4', n: 183000, w: 48, b: 45 });
  assert.equal(m.get('zz9').length, 1);
  assert.equal(parseShard('').size, 0);
  assert.equal(countText(8), '8');
  assert.equal(countText(12345), '1.2 万');
  assert.equal(countText(1830000), '183 万');
  assert.equal(countText(20000), '2 万');
  assert.deepEqual(EX_DBS.map((d) => d.key), ['master', 'hi', 'mid', 'lo']);
});

test('算统计的程序: 读棋谱的走法 (去掉注释、变着、记号); Lichess 的分换成 chess.com 的分', () => {
  assert.deepEqual(sanTokens('1. e4 { [%eval 0.18] [%clk 1:30:58] } 1... c5 2. Nc3?! (2. Nf3 d6 (2... Nc6)) 2... a6!! $1 3.g3 1-0'), ['e4', 'c5', 'Nc3', 'a6', 'g3']);
  assert.deepEqual(sanTokens('1.e4 e5 2.Nf3 Nc6', 3), ['e4', 'e5', 'Nf3']);
  assert.equal(Math.round(ccFromLichess(1290)), 815);
  assert.equal(Math.round(ccFromLichess(2260)), 2110);
  assert.ok(ccFromLichess(1000) < 815 && ccFromLichess(2400) > 2110);
  assert.equal(bandOf(ccFromLichess(1300)), 'lo');
  assert.equal(bandOf(ccFromLichess(1700)), 'mid');
  assert.equal(bandOf(ccFromLichess(2000)), 'hi');
});

// 生成好的资料: 每个资料库 256 个小文件, 开局局面在「大师」里有 e4、d4
test('开局浏览器的资料: 都生成了; 开局局面大家走 e4、d4 最多', async () => {
  for (const d of EX_DBS) {
    const dir = new URL(`../js/explorer/${d.key}/`, import.meta.url);
    assert.ok(existsSync(dir), `${d.name} 还没生成`);
    assert.equal(readdirSync(dir).filter((f) => f.endsWith('.js')).length, 256);
  }
  const start = exKey(new Chess().fen());
  const mod = await import(`../js/explorer/master/${start.shard}.js`);
  const top = parseShard(mod.default).get(start.key);
  assert.ok(top?.length >= 4);
  assert.deepEqual(top.slice(0, 2).map((x) => x.uci).sort(), ['d2d4', 'e2e4']);
  for (const x of top) assert.ok(x.w + x.b <= 100 && x.n > 0);
});
