// 广播 (v1.78, #/radio): 全世界的网络电台 (电台目录和规矩见 ../radio.js; 播放和底下那一条见 radiobar.js)
//   v1.79 (用户挑的): 最上面「正在播放」的大面板 (台标、台名、播放 / 暂停、收藏、睡觉定时、音量, 放着时有跳动的声音条);
//   下面搜电台 (台名、种类、城市、国家); 没搜的时候列: 收藏、附近的台 (按邸报天气定的地方)、热门。
//   收藏跟着卡片同步 (store.data.radio)。v1.79.1: 用户说「最近听过」看着难受, 去掉了 (也不再记)
//   v1.78.1: 热门不分「中文 | 全世界」; v1.78.2: 搜索框清空就回到原样 (不要「不搜了」)

import { h, fill, icon } from '../dom.js';
import { topStations, searchStations, nearbyStations, favoriteList, isFavorite } from '../radio.js';
import { savedPlace, savePlace, locate } from '../weather.js';
import { playStation, togglePlay, stopRadio, radioNow, onRadioChange, stationIcon, statusText, setSleep, sleepLeft, radioVolume, setRadioVolume, canSetVolume } from './radiobar.js';

const SLEEP_CHOICES = [15, 30, 60];

export function renderRadio({ store }) {
  store.moveOldRadioFavs(); // v1.78 存在这台设备上的收藏搬进来 (只一次)
  let query = '';
  let found = null; // 搜到的 (null: 没在搜)
  let hot = null; // 热门 (null: 还没拿)
  let near = null; // 附近的台 (null: 还没拿)
  let nearNote = ''; // 附近的台: 正在定位、没有位置……
  let note = ''; // 正在找、没连上网……
  let sleepOpen = false; // 睡觉定时的几个选项打开着没有
  const volumeOk = canSetVolume();
  const box = h('section', { class: 'radio-page' });
  const input = h('input', { type: 'search', class: 'input radio-search', placeholder: '搜电台：台名、种类、城市，比如 BBC、jazz、纽约', enterkeyhint: 'search', 'aria-label': '搜电台' });

  const play = (s) => playStation(s);

  const favButton = (s, fav, cls = '') =>
    h(
      'button',
      {
        class: `icon-btn radio-fav${fav ? ' on' : ''} ${cls}`,
        type: 'button',
        'aria-label': fav ? '取消收藏' : '收藏',
        title: fav ? '取消收藏' : '收藏',
        onclick: () => {
          store.setRadioFav(s, !fav);
          draw();
        },
      },
      fav ? '★' : '☆',
    );

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
        { class: 'radio-row-main', type: 'button', 'aria-pressed': String(playing), onclick: () => play(s) },
        stationIcon(s, 40),
        h('span', { class: 'radio-row-text' }, h('strong', {}, s.name), h('span', { class: 'muted small' }, [s.place, s.info].filter(Boolean).join(' · '))),
        h('span', { class: 'radio-row-play', 'aria-hidden': 'true' }, icon(playing ? 'pause' : 'play', 20)),
      ),
      favButton(s, isFavorite(store.data.radio, s.id)),
    );
  };
  const list = (items) => h('ul', { class: 'radio-list' }, items.map(row));
  const section = (title, items, extra = null) => (items?.length || extra ? [h('div', { class: 'radio-section-head' }, h('h2', {}, title)), extra, items?.length ? list(items) : null] : null);

  // 正在播放的大面板
  function panel() {
    const { station, state } = radioNow();
    if (!station) return null;
    const busy = state === 'playing' || state === 'loading';
    const left = sleepLeft();
    const pick = (m) =>
      h(
        'button',
        {
          class: 'chip',
          type: 'button',
          onclick: () => {
            sleepOpen = false;
            setSleep(m);
            draw();
          },
        },
        m ? `${m} 分钟` : '不定时了',
      );
    return h(
      'section',
      { class: `radio-now${state === 'playing' ? ' playing' : ''}`, 'aria-label': '正在播放' },
      h(
        'div',
        { class: 'radio-now-top' },
        stationIcon(station, 76),
        h(
          'div',
          { class: 'radio-now-text' },
          h('strong', { class: 'radio-now-name' }, station.name),
          h('span', { class: 'muted small' }, [station.place, station.info].filter(Boolean).join(' · ')),
          h('span', { class: `radio-now-status${state === 'error' ? ' bad' : ''}` }, h('span', { class: 'radio-eq', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'), h('i')), statusText()),
        ),
        favButton(station, isFavorite(store.data.radio, station.id), 'radio-now-fav'),
        h('button', { class: 'icon-btn radio-now-close', type: 'button', 'aria-label': '关掉广播', title: '关掉广播', onclick: stopRadio }, icon('x', 20)),
      ),
      h(
        'div',
        { class: 'radio-now-controls' },
        h('button', { class: 'radio-now-play', type: 'button', 'aria-label': busy ? '暂停' : '播放', title: busy ? '暂停' : '播放', onclick: togglePlay }, icon(busy ? 'pause' : 'play', 30)),
        h(
          'button',
          {
            class: `btn small radio-sleep-btn${left ? ' on' : ''}`,
            type: 'button',
            'aria-expanded': String(sleepOpen),
            onclick: () => {
              sleepOpen = !sleepOpen;
              draw();
            },
          },
          left ? `还剩 ${left} 分钟` : '定时停',
        ),
        volumeOk ? h('label', { class: 'radio-volume', title: '音量' }, icon('volume', 18), h('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(radioVolume()), 'aria-label': '音量', oninput: (e) => setRadioVolume(Number(e.target.value)) })) : null,
      ),
      sleepOpen ? h('div', { class: 'radio-sleep-choices' }, SLEEP_CHOICES.map(pick), left ? pick(0) : null) : null,
    );
  }

  // 附近的台: 还没有地方的话, 给一个「看看我附近的台」(要位置; 跟邸报天气用同一个地方)
  function nearExtra() {
    if (near?.length) return null;
    if (nearNote) return h('p', { class: 'muted small radio-near-note' }, nearNote);
    if (savedPlace()) return null;
    return h('button', { class: 'btn small', type: 'button', onclick: findMe }, '看看我附近的台');
  }

  function draw() {
    const radio = store.data.radio;
    const place = savedPlace();
    fill(
      box,
      h('h1', {}, '广播'),
      panel(),
      h('div', { class: 'radio-search-row' }, input, h('button', { class: 'btn primary', type: 'button', onclick: search }, '搜')),
      note ? h('p', { class: 'muted radio-note' }, note) : null,
      found !== null
        ? found.length
          ? list(found)
          : note
            ? null
            : h('p', { class: 'muted' }, '没找到这样的电台。')
        : [section('收藏', favoriteList(radio)), section(place ? `${place.name}附近` : '附近的台', near, nearExtra()), section('热门', hot)],
    );
  }

  async function loadNear(place) {
    if (!place) return;
    try {
      near = await nearbyStations(place);
      nearNote = near.length ? '' : '附近没找到写了位置的台，可以搜城市名试试。';
    } catch {
      nearNote = '没连上网，拿不到附近的台。';
    }
    if (box.isConnected) draw();
  }

  async function findMe() {
    nearNote = '正在定位……';
    draw();
    try {
      const here = await locate();
      savePlace(here);
      nearNote = '';
      await loadNear(here);
    } catch (e) {
      nearNote = e?.code === 1 ? '没有位置权限：可以在邸报右上角的天气里填城市，或者直接搜城市名。' : '定位不了：可以直接搜城市名。';
      if (box.isConnected) draw();
    }
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

  // 搜索框清空了 (删光、点框里的 ×): 回到原来的样子
  input.addEventListener('input', () => {
    if (!input.value.trim() && found !== null) clear();
  });
  // 中文输入法正在选字时的回车不算
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      search();
    }
  });
  // 播放的台、状态、定时变了: 重画 (面板、哪个在放)
  const off = onRadioChange(() => box.isConnected && draw());
  // 打开时: 拿热门、附近的台 (有地方的话)
  note = '正在拿电台……';
  draw();
  topStations()
    .then((got) => {
      hot = got;
      if (found === null) note = '';
    })
    .catch(() => {
      if (found === null) note = '没连上网，拿不到电台。';
    })
    .then(() => box.isConnected && draw());
  loadNear(savedPlace());
  return { title: '广播', el: box, cleanup: off };
}
