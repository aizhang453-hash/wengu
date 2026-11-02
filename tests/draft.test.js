// 游戏厅「人生草稿」: 开局、一年一年过、路口、结局和打分、批注 (前稿解锁、以前的稿选过的路), 玩到一半存回来,
// 批注怎么存、怎么合 (同步、备份), 越玩越强 (结局解锁稀有开局、性格传给下一稿),
// 内容本身对不对得上 (名字不重复、每件事、每个路口、每个结局、每个稀有开局都碰得到)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STATS, MAX, emptyProfile, offers, newLife, advance, choose, runUntilStop, finish, ending, score, comment, noteFor, restoreLife, newlyUnlocked, isOpen, heirOf, traitsOf, withHeir, originOf, traitOf, choiceOf, ORIGINS, TRAITS, WISHES, CHOICES, ENDINGS } from '../js/draft.js';
import { EVENTS } from '../js/draftdata.js';
import { cleanArcade, cleanDraftProgress, mergeDraftProgress, addScore, progressOf, bestOf, ARCADE } from '../js/arcade.js';
import { Store, cleanData } from '../js/store.js';
import { mergeData } from '../js/merge.js';

const seeded = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const randomPick = (rand) => (life, pending) => pending.opts[Math.floor(rand() * pending.opts.length)];

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: (k) => map.delete(k) };
}

// 一口气写很多稿 (批注一稿一稿攒着; 开局随便挑, 一半的稿把一个性格传下去), 看看都发生了什么
function simulate(n, seed = 1) {
  const rand = seeded(seed);
  const any = (list) => list[Math.floor(rand() * list.length)];
  let profile = emptyProfile();
  const seen = { events: new Set(), choices: new Set(), options: new Set(), endings: new Set(), wishes: new Set(), origins: new Set(), traits: new Set() };
  const lives = [];
  for (let i = 0; i < n; i++) {
    const o = offers(profile, rand);
    const life = newLife({ origin: any(o.origins), trait: any(o.traits), wish: any(o.wishes), heir: heirOf(profile) }, profile, rand);
    runUntilStop(life, profile, rand, randomPick(rand));
    const r = finish(life, profile, 1000 + i);
    profile = rand() < 0.5 ? withHeir(r.profile, any(traitsOf(life)), 1000 + i) : r.profile;
    for (const t of traitsOf(life)) seen.traits.add(t);
    for (const id of Object.keys(life.done)) seen.events.add(id);
    for (const x of life.choices) (seen.choices.add(x.id), seen.options.add(`${x.id}:${x.opt}`));
    seen.endings.add(r.ending.key);
    seen.origins.add(life.origin);
    // 心愿: 不管这一稿挑的是哪个, 走的时候满足了就算碰得到 (活到一百岁太少见, 只看挑了它的稿会时有时无)
    const c = { age: life.age, has: (f) => Object.hasOwn(life.flags, f), since: (f) => (Object.hasOwn(life.flags, f) ? life.age - life.flags[f] : -1) };
    for (const w of WISHES) if (w.done(c)) seen.wishes.add(w.key);
    lives.push({ life, r });
  }
  return { lives, seen, profile };
}

const sim = simulate(3000);

test('开局: 出身、性格、心愿各给三个不重复的; 属性 = 出身 + 性格, 第一年写着怎么出生的', () => {
  const o = offers(emptyProfile(), seeded(3));
  for (const list of [o.origins, o.traits, o.wishes]) {
    assert.equal(list.length, 3);
    assert.equal(new Set(list).size, 3);
    assert.ok(list.every((k) => !(originOf(k) ?? traitOf(k))?.rare), '没解锁时不给稀有的');
  }
  const life = newLife({ origin: 'books', trait: 'curious', wish: 'book' });
  assert.deepEqual(life.stats, { str: 3, kno: 9, soc: 3, mny: 4 });
  assert.equal(life.run, 1);
  assert.equal(life.age, 0);
  assert.match(life.years[0].lines[0].t, /翻了三天字典/);
  assert.equal(newLife({ origin: 'sea', trait: 'bold', wish: 'book' }, { ...emptyProfile(), runs: 4 }).run, 5);
  assert.ok(newLife({ origin: 'sea', trait: 'bold', wish: 'book' }).flags.sea === 0, '出身带的标记');
  assert.throws(() => newLife({ origin: 'nope', trait: 'bold', wish: 'book' }));
});

