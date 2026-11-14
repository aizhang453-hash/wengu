// 国际象棋人物的头像 (v1.82): 圆形头像, 头、头发、衣服按 chesspeople.js 里每个人的 look 画。
// 会眨眼、说话时嘴一张一合; 表情 (mood) 跟着这步好坏变: normal 平常 / smile 微笑 / happy 高兴 / wow 惊喜 / hmm 犹豫 / worried 着急 / shock 吓一跳。
// 彩蛋人物温温用 views/pet.js 里小乌龟的画法。
// 只拼写死的图形和颜色 (颜色来自 chesspeople.js), 没有用户写的字。

import { turtleSvg } from './pet.js';

const SHADE = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(v * k))));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
};

// 头发、帽子: behind 画在衣服后面 (垂到肩上的头巾), back 画在头后面, front 画在头前面, top 盖在脸上的东西 (头盔的护鼻、辫子);
// ears: false 不画耳朵 (被头盔、头巾盖住)
function hair(look, id) {
  const c = look.hair;
  const d = SHADE(c, 0.8);
  switch (look.style) {
    case 'bob':
      return {
        back: `<path fill="${c}" d="M27 64 C23 40 31 18 50 18 C69 18 77 40 73 64 Q68 69 63 64 L37 64 Q32 69 27 64 Z"/>`,
        front: `<path fill="${c}" d="M30.5 46 C30 29 39 20.5 51 20.5 C62.5 20.5 70.5 29 69.5 46 C66 37 58 31.5 47 33.5 C40 35 34.5 39.5 30.5 46 Z"/><path fill="none" stroke="${d}" stroke-width="0.8" d="M47 33.5 C52 29 60 27 66 31"/>`,
      };
    case 'side':
      return {
        back: `<path fill="${c}" d="M30 50 C28 30 37 19.5 50 19.5 C63 19.5 72 30 70 50 Z"/>`,
        front: `<path fill="${c}" d="M30.2 46 C29 30 38 20 51 20 C63 20 71.5 29 69.8 46 C68.5 39 66 35 61.5 33 C55 31.5 47.5 34.5 40 33 C35.5 35 32 40 30.2 46 Z"/><path fill="none" stroke="${d}" stroke-width="0.9" d="M40 33 C43 27 49 23.5 56 23"/>`,
      };
    case 'curly': {
      const dots = [[31, 43, 5.5], [32, 34, 6], [37, 26.5, 6.5], [45, 22, 6.5], [54, 21.5, 6.5], [62.5, 25.5, 6.5], [68, 33, 6], [69, 42, 5.5], [41, 30, 5], [50, 28, 5], [59, 30, 5]];
      return {
        back: `<path fill="${c}" d="M29 50 C27 32 37 20 50 20 C63 20 73 32 71 50 Z"/>`,
        front: dots.map(([x, y, r]) => `<circle fill="${c}" cx="${x}" cy="${y}" r="${r}"/>`).join('') + `<path fill="none" stroke="${d}" stroke-width="0.8" d="M36 28 q3 -3 6 0 M47 24 q3 -3 6 0 M57 26 q3 -3 6 0"/>`,
      };
    }
    case 'ponytail':
      return {
        back: `<path fill="${c}" d="M64 30 C79 30 85 46 80 66 C77 72 73 70 74 64 C76 52 72 42 64 38 Z"/><path fill="${c}" d="M29 54 C27 31 37 19.5 50 19.5 C63 19.5 73 31 71 54 Z"/><rect x="65" y="31" width="6" height="5" rx="2" fill="#d2504a" transform="rotate(30 68 33)"/>`,
        front: `<path fill="${c}" d="M30.3 47 C29.5 30 39 21 50.5 21 C62 21 70.5 30 69.7 47 C68 41 65 38 61 36.5 C57 39 50 39.5 44 37.5 C40 39 36 41 33 44 Z"/>`,
      };
    case 'bald':
      return {
        front: `<path fill="${c}" d="M30.5 54 C28.5 45 29.5 39 33.5 35.5 C33 41 33.5 47 35 52 Z"/><path fill="${c}" d="M69.5 54 C71.5 45 70.5 39 66.5 35.5 C67 41 66.5 47 65 52 Z"/><ellipse cx="44" cy="28" rx="6" ry="3" fill="#ffffff" opacity=".25" transform="rotate(-18 44 28)"/>`,
      };
    case 'kid': // 短头发, 头顶翘一撮
      return {
        back: `<path fill="${c}" d="M30 48 C28 30 37 20 50 20 C63 20 72 30 70 48 Z"/>`,
        front: `<path fill="${c}" d="M30.4 44 C30 30 39 21.5 50 21.5 C61 21.5 70 30 69.6 44 C67 38 63 35 58 35.5 L55 32 L52 35.5 C47 34 41 34 37 37 C34 39 32 41 30.4 44 Z"/><path fill="${c}" d="M49 22.5 C47 16 52 13 55 15.5 C52 16 51 19 52.5 22 Z"/>`,
      };
    case 'helmet': { // 骑士: 锁子甲头巾 + 铁盔 + 护鼻
      const mail = '#9aa1ab';
      return {
        behind: `<path fill="${mail}" d="M24 52 C22 30 34 16 50 16 C66 16 78 30 76 52 L79 82 L21 82 Z"/><path fill="none" stroke="${SHADE(mail, 0.8)}" stroke-width="0.7" stroke-dasharray="1.2 1.6" d="M27 60 H73 M26 66 H74 M25 72 H75 M24 78 H76"/>`,
        ears: false,
        front: `<path fill="#c3c8cf" stroke="#7d848e" stroke-width="0.8" d="M28.5 43 C28 25 38 15.5 50 15.5 C62 15.5 72 25 71.5 43 C66 37.5 58.5 35 50 35 C41.5 35 34 37.5 28.5 43 Z"/><path fill="none" stroke="#e9ecef" stroke-width="1.2" stroke-linecap="round" d="M36 24 C40 20 45 18.5 49 18.5"/><path fill="#7d848e" d="M28.5 43 C34 37.5 41.5 35 50 35 C58.5 35 66 37.5 71.5 43 L71.5 45 C66 39.5 58.5 37 50 37 C41.5 37 34 39.5 28.5 45 Z"/>`,
        top: `<rect x="48.6" y="35" width="2.8" height="17" rx="1" fill="#aab0b8" stroke="#7d848e" stroke-width="0.6"/>`,
      };
    }
    case 'turban': {
      const t = look.turban;
      const td = SHADE(t, 0.86);
      return {
        front: `<path fill="${t}" d="M26.5 42 C24 24 37 12.5 50 12.5 C63 12.5 76 24 73.5 42 C67 35 58.5 32.5 50 32.5 C41.5 32.5 33 35 26.5 42 Z"/><path fill="none" stroke="${td}" stroke-width="1.3" d="M29 35 C38 24 56 20 71 31 M28 29 C40 20 58 18 69 25 M33 21 C43 15 57 15 66 19"/><path fill="${look.band}" d="M27.5 40.5 C34 34.5 41.5 32 50 32 C58.5 32 66 34.5 72.5 40.5 L72 43 C66 37.5 58.5 35 50 35 C41.5 35 34 37.5 28 43 Z"/><circle cx="50" cy="31" r="2.6" fill="#d8b04c" stroke="#a8842c" stroke-width="0.6"/>`,
      };
    }
    case 'bun':
      return {
        back: `<path fill="${c}" d="M29 50 C27 30 37 20 50 20 C63 20 73 30 71 50 Z"/><circle cx="50" cy="16.5" r="7.5" fill="${c}"/><path fill="none" stroke="${d}" stroke-width="0.8" d="M44.5 15 Q50 11 55.5 15 M45 19 Q50 15.5 55 19"/>`,
        front: `<path fill="${c}" d="M30.5 46 C30 30 39 21.5 50 21.5 C61 21.5 70 30 69.5 46 C66 37 60 32 50 31.5 C40 32 34 37 30.5 46 Z"/><path fill="none" stroke="${d}" stroke-width="0.8" d="M50 22 C46 26 40 30 33 40 M50 22 C54 26 60 30 67 40"/>`,
      };
    case 'sage': // 头顶光, 两边白头发垂到肩上
      return {
        back: `<path fill="${c}" d="M30 46 C26 58 26 70 31 78 L37 74 C34 66 34 56 35 50 Z"/><path fill="${c}" d="M70 46 C74 58 74 70 69 78 L63 74 C66 66 66 56 65 50 Z"/>`,
        front: `<path fill="${c}" d="M30.5 54 C28 45 29 38 34 34 C33.5 41 34 47 35.5 52 Z"/><path fill="${c}" d="M69.5 54 C72 45 71 38 66 34 C66.5 41 66 47 64.5 52 Z"/><ellipse cx="44" cy="28" rx="6" ry="3" fill="#ffffff" opacity=".2" transform="rotate(-18 44 28)"/>`,
      };
    case 'veil': { // 中分的头发, 外面一层头纱垂到肩上, 额头一圈金边
      const v = look.veil;
      return {
        behind: `<path fill="${v}" stroke="${SHADE(v, 0.85)}" stroke-width="0.8" d="M24 82 C20 50 28 17 50 17 C72 17 80 50 76 82 Z"/>`,
        ears: false,
        back: `<path fill="${c}" d="M29.5 56 C27 34 37 21 50 21 C63 21 73 34 70.5 56 Z"/>`,
        front: `<path fill="${c}" d="M31 47 C31 31 40 23 50 23 C60 23 69 31 69 47 C65 38 58 33.5 51 33 L50 30 L49 33 C42 33.5 35 38 31 47 Z"/><path fill="none" stroke="${look.trim}" stroke-width="1.3" d="M30 41 C34 27 42 21.5 50 21.5 C58 21.5 66 27 70 41"/><circle cx="50" cy="21.6" r="1.6" fill="${look.trim}"/>`,
      };
    }
    case 'braid': // 中分长头发, 一条辫子从右边垂到胸前
      return {
        back: `<path fill="${c}" d="M29 56 C27 32 37 20 50 20 C63 20 73 32 71 56 Z"/>`,
        front: `<path fill="${c}" d="M30.5 47 C30 30 39 21.5 50 21.5 C61 21.5 70 30 69.5 47 C66 38 59 33 51 32.5 L50 29.5 L49 32.5 C41 33 34 38 30.5 47 Z"/>`,
        top: [60, 66, 72, 78, 84, 90].map((y, i) => `<ellipse cx="${69 + i * 0.6}" cy="${y}" rx="3.6" ry="3.8" fill="${c}" stroke="${d}" stroke-width="0.6"/>`).join('') + `<rect x="70.6" y="93" width="5" height="2.4" rx="1" fill="#d6463c"/>`,
      };
    case 'slick': // 侧分, 抹了发油, 亮亮的
      return {
        back: `<path fill="${c}" d="M30 48 C28 30 37 19.5 50 19.5 C63 19.5 72 30 70 48 Z"/>`,
        front: `<path fill="${c}" d="M30.2 45 C29 29 38 20 51 20 C63 20 71.5 29 69.8 45 C69 38 66 33 61 31 C54 29.5 44 31.5 38 31.5 C34 34 31.5 39 30.2 45 Z"/><path fill="none" stroke="#ffffff" stroke-opacity=".35" stroke-width="1.2" stroke-linecap="round" d="M42 25 C48 22.5 56 23 62 26"/><path fill="none" stroke="${d}" stroke-width="0.9" d="M38 31.5 C40 26 43 23 46 21.5"/>`,
      };
    case 'short': // 板寸
      return {
        back: `<path fill="${c}" d="M30.5 46 C29.5 30 38.5 21 50 21 C61.5 21 70.5 30 69.5 46 Z"/>`,
        front: `<path fill="${c}" d="M30.5 43 C30 29.5 39 21.5 50 21.5 C61 21.5 70 29.5 69.5 43 C68 36.5 64 33 58 32 C52 31.3 47 31.3 42 32 C36 33 32 36.5 30.5 43 Z"/>`,
      };
    case 'messy': // 乱乱的一头头发
      return {
        back: `<path fill="${c}" d="M29 50 C26 30 36 17.5 50 17.5 C64 17.5 74 30 71 50 Z"/>`,
        front: `<path fill="${c}" d="M29.5 46 C27 28 37 16.5 51 17.5 C64 17.5 74 28 70.5 46 L68 37 L66 41.5 L64.5 33.5 L60.5 38 L58.5 31 L54 35.5 L51 29.5 L47 35.5 L43 30.5 L41 37.5 L37 33.5 L35 41 L32.5 37 Z"/><path fill="${c}" d="M44 19 C42 12 48 10 51 12.5 C48 13 47 16 48.5 19 Z M56 18.5 C58 13 63 13.5 64 16.5 C61 15.5 59 17 58.5 19.5 Z"/>`,
      };
    default:
      return {};
  }
}

