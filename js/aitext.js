// AI 回的文字 (拍照让 AI 记错题、做卡片): 从一大段话里找出 JSON, 数学的 LaTeX 换成普通的字, 字段名换了说法也认。
// AI 写得不太规矩的也尽量认: 前后有别的话、```json 包着、一段一段的、少了结尾的 ```、多了逗号、LaTeX 的 \ 少打一个。

// ---- 从 AI 回的一大段里找出 JSON ----

// LaTeX 的 \frac、\sqrt 写进 JSON 时少打了一个 \: \s 这种直接读不了, \f \t \n 会被当成别的字 (\frac 读成换页 + rac)。补成 \\
// (\n、\t 后面跟着的是真的字时不动: 「\nThe」是换行)
const LATEX_LIKE = /^(?:[fb][a-zA-Z]|(?:times|theta|tan|tau|text\w*|triangle|right\w*|rho|rangle|rfloor|rceil|neq?|nabla)(?![a-zA-Z]))/;
export function fixBackslashes(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '\\') {
      out += s[i];
      continue;
    }
    if (s[i + 1] === '\\') {
      out += '\\\\';
      i++;
      continue;
    }
    const rest = s.slice(i + 1, i + 16);
    const valid = /^(?:["/bfnrt]|u[0-9a-fA-F]{4})/.test(rest);
    out += valid && !LATEX_LIKE.test(rest) ? '\\' : '\\\\';
  }
  return out;
}

function tryParse(s) {
  const fixed = fixBackslashes(s);
  for (const v of [fixed, fixed.replace(/,(\s*[}\]])/g, '$1')]) {
    try {
      return JSON.parse(v);
    } catch {
      // 换下一种试试
    }
  }
  return undefined;
}

// 返回找到的几段 JSON (没有就是空的)
export function findJson(text) {
  const t = String(text ?? '')
    .replace(/^﻿/, '')
    .trim();
  if (!t) return [];
  const whole = tryParse(t);
  if (whole !== undefined) return [whole];
  // ```json …``` 一段一段 (一道题一段的也行)
  const blocks = [...t.matchAll(/```[\w-]*[^\S\n]*\n?([\s\S]*?)```/g)].map((m) => tryParse(m[1].trim())).filter((v) => v !== undefined);
  if (blocks.length) return blocks;
  // 前后有别的话 (或者代码块没复制全): 从第一个 { 或 [ 到最后一个 } 或 ]; 好几个 { } 挨着的当成一列
  const end = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  for (const start of [t.indexOf('{'), t.indexOf('[')].filter((i) => i >= 0 && i < end).sort((a, b) => a - b)) {
    const inner = t.slice(start, end + 1);
    const value = tryParse(inner) ?? tryParse(`[${inner.replace(/}\s*,?\s*{/g, '},{')}]`);
    if (value !== undefined) return [value];
  }
  return [];
}

// ---- LaTeX 换成普通的字 ----
const SYMBOLS = {
  times: '×', cdot: '·', div: '÷', pm: '±', mp: '∓', le: '≤', leq: '≤', leqslant: '≤', ge: '≥', geq: '≥', geqslant: '≥', ne: '≠', neq: '≠', approx: '≈', equiv: '≡',
  pi: 'π', theta: 'θ', alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', Delta: 'Δ', lambda: 'λ', mu: 'μ', sigma: 'σ', Sigma: 'Σ', omega: 'ω', phi: 'φ',
  infty: '∞', circ: '°', degree: '°', angle: '∠', triangle: '△', perp: '⊥', parallel: '∥', cong: '≅', sim: '∼', therefore: '∴',
  to: '→', rightarrow: '→', Rightarrow: '⇒', leftrightarrow: '↔', ldots: '…', cdots: '⋯', dots: '…', in: '∈', cup: '∪', cap: '∩',
  sin: 'sin', cos: 'cos', tan: 'tan', log: 'log', ln: 'ln', lvert: '|', rvert: '|', mid: '|',
  left: '', right: '', displaystyle: '', quad: ' ', qquad: ' ', '%': '%', $: '$', '{': '{', '}': '}', '#': '#', '&': '&', _: '_', ',': ' ', ';': ' ', ':': ' ', '!': '', ' ': ' ', '\\': '\n',
};
const KEEP_ARG = new Set(['text', 'textrm', 'textit', 'mathrm', 'mathit', 'mathbf', 'mathsf', 'operatorname', 'overline', 'overrightarrow', 'vec', 'hat', 'boxed', 'mbox']);