test('「似曾相识」的出身写满 3 稿才出现, 出现时是第四张 (稀有); 写完第 3 稿时算新解锁', () => {
  const rand = seeded(5);
  for (let i = 0; i < 200; i++) assert.ok(!offers({ ...emptyProfile(), runs: 2 }, rand).origins.includes('again'));
  for (let i = 0; i < 50; i++) {
    const o = offers({ ...emptyProfile(), runs: 3 }, rand).origins;
    assert.equal(o.length, 4);
    assert.equal(o[3], 'again');
  }
  assert.deepEqual(newlyUnlocked({ ...emptyProfile(), runs: 2 }, { ...emptyProfile(), runs: 3 }).map((x) => x.key), ['again']);
  assert.deepEqual(newlyUnlocked({ ...emptyProfile(), runs: 3 }, { ...emptyProfile(), runs: 4 }), []);
});

test('越玩越强: 拿到结局解锁稀有的性格、出身, 开局时多给一张稀有的', () => {
  const rand = seeded(8);
  const before = emptyProfile();
  const after = { ...emptyProfile(), endings: ['scholar', 'tycoon'] };
  assert.deepEqual(newlyUnlocked(before, after).map((x) => x.key).sort(), ['boss', 'memory']);
  assert.ok(isOpen(traitOf('memory'), after) && !isOpen(traitOf('memory'), before));
  for (let i = 0; i < 50; i++) {
    const o = offers(after, rand);
    assert.equal(o.traits.length, 4);
    assert.equal(o.traits[3], 'memory');
    assert.equal(o.origins[3], 'boss');
    assert.equal(o.wishes.length, 3, '心愿没有稀有的');
  }
  // 解锁了好几个: 第四张在里面随机
  const many = { ...emptyProfile(), endings: ['scholar', 'iron', 'friends'] };
  const got = new Set();
  for (let i = 0; i < 100; i++) got.add(offers(many, rand).traits[3]);
  assert.deepEqual([...got].sort(), ['memory', 'mighty', 'outgoing']);
  // 稀有的开局确实更强
  assert.equal(newLife({ origin: 'county', trait: 'memory', wish: 'book' }).stats.kno, 4 + 4);
});

test('传给下一稿: 下一稿开局带上传下来的性格 (属性、本事都算), 开局不再给它; 写完一稿就用掉了', () => {
  const p = withHeir(emptyProfile(), 'careful', 50);
  assert.equal(heirOf(p), 'careful');
  assert.equal(heirOf(withHeir(p, '', 60)), null);
  assert.equal(heirOf(withHeir(p, 'nope', 60)), null, '不认识的性格不算');
  const rand = seeded(13);
  for (let i = 0; i < 100; i++) assert.ok(!offers(p, rand).traits.includes('careful'));
  const life = newLife({ origin: 'county', trait: 'chatty', wish: 'shop', heir: 'memory' }, p, rand);
  assert.equal(life.heir, 'memory');
  assert.deepEqual(life.stats, { str: 4, kno: 8, soc: 6, mny: 4 });
  assert.deepEqual(traitsOf(life), ['chatty', 'memory']);
  assert.equal(newLife({ origin: 'county', trait: 'chatty', wish: 'shop', heir: 'chatty' }).heir, null, '跟自己挑的一样就不重复算');
  runUntilStop(life, p, rand, randomPick(rand));
  const r = finish(life, p, 99);
  assert.deepEqual(r.profile.heir, { key: '', at: 99 });
  assert.equal(heirOf(r.profile), null);
  // 传下来的性格的本事也算: 心细的不出意外, 惜命的不会累死, 长寿的活得更久
  const lives = (heir, n, seed) => {
    const rnd = seeded(seed);
    return Array.from({ length: n }, () => runUntilStop(newLife({ origin: 'county', trait: 'chatty', wish: 'shop', heir }, emptyProfile(), rnd), emptyProfile(), rnd, randomPick(rnd)));
  };
  assert.ok(lives('careful', 400, 3).every((l) => !l.done.accident));
  assert.ok(lives('cherish', 400, 4).every((l) => l.dead.cause !== 'overwork'));
  const median = (ls) => ls.map((l) => l.age).sort((a, b) => a - b)[Math.floor(ls.length / 2)];
  assert.ok(median(lives('longevity', 600, 5)) >= median(lives(null, 600, 5)) + 3);
});

