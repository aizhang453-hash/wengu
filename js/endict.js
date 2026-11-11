// 英汉小词典 (v1.81): 邸报英文文章里点一个词看中文意思 (画在 views/wordpop.js)。
//   词表在 js/endict/<字母>.js (tools/en-dict.mjs 从 ECDICT 生成, MIT 许可), 点到哪个字母的词才下载那个 (一个一两百 KB; sw.js 的 LAZY)
//   一条: [音标, 中文意思 (几行), 原形?, 变形的种类?] (left 本身有意思, 也是 leave 的过去式); 只是变形的写成 '=原形:种类' (went → '=go:p')

const loaded = new WeakMap(); // 下载的办法 → (字母 → Promise<词表>) (测试换假的词表时不混)
const defaultImporter = (letter) => import(`./endict/${letter}.js`);

function dictOf(letter, importer) {
  if (!loaded.has(importer)) loaded.set(importer, new Map());
  const files = loaded.get(importer);
  if (!files.has(letter)) {
    files.set(
      letter,
      importer(letter)
        .then((m) => m.default ?? m)
        .catch((e) => {
          files.delete(letter); // 断网: 下次再试
          throw e;
        }),
    );
  }
  return files.get(letter);
}

// 点到的字 → 拿去查的几种写法: 原样、小写、去掉 's; 词典里没写的规则变形 (-ies → -y、-ed、-ing、双写的辅音……) 也试试
export function candidates(raw) {
  const w = String(raw ?? '')
    .replace(/[’‘]/g, "'")
    .replace(/^[^A-Za-z]+|[^A-Za-z]+$/g, '');
  if (!w) return [];
  const out = [];
  const add = (x) => x && /^[A-Za-z]/.test(x) && !out.includes(x) && out.push(x);
  const base = w.replace(/'s$/i, '').replace(/s'$/i, 's');
  for (const x of [w, base]) {
    add(x);
    add(x.toLowerCase());
  }
  // 连字符连起来的 (well-known 词典里没有的话): 看最后一截
  if (base.includes('-')) add(base.split('-').pop().toLowerCase());
  const l = base.toLowerCase();
  const rules = [
    [/ies$/, 'y'],
    [/es$/, ''],
    [/s$/, ''],
    [/ied$/, 'y'],
    [/([b-df-hj-np-tv-z])\1ed$/, '$1'],
    [/ed$/, 'e'],
    [/ed$/, ''],
    [/([b-df-hj-np-tv-z])\1ing$/, '$1'],
    [/ing$/, 'e'],
    [/ing$/, ''],
    [/ier$/, 'y'],
    [/iest$/, 'y'],
    [/er$/, ''],
    [/est$/, ''],
    [/ily$/, 'y'],
    [/ly$/, ''],
  ];
  for (const [re, to] of rules) if (re.test(l) && l.length > 3) add(l.replace(re, to));
  return out;
}

const FORMS = { p: '过去式', d: '过去分词', i: '现在分词', 3: '第三人称单数', r: '比较级', t: '最高级', s: '复数' };
export const formText = (kinds) => [...new Set([...String(kinds ?? '')].map((c) => FORMS[c]).filter(Boolean))].join('、');

async function entry(w, importer) {
  const letter = w[0].toLowerCase();
  if (!/[a-z]/.test(letter)) return undefined;
  const dict = await dictOf(letter, importer);
  return Object.hasOwn(dict, w) ? dict[w] : undefined;
}

// 查一个词 → { word (词典里的写法), ph 音标, tr 中文意思, from? (点的是变形: went), kind? (过去式),
//              base?: { word, kind, tr } (这个词本身有意思, 也是别的词的变形: left → leave) }; 没有是 null; 断网抛错
export async function lookupEn(raw, { importer = defaultImporter } = {}) {
  for (const w of candidates(raw)) {
    const v = await entry(w, importer);
    if (v === undefined) continue;
    if (typeof v === 'string') {
      const [lemma, kinds = ''] = v.slice(1).split(':');
      const lv = await entry(lemma, importer);
      if (!Array.isArray(lv)) continue;
      return { word: lemma, ph: lv[0], tr: lv[1], from: w, kind: formText(kinds) };
    }
    const out = { word: w, ph: v[0], tr: v[1] };
    if (v[2]) {
      const b = await entry(v[2], importer);
      if (Array.isArray(b)) out.base = { word: v[2], kind: formText(v[3]), tr: b[1] };
    }
    return out;
  }
  return null;
}
