# 温故

个人学习工具：卡片记忆、间隔复习与错题整理。免费，无需注册。名称取自「温故而知新」。

**在线使用：<https://aizhang453-hash.github.io/wengu/>**

支持电脑与手机，手机上可「添加到主屏幕」。打开过一次后可离线使用。

<p align="center">
  <img src="docs/screenshots/desktop.png" alt="首页「今日」：新词、复习、错题与卡片集" width="860">
</p>

<p align="center">
  <img src="docs/screenshots/home.png" alt="手机上的首页" width="200">
  <img src="docs/screenshots/cards.png" alt="单词卡" width="200">
  <img src="docs/screenshots/learn.png" alt="学习模式" width="200">
  <img src="docs/screenshots/dark.png" alt="深色模式" width="200">
</p>
<p align="center"><sub>手机首页 · 单词卡 · 学习 · 深色模式</sub></p>

## 功能

| | |
|---|---|
| **今日** | 汇总当日新词、到期复习与待重做错题，一键开始；显示连续学习天数 |
| **卡片集** | 单词卡、学习（选择、判断、拼写、听写）、测试、学习游戏、标注图；支持格式、图片、录音与在线词典 |
| **间隔复习** | FSRS-6 算法；每日新词计划（可按考试日期计算）、每日复习上限、目标记忆率、按个人记录优化参数；难记卡片与暂停 |
| **错题集** | 记录错题与练习题：材料、题目、选项、答案与解析；拍照后由 AI 识别并批量录入；题型统计与专项练习；批量删除；连续答对 3 次即为掌握 |
| **导入与导出** | Quizlet（粘贴或书签）、Excel、CSV、Anki 卡组（含复习进度）、拍照生成卡片；导出 Excel、CSV、Anki，打印，分享链接 |
| **统计** | 复习预测、学习记录、记忆率、卡片状态、学习时段分析 |
| **同步与备份** | 通过个人 GitHub 私有仓库在多设备间同步；备份文件导出与恢复 |
| **更多** | 文件夹、搜索、考前清单、深色模式；学习游戏、游戏厅（3D 弹珠台）、学习陪伴「温温」 |

## 使用说明

### 导航

- 左上角 ☰：今日、错题集、统计；「更多」中为学习游戏、游戏厅、温温；底部为设置。
- 右上角「新建」：新建卡片集、导入卡片、记录错题、拍照录入错题、新建文件夹。

### 卡片集

- 卡片集页提供单词卡、学习、测试、游戏（配对、打陨石、方块、宝石、Wordle），以及设置了标注图时的识图练习。
- 统计、加入文件夹、分享、复制为文本、导出、打印、重置进度、删除位于标题旁的「更多」中。
- 编辑页支持加粗、斜体、下划线、高亮，以及图片和录音；学习过程中也可随时编辑卡片。

### 复习

- 在单词卡、今日复习中自评「会 / 不会」的卡片，按 FSRS 安排复习。
- 每日新词计划：固定数量，或按考试日期与剩余数量自动计算；考前若干天仅复习。
- 每日复习上限、目标记忆率与复习参数优化在「设置 › 复习」中调整。
- 自定义学习：加学新词、提前复习、重练今日遗忘、练习难记或星标卡片。

### 错题集

- 手动记录：材料、题目、图片、选项（或填空答案）、我的答案、解析、题型。SAT 题型可自动识别。
- 拍照录入：复制提示词，连同题目照片发给 Claude、ChatGPT 等 AI，再将回复粘贴回来；做错的题和未作答的练习题均可录入。信息不完整的题目会逐题打开以便补充。
- 重做按 FSRS 安排：做错的题次日开始，未作答的练习题当日即可练习；连续答对 3 次即为掌握；可按题型专项练习。
- 批量删除：点击「选择」后勾选题目，或先按题型筛选、搜索，再「全选」并删除。
- 原「题目集」已并入错题集：旧的题目集在读取时自动转为错题，题目集名称作为题型。

### 导入

- 粘贴 Quizlet 导出的文本，或使用 Quizlet 一键导入书签（设置 › 其他）。
- 选择 Excel、CSV、Anki 卡组（.apkg / .colpkg）文件；Anki 卡组可保留复习进度。
- 拍照生成：复制提示词，连同单词表或笔记的照片发给 AI，再将回复粘贴到「导入」中。也支持 AI 返回的表格。

### 同步与备份

- 多设备同步：在「设置 › 同步与备份」中按步骤连接个人 GitHub 私有仓库；其他设备可扫码接入。修改会自动合并，不会互相覆盖。
- 备份：导出包含图片与录音的备份文件；恢复时与现有数据合并。

## 常见问题

**数据保存在哪里？**
保存在当前设备的浏览器中，不会上传。更换设备或清除浏览器数据前，请导出备份或开启多设备同步。

