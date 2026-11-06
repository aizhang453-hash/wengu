// 书库的书目: tools/library.mjs 生成, 别手改。书的正文在 js/library/<id>.js (简体)、js/library/hant/<id>.js (繁体)
// kind: poem 一首一首的诗 (有作者、朝代), text 文章; unit: 一篇叫什么 (首、段、章、篇)
export const BOOKS = [
  {"id":"tangshi","title":"唐诗三百首","author":"蘅塘退士","era":"清","kind":"poem","unit":"首","count":320,"intro":"清代蘅塘退士（孙洙）从唐诗里选出的名篇，「床前明月光」「白日依山尽」「红豆生南国」都在里面。分五言绝句、七言绝句、五言律诗、七言律诗、五言古诗、七言古诗、乐府。"},
  {"id":"songci","title":"宋词三百首","author":"朱孝臧","era":"民国","kind":"poem","unit":"首","count":280,"intro":"近代朱孝臧（上彊村民）选编的宋词名篇，按词人分组，「明月几时有」「寻寻觅觅，冷冷清清」「十年生死两茫茫」都在里面。原书前后几个版本篇数不同，这里有 280 首。"},
  {"id":"sanzijing","title":"三字经","author":"王应麟","era":"宋","kind":"text","unit":"段","count":8,"intro":"三个字一句，讲做人的道理、历史和常识，是古代孩子识字读书的第一本书。相传为南宋王应麟所编，这里是传统版。"},
  {"id":"baijiaxing","title":"百家姓","author":"佚名","era":"北宋","kind":"text","unit":"段","count":6,"intro":"把常见的姓连成四字一句的韵文，「赵钱孙李，周吴郑王」。北宋初年编成。"},
  {"id":"qianziwen","title":"千字文","author":"周兴嗣","era":"南朝梁","kind":"text","unit":"段","count":11,"intro":"一千个字，没有一个重复，四字一句，从天地讲到人事。南朝梁周兴嗣编。"},
  {"id":"dizigui","title":"弟子规","author":"李毓秀","era":"清","kind":"text","unit":"章","count":8,"intro":"三个字一句，讲孩子在家孝顺父母、出门对人、说话做事的规矩。清代李毓秀作。"},
  {"id":"qianjiashi","title":"千家诗","author":"南宋谢枋得/明代王相","era":"宋·明","kind":"poem","unit":"首","count":219,"intro":"古时候孩子学诗的入门诗集，选的多是唐宋名家的诗，「春眠不觉晓」就在里面。分五言绝句、七言绝句、五言律诗、七言律诗。南宋谢枋得、明代王相选编。"},
  {"id":"shenglvqimeng","title":"声律启蒙","author":"车万育","era":"清","kind":"text","unit":"章","count":30,"intro":"学对对子、学声韵的书，「云对雨，雪对风，晚照对晴空」。按韵编排，一个韵一章。清代车万育作。"},
  {"id":"zengguangxianwen","title":"增广贤文","author":"佚名","era":"明","kind":"text","unit":"段","count":38,"intro":"收集了很多俗语和格言，「一寸光阴一寸金」「路遥知马力，日久见人心」都出自这里。明代编成，作者不详。"},
  {"id":"zhuzijiaxun","title":"朱子家训","author":"朱柏庐","era":"明末清初","kind":"text","unit":"篇","count":1,"intro":"讲怎样持家过日子的格言，「黎明即起，洒扫庭除」「一粥一饭，当思来处不易」。明末清初朱柏庐作，又叫《朱子治家格言》。"},
  {"id":"youxueqionglin","title":"幼学琼林","author":"程登吉","era":"明·清","kind":"text","unit":"章","count":33,"intro":"用对偶的句子讲天文、地理、人物、典故，读了能知道很多成语的来历。明代程登吉编，清代邹圣脉增补。"},
];
export const SOURCE = {"name":"chinese-poetry","url":"https://github.com/chinese-poetry/chinese-poetry","license":"MIT"};
