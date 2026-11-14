#!/bin/sh
# 把温故的网页文件复制进 App (Xcode 每次编译都跑这个, App 打开的就是这些文件)。
# 复制哪些照 sw.js 里「断网要存的文件」的名单: 网页要用的文件都在那里 (tests/sw.test.js 会检查)
set -eu

SRC="${SRCROOT}/.."
DEST="${TARGET_BUILD_DIR}/${UNLOCALIZED_RESOURCES_FOLDER_PATH}/web"

rm -rf "$DEST"
mkdir -p "$DEST"
count=0
for f in $(sed -n "s/^[[:space:]]*'\([^']*\)',\$/\1/p" "$SRC/sw.js"); do
  [ "$f" = "./" ] && continue
  mkdir -p "$DEST/$(dirname "$f")"
  cp "$SRC/$f" "$DEST/$f"
  count=$((count + 1))
done

# 长篇小说一回一个文件、国际象棋引擎, 网页上用到才下载 (sw.js 的 LAZY), App 里整个文件夹都放进去
# (引擎的 .wasm 和许可证 COPYING.txt 也要)
# (开局浏览器的资料 js/explorer/ 里面还有子文件夹, 整个复制)
for d in $(sed -n "s/^const LAZY = \[\(.*\)\];\$/\1/p" "$SRC/sw.js" | tr -d "' " | tr ',' ' '); do
  mkdir -p "$DEST/$d"
  cp -R "$SRC/$d". "$DEST/$d"
  count=$((count + $(find "$SRC/$d" -type f | wc -l)))
done

if [ ! -f "$DEST/index.html" ]; then
  echo "error: 没复制到 index.html, 看看 sw.js 里的名单" >&2
  exit 1
fi
echo "复制了 $count 个网页文件"
