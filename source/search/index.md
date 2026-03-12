---
title: 搜索
layout: page
permalink: /search/
---

<div class="search-pc">
  <h2 class="search-title">🔍 文章搜索</h2>
  <input type="text" id="search-input" placeholder="输入关键词（如：树状数组、ACM）" autocomplete="off">
  <div id="search-result"></div>
</div>

<style>
/* 全局统一样式，消除字体大小不一致 */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
  font-family: "Microsoft Yahei", Arial, sans-serif;
}

.search-pc {
  max-width: 750px;
  margin: 3rem auto;
  padding: 0 20px;
}

/* 标题样式 */
.search-title {
  font-size: 18px;
  color: #2c3e50;
  text-align: center;
  margin-bottom: 20px;
  font-weight: 600;
}

/* 搜索框样式 */
#search-input {
  width: 100%;
  padding: 12px 16px;
  font-size: 15px;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  outline: none;
  transition: border-color 0.2s;
  background: #fff;
}

#search-input:focus {
  border-color: #4a90e2;
  box-shadow: 0 0 0 2px rgba(74, 144, 226, 0.1);
}

/* 搜索结果容器 */
#search-result {
  margin-top: 20px;
}

/* 结果为空样式 */
.search-empty {
  text-align: center;
  color: #888;
  font-size: 14px;
  padding: 30px 0;
}

/* 结果项样式（统一字体大小） */
.search-item {
  background: #fff;
  padding: 16px;
  margin-bottom: 12px;
  border-radius: 8px;
  border: 1px solid #f0f0f0;
  transition: all 0.2s;
}

.search-item:hover {
  border-color: #e0e0e0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
  transform: translateY(-1px);
}

/* 标题链接（强制统一字号） */
.search-item-title {
  font-size: 16px;
  color: #2c3e50;
  text-decoration: none;
  font-weight: 500;
  display: block;
  margin-bottom: 8px;
}

.search-item-title:hover {
  color: #4a90e2;
}

/* 内容摘要（强制统一字号，消除大小不一致） */
.search-item-desc {
  font-size: 14px;
  color: #666;
  line-height: 1.6;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2; /* 只显示2行 */
  -webkit-box-orient: vertical;
  /* 强制覆盖原文样式 */
  font-weight: normal !important;
  letter-spacing: normal !important;
}

/* 关键词高亮 */
.search-keyword {
  color: #e67e22;
  font-weight: 500;
}
</style>

<script>
// 加载并解析search.xml
fetch('/search.xml')
  .then(res => res.text())
  .then(xmlStr => {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlStr, 'text/xml');
    const entries = [...xmlDoc.querySelectorAll('entry')];
    const input = document.getElementById('search-input');
    const resultBox = document.getElementById('search-result');

    // 搜索逻辑+关键词高亮
    input.addEventListener('input', () => {
      const keyword = input.value.trim().toLowerCase();
      resultBox.innerHTML = '';

      // 空输入清空结果
      if (!keyword) return;

      // 筛选匹配的文章
      const matchArticles = entries.filter(entry => {
        const title = entry.querySelector('title').textContent.toLowerCase();
        const content = entry.querySelector('content').textContent.toLowerCase();
        return title.includes(keyword) || content.includes(keyword);
      });

      // 无结果
      if (matchArticles.length === 0) {
        resultBox.innerHTML = '<div class="search-empty">未找到「' + keyword + '」相关内容</div>';
        return;
      }

      // 渲染结果（统一字体样式）
      matchArticles.forEach(article => {
        const title = article.querySelector('title').textContent;
        const content = article.querySelector('content').textContent;
        const url = article.querySelector('url').textContent;

        // 关键词高亮处理
        const highlight = (text, key) => {
          const reg = new RegExp(key, 'gi');
          return text.replace(reg, '<span class="search-keyword">$&</span>');
        };
        const highlightTitle = highlight(title, keyword);
        // 截取前100字符，避免内容过长
        const shortContent = content.substr(0, 100);
        const highlightContent = highlight(shortContent, keyword);

        // 生成DOM（所有文字大小由CSS强制统一）
        const item = document.createElement('div');
        item.className = 'search-item';
        item.innerHTML = `
          <a href="${url}" class="search-item-title">${highlightTitle}</a>
          <p class="search-item-desc">${highlightContent}...</p>
        `;
        resultBox.appendChild(item);
      });
    });
  });
</script>