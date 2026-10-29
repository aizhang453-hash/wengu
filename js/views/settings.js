// 设置 (#/settings): 复习 (每天最多复习几张、想记住的把握、按自己的记录优化排法)、多设备同步、备份、温温。
// 以前散在首页 (备份)、复习页下面 (上限、把握、排法) 的, 都放在这里

import { h, toast, download, today } from '../dom.js';
import { exportBackup, importBackup } from '../backup.js';
import { openCapDialog, openRetentionDialog, percent, dateText } from './plan.js';
import { openOptimizeDialog } from './optimize.js';
import { reviewCount } from '../revlog.js';
import { loadConfig } from '../sync.js';
import { inApp } from '../platform.js';

const num = (n) => n.toLocaleString('zh-CN');

// 一行: 左边名字和说明, 右边现在的值和按钮
function row(label, desc, value, ...actions) {
  return h('div', { class: 'settings-row' }, h('div', { class: 'settings-text' }, h('span', { class: 'settings-label' }, label), desc ? h('span', { class: 'settings-desc' }, desc) : null), value ? h('span', { class: 'settings-value' }, value) : null, h('div', { class: 'settings-actions' }, actions));
}

const group = (title, ...rows) => h('section', { class: 'settings-group' }, h('h2', {}, title), h('div', { class: 'settings-card' }, rows));

export function renderSettings({ store, go, syncer, pet = null }) {
  const redraw = () => go('#/settings');
  const records = reviewCount(store.data.revlog);
  const own = store.data.settings.fsrs;
  const config = loadConfig();
  const status = syncer?.state.status;
  const syncText = !config ? '未开启' : status === 'error' ? '同步出错' : status === 'syncing' ? '同步中' : '已开启';

  const fileInput = h('input', {
    type: 'file',
    accept: '.json,application/json',
    hidden: true,
    onchange: async () => {
      const file = fileInput.files?.[0];
      fileInput.value = '';
      if (!file) return;
      // 跟现在的合在一起 (后改的为准), 不会把这里后来改的、背的退回去
      try {
        const { added, replaced } = await importBackup(store, await file.text());
        if (added + replaced === 0) return toast('备份中没有卡片集');
        toast(`已从备份恢复 ${added + replaced} 个卡片集`);
        go('#/');
      } catch (e) {
        toast(e?.size ? `存储空间不足（备份约 ${(e.size / 1e6).toFixed(1)} MB），未导入任何内容` : '无法读取该文件，请选择温故导出的备份');
      }
    },
  });
  const hasData = store.data.sets.length > 0 || store.data.mistakes.length > 0;

  return {
    title: '设置',
    el: h(
      'section',
      { class: 'settings-page' },
      h('h1', {}, '设置'),
      group(
        '复习',
        row('每日复习上限', '超出部分顺延到之后几天', `${num(store.reviewCap)} 张`, h('button', { class: 'btn small', type: 'button', onclick: () => openCapDialog({ store, onSaved: redraw }) }, '修改')),
        row('目标记忆率', '复习时仍记得的概率；越高，复习越频繁', percent(store.retention), h('button', { class: 'btn small', type: 'button', onclick: () => openRetentionDialog({ store, onSaved: redraw }) }, '修改')),
        row(
          '复习参数',
          own ? '已按个人复习记录优化' : records ? `已有 ${num(records)} 次复习记录，可按个人记录优化` : '积累复习记录后，可按个人记录优化',
          own ? `个人参数（${dateText(own.at)}）` : '默认参数',
          h('button', { class: 'btn small', type: 'button', onclick: () => openOptimizeDialog({ store, onChanged: redraw }) }, '优化'),
        ),
      ),
      group(
        '同步与备份',
        row('多设备同步', '通过 GitHub 私有仓库在电脑和手机间同步', syncText, h('a', { class: 'btn small', href: '#/sync' }, config ? '管理' : '开启')),
        row(
          '备份',
          inApp() ? '数据保存在本 App 中，删除 App 会一并删除；更换设备或删除 App 前请先导出。恢复时与现有数据合并' : '数据保存在本浏览器中；更换设备或清除浏览器数据前请先导出。恢复时与现有数据合并',
          null,
          h(
            'button',
            {
              class: 'btn small',
              type: 'button',
              disabled: !hasData,
              onclick: async () => {
                try {
                  download(`温故备份-${today()}.json`, await exportBackup(store));
                } catch {
                  toast('数据过多，无法导出；建议使用多设备同步');
                }
              },
            },
            '导出',
          ),
          h('button', { class: 'btn small', type: 'button', onclick: () => fileInput.click() }, '恢复'),
          fileInput,
        ),
      ),
      group(
        '其他',
        pet ? row(`小乌龟${pet.name()}`, '学习陪伴：显示、提醒与装扮', pet.summary(), h('button', { class: 'btn small', type: 'button', onclick: () => pet.openPanel() }, '打开')) : null,
        row('Quizlet 导入书签', '在 Quizlet 卡片集页面一键导入', null, h('a', { class: 'btn small', href: '#/quizlet' }, '查看')),
      ),
    ),
  };
}
