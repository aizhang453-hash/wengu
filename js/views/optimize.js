// 按自己的记录优化复习排法: 看有多少记录能用, 在后台算 (optimize-worker.js), 比一比新的准不准, 用不用

import { h, fill, openDialog, toast } from '../dom.js';
import { fullHistories } from '../revlog.js';
import { usable, MIN_ITEMS, MIN_TRAIN, DEFAULT_W } from '../optimize.js';
import { currentParameters } from '../srs.js';
import { dateText } from './plan.js';

const num = (n) => n.toLocaleString('zh-CN');
const pct = (x) => `${(x * 100).toFixed(1)}%`;
const days = (s) => (s < 1 ? `${Math.max(1, Math.round(s * 24))} 小时` : `${s < 10 ? s.toFixed(1) : Math.round(s)} 天`);

// 在后台算; 浏览器不支持就在这里算 (会卡一两秒)。signal 停了 (关了窗口) 就不算了
export function runOptimize(histories, current, onProgress, signal = null) {
  return new Promise((resolve, reject) => {
    const stopped = () => new DOMException('不算了', 'AbortError');
    if (signal?.aborted) return reject(stopped());
    const here = async () => {
      const { optimize } = await import('../optimize.js');
      await new Promise((r) => setTimeout(r, 50)); // 先让「算着呢」显示出来
      if (signal?.aborted) throw stopped();
      resolve(optimize(histories, { current, onProgress }));
    };
    let worker;
    try {
      worker = new Worker(new URL('../optimize-worker.js', import.meta.url), { type: 'module' });
    } catch {
      here().catch(reject);
      return;
    }
    const end = () => {
      worker.terminate();
      signal?.removeEventListener('abort', abort);
    };
    const abort = () => {
      end();
      reject(stopped());
    };
    signal?.addEventListener('abort', abort);
    let heard = false;
    worker.onmessage = ({ data }) => {
      heard = true;
      if ('progress' in data) return onProgress?.(data.progress);
      end();
      if (data.error) reject(new Error(data.error));
      else resolve(data.result);
    };
    worker.onmessageerror = () => {
      end();
      reject(new Error('后台传回来的读不了'));
    };
    worker.onerror = (e) => {
      end();
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
  const runBtn = h('button', { class: 'btn primary', disabled: have.items < MIN_ITEMS, onclick: () => run() }, own ? '重新优化' : '开始优化');

  const status = own
    ? `当前：个人参数（${dateText(own.at)}，基于 ${num(own.items)} 次复习）`
    : '当前：FSRS 默认参数';
  let enough;
  if (have.items < MIN_ITEMS) enough = `可用记录不足（间隔一天以上的复习仅 ${have.items} 次），请积累更多记录后再试。`;
  else if (have.items < MIN_TRAIN) enough = '记录较少，仅能优化初始记忆参数，其余参数沿用默认值。';
  else if (have.items < 400) enough = '记录较少，结果可能不稳定；积累约 1000 次后更准确。';
  else enough = '';

  // 关了窗口: 后台还在算的停掉
  const stop = new AbortController();

  async function run() {
    runBtn.disabled = true;
    runBtn.textContent = '正在计算……';
    meter.hidden = false;
    bar.style.width = '0%';
    fill(resultEl);
    try {
      const result = await runOptimize(histories, own ? currentParameters() : null, (p) => (bar.style.width = `${Math.round(p * 100)}%`), stop.signal);
      showResult(result);
    } catch (e) {
      if (e.name === 'AbortError') return;
      console.warn(e);
      fill(resultEl, h('p', { class: 'qe-problem' }, '计算出错，请尝试更换浏览器。'));
    } finally {
      meter.hidden = true;
      runBtn.disabled = false;
      runBtn.textContent = '重新计算';
      runBtn.className = 'btn';
    }
  }

  function showResult(r) {
    if (r.status === 'default' || !r.after) {
      fill(resultEl, h('p', {}, '记录不足，无法计算，继续使用默认参数。'));
      return;
    }
    const rows = [
      ['默认参数', r.before],
      own ? ['当前参数', r.current] : null,
      ['个人参数', r.after],
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
      h('p', { class: 'muted small' }, `基于 ${num(r.after.n)} 次复习，比较预测记忆率与实际结果；数值越小越准确。`),
      h(
        'ul',
        { class: 'opt-facts' },
        h('li', {}, `首次即会：${days(s2)}后记忆率 90%（默认 ${days(DEFAULT_W[2])}）`),
        h('li', {}, `首次不会：${days(s0)}后记忆率 90%（默认 ${days(DEFAULT_W[0])}）`),
      ),
      r.status === 'initial' ? h('p', { class: 'muted small' }, '记录较少，仅调整了初始记忆参数，其余沿用默认值。') : null,
      r.better
        ? h(
            'div',
            { class: 'row end' },
            h('button', { class: 'btn', onclick: () => d.close() }, '暂不使用'),
            h(
              'button',
              {
                class: 'btn primary',
                onclick: () => {
                  const n = store.setParameters({ w: r.w, items: r.items, logLoss: [r.before.logLoss, r.after.logLoss], rmse: [r.before.rmse, r.after.rmse] });
                  d.close();
                  toast(`已启用个人参数${n ? `，${num(n)} 张卡片已按新参数重新计算` : ''}`);
                  onChanged?.();
                },
              },
              '启用此参数',
            ),
          )
        : h('p', { class: 'opt-same' }, own ? '当前参数已较为准确，无需更换。' : '默认参数已较为准确，无需更换。'),
    );
  }

  const d = openDialog({
    title: '复习参数优化',
    onClose: () => stop.abort(),
    body: [
      h('p', { class: 'muted small' }, 'FSRS 通过 21 个参数决定复习间隔。默认参数基于大量用户的平均值；优化将根据你的复习记录（含 Anki 导入）在本地计算个人参数。'),
      h('p', {}, status),
      h('p', {}, `可用记录：${num(have.cards)} 张卡片，共 ${num(have.reviews)} 次复习（间隔一天以上 ${num(have.items)} 次）。`),
      h('p', { class: 'muted small' }, '仅使用记录完整的卡片。'),
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
                if (!confirm('恢复 FSRS 默认参数？')) return;
                store.setParameters(null);
                d.close();
                toast('已恢复默认参数');
                onChanged?.();
              },
            },
            '恢复默认参数',
          )
        : null,
      runBtn,
    ],
  });
  return d;
}
