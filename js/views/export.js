// 卡片集页「导出」: 存成 Excel、CSV 或者 Anki 能导入的文件

import { h, toast, download, openDialog } from '../dom.js';
import { exportFile } from '../cardfile.js';

const FORMATS = [
  ['xlsx', 'Excel (.xlsx)', '一列词、一列解释, Excel、WPS、Numbers、Google 表格都能打开'],
  ['csv', 'CSV (.csv)', '最通用的表格文字, 别的背单词软件 (Knowt、墨墨……) 多半能导入'],
  ['anki', 'Anki (.txt)', '在 Anki 里点「文件 → 导入」选这个文件, 加粗、斜体、换行都保留'],
];

export function openExportDialog(set) {
  const hasMedia = set.cards.some((c) => c.image || c.termAudio || c.defAudio);
  const d = openDialog({
    title: '导出卡片集',
    body: [
      h(
        'div',
        { class: 'export-list' },
        FORMATS.map(([format, name, note]) =>
          h(
            'button',
            {
              class: 'export-choice',
              type: 'button',
              onclick: () => {
                const { blob, filename } = exportFile(set, format);
                download(filename, blob, blob.type);
                toast(`存好了: ${filename}`);
                d.close();
              },
            },
            h('strong', {}, name),
            h('span', { class: 'muted small' }, note),
          ),
        ),
      ),
      h('p', { class: 'muted small' }, '只有文字。', hasMedia ? '图片和录音带不过去; ' : '', '要原样搬到另一台设备 (连图片、录音、学习进度), 用首页的「导出备份」, 或者设置多设备同步。'),
    ],
  });
  return d;
}
