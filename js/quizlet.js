// 从 Quizlet 一键搬: 书签小工具 (bookmarklet)。
// 在 Quizlet 的卡片集页面上点这个书签: 读出所有卡片 → 压缩成分享链接 → 打开温故的导入页。
// 下面的 grab 和 send 会变成文字放进书签, 在 Quizlet 的页面上跑,
// 所以只能用浏览器自带的东西, 不能用别的文件里的函数; 函数里面也不要写 // 注释 (书签是一整行)。

// 找卡片。Quizlet 的网页改过好几次, 几种都试:
//   1. 网页里藏的数据 (__NEXT_DATA__): 新的是 studiableItems → cardSides, 老的是 termIdToTermsMap
//   2. 都没有就读页面上显示的字 (.TermText)
// 返回 { title, termLang, defLang, cards: [{ term, def, imageUrl }] }
export function grab(doc, win) {
  var best = [];
  var info = { termLang: '', defLang: '' };
  var metas = [];
  var seen = new Set();
  var https = function (u) {
    u = String(u || '');
    if (u.indexOf('//') === 0) u = 'https:' + u;
    return u.replace(/^http:/, 'https:');
  };
  var consider = function (cards) {
    cards = cards.filter(function (c) { return c.term || c.def; });
    if (cards.length > best.length) best = cards;
  };
  var fromSides = function (items) {
    return items.map(function (it) {
      var sides = it.cardSides || [];
      var side = function (label, i) {
        var s = sides.find(function (x) { return x && x.label === label; }) || sides[i];
        return (s && s.media) || [];
      };
      var plain = function (m) {
        var t = m.find(function (x) { return x && (x.type === 1 || typeof x.plainText === 'string'); });
        return t ? String(t.plainText || '') : '';
      };
      var img = function (m) {
        var t = m.find(function (x) { return x && x.type === 2 && x.url; });
        return t ? https(t.url) : '';
      };
      var lang = function (m) {
        var t = m.find(function (x) { return x && x.languageCode; });
        return t ? t.languageCode : '';
      };
      var w = side('word', 0);
      var d = side('definition', 1);
      if (!info.termLang) info.termLang = lang(w);
      if (!info.defLang) info.defLang = lang(d);
      return { term: plain(w), def: plain(d), imageUrl: img(d) || img(w) };
    });
  };
  var fromTerms = function (list) {
    return list
      .slice()
      .sort(function (a, b) { return (a.rank || 0) - (b.rank || 0); })
      .map(function (t) {
        var image = t._imageUrl || t.imageUrl || (t.photo && t.photo.url) || (t.image && t.image.url) || '';
        return { term: String(t.word || ''), def: String(t.definition || ''), imageUrl: image ? https(image) : '' };
      });
  };
  var isTerm = function (v) { return v && typeof v === 'object' && typeof v.word === 'string' && typeof v.definition === 'string'; };
  var walk = function (o, depth) {
    if (o == null || depth > 60) return;
    if (typeof o === 'string') {
      if (o.length > 50 && (o[0] === '{' || o[0] === '[') && /"(word|cardSides|definition)"/.test(o)) {
        try { walk(JSON.parse(o), depth + 1); } catch { return; }
      }
      return;
    }
    if (typeof o !== 'object' || seen.has(o)) return;
    seen.add(o);
    var vals;
    try { vals = Array.isArray(o) ? o : Object.keys(o).map(function (k) { return o[k]; }); } catch { return; }
    if (Array.isArray(o) && o.length && o[0] && Array.isArray(o[0].cardSides)) consider(fromSides(o));
    else if (vals.length && vals.every(isTerm)) consider(fromTerms(vals));
    if (!Array.isArray(o) && typeof o.title === 'string' && o.title && (o.wordLang || o.defLang || o.numTerms != null)) {
      metas.push({ title: o.title, termLang: o.wordLang || '', defLang: o.defLang || '', numTerms: o.numTerms });
    }
    for (var i = 0; i < vals.length; i++) walk(vals[i], depth + 1);
  };
  var tag = doc.getElementById('__NEXT_DATA__');
  if (tag) { try { walk(JSON.parse(tag.textContent), 0); } catch {} }
  try { walk(win.__NEXT_DATA__, 0); } catch {}
  try { walk(win.Quizlet, 0); } catch {}
  var scripts = doc.querySelectorAll('script[type="application/json"]');
  for (var s = 0; s < scripts.length; s++) { try { walk(JSON.parse(scripts[s].textContent), 0); } catch { continue; } }

  if (!best.length) {
    var textOf = function (el) { return el ? String(el.innerText || el.textContent || '').trim() : ''; };
    var imageIn = function (el) {
      var im = el.querySelector('img[src]');
      if (im && /^https?:/.test(im.src)) return https(im.src);
      var bg = el.querySelector('[style*="background-image"]');
      var m = bg && /url\(["']?([^"')]+)/.exec(bg.getAttribute('style'));
      return m ? https(m[1]) : '';
    };
    var boxes = doc.querySelectorAll('.SetPageTerms-term, .SetPageTerm, [data-testid="set-page-term-card"], [data-testid="set-page-card-side"]');
    var cards = [];
    for (var b = 0; b < boxes.length; b++) {
      var parts = boxes[b].querySelectorAll('.TermText');
      if (parts.length >= 2) cards.push({ term: textOf(parts[0]), def: textOf(parts[1]), imageUrl: imageIn(boxes[b]) });
    }
    if (!cards.length) {
      var all = doc.querySelectorAll('.TermText');
      for (var t = 0; t + 1 < all.length; t += 2) cards.push({ term: textOf(all[t]), def: textOf(all[t + 1]), imageUrl: '' });
    }
    consider(cards);
  }
  var h1 = doc.querySelector('h1');
  var h1Text = h1 ? String(h1.innerText || h1.textContent || '').trim() : '';
  var pageTitle = String(doc.title || '').replace(/\s*[|\-–]\s*Quizlet.*$/i, '').replace(/\s*Flashcards\s*$/i, '').trim();
  var meta = metas.find(function (m) { return m.numTerms === best.length; }) || metas.find(function (m) { return h1Text && m.title === h1Text; }) || null;
  var title = meta ? meta.title : h1Text || pageTitle || (metas[0] ? metas[0].title : '');
  return { title: title, termLang: info.termLang || (meta ? meta.termLang : ''), defLang: info.defLang || (meta ? meta.defLang : ''), cards: best };
}

// 压缩成分享链接 (跟 share.js 一样的格式), 打开温故
export async function send(base, d, win) {
  var json = JSON.stringify({ v: 1, f: 'quizlet', t: d.title, d: '', l: [d.termLang || 'auto', d.defLang || 'auto'], c: d.cards.map(function (c) { return c.imageUrl ? [c.term, c.def, c.imageUrl] : [c.term, c.def]; }) });
  var bytes = new TextEncoder().encode(json);
  var kind = 'j';
  try {
    var packed = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    bytes = new Uint8Array(await new Response(packed).arrayBuffer());
    kind = 'z';
  } catch {
    kind = 'j';
  }
  var bin = '';
  for (var i = 0; i < bytes.length; i += 32768) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768));
  var url = base + '#/share/' + kind + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  var w = win.open(url, '_blank');
  if (!w) win.location.href = url;
  return url;
}

const NOT_FOUND = '没找到卡片。请在 Quizlet 的卡片集页面上 (能看到所有词的那一页) 点这个书签。';

// 书签的代码 (一整行); base 是温故的网址
export function bookmarkletCode(base) {
  const body = `(function(){var d=(${grab})(document,window);if(!d.cards.length){alert(${JSON.stringify(NOT_FOUND)});return;}(${send})(${JSON.stringify(base)},d,window);})()`;
  const oneLine = body
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join(' ');
  // 网址里 % 和 # 有特殊意思, 中文也转一下, 浏览器运行前会转回来
  return `javascript:${oneLine.replace(/[%#]|[^\x20-\x7e]/g, (ch) => encodeURIComponent(ch))}`;
}
