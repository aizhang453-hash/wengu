// 广播 (v1.78, #/radio): 全世界的网络电台 (电台目录和规矩见 ../radio.js; 播放和底下那一条见 radiobar.js)
//   最上面搜电台 (名字或种类: BBC、中国之声、jazz……); 没搜的时候列「收藏」和「热门」
//   (v1.78.1: 用户说不要「中文 | 全世界」分开; 热门是一个列表, 先中文台再全世界的, 见 ../radio.js 的 topStations)
//   点一个台就放, 再点暂停; ☆ 收藏

import { h, fill, icon } from '../dom.js';
import { topStations, searchStations, favorites, isFavorite, toggleFavorite } from '../radio.js';
import { playStation, radioNow, onRadioChange, stationIcon } from './radiobar.js';

export function renderRadio() {
  let query = '';
  let hot = null; // 热门 (null: 还没拿)
  let found = null; // 搜到的 (null: 没在搜)
  let note = ''; // 正在找、没连上网……
  const box = h('section', { class: 'radio-page' });
  const input = h('input', { type: 'search', class: 'input radio-search', placeholder: '搜电台：名字或种类，比如 BBC、中国之声、jazz', enterkeyhint: 'search', 'aria-label': '搜电台' });

  // 一个台一行: 小图、台名、哪里 · 格式; 点了放 / 暂停; 右边收藏
  const row = (s) => {
    const now = radioNow();
    const on = now.station?.id === s.id;
    const playing = on && (now.state === 'playing' || now.state === 'loading');
    return h(
      'li',
      { class: `radio-row${on ? ' on' : ''}` },
      h(
        'button',
        { class: 'radio-row-main', type: 'button', 'aria-pressed': String(playing), onclick: () => playStation(s) },
        stationIcon(s, 40),
        h('span', { class: 'radio-row-text' }, h('strong', {}, s.name), h('span', { class: 'muted small' }, [s.place, s.info].filter(Boolean).join(' · '))),
        h('span', { class: 'radio-row-play', 'aria-hidden': 'true' }, icon(playing ? 'pause' : 'play', 20)),
      ),
      h(
        'button',
        {
          class: `icon-btn radio-fav${isFavorite(s.id) ? ' on' : ''}`,
          type: 'button',
          'aria-label': isFavorite(s.id) ? '取消收藏' : '收藏',
          title: isFavorite(s.id) ? '取消收藏' : '收藏',
          onclick: () => {
            toggleFavorite(s);
            draw();
          },
        },
        isFavorite(s.id) ? '★' : '☆',
      ),
    );
  };
  const list = (items) => h('ul', { class: 'radio-list' }, items.map(row));

  function draw() {
    const favs = favorites();
    const searching = found !== null;
    fill(
      box,
      h('h1', {}, '广播'),
      h('div', { class: 'radio-search-row' }, input, h('button', { class: 'btn primary', type: 'button', onclick: search }, '搜')),
      note ? h('p', { class: 'muted radio-note' }, note) : null,
      searching
        ? [
            h('div', { class: 'radio-section-head' }, h('h2', {}, `「${query}」`), h('button', { class: 'link-btn', type: 'button', onclick: clear }, '不搜了')),
            found.length ? list(found) : note ? null : h('p', { class: 'muted' }, '没找到这样的电台。'),
          ]
        : [favs.length ? [h('div', { class: 'radio-section-head' }, h('h2', {}, '收藏')), list(favs)] : null, hot?.length ? [h('div', { class: 'radio-section-head' }, h('h2', {}, '热门')), list(hot)] : null],
    );
  }

  async function search() {
    const q = input.value.trim();
    if (!q) return clear();
    query = q;
    found = [];
    note = '正在找……';
    draw();
    try {
      const got = await searchStations(q);
      if (query !== q) return;
      found = got;
      note = '';
    } catch {
      note = '没连上网，搜不了。';
    }
    if (box.isConnected) draw();
  }

  function clear() {
    input.value = '';
    query = '';
    found = null;
    note = '';
    draw();
  }

  // 中文输入法正在选字时的回车不算
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      search();
    }
  });
  // 播放的台、状态变了: 重画 (哪个在放、按钮是 ▶ 还是 ⏸)
  const off = onRadioChange(() => box.isConnected && draw());
  // 热门: 打开时拿一次
  note = '正在拿电台……';
  draw();
  topStations()
    .then((got) => {
      hot = got;
      if (found === null) note = ''; // 正在搜的话, 「正在找」留着
    })
    .catch(() => {
      if (found === null) note = '没连上网，拿不到电台。';
    })
    .then(() => box.isConnected && draw());
  return { title: '广播', el: box, cleanup: off };
}