// 胡子 (画在嘴后面, 嘴照样露出来)
function beard(look) {
  const c = look.hair;
  const d = SHADE(c, 0.85);
  if (look.beard === 'short') return `<path fill="${c}" d="M33 55 C34 64 41 70 50 70 C59 70 66 64 67 55 C64 61 58 64 56 63.5 Q50 62 44 63.5 C42 64 36 61 33 55 Z"/>`;
  if (look.beard === 'full') return `<path fill="${c}" d="M31 50 C30 66 38 77 50 77 C62 77 70 66 69 50 C67 59 62 64 57 63.5 Q50 61.5 43 63.5 C38 64 33 59 31 50 Z"/><path fill="none" stroke="${d}" stroke-width="0.7" d="M41 68 Q43 72 46 74 M50 68 V75.5 M59 68 Q57 72 54 74"/><path fill="${c}" d="M42 57 Q46 54.5 50 56 Q54 54.5 58 57 Q54 58.6 50 57.6 Q46 58.6 42 57 Z"/>`;
  if (look.beard === 'long') return `<path fill="${c}" d="M31.5 52 C31 70 39 88 50 96 C61 88 69 70 68.5 52 C66 60 61 64 57 63.5 Q50 61.5 43 63.5 C39 64 34 60 31.5 52 Z"/><path fill="none" stroke="${d}" stroke-width="0.7" d="M42 70 Q44 80 48 88 M50 70 V92 M58 70 Q56 80 52 88"/><path fill="${c}" d="M41.5 57 Q46 54 50 56 Q54 54 58.5 57 Q55 59 50 57.8 Q45 59 41.5 57 Z"/>`;
  return '';
}

