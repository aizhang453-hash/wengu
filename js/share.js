// 分享链接: 一个卡片集压缩成 #/share/<一串字>, 别人 (或者自己的手机) 点开就能导入。
// 只带文字 (标题、简介、语言、词、解释), 图片可以带网址 (从 Quizlet 搬来的那种), 自己的图片和录音太大带不了。
// 格式: 'z' + base64url(压缩过的 JSON), 浏览器不能压缩时 'j' + base64url(JSON)

function toB64url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(text) {
  const bin = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function pipe(bytes, stream) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}

export async function encodeShare(set) {
  const payload = {
    v: 1,
    t: set.title ?? '',
    d: set.description ?? '',
    l: [set.termLang ?? 'auto', set.defLang ?? 'auto'],
    c: set.cards.map((c) => (c.imageUrl ? [c.term, c.def, c.imageUrl] : [c.term, c.def])),
  };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  if (typeof CompressionStream !== 'undefined') {
    try {
      return `z${toB64url(await pipe(bytes, new CompressionStream('deflate-raw')))}`;
    } catch {
      // 压缩不了就不压
    }
  }
  return `j${toB64url(bytes)}`;
}

// 返回 { title, description, termLang, defLang, cards: [{ term, def, imageUrl? }] }; 坏了返回 null
export async function decodeShare(text) {
  try {
    const kind = text[0];
    let bytes = fromB64url(text.slice(1));
    if (kind === 'z') bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
    else if (kind !== 'j') return null;
    const p = JSON.parse(new TextDecoder().decode(bytes));
    if (!p || !Array.isArray(p.c)) return null;
    const str = (x) => (typeof x === 'string' ? x : '');
    return {
      title: str(p.t),
      description: str(p.d),
      termLang: str(p.l?.[0]) || 'auto',
      defLang: str(p.l?.[1]) || 'auto',
      cards: p.c
        .filter(Array.isArray)
        .map(([term, def, imageUrl]) => ({ term: str(term), def: str(def), ...(/^https:\/\//.test(str(imageUrl)) ? { imageUrl } : {}) }))
        .filter((c) => c.term || c.def || c.imageUrl),
    };
  } catch {
    return null;
  }
}

export function shareUrl(code, base = `${location.origin}${location.pathname}`) {
  return `${base}#/share/${code}`;
}
