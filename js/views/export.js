// 卡片集页「导出」: 存成 Excel、CSV 或者 Anki 能导入的文件

import { h, toast, download, openDialog } from '../dom.js';
import { exportFile } from '../cardfile.js';

const FORMATS = [
  ['xlsx', 'Excel（.xlsx）', '词语与释义各一列，可用 Excel、WPS、Numbers 打开'],
  ['csv', 'CSV（.csv）', '通用表格格式，适用于大多数记忆软件'],
  ['anki', 'Anki（.txt）', '在 Anki 中通过「文件 › 导入」使用，保留格式'],
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
                toast(`已导出：${filename}`);
                d.close();
              },
            },
            h('strong', {}, name),
            h('span', { class: 'muted small' }, note),
          ),
        ),
      ),
      h('p', { class: 'muted small' }, '仅导出文字', hasMedia ? '，不含图片和录音' : '', '。如需在设备间完整迁移，请使用「设置」中的备份或多设备同步。'),
    ],
  });
  return d;
}
