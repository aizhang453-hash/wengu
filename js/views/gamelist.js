// 卡片集页、文件夹页上的「用游戏来记」: 五个游戏, 显示最好成绩

import { h } from '../dom.js';
import { pickDistinct, formatTime } from '../games.js';
import { quizCards } from './gamequiz.js';
import { playable } from '../wordle.js';

export function gameModes(set, base) {
  const canPlay = pickDistinct(set.cards, 2).length >= 2;
  const canQuiz = pickDistinct(quizCards(set.cards), 2).length >= 2;
  const canWordle = playable(set.cards).items.length > 0;
  const best = set.best;
  const tile = (name, hint, href, enabled, why = '至少要两张不一样的卡片') =>
    enabled
      ? h('a', { class: 'mode', href }, h('span', { class: 'mode-name' }, name), h('span', { class: 'muted small' }, hint))
      : h('div', { class: 'mode disabled', 'aria-disabled': 'true' }, h('span', { class: 'mode-name' }, name), h('span', { class: 'muted small' }, why));
  return h(
    'div',
    { class: 'modes games' },
    tile('🧩 配对', best.match ? `最好 ${formatTime(best.match)}` : '把词和解释配起来, 比谁快', `${base}/match`, canPlay),
    tile('☄️ 打陨石', best.blast ? `最高 ${best.blast} 分` : '打中写着对的答案的陨石', `${base}/blast`, canPlay),
    tile('🧱 方块', best.blocks ? `最高 ${best.blocks} 分` : '放积木消行, 答对拿新积木', `${base}/blocks`, canQuiz),
    tile('💎 宝石', best.gems ? `最高 ${best.gems} 分` : '三个连一线消掉, 答题加步数', `${base}/gems`, canQuiz),
    tile('🟩 Wordle', best.wordle ? `最长连胜 ${best.wordle}` : '6 次猜出卡片集里的词', `${base}/wordle`, canWordle, '要有字母拼的单词'),
  );
}
