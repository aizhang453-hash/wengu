// 文字格式 (Quizlet 的加粗、斜体、下划线、高亮), 存成几个记号:
//   **加粗**  *斜体*  __下划线__  ==高亮==
// 只有成对出现、而且贴着字的才算记号 (跟 Markdown 一样): **词** 是加粗;
// 单个的、两边是空格的照原样显示 (5 * 3 * 2、a == b、填空的 ____、snake_case__name)。
// 判分、朗读、导出、比较时都先去掉记号。

export const MARKS = {
  bold: '**',
  italic: '*',
  underline: '__',
  highlight: '==',
};

const TOKEN = /(\*\*|__|==|\*)/;
const KIND = { '**': 'b', '*': 'i', __: 'u', '==': 'hl' };

// 拆成一段一段: [{ text, b, i, u, hl }]
export function parseMarks(text) {
  const parts = String(text ?? '').split(TOKEN);
  const on = { b: false, i: false, u: false, hl: false };
  const out = [];
  const push = (t) => {
    if (!t) return;
    const last = out.at(-1);
    if (last && last.b === on.b && last.i === on.i && last.u === on.u && last.hl === on.hl) last.text += t;
    else out.push({ text: t, ...on });
  };
  // 记号前后挨着的字 (挨着别的记号的跳过去, 比如 ***又粗又斜***)
  const after = (k) => {
    let j = k + 1;
    while (parts[j] === '' && j + 1 < parts.length) j += 2;
    return parts[j] ?? '';
  };
  const before = (k) => {
    let j = k - 1;
    while (parts[j] === '' && j - 1 > 0) j -= 2;
    return parts[j] ?? '';
  };
  const word = /[\p{L}\p{N}]/u;
  // 开头: 后面紧跟着字; 收尾: 前面紧跟着字。__ 还不能在一个词中间 (snake_case__name)
  const canOpen = (k) => /^\S/.test(after(k)) && !(parts[k] === '__' && word.test(before(k).slice(-1)));
  const canClose = (k) => /\S$/.test(before(k)) && !(parts[k] === '__' && word.test(after(k).slice(0, 1)));
  for (let k = 0; k < parts.length; k++) {
    const part = parts[k];
    if (k % 2 === 0) {
      push(part);
      continue;
    }
    const kind = KIND[part];
    if (on[kind] && canClose(k)) {
      on[kind] = false; // 收尾
    } else if (!on[kind] && canOpen(k) && parts.some((p, j) => j > k && j % 2 === 1 && p === part && canClose(j))) {
      on[kind] = true; // 后面有配对的才开头
    } else {
      push(part); // 落单的照原样
    }
  }
  return out;
}

export function stripMarks(text) {
  return parseMarks(text)
    .map((t) => t.text)
    .join('');
}

export function hasMarks(text) {
  return parseMarks(text).some((t) => t.b || t.i || t.u || t.hl);
}

// 变成网页元素 (用户的字一律当文字放, 不会被当成网页代码)
export function richNodes(text) {
  return parseMarks(text).map((t) => {
    let node = document.createTextNode(t.text);
    for (const [flag, tag] of [
      ['hl', 'mark'],
      ['u', 'u'],
      ['i', 'em'],
      ['b', 'strong'],
    ]) {
      if (!t[flag]) continue;
      const el = document.createElement(tag);
      el.append(node);
      node = el;
    }
    return node;
  });
}

// 编辑时: 选中的字加上 / 去掉记号; 没选就放一对记号, 光标在中间
export function toggleMark(textarea, marker) {
  const { value, selectionStart: a, selectionEnd: b } = textarea;
  const before = value.slice(0, a);
  const sel = value.slice(a, b);
  const after = value.slice(b);
  let next;
  let start;
  let end;
  if (before.endsWith(marker) && after.startsWith(marker)) {
    next = before.slice(0, -marker.length) + sel + after.slice(marker.length);
    start = a - marker.length;
    end = b - marker.length;
  } else if (sel.startsWith(marker) && sel.endsWith(marker) && sel.length >= marker.length * 2) {
    const inner = sel.slice(marker.length, -marker.length);
    next = before + inner + after;
    start = a;
    end = a + inner.length;
  } else {
    next = before + marker + sel + marker + after;
    start = a + marker.length;
    end = b + marker.length;
  }
  textarea.value = next;
  textarea.setSelectionRange(start, end);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.focus();
}
