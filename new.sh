#!/bin/bash
# 增强版：适配空格/中文路径，自动检测编辑器

# -------------------------- 强制锁定 Hexo 目录 --------------------------
HEXO_DIR="$HOME/HexoBlog"  # 你的 Hexo 根目录，确保没错
cd "$HEXO_DIR" || { echo "❌ 无法进入 Hexo 目录：$HEXO_DIR"; exit 1; }
# -------------------------------------------------------------------------

if [ -z "$1" ]; then
  echo "❌ 请输入文章标题！用法：n \"你的文章标题\""
  exit 1
fi

# 1. 新建文章 + 精准获取路径（只执行一次，避免重复创建）
export LC_ALL=en_US.UTF-8
POST_PATH=$(hexo new "$1" 2>&1 | grep -o 'source/_posts/.*\.md')

# 2. 检查路径
if [ -z "$POST_PATH" ]; then
  echo "❌ 无法获取文章路径，请手动查看 source/_posts/ 文件夹"
  exit 1
fi

# 3. 绝对路径
ABS_POST_PATH="$HEXO_DIR/$POST_PATH"

# 4. 打开文件（优先 VS Code）
if command -v code &> /dev/null; then
  echo "✅ 文章已新建：$ABS_POST_PATH"
  code "$ABS_POST_PATH"
elif [[ "$OSTYPE" == "darwin"* ]]; then
  open "$ABS_POST_PATH"
else
  xdg-open "$ABS_POST_PATH"
fi