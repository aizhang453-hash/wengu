// 国际象棋的开局浏览器 (v1.86): 每个局面大家怎么走、每步走过几盘、白赢 / 黑赢各几成。
// 统计是事先算好的 (tools/chess-explorer.mjs), 一个资料库分成 256 个小文件 (js/explorer/<资料库>/<00–ff>.js), 翻到哪个局面才下载哪个。
// 资料库: master 大师 (KingBase 2019 + Lichess 比赛直播棋局 + PGN Mentor 名人棋局, 双方 2200 分以上)、
//         lo / mid / hi Lichess 网上的棋 (按双方平均分换成 chess.com 的分: 1000 以下 / 1000–1600 / 1600 以上)。

export const EX_DBS = [
  { key: 'master', name: '大师' },
  { key: 'hi', name: '1600 分以上' },
  { key: 'mid', name: '1000–1600 分' },
  { key: 'lo', name: '1000 分以下' },
];

// FNV-1a 32 位 (seed 不同, 算出两个不相干的数)
function fnv(s, seed) {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// 局面的钥匙: 棋子摆法 + 谁走 + 易位权 + 吃过路兵的格子 (不看步数)。
// 返回 { key: 文件里写的编号, shard: 在哪个小文件 (两位十六进制) }
export function exKey(fen) {
  const s = String(fen).split(' ').slice(0, 4).join(' ');
  const a = fnv(s, 0x811c9dc5);
  const b = fnv(s, 0x2b992ddf);
  return { key: a.toString(36) + (b & 0xffff).toString(36).padStart(4, '0'), shard: (a & 0xff).toString(16).padStart(2, '0') };
}

// 一个小文件的内容 → Map(钥匙 → [{ uci, n 走过几盘, w 白赢几成, b 黑赢几成 }])
//   每行: 钥匙 走法,盘数,白赢%,黑赢% 走法,…
export function parseShard(text) {
  const map = new Map();
  for (const line of String(text).split('\n')) {
    const parts = line.split(' ');
    if (parts.length < 2) continue;
    map.set(
      parts[0],
      parts.slice(1).map((m) => {
        const [uci, n, w, b] = m.split(',');
        return { uci, n: Number(n), w: Number(w), b: Number(b) };
      }),
    );
  }
  return map;
}

const cache = new Map(); // `${资料库}/${小文件}` → Promise<Map>
export function loadShard(db, shard, base = './explorer') {
  const id = `${db}/${shard}`;
  if (!cache.has(id)) {
    cache.set(
      id,
      import(`${base}/${id}.js`)
        .then((m) => parseShard(m.default))
        .catch((e) => {
          cache.delete(id);
          throw e;
        }),
    );
  }
  return cache.get(id);
}

// 这个局面在这个资料库里大家怎么走 (从多到少); 没有记录: []
export async function explore(db, fen) {
  const { key, shard } = exKey(fen);
  const map = await loadShard(db, shard);
  return [...(map.get(key) ?? [])].sort((x, y) => y.n - x.n);
}