test('一年一年过: 每年都有字, 属性一直在 0–20, 等着选路口时不往下过, 120 岁以前一定走完', () => {
  for (const { life } of sim.lives) {
    assert.ok(life.dead, '写完了');
    assert.ok(life.age >= 1 && life.age <= 120, `享年 ${life.age}`);
    assert.equal(life.years.length, life.age + 1);
    for (const y of life.years) {
      assert.ok(y.lines.length >= 1, `${y.age} 岁没有字`);
      for (const l of y.lines) assert.equal(typeof l.t, 'string');
    }
    for (const [k] of STATS) {
      assert.ok(life.stats[k] >= 0 && life.stats[k] <= MAX);
      assert.ok(life.peak[k] >= life.stats[k]);
    }
    assert.equal(life.years.at(-1).lines.at(-1).k, 'death');
  }
  const life = newLife({ origin: 'county', trait: 'sunny', wish: 'shop' });
  const rand = seeded(9);
  runUntilStop(life, emptyProfile(), rand);
  assert.ok(life.pending, '停在第一个路口');
  assert.equal(life.age, 8);
  const age = life.age;
  assert.equal(advance(life, emptyProfile(), rand), null);
  assert.equal(life.age, age);
  assert.equal(choose(life, 'no-such-option', emptyProfile(), rand), false);
  assert.ok(choose(life, life.pending.opts[0], emptyProfile(), rand));
  assert.equal(life.pending, null);
  assert.equal(life.years.at(-1).lines.find((l) => l.k === 'choice').t, choiceOf('hobby').options.find((o) => o.key === life.choices[0].opt).text);
});

test('死亡年龄大致合理: 一半以上活过 70, 40 岁以前走的不到一成', () => {
  const ages = sim.lives.map(({ life }) => life.age).sort((a, b) => a - b);
  const median = ages[Math.floor(ages.length / 2)];
  assert.ok(median >= 70 && median <= 88, `中位数 ${median}`);
  assert.ok(ages.filter((a) => a < 40).length / ages.length < 0.1);
});

test('内容: 名字不重复, 存进批注的名字都合规', () => {
  const unique = (list, what) => assert.equal(new Set(list).size, list.length, `${what} 有重名`);
  unique(EVENTS.map((e) => e.id), '事');
  unique(CHOICES.map((c) => c.id), '路口');
  unique(ENDINGS.map((e) => e.key), '结局');
  unique(ORIGINS.map((e) => e.key), '出身');
  unique(TRAITS.map((e) => e.key), '性格');
  unique(WISHES.map((e) => e.key), '心愿');
  for (const c of CHOICES) {
    unique(c.options.map((o) => o.key), `路口 ${c.id} 的选项`);
    assert.match(c.id, /^[a-z][a-z0-9-]{0,31}$/);
    for (const o of c.options) assert.match(o.key, /^[a-z][a-z0-9-]{0,31}$/);
  }
  for (const e of ENDINGS) {
    assert.match(e.key, /^[a-z][a-z0-9-]{0,31}$/);
    assert.ok(e.name && e.desc && e.hint, e.key);
  }
  assert.equal(ENDINGS.at(-1).test({}), true, '最后一个结局谁都能拿');
  for (const w of WISHES) assert.ok(w.hint, w.key);
  for (const x of [...ORIGINS, ...TRAITS].filter((y) => y.rare)) {
    assert.ok(x.lock, `${x.key} 没写解锁条件`);
    assert.ok(x.needs ? ENDINGS.some((e) => e.key === x.needs) : x.runs > 0, `${x.key} 的解锁条件对不上`);
    if (x.needs) assert.match(x.lock, new RegExp(ENDINGS.find((e) => e.key === x.needs).name), `${x.key} 写的结局名对不上`);
  }
});

