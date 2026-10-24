// 查词典: 卡片上的英语词, 在线打开词典的网页查 (要联网)。
// 这几家词典都不让别的网站把页面嵌进来, 也没有免费的接口, 所以是在新的网页里打开, 查的词放在网址里

import { h, openDialog } from './dom.js';
import { stripMarks } from './rich.js';
import { scriptLang, setLang } from './speech.js';

export const DICTS = [
  {
    id: 'oxford',
    name: '牛津学习者词典',
    desc: '英英: 用简单的英语解释, 例句多, 有英美两种发音',
    url: (w) => `https://www.oxfordlearnersdictionaries.com/search/english/?q=${encodeURIComponent(w)}`,
  },
  {
    id: 'cambridge',
    name: '剑桥英汉双解',
    desc: '简单的英文解释, 每条下面有中文翻译',
    // 剑桥的网址里词组用 - 连 (give up → give-up)
    url: (w) => `https://dictionary.cambridge.org/dictionary/english-chinese-simplified/${encodeURIComponent(w.toLowerCase().replace(/\s+/g, '-'))}`,
  },
  {
    id: 'youdao',
    name: '有道词典',
    desc: '中文意思; 放一整句进去也能翻译',
    url: (w) => `https://dict.youdao.com/result?word=${encodeURIComponent(w)}&lang=en`,
  },
];

// 词性 (n. v. adj. ……), 放在词前后的要去掉
const POS = /(^|\s)(n|v|vt|vi|adj|adv|prep|conj|pron|int|interj|art|num|aux|abbr|pl|sing)\.(?=\s|$)/gi;

// 一段字里能拿去查的英语词 (或者短词组): 去掉格式、括号里的、音标、词性、编号, 有几个意思的取第一个。
// 不是英语、太长 (像一句话) 的返回 null
export function lookupWord(text) {
  let t = stripMarks(String(text ?? ''))
    .split(/\r?\n/)
    .find((line) => line.trim()) ?? '';
  t = t.replace(/[(（[【][^)）\]】]*[)）\]】]/g, ' '); // (n.) [美] 【考】
  t = t.split(/[\u2e80-\u9fff\uac00-\ud7af\uff00-\uffef]/)[0]; // abandon 放弃 → abandon
  t = t.split(/[;；,，/|=:：、]/)[0]; // abandon; desert → abandon; 音标 /əˈbændən/ 也切掉
  t = t.replace(POS, ' ').replace(POS, ' ');
  t = t.replace(/^[\s\d.)、-]+/, ''); // 1. abandon
  t = t.replace(/[\s.!?…'"“”‘’-]+$/, '').replace(/^['"“”‘’\s]+/, '');
  t = t.replace(/’/g, "'").replace(/\s+/g, ' ').trim();
  if (!t || t.length > 40) return null;
  if (!/^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ' .-]*$/.test(t)) return null;
  if (t.split(' ').length > 5) return null;
  return t;
}

// 卡片这一面是不是英语: 卡片集设了语言就听它的, 「自动」的按整个卡片集猜
function englishSide(set, side) {
  const lang = side === 'term' ? set?.termLang : set?.defLang;
  const real = !lang || lang === 'auto' ? setLang(set, side) : lang;
  return String(real ?? '').startsWith('en');
}

// 这张卡片能查什么: word = 先填好的词, texts = 可以换着查的 (英语的那几面, 比如背面的英文解释整句)
export function cardLookup(card, set) {
  const texts = [];
  let word = null;
  for (const side of ['term', 'def']) {
    const plain = stripMarks(card?.[side] ?? '').trim();
    if (!plain || !englishSide(set, side)) continue;
    const w = lookupWord(plain);
    word ??= w;
    // 不是一个词、是一整句英语的 (比如背面的英文解释) 整句放进来, 能拿去翻译
    const whole = !w && !scriptLang(plain) && plain.length <= 300 ? plain.replace(/\s+/g, ' ') : null;
    for (const t of [w, whole]) {
      if (t && !texts.includes(t)) texts.push(t);
    }
  }
  if (!texts.length) return null;
  return { word: word ?? texts[0], texts };
}

// 卡片上的「查词典」按钮; 这张卡片没有英语就不放
export function dictButton(card, set, extra = {}) {
  if (!cardLookup(card, set)) return null;
  return h(
    'button',
    {
      class: 'icon-btn dict-btn',
      title: '查词典',
      'aria-label': '查词典',
      ...extra,
      onclick: (e) => {
        e.stopPropagation();
        openLookup(card, set);
      },
    },
    h('span', { 'aria-hidden': 'true' }, '📖'),
  );
}

// 页面上选中的一小段英语 (电脑上先选中一个词再点查词典, 就查选中的)
function selectedWord() {
  const s = typeof getSelection === 'function' ? String(getSelection() ?? '').trim() : '';
  return s && s.length <= 60 && /^[A-Za-zÀ-ÿ' .-]+$/.test(s) ? s : null;
}

// 查词典的窗口: 上面是要查的 (能改), 下面每家词典一个按钮
export function openLookup(card, set) {
  const found = cardLookup(card, set);
  if (!found) return null;
  const start = selectedWord() ?? found.word;
  const input = h('input', {
    class: 'input',
    type: 'search',
    value: start,
    maxlength: 300,
    enterkeyhint: 'search',
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
    'aria-label': '要查的词',
  });
  const links = DICTS.map((d) =>
    h(
      'a',
      { class: 'dict-choice', target: '_blank', rel: 'noopener noreferrer', dataset: { dict: d.id } },
      h('strong', {}, d.name),
      h('span', { class: 'muted small' }, d.desc),
    ),
  );
  const chips =
    found.texts.length > 1
      ? h(
          'div',
          { class: 'dict-texts' },
          found.texts.map((t) =>
            h(
              'button',
              {
                class: 'chip',
                type: 'button',
                title: t,
                onclick: () => {
                  input.value = t;
                  update();
                },
              },
              t.length > 40 ? `${t.slice(0, 38)}…` : t,
            ),
          ),
        )
      : null;
  function update() {
    const w = input.value.trim();
    DICTS.forEach((d, i) => {
      links[i].href = w ? d.url(w) : '#';
      links[i].setAttribute('aria-disabled', String(!w));
    });
    for (const c of chips?.children ?? []) c.classList.toggle('on', c.title === w);
  }
  input.addEventListener('input', update);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      if (input.value.trim()) links[0].click();
    }
  });
  for (const a of links) a.addEventListener('click', (e) => !input.value.trim() && e.preventDefault());
  update();
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  const d = openDialog({
    title: '查词典',
    body: [
      input,
      chips,
      h('div', { class: 'dict-list' }, links),
      h(
        'p',
        { class: 'muted small dict-note' },
        offline ? '现在好像没连网, 连上网才能打开词典。' : '在新的网页里打开, 查完回来接着背。查的词会发给那个词典网站。',
      ),
    ],
  });
  // 电脑上直接能打字改; 手机上不自动弹键盘 (会挡住下面的按钮)
  if (window.matchMedia?.('(pointer: fine)').matches) {
    input.focus();
    input.select();
  }
  return d;
}