const simple = (s) => /^[\p{L}\p{N}.°π]+$/u.test(s);
const wrap = (s) => (simple(s) ? s : `(${s})`);

// s[i] 开始的一个参数: { … } 里面的, 或者一个字
function arg(s, i) {
  while (s[i] === ' ') i++;
  if (s[i] !== '{') return [s[i] ?? '', i + 1];
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === '\\') j++;
    else if (s[j] === '{') depth++;
    else if (s[j] === '}' && --depth === 0) return [s.slice(i + 1, j), j + 1];
  }
  return [s.slice(i + 1), s.length];
}

function convert(s) {
  let out = '';
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '\\') {
      const name = /^\\([a-zA-Z]+|[\s\S])?/.exec(s.slice(i))[1] ?? '';
      i += name.length + 1;
      if (/^[dt]?frac$/.test(name)) {
        const [a, j] = arg(s, i);
        const [b, k] = arg(s, j);
        out += `${wrap(convert(a))}/${wrap(convert(b))}`;
        i = k;
      } else if (name === 'sqrt') {
        let n = '';
        if (s[i] === '[' && s.indexOf(']', i) > i) {
          n = convert(s.slice(i + 1, s.indexOf(']', i)));
          i = s.indexOf(']', i) + 1;
        }
        const [a, j] = arg(s, i);
        out += `${n}√${wrap(convert(a))}`;
        i = j;
      } else if (name === 'underline') {
        const [a, j] = arg(s, i);
        out += `__${convert(a)}__`;
        i = j;
      } else if (KEEP_ARG.has(name)) {
        const [a, j] = arg(s, i);
        out += convert(a);
        i = j;
      } else if (Object.hasOwn(SYMBOLS, name)) {
        out += SYMBOLS[name];
      } else {
        out += `\\${name}`; // 不认得的照原样
      }
    } else if ((ch === '^' || ch === '_') && s[i + 1] === '{') {
      const [a, j] = arg(s, i + 1);
      const inner = convert(a);
      // H_{2}O、log_{2}: 下标是数字的写成 H₂O、log₂
      out += ch === '_' && /^\d+$/.test(inner) ? [...inner].map((d) => '₀₁₂₃₄₅₆₇₈₉'[d]).join('') : ch + wrap(inner);
      i = j;
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}

export function plainMath(text) {
  let s = String(text ?? '');
  if (!/[\\$]|[_^]\{/.test(s)) return s;
  s = s
    .replace(/\\\(([\s\S]*?)\\\)/g, '$1')
    .replace(/\\\[([\s\S]*?)\\\]/g, '$1')
    .replace(/\$\$([\s\S]+?)\$\$/g, '$1')
    // $x^2$、$ABC$: 贴着字、里面有 LaTeX 或者没空格带字母的才是公式 ($5 and $10、$5-$10 是钱)
    .replace(/\$(\S(?:[^$\n]*\S)?)\$/g, (all, inner) => (/[\\^_{}=]/.test(inner) || (!/\s/.test(inner) && /[a-zA-Z]/.test(inner)) ? inner : all));
  return convert(s).replace(/\^°/g, '°');
}

// ---- 字段 ----
const keyOf = (k) => k.toLowerCase().replace(/[\s_-]+/g, '');

// pick('question', '题目', 'stem'): 第一个有东西的字段; 字段名不分大小写, 空格、_、- 不算 (correct_answer = correctAnswer)
export function picker(raw) {
  const map = new Map(Object.entries(raw).map(([k, v]) => [keyOf(k), v]));
  return (...names) => {
    for (const n of names) {
      const v = map.get(keyOf(n));
      if (v !== undefined && v !== null && v !== '') return v;
    }
    return undefined;
  };
}

// 字段的值换成字: 数组一行一个, LaTeX 换成普通的字, 前后的空白去掉
export function clean(v) {
  if (v === undefined || v === null) return '';
  if (Array.isArray(v)) return v.map(clean).filter(Boolean).join('\n');
  if (typeof v === 'object') return clean(v.text ?? v.content ?? v.value ?? '');
  return plainMath(String(v).replace(/\r\n?/g, '\n')).trim();
}