function clothes(look, id) {
  const c = look.shirt;
  const d = SHADE(c, 0.82);
  const shape = 'M8 104 C10 86 25 78.5 50 78.5 C75 78.5 90 86 92 104 Z';
  const body = `<path fill="${c}" d="${shape}"/>`;
  switch (look.collar) {
    case 'cardigan':
      return `${body}<path fill="#fbf7f0" d="M42.5 78.5 L50 93 L57.5 78.5 Z"/><path fill="none" stroke="${d}" stroke-width="1.4" d="M42 78.5 L50 95 L50 104 M58 78.5 L50 95"/><circle cx="50" cy="99" r="1.1" fill="${d}"/>`;
    case 'polo':
      return `${body}<path fill="${d}" d="M41 78 L47 87.5 L50 80.5 Z M59 78 L53 87.5 L50 80.5 Z"/><path fill="none" stroke="${d}" stroke-width="1" d="M50 81 L50 95"/><circle cx="50" cy="88" r="0.9" fill="#f4f1ea"/><circle cx="50" cy="92.5" r="0.9" fill="#f4f1ea"/>`;
    case 'hoodie':
      return `${body}<path fill="${d}" d="M33 81 Q50 95 67 81 Q63 75 50 77 Q37 75 33 81 Z"/><path fill="none" stroke="#f1f1f1" stroke-width="1" stroke-linecap="round" d="M46 85 L45 96 M54 85 L55 96"/>`;
    case 'uniform':
      return `${body}<path fill="none" stroke="#3a64b0" stroke-width="3.2" d="M13 100 C17 88 26 82 37 80 M87 100 C83 88 74 82 63 80"/><path fill="#3a64b0" d="M43 78.5 L50 86 L57 78.5 Z"/><path fill="none" stroke="#c9ccd3" stroke-width="0.9" d="M50 86 L50 104"/>`;
    case 'suit':
      return `${body}<path fill="#f7f7f5" d="M43 78.5 L50 96 L57 78.5 Z"/><path fill="${look.tie ?? '#a63a32'}" d="M48.4 81 L51.6 81 L52.8 92 L50 97 L47.2 92 Z"/><path fill="${d}" d="M43 78.5 L50 96 L44 104 L35 84 Z M57 78.5 L50 96 L56 104 L65 84 Z"/>`;
    case 'tee': // 小孩的条纹 T 恤
      return `<defs><clipPath id="${id}b"><path d="${shape}"/></clipPath></defs>${body}<g clip-path="url(#${id}b)" fill="${look.stripe}"><rect x="0" y="88" width="100" height="4"/><rect x="0" y="97" width="100" height="4"/></g><path fill="none" stroke="${d}" stroke-width="1.6" d="M42.5 79 Q50 84 57.5 79"/>`;
    case 'armor': { // 锁子甲 + 红色罩袍, 胸前一个金色人字纹
      const mail = '#9aa1ab';
      return `<path fill="${mail}" d="${shape}"/><path fill="none" stroke="${SHADE(mail, 0.8)}" stroke-width="0.7" stroke-dasharray="1.2 1.6" d="M14 92 H86 M11 98 H89"/><path fill="${look.tabard}" d="M32 104 L35 84 Q50 89 65 84 L68 104 Z"/><path fill="none" stroke="#e2b53c" stroke-width="2.4" stroke-linejoin="round" d="M42 99 L50 92 L58 99"/>`;
    }
    case 'jersey': // 球衣: V 领、领口和袖口一圈绿边
      return `${body}<path fill="none" stroke="${look.trim}" stroke-width="3" stroke-linejoin="round" d="M42 79 L50 88 L58 79"/><path fill="none" stroke="${look.trim}" stroke-width="2.2" d="M11 98 C14 90 20 85 27 82 M89 98 C86 90 80 85 73 82"/>`;
    case 'robe': // 长袍: 交领, 金边
      return `${body}<path fill="#f1ead9" d="M42 78.5 L50 92 L58 78.5 Z"/><path fill="none" stroke="${look.trim}" stroke-width="2.4" d="M41 78.5 L52 104 M59 78.5 L48 96"/>`;
    case 'shawl': // 毛衣外面披一条披肩
      return `${body}<path fill="#f3efe7" d="M43 78.5 L50 89 L57 78.5 Z"/><path fill="${SHADE(c, 1.25)}" d="M14 92 C20 82 32 79 43 78.5 L48 92 C40 98 30 101 22 104 L12 104 Z M86 92 C80 82 68 79 57 78.5 L52 92 C60 98 70 101 78 104 L88 104 Z"/><path fill="none" stroke="${d}" stroke-width="0.8" stroke-dasharray="2 2" d="M18 96 C28 92 38 89 46 88 M82 96 C72 92 62 89 54 88"/>`;
    case 'drape': // 斜披一块布, 金边
      return `${body}<path fill="${SHADE(c, 0.92)}" d="M20 84 C34 80 46 79 56 80 L80 104 L44 104 Z"/><path fill="none" stroke="${look.trim}" stroke-width="2.2" d="M20 84 C34 80 46 79 56 80 L80 104"/>`;
    case 'gown': // 方领礼服, 金边, 珍珠项链
      return `${body}<path fill="${SHADE(look.skin, 0.97)}" d="M37 79.5 Q50 83 63 79.5 L61 87 Q50 89.5 39 87 Z"/><path fill="none" stroke="${look.trim}" stroke-width="2" d="M38.5 87 Q50 90 61.5 87"/>` + (look.pearls ? [40, 43.5, 47, 50.5, 54, 57.5, 61].map((x, i) => `<circle cx="${x - 0.5}" cy="${82.5 + Math.abs(i - 3) * -0.55 + 2}" r="1.1" fill="#fbf8f2" stroke="#d9d2c4" stroke-width="0.3"/>`).join('') : '');
    case 'blazer': // 西装外套, 里面白上衣
      return `${body}<path fill="#f7f5f0" d="M42 78.5 L50 92 L58 78.5 Z"/><path fill="${d}" d="M42 78.5 L50 93 L45 104 L36 86 Z M58 78.5 L50 93 L55 104 L64 86 Z"/>`;
    case 'vest': // 白衬衫、深色马甲、红领结
      return `${body}<path fill="${look.vest}" d="M30 86 C33 82 38 80 41 80 L50 98 L59 80 C62 80 67 82 70 86 L69 104 L31 104 Z"/><circle cx="50" cy="101" r="0.9" fill="#d9c58b"/><path fill="${look.bow}" d="M43.5 79.5 L50 82.3 L43.5 85.2 Z M56.5 79.5 L50 82.3 L56.5 85.2 Z"/><circle cx="50" cy="82.3" r="1.6" fill="${SHADE(look.bow, 0.8)}"/>`;
    case 'track': // 运动服: 立领、拉链、肩上两道白杠
      return `${body}<path fill="none" stroke="#ffffff" stroke-width="1.6" d="M12 99 C15 89 23 84 33 81 M15 101 C18 91 25 86 35 83 M88 99 C85 89 77 84 67 81 M85 101 C82 91 75 86 65 83"/><path fill="${d}" d="M42 76 L58 76 L59 82 Q50 85 41 82 Z"/><path fill="none" stroke="#e8e8e8" stroke-width="1" d="M50 83 V104"/>`;
    default:
      return body;
  }
}
function face(mood, look) {
  const ink = '#2a211c';
  const brow = look.brows ?? SHADE(look.hair ?? '#333333', 0.9);
  const b = (l, r) => `<path class="cf-brow" fill="none" stroke="${brow}" stroke-width="1.7" stroke-linecap="round" d="${l} ${r}"/>`;
  const dotEyes = (ry = 2.8, dx = 0) =>
    `<g class="cf-eyes"><ellipse cx="${42 + dx}" cy="47.5" rx="2.3" ry="${ry}" fill="${ink}"/><ellipse cx="${58 + dx}" cy="47.5" rx="2.3" ry="${ry}" fill="${ink}"/><circle cx="${42.8 + dx}" cy="46.4" r="0.8" fill="#fff"/><circle cx="${58.8 + dx}" cy="46.4" r="0.8" fill="#fff"/></g>`;
  const arcEyes = `<path fill="none" stroke="${ink}" stroke-width="1.6" stroke-linecap="round" d="M39.3 48.3 Q42 44.8 44.7 48.3 M55.3 48.3 Q58 44.8 60.7 48.3"/>`;
  const talk = `<ellipse class="cf-talk" cx="50" cy="61" rx="3" ry="2.4" fill="#7a2f2a"/>`;
  const mouth = (d, fill = false) => `<path class="cf-mouth" ${fill ? `fill="#7a2f2a"` : 'fill="none"'} stroke="${fill ? 'none' : '#7a3b30'}" stroke-width="1.5" stroke-linecap="round" d="${d}"/>`;
  const cheeks = (o = 0.35) => `<ellipse cx="38.5" cy="55.5" rx="3.3" ry="1.8" fill="#f08b80" opacity="${o}"/><ellipse cx="61.5" cy="55.5" rx="3.3" ry="1.8" fill="#f08b80" opacity="${o}"/>`;
  const sweat = `<path class="cf-sweat" fill="#8fd0f5" stroke="#5aa9d6" stroke-width="0.5" d="M70 34 Q73 39 70.5 41 Q67.5 39.5 70 34 Z"/>`;
  const sparkle = (x, y, s) => `<path class="cf-spark" fill="#ffd34d" d="M${x} ${y - s} L${x + s * 0.3} ${y - s * 0.3} L${x + s} ${y} L${x + s * 0.3} ${y + s * 0.3} L${x} ${y + s} L${x - s * 0.3} ${y + s * 0.3} L${x - s} ${y} L${x - s * 0.3} ${y - s * 0.3} Z"/>`;
  // 严格的人 (程老师): 平常、微笑时眉毛压低一点
  if (look.stern && (mood === 'normal' || mood === 'smile')) return b('M37.5 40 Q42 40.4 46 41.6', 'M54 41.6 Q58 40.4 62.5 40') + dotEyes() + mouth(mood === 'smile' ? 'M46 60.4 Q50 62 54 60.4' : 'M46 61 L54 61') + talk;
  switch (mood) {
    case 'smile':
      return b('M37.5 40.6 Q42 38.6 46 40.2', 'M54 40.2 Q58 38.6 62.5 40.6') + dotEyes() + mouth('M44.5 59.5 Q50 64 55.5 59.5') + talk + cheeks(0.25);
    case 'happy':
      return b('M37.5 39.8 Q42 37.6 46 39.4', 'M54 39.4 Q58 37.6 62.5 39.8') + arcEyes + mouth('M44 59 Q50 60 56 59 Q55 66.5 50 66.5 Q45 66.5 44 59 Z', true) + `<path class="cf-mouth" fill="#fff" d="M45 59.4 Q50 60.1 55 59.4 L54.6 61 Q50 61.6 45.4 61 Z"/>` + talk + cheeks(0.45);
    case 'wow':
      return (
        b('M37.5 37.6 Q42 35.2 46 37', 'M54 37 Q58 35.2 62.5 37.6') +
        dotEyes(3.4) +
        mouth('M45.2 59 Q50 58.3 54.8 59 Q54.4 67 50 67 Q45.6 67 45.2 59 Z', true) +
        talk +
        cheeks(0.5) +
        sparkle(22, 24, 4) +
        sparkle(79, 20, 3.2) +
        sparkle(82, 40, 2.4)
      );
    case 'hmm':
      return b('M37.5 39.2 Q42 37 46 38.8', 'M54 40.8 Q58 40.6 62.5 41.2') + dotEyes(2.6, 1.2) + mouth('M46 61.2 Q50 60 54.5 60.4') + talk;
    case 'worried':
      return b('M37.5 41.4 Q42 40.4 46 38.6', 'M54 38.6 Q58 40.4 62.5 41.4') + dotEyes(2.7) + mouth('M45.5 62 Q50 59 54.5 62') + talk + sweat;
    case 'shock':
      return (
        b('M37.5 37.2 Q42 35.4 46 37.4', 'M54 37.4 Q58 35.4 62.5 37.2') +
        `<g class="cf-eyes"><circle cx="42" cy="47.5" r="3.4" fill="#fff" stroke="${ink}" stroke-width="0.8"/><circle cx="58" cy="47.5" r="3.4" fill="#fff" stroke="${ink}" stroke-width="0.8"/><circle cx="42" cy="47.8" r="1.4" fill="${ink}"/><circle cx="58" cy="47.8" r="1.4" fill="${ink}"/></g>` +
        `<ellipse class="cf-mouth" cx="50" cy="62.5" rx="3.2" ry="4.3" fill="#7a2f2a"/>` +
        talk +
        sweat
      );
    default:
      return b('M37.5 40.6 Q42 38.6 46 40.2', 'M54 40.2 Q58 38.6 62.5 40.6') + dotEyes() + mouth('M45.5 60 Q50 62.6 54.5 60') + talk;
  }
}

