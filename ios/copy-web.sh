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

if [ ! -f "$DEST/index.html" ]; then
  echo "error: 没复制到 index.html, 看看 sw.js 里的名单" >&2
  exit 1
fi
echo "复制了 $count 个网页文件"
