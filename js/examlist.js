// 考前清单: 考试前一天 (和考试那天早上) 最后要过的、要带的、今晚要做的, 一样一样打勾。
// 画在 views/examlist.js; 这里只排清单 (按自己的数据: 还有几张没背、几道错题没掌握、哪类错得最多……)

// e: { days 还有几天 (1 明天考、0 今天考), exam 'YYYY-MM-DD', title 哪个计划的考试,
//      due 今天还要背几张, mistakes 错题一共几道, mistakesLeft 还没掌握的, topKind { kind, left } 错得最多的题型,
//      leeches 难记卡几张, starred 星标的几张 }
// 返回 { intro, groups: [{ name, items: [{ id, text, href?, done? (按数据已经做完了) }] }] }
export function examChecklist(e) {
  const [, m, d] = e.exam.split('-').map(Number);
  const when = `${m}月${d}日`;
  const of = e.title ? `（${e.title}）` : '';
  if (e.days === 0) {
    return {
      intro: `今日考试${of}。出发前请逐项确认。`,
      groups: [
        {
          name: '出门前',
          items: [
            { id: 'breakfast', text: '吃早餐，补充水分' },
            { id: 'bag', text: '准考证、带照片的证件、考试用电脑或平板（已充满电）及充电线、计算器、铅笔、水和零食' },
            { id: 'early', text: '提前 30 分钟到达考场' },
            e.mistakes ? { id: 'glance', text: '如需复习，仅浏览错题解析，不再学习新内容', href: '#/mistakes' } : null,
          ].filter(Boolean),
        },
        {
          name: '考试中',
          items: [
            { id: 'skip', text: '遇到难题先标记跳过，最后再做' },
            { id: 'guess', text: '每题都作答，不留空（SAT 答错不扣分）' },
            { id: 'breathe', text: '紧张时深呼吸，保持节奏' },
          ],
        },
      ],
    };
  }
  const study = [
    e.due ? { id: 'due', text: `完成今日复习（剩余 ${e.due} 张）`, href: '#/review' } : { id: 'due', text: '今日复习已完成', done: true },
    e.mistakesLeft
      ? { id: 'mistakes', text: `重做未掌握的错题（${e.mistakesLeft} 道）${e.topKind?.left ? `；「${e.topKind.kind}」最多，优先完成` : ''}`, href: e.topKind?.left ? `#/mistakes/review/kind:${encodeURIComponent(e.topKind.kind)}` : '#/mistakes/review/all' }
      : null,
    e.mistakes ? { id: 'notes', text: '浏览错题解析，避免重复失误', href: '#/mistakes' } : null,
    e.leeches ? { id: 'leech', text: `浏览难记卡片（${e.leeches} 张）`, href: '#/review/practice:leech' } : null,
    e.starred ? { id: 'starred', text: `浏览星标卡片（${e.starred} 张）`, href: '#/review/practice:starred' } : null,
  ].filter(Boolean);
  return {
    intro: `明日（${when}）考试${of}。今日不再学习新内容，请逐项完成以下准备。`,
    groups: [
      { name: '今日复习', items: study },
      {
        name: '物品准备',
        items: [
          { id: 'ticket', text: '准考证（打印或保存在手机中）及带照片的证件' },
          { id: 'device', text: '考试用电脑或平板：安装考试软件（SAT 为 Bluebook）、充满电并携带充电线' },
          { id: 'tools', text: '计算器（如允许）及电池；铅笔、橡皮' },
          { id: 'snack', text: '水和零食' },
          { id: 'route', text: '确认考场地址与路线，设置两个闹钟，计划提前 30 分钟到达' },
        ],
      },
      {
        name: '今晚',
        items: [
          { id: 'nonew', text: '不学习新内容，不熬夜刷题' },
          { id: 'sleep', text: '23 点前入睡，睡眠有助于巩固记忆' },
        ],
      },
    ],
  };
}
