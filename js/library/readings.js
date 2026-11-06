// 读音特别的字 (通假字、古文里的多音字、姓): 手写的, 不是 tools/library.mjs 生成的。
// 照现在的语文课本和普通话审音标; 有旧读的写在说明里 (「斜」旧读 xiá)。拿不准、两种读法都规范的不标 (作姓的「宓」「乐」「隗」)。
//   at: 在哪句里 (简体; 这几个字在书里出现几次都标), ch: 标哪几个字 (at 里的), py: 拼音, note: 说明,
//   say: 朗读时换成这几个字 (读音一样; 系统会念错的才写), book: 只在这本书里 (不写是所有的书)
// tests/reading.test.js 会检查每条的 at 在书里真的有

export const READINGS = [
  // ---- 论语 ----
  { book: 'lunyu', at: '不亦说乎', ch: '说', py: 'yuè', note: '同「悦」，高兴', say: '悦' },
  { at: '曾子', ch: '曾', py: 'zēng', note: '姓', say: '增' },
  { book: 'lunyu', at: '吾日三省吾身', ch: '省', py: 'xǐng', note: '反省', say: '醒' },
  { book: 'lunyu', at: '千乘之国', ch: '乘', py: 'shèng', note: '一车四马为一乘', say: '剩' },
  { at: '出则弟', ch: '弟', py: 'tì', note: '同「悌」，敬爱兄长', say: '替' },
  { at: '孝弟', ch: '弟', py: 'tì', note: '同「悌」，敬爱兄长', say: '替' },
  { book: 'lunyu', at: '是知也', ch: '知', py: 'zhì', note: '同「智」', say: '智' },
  { book: 'lunyu', at: '知者乐水', ch: '知', py: 'zhì', note: '同「智」', say: '智' },
  { book: 'lunyu', at: '知者动', ch: '知', py: 'zhì', note: '同「智」', say: '智' },
  { book: 'lunyu', at: '知者乐，仁者寿', ch: '知', py: 'zhì', note: '同「智」', say: '智' },
  { book: 'lunyu', at: '吾十有五而志于学', ch: '有', py: 'yòu', note: '同「又」', say: '又' },
  { book: 'lunyu', at: '逝者如斯夫', ch: '夫', py: 'fú', note: '句末语气词', say: '扶' },
  { book: 'lunyu', at: '好之者', ch: '好', py: 'hào', note: '喜好', say: '号' },
  { at: '好学', ch: '好', py: 'hào', note: '喜好', say: '号' },

  // ---- 三字经、弟子规、千字文 ----
  { book: 'sanzijing', at: '择邻处', ch: '处', py: 'chǔ', note: '居住', say: '楚' },
  { book: 'sanzijing', at: '方少时', ch: '少', py: 'shào', note: '年少', say: '绍' },
  { book: 'sanzijing', at: '长幼序', ch: '长', py: 'zhǎng', note: '年长的', say: '掌' },
  { book: 'dizigui', at: '长者先', ch: '长', py: 'zhǎng', note: '年长的人', say: '掌' },
  { book: 'dizigui', at: '冠必正', ch: '冠', py: 'guān', note: '帽子', say: '关' },
  { book: 'qianziwen', at: '乐殊贵贱', ch: '乐', py: 'yuè', note: '音乐', say: '月' },

  // ---- 百家姓 (作姓时的读音) ----
  { book: 'baijiaxing', at: '郁单杭洪', ch: '单', py: 'shàn', note: '作姓读 shàn', say: '善' },
  { book: 'baijiaxing', at: '宁仇栾暴', ch: '仇', py: 'qiú', note: '作姓读 qiú', say: '求' },
  { book: 'baijiaxing', at: '干解应宗', ch: '解', py: 'xiè', note: '作姓读 xiè', say: '谢' },
  { book: 'baijiaxing', at: '查后荆红', ch: '查', py: 'zhā', note: '作姓读 zhā', say: '渣' },
  { book: 'baijiaxing', at: '盖益桓公', ch: '盖', py: 'gě', note: '作姓读 gě', say: '葛' },
  { book: 'baijiaxing', at: '经房裘缪', ch: '缪', py: 'miào', note: '作姓读 miào', say: '妙' },
  { book: 'baijiaxing', at: '万俟司马', ch: '万俟', py: 'mòqí', note: '复姓', say: '莫其' },
  { book: 'baijiaxing', at: '尉迟公羊', ch: '尉迟', py: 'yùchí', note: '复姓', say: '玉池' },
  { book: 'baijiaxing', at: '曾毋沙乜', ch: '乜', py: 'niè', note: '作姓读 niè', say: '聂' },
  { book: 'baijiaxing', at: '孔曹严华', ch: '华', py: 'huà', note: '作姓读 huà', say: '画' },
  { book: 'baijiaxing', at: '闻莘党翟', ch: '莘', py: 'shēn', note: '作姓读 shēn', say: '深' },
  { book: 'baijiaxing', at: '冷訾辛阚', ch: '阚', py: 'kàn', note: '作姓读 kàn', say: '瞰' },
  { book: 'baijiaxing', at: '边扈燕冀', ch: '燕', py: 'yān', note: '作姓读 yān', say: '烟' },
  { book: 'baijiaxing', at: '熊纪舒屈', ch: '纪', py: 'jǐ', note: '作姓读 jǐ', say: '挤' },
  { book: 'baijiaxing', at: '俞任袁柳', ch: '任', py: 'rén', note: '作姓读 rén', say: '人' },
  { book: 'baijiaxing', at: '漆雕乐正', ch: '乐正', py: 'yuèzhèng', note: '复姓', say: '月正' },
  { book: 'baijiaxing', at: '长孙慕容', ch: '长孙', py: 'zhǎngsūn', note: '复姓', say: '掌孙' },
  { book: 'baijiaxing', at: '澹台公冶', ch: '澹台', py: 'tántái', note: '复姓', say: '谈台' },
  { book: 'baijiaxing', at: '轩辕令狐', ch: '令狐', py: 'línghú', note: '复姓', say: '零狐' },
  { book: 'baijiaxing', at: '淳于单于', ch: '单于', py: 'chányú', note: '复姓', say: '蝉于' },

  // ---- 古文观止 ----
  { book: 'guwen', at: '陟罚臧否', ch: '否', py: 'pǐ', note: '坏，恶', say: '痞' },
  { book: 'guwen', at: '以遗陛下', ch: '遗', py: 'wèi', note: '给予，留给', say: '位' },
  { book: 'guwen', at: '便要还家', ch: '要', py: 'yāo', note: '同「邀」', say: '邀' },
  { book: 'guwen', at: '属予作文', ch: '属', py: 'zhǔ', note: '同「嘱」，嘱托', say: '嘱' },
  { book: 'guwen', at: '举酒属客', ch: '属', py: 'zhǔ', note: '劝酒', say: '嘱' },
  { book: 'guwen', at: '冯虚御风', ch: '冯', py: 'píng', note: '同「凭」', say: '凭' },
  { book: 'guwen', at: '句读之不知', ch: '读', py: 'dòu', note: '句读：文句中的停顿', say: '豆' },
  { book: 'guwen', at: '或不焉', ch: '不', py: 'fǒu', note: '同「否」', say: '否' },
  { book: 'guwen', at: '又何间焉', ch: '间', py: 'jiàn', note: '参与', say: '见' },
  { book: 'guwen', at: '朝服衣冠', ch: '朝', py: 'zhāo', note: '早晨', say: '招' },
  { book: 'guwen', at: '期年之后', ch: '期', py: 'jī', note: '满一年', say: '基' },

  // ---- 唐诗、宋词 ----
  { book: 'tangshi', at: '鬓毛衰', ch: '衰', py: 'cuī', note: '稀疏', say: '催' },
  { book: 'tangshi', at: '将进酒', ch: '将', py: 'qiāng', note: '请', say: '枪' },
  { at: '夕阳斜', ch: '斜', py: 'xié', note: '旧读 xiá，跟上下句押韵；现在课本读 xié' },
  { book: 'songci', at: '一骑红尘', ch: '骑', py: 'qí', note: '旧读 jì；现在课本读 qí' },
  { book: 'songci', at: '乍暖还寒', ch: '还', py: 'huán', note: '又，仍', say: '环' },
];