function extras(look) {
  let s = '';
  if (look.old) s += `<path fill="none" stroke="${SHADE(look.skin, 0.78)}" stroke-width="0.8" stroke-linecap="round" d="M42.5 30.5 Q50 28.6 57.5 30.5 M44.5 33.6 Q50 32.2 55.5 33.6 M34.5 49.5 l-2.2 1 M65.5 49.5 l2.2 1"/>`;
  if (look.mustache === true) s += `<path fill="${look.hair}" d="M43 56.6 Q46.5 53.6 50 55.6 Q53.5 53.6 57 56.6 Q53.5 58.4 50 57.2 Q46.5 58.4 43 56.6 Z"/>`;
  if (look.mustache === 'curl') s += `<path fill="${look.hair}" d="M41.5 57 Q45.5 53.6 50 55.8 Q54.5 53.6 58.5 57 Q61 54.6 63.2 56.4 Q60.6 59.6 55.4 58.4 Q52.4 58 50 57.2 Q47.6 58 44.6 58.4 Q39.4 59.6 36.8 56.4 Q39 54.6 41.5 57 Z"/>`;
  if (look.glasses === 'thin') s += `<g fill="none" stroke="#5b4636" stroke-width="1.1"><circle cx="42" cy="47.5" r="5.2"/><circle cx="58" cy="47.5" r="5.2"/><path d="M47.2 47 Q50 45.6 52.8 47 M36.8 46.6 L31.5 45.5 M63.2 46.6 L68.5 45.5"/></g>`;
  if (look.glasses === 'reading') s += `<g fill="${'#ffffff'}" fill-opacity=".18" stroke="#8b6a3e" stroke-width="1.2"><path d="M36.5 49 H47.5 Q47 54.2 42 54.2 Q37 54.2 36.5 49 Z"/><path d="M52.5 49 H63.5 Q63 54.2 58 54.2 Q53 54.2 52.5 49 Z"/></g><path fill="none" stroke="#8b6a3e" stroke-width="1.1" d="M47.5 49.4 Q50 48.2 52.5 49.4"/>`;
  if (look.earrings) s += `<circle cx="30.4" cy="56" r="1.6" fill="#d8b04c"/><circle cx="69.6" cy="56" r="1.6" fill="#d8b04c"/>`;
  if (look.headphones) s += `<path fill="none" stroke="#2f3136" stroke-width="3.2" stroke-linecap="round" d="M28.5 47 C27.5 18 72.5 18 71.5 47"/><rect x="24" y="41" width="8" height="14" rx="3.5" fill="#e4572e"/><rect x="68" y="41" width="8" height="14" rx="3.5" fill="#e4572e"/>`;
  // 直播耳麦: 头上一道、两边耳罩、左边伸出一根麦克风到嘴边
  if (look.headset) s += `<path fill="none" stroke="#2b2d33" stroke-width="2.6" stroke-linecap="round" d="M28.5 46 C27.5 15 72.5 15 71.5 46"/><rect x="24.5" y="41" width="7.5" height="13" rx="3.4" fill="#2b2d33"/><rect x="68" y="41" width="7.5" height="13" rx="3.4" fill="#2b2d33"/><path fill="none" stroke="#2b2d33" stroke-width="1.6" stroke-linecap="round" d="M28 53 Q30 63 40.5 63.5"/><ellipse cx="42.2" cy="63.4" rx="2.4" ry="1.8" fill="#55d0a4"/>`;
  return s;
}

