// 每日猜词 (v1.76) 的词表: 从 SCOWL (英文拼写检查用的开源词表, 按常用程度分级) 生成 js/words.js
//   答案: 常用的五个字母的词 (SCOWL 10、20、35 级), 去掉复数、过去式、-ing 这种 (像 books、baked、going), 去掉不雅的词;
//         最常用的 (10、20 级) 排前面, 35 级的排后面, 各用固定的种子打乱一次, 每天按顺序轮一个 (js/wordle.js 的 dailyWord)。打乱的次序写进文件, 以后改程序也不会变
//   能猜的词: 答案加上 SCOWL 80 级以内所有五个字母的词 (猜的时候宽一点, 少碰到「词表里没有这个词」)
// 跑法: node tools/words.mjs <SCOWL 的 final 文件夹>
//   SCOWL: http://wordlist.aspell.net/ (scowl-2020.12.07.tar.gz), 许可见 js/LICENSE-scowl.txt (要跟词表放在一起)
// 生成过一次以后答案的次序就定了: 重新生成会把已经过去的日子的词也改掉, 一般不要重跑; 要加减词另想办法

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const LEVELS_ALLOWED = [10, 20, 35, 40, 50, 55, 60, 70, 80];
const KINDS = ['english', 'american'];

// 不雅的、骂人的、容易冒犯人的: 不当答案 (还是能猜)
const BLOCK = new Set(
  'bitch whore slut pussy penis vulva dildo semen boobs booby butts horny randy kinky crack crapy shite shits pimps porno pervs fucks cunts dicks prick queer negro nazis rapes raped rapist sperm toots turds tramp wench homos gooks dykes fagot lynch abort slave chink nuder lusty rifer'.split(' '),
);

export function readLevel(dir, level) {
  return KINDS.flatMap((k) => {
    const f = join(dir, `${k}-words.${level}`);
    return existsSync(f) ? readFileSync(f, 'latin1').split(/\r?\n/) : [];
  }).filter((w) => /^[a-z]{5}$/.test(w));
}

// 复数、第三人称、过去式、-ing: 有原形的不要 (books → book、baked → bake、going → go)
export function inflected(w, known) {
  if (w.endsWith('s') && !w.endsWith('ss') && (known.has(w.slice(0, -1)) || (w.endsWith('es') && known.has(w.slice(0, -2))))) return true;
  if (w.endsWith('ed') && (known.has(w.slice(0, -1)) || known.has(w.slice(0, -2)))) return true;
  if (w.endsWith('ing') && (known.has(w.slice(0, -3)) || known.has(`${w.slice(0, -3)}e`))) return true;
  return false;
}

// 固定种子的打乱 (mulberry32)
export function seededShuffle(list, seed) {
  let a = seed >>> 0;
  const rand = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function buildWords(dir) {
  // 所有级别的词 (认原形用, 不限五个字母)
  const all = new Set(
    [...LEVELS_ALLOWED, 95].flatMap((n) =>
      KINDS.flatMap((k) => {
        const f = join(dir, `${k}-words.${n}`);
        return existsSync(f) ? readFileSync(f, 'latin1').split(/\r?\n/) : [];
      }),
    ),
  );
  const ok = (w) => !inflected(w, all) && !BLOCK.has(w);
  // 先轮最常用的 (10、20 级), 轮完再轮 35 级的 (难一点)
  const easy = [...new Set([10, 20].flatMap((n) => readLevel(dir, n)))].filter(ok).sort();
  const harder = [...new Set(readLevel(dir, 35))].filter((w) => ok(w) && !easy.includes(w)).sort();
  const answers = [...seededShuffle(easy, 20261111), ...seededShuffle(harder, 20261112)];
  const allowed = [...new Set([...answers, ...LEVELS_ALLOWED.flatMap((n) => readLevel(dir, n))])].sort();
  return { answers, allowed, easy: easy.length };
}

function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('用法: node tools/words.mjs <SCOWL 的 final 文件夹>');
    process.exit(1);
  }
  const { answers, allowed, easy } = buildWords(dir);
  const out = `// 每日猜词的词表 (tools/words.mjs 从 SCOWL 生成, 别手改; 许可见 js/LICENSE-scowl.txt)
// ANSWERS: 每天的答案, 按这个次序一天一个 (从 2026-11-10 起); ALLOWED: 能猜的词 (空格隔开)
export const ANSWERS = ${JSON.stringify(answers.join(' '))}.split(' ');
export const ALLOWED = ${JSON.stringify(allowed.join(' '))};
`;
  writeFileSync(new URL('../js/words.js', import.meta.url), out);
  console.error(`答案 ${answers.length} 个 (前 ${easy} 个最常用), 能猜的 ${allowed.length} 个`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