test('内容: 每件事、每个路口、每个选项、每个结局、每个心愿都碰得到', () => {
  const missing = (all, got) => all.filter((x) => !got.has(x));
  assert.deepEqual(missing(EVENTS.map((e) => e.id), sim.seen.events), []);
  assert.deepEqual(missing(CHOICES.map((c) => c.id), sim.seen.choices), []);
  assert.deepEqual(missing(CHOICES.flatMap((c) => c.options.map((o) => `${c.id}:${o.key}`)), sim.seen.options), []);
  assert.deepEqual(missing(ENDINGS.map((e) => e.key), sim.seen.endings), []);
  assert.deepEqual(missing(WISHES.map((w) => w.key), sim.seen.wishes), []);
  assert.deepEqual(missing(ORIGINS.map((o) => o.key), sim.seen.origins), []);
  assert.deepEqual(missing(TRAITS.map((t) => t.key), sim.seen.traits), [], '稀有的性格也都解锁过、用过');
});

test('前稿: 以前创业赔光过, 30 岁的路口才有「先做副业试试」', () => {
  const at29 = () => {
    const life = newLife({ origin: 'county', trait: 'careful', wish: 'shop' }); // 心细的不出意外
    life.age = 29;
    life.flags = { job: 20, office: 22, bigcity: 22 };
    life.choices = CHOICES.filter((c) => c.age < 30).map((c) => ({ id: c.id, opt: c.options[0].key, age: c.age }));
    return life;
  };
  const plain = at29();
  advance(plain, emptyProfile(), seeded(4242));
  assert.equal(plain.pending?.id, 'career');
  assert.ok(!plain.pending.opts.includes('side'));
  const learned = { ...emptyProfile(), runs: 1, marks: ['m:bankrupt'] };
  const again = at29();
  advance(again, learned, seeded(4242));
  assert.ok(again.pending.opts.includes('side'));
  assert.ok(choiceOf('career').options.find((o) => o.key === 'side').new);
});

test('结局、分数、评语: 照着规则来', () => {
  const life = newLife({ origin: 'county', trait: 'sunny', wish: 'hundred' });
  Object.assign(life, { age: 101, stats: { str: 3, kno: 10, soc: 9, mny: 5 }, peak: { str: 9, kno: 12, soc: 11, mny: 6 }, wishAt: 100, dead: { age: 101, cause: 'old', text: '' } });
  const end = ending(life);
  assert.equal(end.key, 'hundred');
  assert.equal(score(life, end), 101 + 10 * 2 + 9 * 2 + 5 + 3 + 80 + end.pts);
  assert.equal(comment(life), '学问好，缺钱。心愿「活到一百岁」已了。下一稿多攒钱。');
  life.wishAt = null;
  assert.match(comment(life), /心愿「活到一百岁」未了。下一稿，好好锻炼，少操点心。$/);
  Object.assign(life, { age: 35, flags: {}, dead: { age: 35, cause: 'overwork', text: '' } });
  assert.equal(ending(life).key, 'overwork');
  life.dead.cause = 'accident';
  assert.equal(ending(life).key, 'young');
});

test('写完一稿: 结局、记号、批注记下来, 下一稿的路口能看到以前选过的路', () => {
  const rand = seeded(11);
  const life = newLife({ origin: 'yard', trait: 'chatty', wish: 'friend' }, emptyProfile(), rand);
  runUntilStop(life, emptyProfile(), rand, randomPick(rand));
  assert.throws(() => finish(newLife({ origin: 'yard', trait: 'chatty', wish: 'friend' })), /还没写完/);
  const r = finish(life, emptyProfile(), 5000);
  assert.equal(r.profile.runs, 1);
  assert.deepEqual(r.profile.endings, [r.ending.key]);
  assert.ok(r.newEnding);
  assert.deepEqual(r.profile.last, { age: life.age, end: r.ending.key, at: 5000 });
  assert.equal(Object.keys(r.profile.notes).length, life.choices.length);
  const first = life.choices[0];
  assert.deepEqual(noteFor(r.profile, first.id, first.opt), { run: 1, age: life.age, end: r.ending.name });
  assert.equal(noteFor(r.profile, first.id, 'never'), null);
  // 第二稿同样的结局不算新的; 同一条路换成新的批注
  const life2 = newLife({ origin: 'yard', trait: 'chatty', wish: 'friend' }, r.profile, rand);
  runUntilStop(life2, r.profile, rand, randomPick(rand));
  const r2 = finish(life2, r.profile, 6000);
  assert.equal(r2.profile.runs, 2);
  assert.equal(r2.newEnding, !r.profile.endings.includes(r2.ending.key));
  assert.equal(r2.profile.notes[`${life2.choices[0].id}:${life2.choices[0].opt}`].run, 2);
  if (life2.wishAt !== null) assert.ok(r2.profile.marks.includes('wish:friend'));
});