function personMarkup(look, mood) {
  const skin = look.skin;
  const id = `cf${Math.random().toString(36).slice(2, 8)}`;
  const hs = hair(look, id);
  const shade = SHADE(skin, 0.86);
  // 小孩: 头大一点、肩膀窄一点
  const head = look.kid ? 'translate(50 56) scale(1.07) translate(-50 -56)' : '';
  return `<defs><clipPath id="${id}"><circle cx="50" cy="50" r="50"/></clipPath></defs>
<g clip-path="url(#${id})">
<circle cx="50" cy="50" r="50" fill="${look.bg}"/>
${hs.behind ?? ''}
<g class="cf-body"${look.kid ? ' transform="translate(50 104) scale(0.9 1) translate(-50 -104)"' : ''}>${clothes(look, id)}</g>
<g class="cf-head"><g transform="${head}">
<path fill="${skin}" d="M43 60 L43 80 Q50 84.5 57 80 L57 60 Z"/><path fill="${shade}" d="M43 68 Q50 74 57 68 L57 64 Q50 70 43 64 Z"/>
${hs.back ?? ''}
${hs.ears === false ? '' : `<ellipse cx="30.6" cy="49" rx="3.6" ry="5.2" fill="${skin}"/><ellipse cx="69.4" cy="49" rx="3.6" ry="5.2" fill="${skin}"/>`}
<path fill="${skin}" d="M50 22 C63.5 22 70.5 32 70.5 46 C70.5 60.5 61.5 69.5 50 69.5 C38.5 69.5 29.5 60.5 29.5 46 C29.5 32 36.5 22 50 22 Z"/>
<path fill="none" stroke="${SHADE(skin, 0.72)}" stroke-width="1.2" stroke-linecap="round" d="M50.3 49.5 Q48.6 54 50.8 55"/>
${hs.front ?? ''}
${beard(look)}
${face(mood, look)}
${extras(look)}
${hs.top ?? ''}
</g></g>
</g>`;
}