**iPhone 上朗读没有声音？**
请关闭手机侧边的静音开关；如仍无声，可在「设置 › 辅助功能 › 朗读内容 › 声音」中下载语音。自行录制的音频不受影响。

**如何更新到新版本？**
联网时打开即为最新版本。已添加到主屏幕的，完全关闭后重新打开即可。

## 更新记录

当前版本 **v1.45**，详见 [CHANGELOG.md](CHANGELOG.md)。

## 开发

需要 [Node.js](https://nodejs.org/)：

```sh
npm start        # 本地运行：http://localhost:8000
npm test         # 运行测试
npm run sw       # 新增 js 文件后，更新离线缓存清单
```

直接打开 `index.html` 无法运行（浏览器不允许从本地文件加载 JavaScript 模块），请使用上述本地服务器。

<details>
<summary><b>代码结构</b></summary>

- `index.html`、`css/style.css`：页面与样式（颜色等定义为变量，深色模式另有一套）
- `js/app.js`：入口与路由；`js/dom.js`：元素、提示、对话框、菜单等基础组件
- `js/views/`：各页面
  - `home.js` 今日、`set.js` 卡片集、`folder.js` 文件夹、`settings.js` 设置、`menu.js` 菜单与新建菜单、`search.js` 搜索
  - `edit.js` 编辑卡片集、`fileimport.js` 文件导入、`export.js` 导出、`cardedit.js` 卡片快速编辑、`aiprompt.js` 提示词按钮
  - `cards.js` 单词卡、`learn.js` 学习、`exam.js` 测试、`review.js` 今日复习、`plan.js` 计划与复习设置对话框、`optimize.js` 参数优化、`stats.js` 统计、`diagram.js` 标注图
  - `mistakes.js` 错题集、`mistakeedit.js` 记录与编辑、`mistakereview.js` 重做、`mistakeimport.js` 拍照录入
  - `gamehub.js`、`gameshell.js`、`match.js`、`blast.js`、`blocks.js`、`gems.js`、`wordle.js`、`gamequiz.js`：学习游戏；`arcade.js`、`pinball.js`：游戏厅
  - `share.js` 分享、`quizlet.js` Quizlet 书签、`sync.js` 同步设置、`pet.js` 温温、`examlist.js` 考前清单
- 数据与逻辑
  - `js/store.js` 存储；`js/merge.js` 合并；`js/sync.js` GitHub 同步；`js/backup.js` 备份；`js/media.js` 图片与录音（IndexedDB）
  - `js/srs.js` 间隔复习（`js/vendor/fsrs.js`：ts-fsrs，MIT）；`js/plan.js` 每日计划；`js/revlog.js` 复习记录；`js/optimize.js`、`js/optimize-worker.js` 参数优化（改写自 fsrs-rs，BSD-3-Clause）
  - `js/questions.js` 出题；`js/learn.js` 学习模式；`js/exam.js` 测试；`js/grade.js` 判分；`js/scope.js` 学习范围；`js/custom.js` 自定义学习；`js/stats.js` 统计
  - `js/mistakes.js` 错题；`js/mistakeimport.js` 错题的 AI 识别；`js/cardimport.js` 卡片的 AI 识别；`js/aitext.js` 从 AI 回复中提取 JSON、转换 LaTeX；`js/quiz.js` 旧题目集转换
  - `js/parse.js` 粘贴文本；`js/cardfile.js` 文件导入导出（`js/xlsx.js`、`js/csv.js`、`js/anki.js`、`js/zip.js`、`js/sqlite.js`、`js/vendor/fzstd.js`：MIT）
  - `js/games.js`、`js/blocks.js`、`js/gems.js`、`js/wordle.js` 游戏规则；`js/pinball.js`、`js/pinball3d.js`（`js/vendor/three.js`：MIT）、`js/pinart.js`、`js/pindmd.js`、`js/pinsound.js` 弹珠台；`js/arcade.js` 游戏厅
  - `js/speech.js` 朗读；`js/recorder.js` 录音；`js/sound.js`、`js/unlock.js` 音效；`js/dict.js` 词典；`js/rich.js` 文字格式；`js/cardview.js` 卡片显示；`js/diagram.js` 标注图；`js/search.js` 搜索；`js/print.js` 打印；`js/share.js` 分享链接；`js/quizlet.js` 书签；`js/qr.js`（`js/vendor/qrcode.js`：MIT）二维码；`js/pet.js` 温温；`js/examlist.js` 考前清单
- `sw.js`、`manifest.webmanifest`：离线使用与添加到主屏幕
- `tests/`：测试；`docs/screenshots/`：说明中的截图

</details>

## 许可证

[PolyForm Strict 1.0.0](LICENSE)：可查看代码、个人使用，不可修改后再发布或商用。
第三方代码按其各自许可：`js/vendor/` 中的 ts-fsrs、fzstd、qrcode-generator、three.js（均为 MIT）；`js/optimize.js` 改写自 fsrs-rs（BSD-3-Clause，许可原文见文件末尾）。
