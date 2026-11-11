// 点词查意思 (v1.81, 用户挑的): 邸报的英文文章里点一个词, 旁边弹出一小块: 词、音标、朗读、中文意思, 「加进卡片」(放进「邸报生词」卡片集)。
//   意思从英汉小词典来 (../endict.js, ECDICT); 小词典里没有的给一个去有道词典的链接。
//   点链接、按钮不查; 自己选了一段字 (长按、拖) 不查; 点外面、按 Esc 关掉

import { h, fill, icon, toast } from '../dom.js';
import { lookupEn } from '../endict.js';
import { DICTS } from '../dict.js';
import { speak, canSpeak } from '../speech.js';
import { makeSet, makeCard } from '../store.js';

export const WORDS_SET = '邸报生词';
const SET_KEY = 'wengu:news-words-set'; // 「邸报生词」卡片集的编号 (改了名也找得到; 别的设备上按名字找)
const HL = 'news-word';

// 点到的那个位置的字: 浏览器给的光标位置 (Safari、Chrome 是 caretRangeFromPoint, 新的是 caretPositionFromPoint)
function caretAt(x, y) {
  if (document.caretPositionFromPoint) {
    const p = document.caretPositionFromPoint(x, y);
    return p ? { node: p.offsetNode, offset: p.offset } : null;
  }
  if (document.caretRangeFromPoint) {
    const r = document.caretRangeFromPoint(x, y);
    return r ? { node: r.startContainer, offset: r.startOffset } : null;
  }
  return null;
}

