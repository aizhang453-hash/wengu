// 判打字的答案对不对。大小写、标点、多余的空格从来不算错。
// 开着「智能判分」时再宽一点 (跟 Quizlet 的 smart grading 一样):
//   - 括号里的可以不写: 答案「河 (一条河)」写「河」算对
//   - 有几个意思的写出一个就行: 答案「跑, 奔跑」写「奔跑」算对
//   - 打错一两个字母、少了重音符号、词的顺序不一样, 算对但提醒一下 (close)

const PARENS = /[(（[【][^)）\]】]*[)）\]】]/g;
const CJK = /[぀-ヿ㐀-䶿一-鿿가-힯]/;

export function normalize(text, { dropParens = false } = {}) {
  let s = String(text ?? '').normalize('NFKC').toLowerCase();
  if (dropParens) s = s.replace(PARENS, ' ');
  return s
    .replace(/\p{P}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripAccents(s) {
  return s.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');
}

// 几个意思用逗号、分号、斜杠、顿号、「 or 」隔开。
// 只有一个字母的不算 (免得「km/h」写个「h」也算对), 一个汉字算
export function alternatives(expected) {
  return String(expected ?? '')
    .replace(PARENS, ' ')
    .split(/[,;/|、，；]|\s+or\s+/i)
    .map((s) => normalize(s))
    .filter((s) => CJK.test(s) || Array.from(s).length >= 2);
}

// 改几个字才能一样 (按字算, 不按字节)
export function editDistance(a, b) {
  const x = Array.from(a);
  const y = Array.from(b);
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j);
  for (let i = 1; i <= x.length; i++) {
    const cur = [i];
    for (let j = 1; j <= y.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[y.length];
}

// 能错几个字: 中日韩的字一个就是一个意思, 放得严一点
function typoAllowance(expected) {
  const n = Array.from(expected).length;
  if (CJK.test(expected)) return n >= 6 ? 1 : 0;
  if (n >= 8) return 2;
  if (n >= 4) return 1;
  return 0;
}

function sameWords(a, b) {
  const sort = (s) => s.split(' ').sort().join(' ');
  return a.includes(' ') && sort(a) === sort(b);
}

// 返回 { correct, close }。close 是「差一点, 算你对」
export function grade(answer, expected, { smart = true } = {}) {
  const a = normalize(answer);
  const e = normalize(expected);
  if (!a) return { correct: false, close: false };
  if (a === e) return { correct: true, close: false };
  if (!e) return { correct: false, close: false };
  if (!smart) return { correct: false, close: false };

  const candidates = [...new Set([e, normalize(expected, { dropParens: true }), ...alternatives(expected)])].filter(Boolean);
  if (candidates.includes(a)) return { correct: true, close: false };

  for (const c of candidates) {
    if (stripAccents(a) === stripAccents(c)) return { correct: true, close: true };
    if (sameWords(a, c)) return { correct: true, close: true };
    const allow = typoAllowance(c);
    if (allow && editDistance(a, c) <= allow) return { correct: true, close: true };
  }
  return { correct: false, close: false };
}
