import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readZip, writeZip, crc32 } from '../js/zip.js';
import { SQLiteDB, parseCreate } from '../js/sqlite.js';
import { readXlsx, writeXlsx, colName } from '../js/xlsx.js';
import { parseCsv, toCsv, guessDelimiter, decodeText } from '../js/csv.js';
import { htmlToText, mediaRefs, cloze, parseAnkiText, readApkg, toAnkiText, textToHtml } from '../js/anki.js';
import { readCardFile, buildCards, guessHeader, guessColumns, columnLabels, exportFile, FileError } from '../js/cardfile.js';

const fixture = (name) => new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
const fileOf = (name, bytes) => new File([bytes], name);

// ---- zip ----
test('zip: 写了再读, 中文文件名也行', async () => {
  const bytes = writeZip([
    { name: 'a.txt', data: 'hello' },
    { name: '文件夹/中文.txt', data: '温故而知新' },
    { name: 'bin', data: new Uint8Array([0, 1, 2, 255]) },
  ]);
  const zip = readZip(bytes);
  assert.deepEqual([...zip.keys()], ['a.txt', '文件夹/中文.txt', 'bin']);
  assert.equal(new TextDecoder().decode(await zip.get('文件夹/中文.txt').read()), '温故而知新');
  assert.deepEqual([...(await zip.get('bin').read())], [0, 1, 2, 255]);
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  assert.throws(() => readZip(new Uint8Array(100)), /不是 zip/);
});

// ---- SQLite ----
test('SQLite: 认得 CREATE TABLE 里的列 (有注释、WITHOUT ROWID)', () => {
  assert.deepEqual(parseCreate('CREATE TABLE notes (\n id integer PRIMARY KEY,\n -- 注释, 有逗号\n flds text NOT NULL, sfld integer )'), { columns: ['id', 'flds', 'sfld'], rowidCol: 'id', withoutRowid: false });
  assert.deepEqual(parseCreate('CREATE TABLE fields ( ntid integer NOT NULL, ord integer NOT NULL, name text, PRIMARY KEY (ntid, ord) ) without rowid'), { columns: ['ntid', 'ord', 'name'], rowidCol: null, withoutRowid: true });
  assert.deepEqual(parseCreate('CREATE TABLE t (b text, a integer, PRIMARY KEY (a)) WITHOUT ROWID').columns, ['a', 'b']);
  assert.equal(parseCreate('CREATE TABLE t (id INTEGER NOT NULL PRIMARY KEY, x)').rowidCol, 'id');
  assert.equal(parseCreate('CREATE TABLE t (id text PRIMARY KEY, x)').rowidCol, null);
});

