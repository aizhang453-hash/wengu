// 文字格式 (Quizlet 的加粗、斜体、下划线、高亮), 存成几个记号:
//   **加粗**  *斜体*  __下划线__  ==高亮==
// 只有成对出现的才算记号, 单个的 * 照原样显示 (比如 5 * 3)。
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
  for (let k = 0; k < parts.length; k++) {
    const part = parts[k];
    if (k % 2 === 0) {
      push(part);
      continue;
    }
    const kind = KIND[part];
    if (on[kind]) {
      on[kind] = false; // 收尾
    } else if (parts.slice(k + 1).some((p, j) => j % 2 === 1 && p === part)) {
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