const TURTLE_MOOD = { normal: 'normal', smile: 'normal', happy: 'happy', wow: 'happy', hmm: 'worried', worried: 'worried', shock: 'sad' };

// 头像 (svg): person 是 chesspeople.js 里的人物; size: 多大 (px)
export function faceSvg(person, { mood = 'normal', size = 64 } = {}) {
  const look = person.look;
  if (look.turtle) {
    const wrap = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    wrap.setAttribute('viewBox', '0 0 100 100');
    wrap.setAttribute('width', String(size));
    wrap.setAttribute('height', String(size));
    wrap.setAttribute('aria-hidden', 'true');
    wrap.classList.add('cf', `cf-mood-${mood}`, 'cf-turtle');
    const cid = `cf${Math.random().toString(36).slice(2, 8)}`;
    wrap.innerHTML = `<defs><clipPath id="${cid}"><circle cx="50" cy="50" r="50"/></clipPath></defs><circle cx="50" cy="50" r="50" fill="${look.bg}"/>`; // 写死的图形
    const t = turtleSvg({ stage: 3, mood: TURTLE_MOOD[mood] ?? 'normal', size: 84 });
    const clip = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    clip.setAttribute('clip-path', `url(#${cid})`);
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform', 'translate(3 7) scale(0.78)'); // 小乌龟 (宽 7–115、高 22–97) 放在圆的正中
    clip.append(g);
    g.innerHTML = t.innerHTML; // 小乌龟也是写死的图形
    g.classList.add('turtle', `mood-${TURTLE_MOOD[mood] ?? 'normal'}`, 'stage-3');
    wrap.append(clip);
    return wrap;
  }
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('cf', `cf-mood-${mood}`);
  svg.innerHTML = personMarkup(look, mood); // 只有写死的图形和 chesspeople.js 里的颜色
  return svg;
}

// 会动的头像: 换表情 (带一下跳 / 一下抖)、说话时嘴动
export function liveFace(person, { size = 72 } = {}) {
  const box = document.createElement('div');
  box.className = 'cf-box';
  let mood = 'normal';
  let svg = faceSvg(person, { mood, size });
  box.append(svg);
  let talkTimer = 0;
  return {
    el: box,
    setPerson(p) {
      person = p;
      svg.replaceWith((svg = faceSvg(person, { mood, size })));
    },
    setMood(next, { react = true } = {}) {
      const talking = svg.classList.contains('talking');
      mood = next;
      svg.replaceWith((svg = faceSvg(person, { mood, size })));
      if (talking) svg.classList.add('talking');
      if (react) {
        const cls = next === 'wow' || next === 'happy' ? 'cf-jump' : next === 'shock' || next === 'worried' ? 'cf-shake' : '';
        if (cls) {
          box.classList.remove('cf-jump', 'cf-shake');
          void box.offsetWidth;
          box.classList.add(cls);
        }
      }
    },
    talk(ms = 1200) {
      svg.classList.add('talking');
      clearTimeout(talkTimer);
      talkTimer = setTimeout(() => svg.classList.remove('talking'), ms);
    },
  };
}