test('SQLite: 很多行、很长的字 (溢出页)、各种类型, 跟真的 SQLite 读出来一样', async (t) => {
  let sqlite;
  try {
    sqlite = await import('node:sqlite');
  } catch {
    return t.skip('这个 Node 没有 node:sqlite');
  }
  const dir = mkdtempSync(join(tmpdir(), 'wengu-sqlite-'));
  try {
    for (const pageSize of [512, 4096]) {
      const path = join(dir, `t${pageSize}.db`);
      const db = new sqlite.DatabaseSync(path);
      db.exec(`PRAGMA page_size=${pageSize}; CREATE TABLE notes (id integer PRIMARY KEY, txt text, n integer, f real, b blob); CREATE TABLE kv (k text NOT NULL, v integer, PRIMARY KEY (k)) WITHOUT ROWID;`);
      const ins = db.prepare('INSERT INTO notes VALUES (?, ?, ?, ?, ?)');
      const kv = db.prepare('INSERT INTO kv VALUES (?, ?)');
      const expected = [];
      db.exec('BEGIN');
      for (let i = 1; i <= 1500; i++) {
        const txt = i % 97 === 0 ? `长的${'温故而知新 '.repeat(i % 900)}${i}` : `第 ${i} 行`;
        const n = [0, 1, -1, 127, -128, 32767, -40000, 8388607, 2 ** 31, -(2 ** 40), 1791837323705][i % 11];
        const id = 1791837000000 + i * 7;
        ins.run(id, txt, n, i / 8, new Uint8Array([i % 256, 7]));
        kv.run(`key-${String(i).padStart(4, '0')}${i % 50 === 0 ? 'x'.repeat(600) : ''}`, i);
        expected.push({ id, txt, n });
      }
      db.exec('COMMIT');
      db.close();
      const mine = new SQLiteDB(readFileSync(path));
      const rows = mine.rows('notes');
      assert.equal(rows.length, 1500);
      rows.forEach((r, i) => {
        assert.equal(r.id, expected[i].id);
        assert.equal(r.txt, expected[i].txt);
        assert.equal(r.n, expected[i].n);
        assert.equal(r.f, (i + 1) / 8);
        assert.deepEqual([...r.b], [(i + 1) % 256, 7]);
      });
      const kvs = mine.rows('kv');
      assert.equal(kvs.length, 1500);
      assert.equal(kvs[49].k, `key-0050${'x'.repeat(600)}`);
      assert.equal(kvs[49].v, 50);
      assert.deepEqual(mine.rows('nope'), []);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- Excel ----
test('Excel: 读 openpyxl 做的文件 (几个工作表、富文本、空行、数字)', async () => {
  const sheets = await readXlsx(fixture('openpyxl.xlsx'));
  assert.deepEqual(sheets.map((s) => s.name), ['托福 第1单元', 'Sheet2']);
  assert.deepEqual(sheets[0].rows, [
    ['单词', '释义', '例句'],
    ['abandon', '放弃; 抛弃', 'He abandoned the plan.'],
    ['salt & pepper', '盐<和>胡椒'],
    ['bold and plain', '两行\n第二行'],
    ['skip a row', '', '只有 C 列'],
    ['42', '0.3'],
  ]);
  assert.deepEqual(sheets[1].rows, [['cat', '猫'], ['dog', '狗']]);
});

test('Excel: 写了再读一样; 特殊字符不坏', async () => {
  const rows = [['词', '解释'], ['a & b <c>', '"引号" \'单引号\''], ['  前后空格 ', '两行\n第二行 🍎'], ['控制字符\u0001没了', '']];
  const bytes = writeXlsx([{ name: '测试/表[1]', rows, header: true, widths: [20, 30] }, { name: '测试/表[1]', rows: [['x', 'y']] }]);
  const sheets = await readXlsx(bytes);
  assert.deepEqual(sheets.map((s) => s.name), ['测试 表 1', '测试 表 1 2']);
  assert.deepEqual(sheets[0].rows, [['词', '解释'], ['a & b <c>', '"引号" \'单引号\''], ['  前后空格 ', '两行\n第二行 🍎'], ['控制字符没了']]);
  assert.equal(colName(0), 'A');
  assert.equal(colName(25), 'Z');
  assert.equal(colName(26), 'AA');
  assert.equal(colName(701), 'ZZ');
});

test('Excel: 别的软件写的样子也认 (标签有前缀、_x000D_、没有 r 属性)', async () => {
  const sheet = `<x:worksheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:sheetData><x:row><x:c t="inlineStr"><x:is><x:t>a_x000D_b</x:t></x:is></x:c><x:c t="s"><x:v>0</x:v></x:c></x:row><x:row r="3"><x:c r="B3" t="str"><x:v>公式结果</x:v></x:c><x:c r="C3" t="b"><x:v>1</x:v></x:c></x:row></x:sheetData></x:worksheet>`;
  const bytes = writeZip([
    { name: 'xl/workbook.xml', data: '<workbook xmlns:r="r"><sheets><sheet name="S &amp; T" sheetId="1" r:id="rId7"/></sheets></workbook>' },
    { name: 'xl/_rels/workbook.xml.rels', data: '<Relationships><Relationship Id="rId7" Target="/xl/worksheets/data.xml"/></Relationships>' },
    { name: 'xl/sharedStrings.xml', data: '<sst><si><r><t>富</t></r><r><t xml:space="preserve"> 文本</t></r><rPh><t>ふ</t></rPh></si></sst>' },
    { name: 'xl/worksheets/data.xml', data: sheet },
  ]);
  const [s] = await readXlsx(bytes);
  assert.equal(s.name, 'S & T');
  assert.deepEqual(s.rows, [['a\rb', '富 文本'], ['', '公式结果', 'TRUE']]);
});

// ---- CSV ----
test('CSV: 引号、字里的逗号和换行、分号分隔、GBK 编码', () => {
  assert.deepEqual(parseCsv('word,meaning\r\n"a, b","line1\nline2"\n"say ""hi""",x\n'), [['word', 'meaning'], ['a, b', 'line1\nline2'], ['say "hi"', 'x']]);
  assert.equal(guessDelimiter('a;b\nc;d, e\nf;g'), ';');
  assert.equal(guessDelimiter('a\tb, c\nd\te'), '\t');
  assert.deepEqual(parseCsv('a;"b;c"\n', ';'), [['a', 'b;c']]);
  // 格子中间的引号当普通字
  assert.deepEqual(parseCsv('he said "hi",x\n', ','), [['he said "hi"', 'x']]);
  assert.deepEqual(parseCsv('"5" screen,y\n', ','), [['5" screen', 'y']]);
  // GBK: "苹果" = C6 BB B9 FB
  assert.equal(decodeText(new Uint8Array([0x61, 0x2c, 0xc6, 0xbb, 0xb9, 0xfb])), 'a,苹果');
  assert.equal(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0x61])), 'a');
  const rows = [['词', '解释'], ['a,b', '"q"'], [' lead', 'x\ny']];
  assert.deepEqual(parseCsv(toCsv(rows)), rows);
});

// ---- Anki ----
test('Anki: HTML 变成文字和格式记号', () => {
  assert.equal(htmlToText('<b>cat</b>'), '**cat**');
  assert.equal(htmlToText('salt &amp; pepper&nbsp;&lt;x&gt; &#x4e2d;&#25991;'), 'salt & pepper <x> 中文');
  assert.equal(htmlToText('猫<br><img src="cat.png">'), '猫');
  assert.equal(htmlToText('一<div>二</div><div>三</div>'), '一\n二\n三');
  assert.equal(htmlToText('<i>to move</i> quickly, <u>esp.</u> on foot'), '*to move* quickly, __esp.__ on foot');
  assert.equal(htmlToText('apple [sound:apple.mp3]'), 'apple');
  assert.equal(htmlToText('<b>a</b><b>b</b> <i></i>x <span style="color:red">red</span>'), '**ab** x red');
  assert.equal(htmlToText('<style>.x{}</style>line\n  two'), 'line two');
  assert.deepEqual(mediaRefs(`x <img src="a b.png"> <IMG SRC='c.jpg'> [sound:d.mp3] <img src=e.gif>`), { images: ['a b.png', 'c.jpg', 'e.gif'], sounds: ['d.mp3'] });
  assert.deepEqual(cloze('The capital of {{c1::France}} is {{c2::Paris::city}}.'), { question: 'The capital of […] is [city].', answer: 'France; Paris' });
  assert.equal(cloze('no cloze'), null);
  assert.equal(textToHtml('**粗** a<b & *斜*\n第二行'), '<b>粗</b> a&lt;b &amp; <i>斜</i><br>第二行');
});

test('Anki: 读 Anki 导出的文字 (.txt)', () => {
  const r = parseAnkiText(new TextDecoder().decode(fixture('anki-notes.txt')));
  assert.equal(r.html, true);
  assert.equal(r.rows.length, 7);
  assert.equal(r.rows[0].deck, 'Vocab::Unit 1');
  assert.deepEqual(r.rows[1].cells.slice(0, 2), ['<b>cat</b>', '猫<br><img src="cat.png">']);
  assert.deepEqual(r.rows[4].cells.slice(0, 3), ['ephemeral', '短暂的', 'Fame is ephemeral.']);
  assert.equal(parseAnkiText('apple\t苹果\n'), null);
  const plain = parseAnkiText('#separator:Comma\n#html:false\na,"b, c"\n');
  assert.deepEqual(plain.rows[0].cells, ['a', 'b, c']);
});

for (const [kind, file] of [['新版', 'anki-new.apkg'], ['老版 (兼容)', 'anki-legacy.apkg']]) {
  test(`Anki: 读${kind}卡组 .apkg (牌组、字段名、图片、声音)`, async () => {
    const { notes, media } = await readApkg(fixture(file));
    assert.equal(notes.length, 7);
    const { id, reviews, ...first } = notes[0];
    assert.deepEqual(first, { fields: ['apple [sound:apple.mp3]', '苹果'], model: 'Basic', fieldNames: ['Front', 'Back'], deck: 'Vocab::Unit 1' });
    assert.ok(id);
    assert.deepEqual(reviews, []); // 导出时没勾「包含学习进度」
    assert.deepEqual(notes[4].fieldNames, ['Word', 'Meaning', 'Example']);
    assert.equal(notes[4].deck, 'Vocab::Unit 2');
    assert.equal(notes[6].model, 'Cloze');
    const img = await media.get('cat.png');
    assert.equal(img.type, 'image/png');
    assert.deepEqual([...new Uint8Array(await img.arrayBuffer())].slice(0, 4), [0x89, 0x50, 0x4e, 0x47]);
    assert.equal(await (await media.get('apple.mp3')).text(), 'ID3FAKEMP3DATA');
    assert.equal(await media.get('nope.png'), null);
  });
}

test('导入 .apkg: 一个牌组一张表, 变成卡片 (图片、声音、完形填空)', async () => {
  const r = await readCardFile(fileOf('vocab.apkg', fixture('anki-new.apkg')));
  assert.equal(r.kind, 'table');
  assert.equal(r.html, true);
  assert.deepEqual(r.sheets.map((s) => s.name), ['Vocab::Unit 1', 'Vocab::Unit 2']);
  const [u1, u2] = r.sheets;
  assert.deepEqual(u1.columns, ['Front', 'Back']);
  const cards = buildCards(u1.rows, { term: 0, def: 1, html: true });
  assert.deepEqual(cards[0], { term: 'apple', def: '苹果', image: '', termAudio: 'apple.mp3', defAudio: '' });
  assert.deepEqual(cards[1], { term: '**cat**', def: '猫', image: 'cat.png', termAudio: '', defAudio: '' });
  assert.equal(cards[2].def, '盐和胡椒 (调料)\n第二行');
  assert.deepEqual(u2.columns, ['Word', 'Meaning', 'Example']);
  const c2 = buildCards(u2.rows, { term: 0, def: 1, extra: 2, html: true });
  assert.deepEqual(c2.map((c) => [c.term, c.def]), [
    ['ephemeral', '短暂的\nFame is ephemeral.'],
    ['ubiquitous', '无处不在的'],
    ['The capital of […] is [city].', 'France; Paris\nEurope'],
  ]);
  assert.deepEqual(columnLabels(u2, false, true), ['Word', 'Meaning', 'Example']);
});

test('导入 CSV / Excel: 认出标题行, 猜对哪一列是词、哪一列是解释', async () => {
  const csv = await readCardFile(fileOf('words.csv', new TextEncoder().encode('Definition,Term\n苹果,apple\n香蕉,banana\n')));
  const s = csv.sheets[0];
  assert.equal(guessHeader(s.rows), true);
  assert.deepEqual(guessColumns(s.rows, true), { term: 1, def: 0, width: 2 });
  assert.deepEqual(buildCards(s.rows, { term: 1, def: 0, header: true }), [
    { term: 'apple', def: '苹果', image: '', termAudio: '', defAudio: '' },
    { term: 'banana', def: '香蕉', image: '', termAudio: '', defAudio: '' },
  ]);
  assert.deepEqual(columnLabels(s, true, false), ['A 列: Definition', 'B 列: Term']);

  const x = await readCardFile(fileOf('toefl.xlsx', fixture('openpyxl.xlsx')));
  assert.equal(x.title, 'toefl');
  assert.equal(guessHeader(x.sheets[0].rows), true);
  assert.deepEqual(guessColumns(x.sheets[0].rows, true), { term: 0, def: 1, width: 3 });
  assert.equal(guessHeader(x.sheets[1].rows), false);
  assert.deepEqual(columnLabels(x.sheets[1], false, false), ['A 列 (cat)', 'B 列 (猫)']);

  // 没有标题、第一列空着
  assert.deepEqual(guessColumns([['', 'a', 'b'], ['', 'c', 'd']], false), { term: 1, def: 2, width: 3 });
});

test('Anki 卡组: 按字段名猜词和解释, 只有图片 / 声音的字段不当解释; 没选的字段里的图片、词的发音也带上', () => {
  const names = ['Word', 'Image', 'Sound', 'Meaning', 'Example', 'Sound_Meaning'];
  const rows = [
    ['agree', '<img src="agree.jpg">', '[sound:agree.mp3]', 'To <b>agree</b> is to say yes.', 'I agree with you.', '[sound:agree_m.mp3]'],
    ['arrive', '<img src="arrive.jpg">', '[sound:arrive.mp3]', 'To arrive is to reach a place.', 'We arrived late.', '[sound:arrive_m.mp3]'],
  ];
  assert.deepEqual(guessColumns(rows, false, { names, html: true }), { term: 0, def: 3, width: 6 });
  // 字段名认不出来: 跳过只有图片、声音的字段
  assert.deepEqual(guessColumns(rows, false, { names: ['A', 'B', 'C', 'D', 'E', 'F'], html: true }), { term: 0, def: 3, width: 6 });
  const [card] = buildCards(rows, { term: 0, def: 3, extra: 4, html: true });
  assert.deepEqual([card.term, card.def, card.image, card.termAudio, card.defAudio], ['agree', 'To **agree** is to say yes.\nI agree with you.', 'agree.jpg', 'agree.mp3', '']);
  // 自己选了图片那个字段当解释, 照旧
  assert.equal(buildCards(rows, { term: 0, def: 1, html: true })[0].image, 'agree.jpg');
});

test('导入: 普通 .txt 交给粘贴框; 不支持的格式说清楚', async () => {
  const r = await readCardFile(fileOf('quizlet.txt', new TextEncoder().encode('apple\t苹果\nbanana\t香蕉')));
  assert.deepEqual(r, { kind: 'text', text: 'apple\t苹果\nbanana\t香蕉', title: 'quizlet' });
  await assert.rejects(readCardFile(fileOf('old.xls', new Uint8Array(10))), (e) => e instanceof FileError && /另存为/.test(e.message));
  await assert.rejects(readCardFile(fileOf('bad.apkg', new Uint8Array(10))), /不是 Anki 卡组/);
  await assert.rejects(readCardFile(fileOf('bad.xlsx', new TextEncoder().encode('hello'))), /读不了/);
  const anki = await readCardFile(fileOf('notes.txt', fixture('anki-notes.txt')));
  assert.equal(anki.kind, 'table');
  assert.deepEqual(anki.sheets.map((s) => [s.name, s.rows.length]), [['Vocab::Unit 1', 4], ['Vocab::Unit 2', 3]]);
});

test('导出: Excel、CSV 再导入回来一样; Anki 文字格式', async () => {
  const set = { title: '托福: 核心词?', cards: [{ term: '**apple**', def: '苹果, 一种水果' }, { term: 'say "hi"', def: '打招呼\n第二行' }] };
  const x = exportFile(set, 'xlsx');
  assert.equal(x.filename, '托福  核心词.xlsx');
  const back = await readCardFile(fileOf(x.filename, new Uint8Array(await x.blob.arrayBuffer())));
  assert.deepEqual(buildCards(back.sheets[0].rows, { term: 0, def: 1, header: guessHeader(back.sheets[0].rows) }).map((c) => [c.term, c.def]), [
    ['apple', '苹果, 一种水果'],
    ['say "hi"', '打招呼\n第二行'],
  ]);
  const c = exportFile(set, 'csv');
  const csvBack = await readCardFile(fileOf(c.filename, new Uint8Array(await c.blob.arrayBuffer())));
  assert.deepEqual(csvBack.sheets[0].rows, [['词', '解释'], ['apple', '苹果, 一种水果'], ['say "hi"', '打招呼\n第二行']]);
  assert.equal(
    toAnkiText(set),
    '#separator:tab\n#html:true\n#columns:Front\tBack\n<b>apple</b>\t苹果, 一种水果\n"say ""hi"""\t打招呼<br>第二行\n',
  );
  const a = exportFile(set, 'anki');
  const ankiBack = parseAnkiText(await a.blob.text());
  assert.deepEqual(ankiBack.columns, ['Front', 'Back']);
  assert.deepEqual(buildCards(ankiBack.rows.map((r) => r.cells), { term: 0, def: 1, html: true }).map((c) => [c.term, c.def]), [
    ['**apple**', '苹果, 一种水果'],
    ['say "hi"', '打招呼\n第二行'],
  ]);
});