const LETTER = /[A-Za-z'’-]/;
// 这个点上是哪个英语词: { word, range } (点在行末的空白、标点上是 null)
export function wordAt(x, y) {
  const c = caretAt(x, y);
  if (!c || c.node?.nodeType !== Node.TEXT_NODE) return null;
  const t = c.node.data;
  let i = c.offset;
  let j = c.offset;
  while (i > 0 && LETTER.test(t[i - 1])) i--;
  while (j < t.length && LETTER.test(t[j])) j++;
  while (i < j && /['’-]/.test(t[i])) i++;
  while (j > i && /['’-]/.test(t[j - 1])) j--;
  const word = t.slice(i, j);
  if (!/[A-Za-z]/.test(word) || word.length > 40) return null;
  const range = document.createRange();
  range.setStart(c.node, i);
  range.setEnd(c.node, j);
  // 真的点在这个词上 (不是行末空白: 浏览器会给最近的字)
  if (![...range.getClientRects()].some((r) => x >= r.left - 3 && x <= r.right + 3 && y >= r.top - 3 && y <= r.bottom + 3)) return null;
  return { word, range };
}

// 「邸报生词」卡片集: 先按记着的编号找, 再按名字找, 都没有就新做一个 (加第一张卡片时)
function wordsSet(store) {
  let id = null;
  try {
    id = localStorage.getItem(SET_KEY);
  } catch {
    id = null;
  }
  return (id && store.getSet(id)) || store.allSets().find((s) => s.title === WORDS_SET) || null;
}

export function addWordCard(store, term, def) {
  const old = wordsSet(store);
  if (old?.cards.some((c) => c.term.trim().toLowerCase() === term.toLowerCase())) return { set: old, added: false };
  const set = old ?? makeSet({ title: WORDS_SET, description: '在邸报的英文报道里点词加进来的。', termLang: 'en-US', defLang: 'zh-CN' });
  const saved = store.putSet({ ...set, cards: [...set.cards, makeCard(term, def)] });
  try {
    localStorage.setItem(SET_KEY, saved.id);
  } catch {
    // 记不住编号也没关系, 按名字找
  }
  return { set: saved, added: true };
}

// 挂在文章上: 返回 { close } (离开文章页时叫)
export function wordLookup(root, { store, go } = {}) {
  const pop = h('div', { class: 'word-pop', role: 'dialog', 'aria-label': '查词', hidden: true });
  document.body.append(pop);
  let asked = 0; // 最后一次点的 (慢的回答回来时已经点了别的, 不画)

  const unmark = () => globalThis.CSS?.highlights?.delete(HL);
  const close = () => {
    pop.hidden = true;
    asked++;
    unmark();
  };

  // 放在那个词的下面 (下面放不下就放上面); 跟着页面滚
  function place(range) {
    const r = range.getBoundingClientRect();
    const w = Math.min(340, innerWidth - 24);
    pop.style.width = `${w}px`;
    pop.style.left = `${Math.max(12, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 12)) + scrollX}px`;
    pop.hidden = false;
    const below = r.bottom + 8;
    const ph = pop.offsetHeight;
    const top = below + ph > innerHeight - 8 && r.top - 8 - ph > 8 ? r.top - 8 - ph : below;
    pop.style.top = `${top + scrollY}px`;
  }

  function head(word, ph) {
    return h(
      'div',
      { class: 'word-pop-head' },
      h('strong', { class: 'word-pop-word', lang: 'en' }, word),
      ph ? h('span', { class: 'word-pop-ph muted' }, `/${ph}/`) : null,
      canSpeak() ? h('button', { class: 'icon-btn', type: 'button', 'aria-label': '朗读', title: '朗读', onclick: () => speak(word, 'en-US') }, icon('volume', 18)) : null,
      h('button', { class: 'icon-btn word-pop-x', type: 'button', 'aria-label': '关掉', title: '关掉', onclick: close }, icon('x', 18)),
    );
  }

  const lines = (tr) => String(tr ?? '').split('\n').filter(Boolean).map((x) => h('p', { class: 'word-pop-tr' }, x));

  function draw(hit, got) {
    if (got === undefined) return fill(pop, head(hit.word), h('p', { class: 'muted small' }, '正在查……'));
    const youdao = DICTS.find((d) => d.id === 'youdao');
    if (got === 'offline') return fill(pop, head(hit.word), h('p', { class: 'muted small' }, '没连上网，查不了。'));
    if (!got) return fill(pop, head(hit.word), h('p', { class: 'muted small' }, '小词典里没有这个词。', youdao ? h('a', { href: youdao.url(hit.word), target: '_blank', rel: 'noopener' }, '去有道词典查') : null));
    const add = h(
      'button',
      {
        class: 'btn small word-pop-add',
        type: 'button',
        onclick: () => {
          let res;
          try {
            res = addWordCard(store, got.word, got.tr);
          } catch {
            return toast('存不下了：浏览器给的空间满了');
          }
          fill(add, icon('check', 16), res.added ? ` 加进了「${res.set.title}」` : ` 已经在「${res.set.title}」里了`);
          add.disabled = true;
          if (go) add.after(h('a', { class: 'word-pop-go small', href: `#/set/${encodeURIComponent(res.set.id)}` }, '去看看'));
        },
      },
      icon('plus', 16),
      ' 加进卡片',
    );
    fill(
      pop,
      head(got.word, got.ph),
      got.from ? h('p', { class: 'muted small word-pop-from' }, h('span', { lang: 'en' }, got.from), ` 是 ${got.word} 的${got.kind || '变形'}`) : null,
      lines(got.tr),
      got.base ? h('p', { class: 'muted small word-pop-from' }, `也是 `, h('span', { lang: 'en' }, got.base.word), ` 的${got.base.kind || '变形'}：${String(got.base.tr).split('\n')[0]}`) : null,
      store ? h('div', { class: 'word-pop-foot' }, add) : null,
    );
  }

  async function show(hit) {
    const n = ++asked;
    if (globalThis.Highlight && globalThis.CSS?.highlights) CSS.highlights.set(HL, new Highlight(hit.range)); // 点的词底下标一下颜色
    draw(hit, undefined);
    place(hit.range);
    let got;
    try {
      got = await lookupEn(hit.word);
    } catch {
      got = 'offline';
    }
    if (n !== asked) return;
    draw(hit, got);
    place(hit.range);
  }

  const onClick = (e) => {
    if (e.target.closest('a, button, input, select, textarea, figure')) return;
    const sel = getSelection();
    if (sel && !sel.isCollapsed && String(sel).trim()) return; // 自己选了字
    const hit = wordAt(e.clientX, e.clientY);
    if (!hit) return close();
    show(hit);
  };
  const onDown = (e) => {
    if (!pop.hidden && !pop.contains(e.target) && !root.contains(e.target)) close();
  };
  const onKey = (e) => e.key === 'Escape' && !pop.hidden && close();
  root.classList.add('word-lookup');
  root.addEventListener('click', onClick);
  document.addEventListener('pointerdown', onDown);
  document.addEventListener('keydown', onKey);
  return {
    close() {
      close();
      root.removeEventListener('click', onClick);
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
      pop.remove();
    },
  };
}
