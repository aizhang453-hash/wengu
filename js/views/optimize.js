// 按自己的记录优化复习排法: 看有多少记录能用, 在后台算 (optimize-worker.js), 比一比新的准不准, 用不用

import { h, fill, openDialog, toast } from '../dom.js';
import { fullHistories } from '../revlog.js';
import { usable, MIN_ITEMS, MIN_TRAIN, DEFAULT_W } from '../optimize.js';
import { currentParameters } from '../srs.js';
import { dateText } from './plan.js';

const num = (n) => n.toLocaleString('zh-CN');
const pct = (x) => `${(x * 100).toFixed(1)}%`;
const days = (s) => (s < 1 ? `${Math.max(1, Math.round(s * 24))} 小时` : `${s < 10 ? s.toFixed(1) : Math.round(s)} 天`);

// 在后台算; 浏览器不支持就在这里算 (会卡一两秒)
export function runOptimize(histories, current, onProgress) {
  return new Promise((resolve, reject) => {
    const here = async () => {
      const { optimize } = await import('../optimize.js');
      await new Promise((r) => setTimeout(r, 50)); // 先让「算着呢」显示出来
      resolve(optimize(histories, { current, onProgress }));
    };
    let worker;
    try {
      worker = new Worker(new URL('../optimize-worker.js', import.meta.url), { type: 'module' });
    } catch {
      here().catch(reject);
      return;
    }
    let heard = false;
    worker.onmessage = ({ data }) => {
      heard = true;
      if ('progress' in data) return onProgress?.(data.progress);
      worker.terminate();
      if (data.error) reject(new Error(data.error));
      else resolve(data.result);
    };
    worker.onerror = (e) => {
      worker.terminate();
      if (heard) reject(new Error(e.message || '算不了'));
      else here().catch(reject); // 起不来 (老浏览器不支持这种后台): 在这里算
    };
    worker.postMessage({ histories, current });
  });
}

export function openOptimizeDialog({ store, onChanged }) {
  const own = store.data.settings.fsrs;
  const histories = fullHistories(store.allSets(), store.data.revlog);
  const have = usable(histories);
  const resultEl = h('div', { class: 'opt-result' });
  const bar = h('span', { class: 'meter-fill' });
  const meter = h('span', { class: 'meter', hidden: true }, bar);
  const runBtn = h('button', { class: 'btn primary', disabled: have.items < MIN_ITEMS, onclick: () => run() }, own ? '用现在的记录再优化一次' : '开始优化');

  const status = own
    ? `现在用的: 按你的记录优化过的参数 (${dateText(own.at)}, 用了 ${num(own.items)} 次复习)`
    : '现在用的: FSRS 的默认参数 (很多 Anki 用户的平均)';
  let enough;
  if (have.items < MIN_ITEMS) enough = `能用的记录还太少 (隔天以后的复习只有 ${have.items} 次), 多背几天再来。`;
  else if (have.items < MIN_TRAIN) enough = '记录还不多, 只能估出「第一次背完能记几天」, 别的参数先用默认的。';
  else if (have.items < 400) enough = '记录不太多, 算出来的可能不太稳; 攒到 1000 次左右会更准。';
  else enough = '';

  async function run() {
    runBtn.disabled = true;
    runBtn.textContent = '算着呢……';
    meter.hidden = false;
    bar.style.width = '0%';
    fill(resultEl);
    try {
      const result = await runOptimize(histories, own ? currentParameters() : null, (p) => (bar.style.width = `${Math.round(p * 100)}%`));
      showResult(result);
    } catch (e) {
      console.warn(e);
      fill(resultEl, h('p', { class: 'qe-problem' }, '算的时候出错了, 换个浏览器试试?'));
    } finally {
      meter.hidden = true;
      runBtn.disabled = false;
      runBtn.textContent = '再算一次';
      runBtn.className = 'btn';
    }
  }

  function showResult(r) {
    if (r.status === 'default' || !r.after) {
      fill(resultEl, h('p', {}, '记录还太少, 算不出来, 先用默认参数。'));
      return;
    }
    const rows = [
      ['默认参数', r.before],
      own ? ['现在用的', r.current] : null,
      ['按你的记录算的', r.after],
    ].filter(Boolean);
    const [s0, s2] = [r.w[0], r.w[2]];
    fill(
      resultEl,
      h(
        'table',
        { class: 'opt-table' },
        h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, '预测误差'), h('th', {}, '对数损失'))),
        h(
          'tbody',
          {},
          rows.map(([name, e]) => h('tr', {}, h('th', {}, name), h('td', {}, pct(e.rmse)), h('td', {}, e.logLoss.toFixed(4)))),
        ),
      ),
      h('p', { class: 'muted small' }, `拿你的 ${num(r.after.n)} 次复习算的: 每次按之前的记录预测「这次还记得的把握」, 跟实际记没记得比。两个数都是越小越准。`),
      h(
        'ul',
        { class: 'opt-facts' },
        h('li', {}, `第一次就会的: 过 ${days(s2)}还有 90% 记得 (默认 ${days(DEFAULT_W[2])})`),
        h('li', {}, `第一次不会的: 过 ${days(s0)}还有 90% 记得 (默认 ${days(DEFAULT_W[0])})`),
      ),
      r.status === 'initial' ? h('p', { class: 'muted small' }, '记录还不多, 只调了第一次以后能记几天, 别的参数还是默认的。') : null,
      r.better
        ? h(
            'div',
            { class: 'row end' },
            h('button', { class: 'btn', onclick: () => d.close() }, '先不用'),
            h(
              'button',
              {
                class: 'btn primary',
                onclick: () => {
                  const n = store.setParameters({ w: r.w, items: r.items, logLoss: [r.before.logLoss, r.after.logLoss], rmse: [r.before.rmse, r.after.rmse] });
                  d.close();
                  toast(`换好了, 以后按你的参数排${n ? `; ${num(n)} 张卡片按新参数重算了记得多牢` : ''}`);
                  onChanged?.();
                },
              },
              '用这套参数',
            ),
          )
        : h('p', { class: 'opt-same' }, own ? '现在用的参数已经挺合适了, 新算的不比它准, 不用换。' : '默认参数对你就挺合适, 新算的不比它准, 不用换。'),
    );
  }

  const d = openDialog({
    title: '按我的记录优化复习排法',
    body: [
      h('p', { class: 'muted small' }, 'FSRS 有 21 个参数, 决定「隔多久再复习、多快会忘」。默认的是很多 Anki 用户的平均; 拿你自己的翻卡自评记录 (连从 Anki 搬来的) 算一套更合你的 (跟 Anki 里的「优化」一样, 在你的浏览器里算)。'),
      h('p', {}, status),
      h('p', {}, `能用的记录: ${num(have.cards)} 张卡片, 一共 ${num(have.reviews)} 次复习 (隔天以后的 ${num(have.items)} 次)。`),
      h('p', { class: 'muted small' }, '只用从第一次背起都记着的卡片 (在这一版以前背过的、只记了一部分的不算)。'),
      enough ? h('p', { class: 'muted small' }, enough) : null,
      meter,
      resultEl,
    ],
    footer: [
      own
        ? h(
            'button',
            {
              class: 'btn',
              onclick: () => {
                if (!confirm('换回 FSRS 的默认参数?')) return;
                store.setParameters(null);
                d.close();
                toast('换回默认参数了');
                onChanged?.();
              },
            },
            '换回默认参数',
          )
        : null,
      runBtn,
    ],
  });
  return d;
}