test('玩到一半存起来: 存成 JSON 再读回来接着写; 存坏了、内容对不上就不要', () => {
  const rand = seeded(21);
  const life = newLife({ origin: 'hill', trait: 'frugal', wish: 'home' }, emptyProfile(), rand);
  runUntilStop(life, emptyProfile(), rand);
  const back = restoreLife(JSON.parse(JSON.stringify(life)));
  assert.deepEqual(back, life);
  assert.ok(choose(back, back.pending.opts[0], emptyProfile(), rand));
  assert.equal(restoreLife(null), null);
  assert.equal(restoreLife({ v: 2 }), null);
  assert.equal(restoreLife({ ...life, origin: 'mars' }), null);
  assert.equal(restoreLife({ ...life, heir: 'mars' }), null);
  assert.equal(restoreLife({ ...life, heir: undefined }).heir, null, '旧版本存的没有 heir');
  assert.equal(restoreLife({ ...life, stats: { str: 'x' } }), null);
  assert.equal(restoreLife({ ...life, pending: { id: 'gone', opts: ['a'] } }).pending, null);
  assert.deepEqual(restoreLife({ ...life, pending: { id: 'hobby', opts: ['art', 'gone'] } }).pending, { id: 'hobby', opts: ['art'] });
});

test('批注怎么存: 乱的去掉, 合的时候几稿取大的、结局记号合起来、批注和传下去的性格取后写的', () => {
  assert.equal(cleanDraftProgress(null), null);
  assert.equal(cleanDraftProgress({}), null);
  const clean = cleanDraftProgress({
    runs: 3.7,
    endings: ['young', 'young', 'Bad Key', 7, 'hundred'],
    marks: ['m:bankrupt', 'wish:shop', '<script>'],
    notes: { 'hobby:art': { run: 2, age: 70, end: 'young', at: 10 }, 'bad key': { run: 1, age: 1, end: 'x', at: 1 }, 'career:stay': { run: 1, age: 80, end: 'BAD', at: 5 } },
    last: { age: 70, end: 'young', at: 10 },
    heir: { key: 'memory', at: 11 },
  });
  assert.deepEqual(clean, { runs: 3, endings: ['young', 'hundred'], marks: ['m:bankrupt', 'wish:shop'], notes: { 'hobby:art': { run: 2, age: 70, end: 'young', at: 10 } }, last: { age: 70, end: 'young', at: 10 }, heir: { key: 'memory', at: 11 } });
  assert.equal(cleanDraftProgress({ runs: 1, heir: { key: 'Bad', at: 1 } }).heir, null);
  assert.deepEqual(cleanDraftProgress({ heir: { key: '', at: 5 } }).heir, { key: '', at: 5 }, '「不传了」也要记着, 同步时盖过旧的');
  // 传下去的性格: 后写的算 (一台设备用掉了, 另一台设备旧的不会又冒出来)
  const x = mergeDraftProgress({ ...emptyProfile(), runs: 1, heir: { key: 'memory', at: 1 } }, { ...emptyProfile(), runs: 2, heir: { key: '', at: 2 } });
  assert.deepEqual(x.heir, { key: '', at: 2 });
  assert.deepEqual(mergeDraftProgress({ ...emptyProfile(), runs: 1, heir: { key: 'memory', at: 3 } }, { ...emptyProfile(), runs: 2, heir: null }).heir, { key: 'memory', at: 3 });
  const a = { runs: 2, endings: ['young'], marks: ['m:a'], notes: { 'x:y': { run: 1, age: 30, end: 'young', at: 1 } }, last: { age: 30, end: 'young', at: 1 } };
  const b = { runs: 5, endings: ['hundred'], marks: ['m:b'], notes: { 'x:y': { run: 5, age: 100, end: 'hundred', at: 9 }, 'p:q': { run: 4, age: 80, end: 'peaceful', at: 8 } }, last: { age: 100, end: 'hundred', at: 9 } };
  const m = mergeDraftProgress(a, b);
  assert.equal(m.runs, 5);
  assert.deepEqual(m.endings.sort(), ['hundred', 'young']);
  assert.deepEqual(m.marks.sort(), ['m:a', 'm:b']);
  assert.equal(m.notes['x:y'].run, 5);
  assert.equal(m.notes['p:q'].run, 4);
  assert.equal(m.last.end, 'hundred');
  const tidy = (x) => ({ ...x, endings: [...x.endings].sort(), marks: [...x.marks].sort() });
  assert.deepEqual(tidy(mergeDraftProgress(b, a)), tidy(m), '两边换过来合也一样');
  assert.equal(mergeDraftProgress(null, a), a);
});

