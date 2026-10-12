// AI 功能的页面部分: 设置 (#/ai)、编辑页「AI 出卡片」、讲解窗口、「让 AI 看看」判分、AI 练习题 (#/set/<id>/quiz)

import { h, fill, toast, openDialog, dialogOpen } from '../dom.js';
import { rich } from '../cardview.js';
import { stripMarks } from '../rich.js';
import { shrinkImage } from '../media.js';
import { playSound } from '../sound.js';
import { loadAI, saveAI, aiReady, testKey, generateCards, judgeAnswer, explainCard, practiceQuiz, fileToBase64, AIError, MODEL, QUIZ_MAX_CARDS } from '../ai.js';

const KEYS_URL = 'https://console.anthropic.com/settings/keys';
const LIMITS_URL = 'https://console.anthropic.com/settings/limits';

const message = (e) => (e instanceof AIError ? e.message : '出错了');

// AI 写的文字: 一行一行, 「- 」开头的当列表; **加粗** 用温故自己的格式显示
function aiText(text) {
  return h(
    'div',
    { class: 'ai-text' },
    text
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => (/^\s*[-•]\s+/.test(l) ? h('div', { class: 'ai-li' }, '• ', rich(l.replace(/^\s*[-•]\s+/, ''))) : h('p', {}, rich(l.replace(/^#+\s*/, ''))))),
  );
}

// ---- 设置 ----
export function renderAISettings({ go }) {
  const config = loadAI();
  const keyInput = h('input', { class: 'input', type: 'password', placeholder: 'sk-ant-……', autocomplete: 'off', 'aria-label': 'API 密钥' });
  const msg = h('p', { class: 'sync-msg', 'aria-live': 'polite' });
  const saveBtn = h(
    'button',
    {
      class: 'btn primary',
      onclick: async () => {
        const apiKey = keyInput.value.trim();
        if (!apiKey) return (msg.textContent = '把密钥粘贴进来');
        saveBtn.disabled = true;
        msg.textContent = '试一下能不能用……';
        try {
          await testKey(apiKey);
          saveAI({ apiKey });
          toast('好了, AI 功能可以用了');
          go('#/ai');
        } catch (e) {
          msg.textContent = message(e);
        } finally {
          saveBtn.disabled = false;
        }
      },
    },
    config ? '换成这个密钥' : '保存',
  );
  const root = h(
    'section',
    { class: 'sync-page ai-page' },
    h('a', { class: 'back', href: '#/' }, '← 首页'),
    h('h1', {}, 'AI 功能 (选填)'),
    h('p', {}, '用你自己的 Anthropic API 密钥, 温故直接连 Claude, 中间不经过别的服务器。不填也完全不影响别的功能。'),
    h(
      'ul',
      { class: 'notes' },
      h('li', {}, h('strong', {}, 'AI 出卡片: '), '编辑页里粘贴笔记、课文, 或者选 PDF、照片, Claude 帮你做成卡片'),
      h('li', {}, h('strong', {}, '让 AI 看看: '), '学习、测试里打字题判错了, 问 Claude 是不是同一个意思 (同义词、换个说法)'),
      h('li', {}, h('strong', {}, 'AI 讲讲: '), '单词卡、学习里点 ✨, 讲意思、给例子、教你怎么记'),
      h('li', {}, h('strong', {}, 'AI 练习题: '), '根据卡片集出考理解、考运用的选择题, 带解析'),
    ),
    config
      ? h(
          'div',
          { class: 'sync-status ok' },
          h('strong', {}, '已经设置好了'),
          h('div', { class: 'muted small' }, `密钥 ${config.apiKey.slice(0, 10)}……${config.apiKey.slice(-4)}, 用的模型是 ${MODEL}`),
          h(
            'div',
            { class: 'row' },
            h(
              'button',
              {
                class: 'btn danger small',
                onclick: () => {
                  if (!confirm('删掉这台设备上的 API 密钥? AI 功能就用不了了。')) return;
                  saveAI(null);
                  go('#/ai');
                },
              },
              '删掉密钥',
            ),
          ),
        )
      : null,
    h(
      'ol',
      { class: 'sync-steps' },
      h('li', {}, h('strong', {}, '去 Anthropic 的网站建一个 API 密钥 '), h('a', { class: 'btn small', href: KEYS_URL, target: '_blank', rel: 'noopener' }, '去建密钥 ↗'), h('p', { class: 'muted small' }, '要先注册、充一点钱 (按用量付费)。建议在 ', h('a', { href: LIMITS_URL, target: '_blank', rel: 'noopener' }, '用量上限'), ' 里设一个每月最多花多少。')),
      h('li', {}, h('strong', {}, config ? '换一个密钥' : '粘贴到这里'), keyInput, h('div', { class: 'row' }, saveBtn), msg),
    ),
    h('h2', {}, '大概花多少钱'),
    h(
      'p',
      { class: 'muted small' },
      `${MODEL} 每一百万个字元 (token) 输入 4 美元、输出 20 美元。大概: 两页笔记出 30 张卡片 0.1 美元左右; 判一次分不到 1 美分; 讲一张卡片 1~2 美分; 出 10 道练习题 0.1 美元左右。PDF、图片越大越贵。`,
    ),
    h('h2', {}, '安全'),
    h(
      'ul',
      { class: 'notes small' },
      h('li', {}, '密钥只存在这台设备的浏览器里, 不会同步到 GitHub, 也不会发给除了 Anthropic 以外的地方'),
      h('li', {}, '能用这个浏览器的人都能看到密钥。公用电脑别存; 最好单独给温故建一个密钥, 设好用量上限, 不用了就在 Anthropic 网站上删掉'),
      h('li', {}, '发给 Claude 的只有你点 AI 功能时的那些内容 (笔记、那张卡片、你写的答案)'),
    ),
  );
  return { title: 'AI 功能', el: root, focus: keyInput };
}

// 没设置时显示的一行字
export function aiSetupHint(text = '要先设置 API 密钥') {
  return h('p', { class: 'muted small' }, `${text}: `, h('a', { href: '#/ai' }, 'AI 功能设置 →'));
}

// ---- 编辑页: AI 出卡片 ----
const MAX_FILES_BYTES = 20 * 1024 * 1024;

export function aiCardsPanel({ onCards }) {
  const box = h('div', { class: 'ai-cards' });
  if (!aiReady()) {
    fill(box, h('p', { class: 'muted small' }, '粘贴笔记、课文, 或者选 PDF、照片, Claude 帮你做成卡片。'), aiSetupHint('要用你自己的 Anthropic API 密钥'));
    return box;
  }
  let files = [];
  let controller = null;
  const notes = h('textarea', { class: 'input', rows: 5, placeholder: '把笔记、课文、要背的内容粘贴到这里 (也可以只选文件)', 'aria-label': '学习材料' });
  const fileInput = h('input', { type: 'file', accept: 'application/pdf,image/*', multiple: true, hidden: true, onchange: () => addFiles([...fileInput.files]) });
  const fileList = h('div', { class: 'ai-files' });
  const count = h('input', { class: 'input tiny', type: 'number', min: 0, max: 200, placeholder: '自动', 'aria-label': '大概几张' });
  const extra = h('input', { class: 'input', placeholder: '还有什么要求 (可以不写), 比如「解释用英文」「只要人名和年份」', 'aria-label': '要求' });
  const result = h('div', { class: 'ai-result' });
  const goBtn = h('button', { class: 'btn primary', type: 'button', onclick: () => run() }, '✨ 出卡片');
  const cancelBtn = h('button', { class: 'btn', type: 'button', hidden: true, onclick: () => controller?.abort() }, '取消');

  function addFiles(list) {
    fileInput.value = '';
    for (const f of list) {
      if (f.type === 'application/pdf' || f.type.startsWith('image/')) files.push(f);
      else toast(`${f.name} 不是 PDF 也不是图片`);
    }
    drawFiles();
  }

  function drawFiles() {
    fill(
      fileList,
      files.map((f, i) =>
        h(
          'span',
          { class: 'media-chip' },
          h('span', { class: 'chip-play' }, `${f.type === 'application/pdf' ? '📄' : '🖼'} ${f.name}`),
          h('button', { class: 'chip-x', type: 'button', 'aria-label': `去掉 ${f.name}`, onclick: () => (files.splice(i, 1), drawFiles()) }, '✕'),
        ),
      ),
    );
  }

  async function run() {
    if (!notes.value.trim() && !files.length) {
      toast('粘贴一些内容, 或者选一个文件');
      notes.focus();
      return;
    }
    const total = files.reduce((n, f) => n + f.size, 0);
    if (total > MAX_FILES_BYTES) return toast('文件太大了 (加起来超过 20MB)');
    goBtn.disabled = true;
    cancelBtn.hidden = false;
    controller = new AbortController();
    fill(result, h('p', { class: 'muted ai-wait' }, 'Claude 在看……内容多的话要一两分钟'));
    try {
      const prepared = [];
      for (const f of files) {
        if (f.type === 'application/pdf') prepared.push({ kind: 'pdf', mediaType: f.type, data: await fileToBase64(f), name: f.name });
        else {
          const img = await shrinkImage(f, 1568);
          prepared.push({ kind: 'image', mediaType: img.type || f.type, data: await fileToBase64(img), name: f.name });
        }
      }
      const out = await generateCards({ text: notes.value, files: prepared, count: Number(count.value) || 0, extra: extra.value, signal: controller.signal });
      showResult(out);
    } catch (e) {
      fill(result, h('p', { class: 'ai-error' }, message(e)));
    } finally {
      goBtn.disabled = false;
      cancelBtn.hidden = true;
      controller = null;
    }
  }

  function showResult({ title, cards }) {
    if (!cards.length) return fill(result, h('p', { class: 'ai-error' }, '没做出卡片, 换点内容试试'));
    const addBtn = h(
      'button',
      {
        class: 'btn primary',
        type: 'button',
        onclick: () => {
          onCards(cards, title);
          fill(result);
          notes.value = '';
          files = [];
          drawFiles();
        },
      },
      `加进来 (${cards.length} 张)`,
    );
    fill(
      result,
      h('p', {}, `做好了 ${cards.length} 张${title ? `「${title}」` : ''}, 看看对不对 (加进来以后还能改):`),
      h('table', { class: 'preview-table' }, h('tbody', {}, cards.slice(0, 50).map((c) => h('tr', {}, h('td', {}, stripMarks(c.term)), h('td', {}, stripMarks(c.def)))))),
      cards.length > 50 ? h('p', { class: 'muted small' }, `还有 ${cards.length - 50} 张……`) : null,
      h('div', { class: 'row' }, addBtn, h('button', { class: 'btn', type: 'button', onclick: () => run() }, '重新出')),
    );
  }

  fill(
    box,
    h('p', { class: 'muted small' }, `用 Claude (${MODEL}) 把笔记、PDF、照片做成卡片。`),
    notes,
    h('div', { class: 'row ai-file-row' }, h('button', { class: 'btn small', type: 'button', onclick: () => fileInput.click() }, '选 PDF / 图片'), fileInput, fileList),
    h('div', { class: 'row ai-options' }, h('label', {}, '大概几张 ', count), extra),
    h('div', { class: 'row' }, goBtn, cancelBtn),
    result,
  );
  return box;
}

// ---- AI 讲讲 ----
export function explainButton(card, set) {
  if (!aiReady()) return null;
  return h(
    'button',
    {
      class: 'icon-btn ai-btn',
      type: 'button',
      title: 'AI 讲讲',
      'aria-label': 'AI 讲讲',
      onclick: (e) => {
        e.stopPropagation();
        openExplainDialog(card, set);
      },
    },
    '✨',
  );
}

export function openExplainDialog(card, set) {
  const controller = new AbortController();
  const body = h('div', { class: 'ai-explain', 'aria-live': 'polite' }, h('p', { class: 'muted ai-wait' }, 'Claude 在想……'));
  openDialog({
    title: `✨ ${stripMarks(card.term).slice(0, 40) || '这张卡片'}`,
    body: [body, h('p', { class: 'muted small' }, `由 Claude 生成, 可能有错, 仅供参考。`)],
    onClose: () => controller.abort(),
  });
  explainCard({ term: card.term, def: card.def, title: set?.title ?? '', signal: controller.signal, onText: (t) => fill(body, aiText(t)) }).catch((e) => {
    if (e.kind !== 'abort') fill(body, h('p', { class: 'ai-error' }, message(e)));
  });
}

// ---- 让 AI 看看 (打字题判错了) ----
// onCorrect(): AI 说算对时调 (跟「我答对了」一样)
export function judgeButton({ prompt, answer, typed, onCorrect }) {
  if (!aiReady() || !typed.trim()) return null;
  const out = h('div', { class: 'ai-judge', 'aria-live': 'polite' });
  const btn = h(
    'button',
    {
      class: 'btn small',
      type: 'button',
      title: '问 Claude 是不是同一个意思',
      onclick: async () => {
        btn.disabled = true;
        fill(out, h('span', { class: 'muted small ai-wait' }, 'Claude 在看……'));
        try {
          const r = await judgeAnswer({ prompt: stripMarks(prompt), answer: stripMarks(answer), typed });
          fill(out, h('div', { class: r.correct ? 'ai-verdict good' : 'ai-verdict bad' }, h('strong', {}, r.correct ? '✓ AI: 算对' : '✗ AI: 还是不对'), r.reason ? ` ${r.reason}` : ''));
          btn.remove();
          if (r.correct) onCorrect();
        } catch (e) {
          fill(out, h('span', { class: 'ai-error small' }, message(e)));
          btn.disabled = false;
        }
      },
    },
    '✨ 让 AI 看看',
  );
  return h('div', { class: 'ai-judge-wrap' }, btn, out);
}

// ---- AI 练习题 ----
export function renderAIQuiz({ store }, id) {
  const set = store.getSet(id);
  const back = set?.virtual ? `#/folder/${encodeURIComponent(set.folderId)}` : `#/set/${encodeURIComponent(id)}`;
  if (!set) return { title: '找不到', el: h('section', { class: 'empty' }, h('h1', {}, '找不到这个卡片集'), h('a', { class: 'btn primary', href: '#/' }, '回首页')) };
  const name = set.title || '未命名卡片集';
  const stage = h('div', { class: 'learn-stage' });
  const bar = h('span', { class: 'meter-fill' });
  let controller = null;
  let questions = [];
  let index = 0;
  let right = 0;
  let phase = 'setup';

  function setup() {
    phase = 'setup';
    bar.style.width = '0%';
    if (!aiReady()) return fill(stage, h('div', { class: 'summary' }, h('h2', {}, 'AI 练习题'), aiSetupHint('要先设置你自己的 Anthropic API 密钥')));
    if (set.cards.length < 3) return fill(stage, h('div', { class: 'summary' }, h('h2', {}, '卡片太少了'), h('p', { class: 'muted' }, '至少要 3 张卡片才能出题。')));
    const counts = [5, 10, 20];
    fill(
      stage,
      h(
        'div',
        { class: 'summary' },
        h('div', { class: 'game-emoji', 'aria-hidden': 'true' }, '✨'),
        h('h2', {}, 'AI 练习题'),
        h('p', { class: 'muted' }, `Claude 根据「${name}」的卡片出选择题, 考理解和运用 (用法、例句、辨析), 答完有解析。`),
        set.cards.length > QUIZ_MAX_CARDS ? h('p', { class: 'muted small' }, `卡片很多, 只用前 ${QUIZ_MAX_CARDS} 张出题。`) : null,
        h('div', { class: 'row center' }, counts.map((n, i) => h('button', { class: i === 1 ? 'btn primary' : 'btn', onclick: () => make(n) }, `出 ${n} 道`))),
      ),
    );
  }

  async function make(count) {
    phase = 'loading';
    controller = new AbortController();
    fill(stage, h('div', { class: 'summary' }, h('p', { class: 'muted ai-wait' }, `Claude 在出 ${count} 道题……一般要半分钟到一分钟`), h('button', { class: 'btn', onclick: () => controller.abort() }, '取消')));
    try {
      questions = await practiceQuiz({ title: name, cards: set.cards, count, signal: controller.signal });
      index = 0;
      right = 0;
      ask();
    } catch (e) {
      if (e.kind === 'abort') return setup();
      fill(stage, h('div', { class: 'summary' }, h('p', { class: 'ai-error' }, message(e)), h('button', { class: 'btn primary', onclick: setup }, '再试一次')));
      phase = 'setup';
    }
  }

  function ask() {
    bar.style.width = `${(index / questions.length) * 100}%`;
    if (index >= questions.length) return finish();
    phase = 'question';
    const q = questions[index];
    const feedback = h('div', { class: 'feedback', 'aria-live': 'polite' });
    const buttons = q.options.map((opt, i) => h('button', { class: 'option', onclick: () => choose(i) }, h('span', { class: 'key' }, String(i + 1)), h('span', { class: 'option-text' }, opt)));
    const choose = (i) => {
      if (phase !== 'question') return;
      phase = 'feedback';
      const ok = i === q.answer;
      if (ok) right++;
      playSound(ok ? 'right' : 'wrong');
      buttons.forEach((b, j) => {
        b.disabled = true;
        if (j === q.answer) b.classList.add('right');
        else if (j === i) b.classList.add('wrong');
      });
      const cont = h('button', { class: 'btn primary', onclick: next }, index + 1 < questions.length ? '下一题' : '看结果');
      feedback.className = `feedback ${ok ? 'good' : 'bad'}`;
      fill(feedback, h('strong', {}, ok ? '对了!' : `不对, 是 ${String.fromCharCode(65 + q.answer)}`), q.explanation ? h('div', { class: 'small' }, q.explanation) : null, h('div', { class: 'row' }, cont));
      cont.focus();
    };
    const view = h('div', { class: 'question' }, h('div', { class: 'q-head' }, h('span', { class: 'muted small' }, 'AI 练习题'), h('span', { class: 'muted small' }, `${index + 1}/${questions.length}`)), h('div', { class: 'q-text ai-q' }, q.question), h('div', { class: 'options-grid' }, buttons), feedback);
    view.choose = choose;
    fill(stage, view);
  }

  function next() {
    if (phase !== 'feedback') return;
    index++;
    ask();
  }

  function finish() {
    phase = 'done';
    bar.style.width = '100%';
    fill(
      stage,
      h(
        'div',
        { class: 'summary' },
        h('div', { class: 'game-emoji', 'aria-hidden': 'true' }, right === questions.length ? '🎉' : '📝'),
        h('h2', {}, `${right} / ${questions.length}`),
        h('p', { class: 'muted' }, right === questions.length ? '全对了!' : '错的题再看看解析, 回去复习一下对应的卡片。'),
        h('div', { class: 'row center' }, h('button', { class: 'btn primary', onclick: setup }, '再出一套'), h('a', { class: 'btn', href: back }, `回「${name}」`)),
      ),
    );
  }

  function onKey(e) {
    if (dialogOpen() || e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('input, textarea, select')) return;
    const view = stage.firstChild;
    if (phase === 'question' && view?.choose) {
      const n = Number(e.key);
      if (n >= 1 && n <= questions[index].options.length) {
        e.preventDefault();
        view.choose(n - 1);
      }
    } else if (phase === 'feedback' && e.key === 'Enter' && !e.target.closest?.('button')) {
      e.preventDefault();
      next();
    }
  }
  document.addEventListener('keydown', onKey);
  setup();

  return {
    title: `AI 练习题 · ${name}`,
    el: h('section', { class: 'learn ai-quiz' }, h('a', { class: 'back', href: back }, `← ${name}`), h('span', { class: 'meter thin' }, bar), stage, h('p', { class: 'muted small keys' }, '键盘: 按 1–4 选 · 回车下一题 · 题目由 Claude 生成, 可能有错')),
    cleanup: () => {
      controller?.abort();
      document.removeEventListener('keydown', onKey);
    },
  };
}
