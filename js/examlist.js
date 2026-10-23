// 考前清单: 考试前一天 (和考试那天早上) 最后要过的、要带的、今晚要做的, 一样一样打勾。
// 画在 views/examlist.js; 这里只排清单 (按自己的数据: 还有几张没背、几道错题没掌握、哪类错得最多……)

// e: { days 还有几天 (1 明天考、0 今天考), exam 'YYYY-MM-DD', title 哪个计划的考试,
//      due 今天还要背几张, mistakes 错题一共几道, mistakesLeft 还没掌握的, topKind { kind, left } 错得最多的题型,
//      leeches 难记卡几张, starred 星标的几张 }
// 返回 { intro, groups: [{ name, items: [{ id, text, href?, done? (按数据已经做完了) }] }] }
export function examChecklist(e) {
  const [, m, d] = e.exam.split('-').map(Number);
  const when = `${m}月${d}日`;
  const of = e.title ? ` (${e.title})` : '';
  if (e.days === 0) {
    return {
      intro: `今天考试${of}! 出门前对一下, 然后放松去考。`,
      groups: [
        {
          name: '出门前',
          items: [
            { id: 'breakfast', text: '吃早饭、喝点水' },
            { id: 'bag', text: '准考证、带照片的证件、考试用的电脑 / 平板 (充满电) 和充电线、计算器、铅笔、水和零食' },
            { id: 'early', text: '提前 30 分钟到考场' },
            e.mistakes ? { id: 'glance', text: '想看的话, 只翻一翻错题的「为什么错」, 别学新的', href: '#/mistakes' } : null,
          ].filter(Boolean),
        },
        {
          name: '考的时候',
          items: [
            { id: 'skip', text: '不会的先跳过、做个记号, 回头再做' },
            { id: 'guess', text: '每道题都选一个, 别空着 (SAT 答错不扣分)' },
            { id: 'breathe', text: '紧张了就深呼吸三次。你准备了这么久, 一定行!' },
          ],
        },
      ],
    };
  }
  const study = [
    e.due ? { id: 'due', text: `今天的复习背完 (还有 ${e.due} 张)`, href: '#/review' } : { id: 'due', text: '今天的复习背完了', done: true },
    e.mistakesLeft
      ? { id: 'mistakes', text: `还没掌握的错题再做一遍 (${e.mistakesLeft} 道)${e.topKind?.left ? `; 「${e.topKind.kind}」最多, 先做这类` : ''}`, href: e.topKind?.left ? `#/mistakes/review/kind:${encodeURIComponent(e.topKind.kind)}` : '#/mistakes/review/all' }
      : null,
    e.mistakes ? { id: 'notes', text: '错题的「为什么错」快速看一遍: 明天别再踩同一个坑', href: '#/mistakes' } : null,
    e.leeches ? { id: 'leech', text: `难记卡看一遍 (${e.leeches} 张): 不用全记住, 眼熟就行`, href: '#/review/practice:leech' } : null,
    e.starred ? { id: 'starred', text: `星标的过一遍 (${e.starred} 张)`, href: '#/review/practice:starred' } : null,
  ].filter(Boolean);
  return {
    intro: `明天 (${when}) 就考试了${of}。今天别学新的了, 把下面的一样一样做完、打勾, 然后早点睡。`,
    groups: [
      { name: '今天过一遍', items: study },
      {
        name: '准备好东西',
        items: [
          { id: 'ticket', text: '准考证 (打印好, 或者存在手机里) 和带照片的证件' },
          { id: 'device', text: '考试用的电脑 / 平板: 装好考试软件 (SAT 用 Bluebook)、充满电, 带上充电线' },
          { id: 'tools', text: '计算器 (能带的话) 装好电池; 铅笔、橡皮 (打草稿用)' },
          { id: 'snack', text: '水和小零食, 休息的时候吃' },
          { id: 'route', text: '查好考场地址、怎么去; 定两个闹钟, 打算提前 30 分钟到' },
        ],
      },
      {
        name: '今晚',
        items: [
          { id: 'nonew', text: '别学新的, 别熬夜刷题: 会的再确认一遍就好' },
          { id: 'sleep', text: '11 点前睡觉: 睡着的时候, 今天复习的会记得更牢' },
        ],
      },
    ],
  };
}