test('成绩和批注记进游戏厅: 跟着同步、备份合起来, 弹珠台的不受影响', () => {
  assert.ok(ARCADE.some((g) => g.key === 'draft' && g.href === '#/arcade/draft'));
  assert.deepEqual(progressOf(null, 'draft'), emptyProfile());
  assert.deepEqual(progressOf(null, 'pinball'), { xp: {}, bosses: 0, landings: 0 });
  const rand = seeded(31);
  const life = newLife({ origin: 'alley', trait: 'bold', wish: 'shop' }, emptyProfile(), rand);
  runUntilStop(life, emptyProfile(), rand, randomPick(rand));
  const r = finish(life, emptyProfile(), 7000);
  const s1 = new Store(memoryStorage());
  const { rank, best } = s1.recordArcade('draft', r.score, 7000, r.profile);
  assert.equal(rank, 1);
  assert.ok(best);
  s1.recordArcade('pinball', 1234, 7001, { xp: { pilot: 10 }, bosses: 1, landings: 0 });
  assert.equal(bestOf(s1.data.arcade, 'draft'), r.score);
  assert.equal(progressOf(s1.data.arcade, 'draft').runs, 1);
  // 另一台设备写了两稿
  const other = { draft: { top: [{ score: 999, at: 8000 }], progress: { runs: 2, endings: ['hundred'], marks: ['m:bankrupt'], notes: {}, last: { age: 101, end: 'hundred', at: 8000 } } } };
  const merged = cleanData(mergeData(s1.data, cleanData({ arcade: other })));
  assert.equal(bestOf(merged.arcade, 'draft'), 999);
  const p = progressOf(merged.arcade, 'draft');
  assert.equal(p.runs, 2);
  assert.ok(p.endings.includes('hundred') && p.endings.includes(r.ending.key));
  assert.ok(p.marks.includes('m:bankrupt'));
  assert.equal(p.last.end, 'hundred');
  assert.equal(Object.keys(p.notes).length, life.choices.length);
  assert.equal(progressOf(merged.arcade, 'pinball').xp.pilot, 10);
  // 存进去再读出来 (备份、刷新页面) 还是一样
  const s2 = new Store(memoryStorage());
  s2.data = cleanData(JSON.parse(JSON.stringify(merged)));
  assert.deepEqual(progressOf(s2.data.arcade, 'draft'), p);
  assert.deepEqual(cleanArcade({ draft: { top: [], progress: { runs: 0 } } }), null);
  // 分数是 0 也记批注
  assert.equal(progressOf(addScore(null, 'draft', 0, 1, { runs: 1, endings: ['young'], marks: [], notes: {}, last: null }).arcade, 'draft').runs, 1);
});

test('出身的属性加起来差不多: 普通的 13–19, 稀有的更高一点 (15–23)', () => {
  for (const o of ORIGINS) {
    const sum = Object.values(o.stats).reduce((s, v) => s + v, 0);
    if (o.rare) assert.ok(sum >= 15 && sum <= 23, `${o.key} ${sum}`);
    else assert.ok(sum >= 13 && sum <= 19, `${o.key} ${sum}`);
    assert.equal(originOf(o.key), o);
  }
});
