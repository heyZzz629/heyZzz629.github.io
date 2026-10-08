/* ============================================================
   Study Hub · 工具页用户挂件
   左上角显示用户名 · 点击返回首页
   ============================================================ */
(function () {
  'use strict';
  if (!window.Auth) { console.warn('[auth-widget] auth.js 未加载'); return; }

  function injectStyles() {
    if (document.getElementById('shub-widget-styles')) return;
    const css = `
      .shub-widget {
        position: fixed; top: 12px; left: 12px; z-index: 99998;
        display: inline-flex; align-items: center; gap: 8px;
        padding: 6px 12px 6px 6px; border-radius: 999px;
        background: rgba(255,255,255,.88);
        backdrop-filter: blur(16px) saturate(180%);
        -webkit-backdrop-filter: blur(16px) saturate(180%);
        border: 1px solid rgba(0,0,0,.06);
        box-shadow: 0 2px 8px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
        font-size: 12.5px; font-weight: 600; color: #1e293b;
        cursor: pointer; text-decoration: none; user-select: none;
        transition: all .25s cubic-bezier(.16,1,.3,1);
        line-height: 1;
      }
      .shub-widget:hover {
        transform: translateY(-1px);
        box-shadow: 0 6px 16px rgba(0,0,0,.1), 0 2px 4px rgba(0,0,0,.06);
        border-color: rgba(99,102,241,.3);
      }
      .shub-widget .w-avatar {
        width: 22px; height: 22px; border-radius: 50%;
        display: grid; place-items: center;
        font-size: 11px; font-weight: 800; color: #fff;
        background: linear-gradient(135deg, #6366f1, #a855f7);
        flex-shrink: 0;
        box-shadow: inset 0 1px 0 rgba(255,255,255,.25);
      }
      .shub-widget.guest .w-avatar {
        background: #e2e8f0; color: #64748b; font-size: 12px;
      }
      .shub-widget .w-text {
        max-width: 120px; overflow: hidden;
        text-overflow: ellipsis; white-space: nowrap;
      }
      .shub-widget .w-dot {
        width: 6px; height: 6px; border-radius: 50%;
        background: #10b981;
        box-shadow: 0 0 6px rgba(16,185,129,.6);
        flex-shrink: 0;
        transition: background .3s, box-shadow .3s;
      }
      .shub-widget.guest .w-dot {
        background: #94a3b8; box-shadow: none;
      }
      .shub-widget .w-dot.syncing {
        background: #f59e0b;
        box-shadow: 0 0 6px rgba(245,158,11,.6);
        animation: shub-pulse 1s infinite;
      }
      .shub-widget .w-dot.error {
        background: #ef4444;
        box-shadow: 0 0 6px rgba(239,68,68,.6);
      }
      @keyframes shub-pulse { 50% { opacity: .5; } }

      /* 深色模式 */
      [data-theme="dark"] .shub-widget {
        background: rgba(16,20,31,.88);
        border-color: rgba(255,255,255,.08);
        color: #f4f6fa;
      }
      [data-theme="dark"] .shub-widget:hover {
        border-color: rgba(129,140,248,.4);
      }
      [data-theme="dark"] .shub-widget.guest .w-avatar {
        background: #1b2230; color: #8b96ad;
      }
      @media (prefers-color-scheme: dark) {
        .shub-widget {
          background: rgba(16,20,31,.88);
          border-color: rgba(255,255,255,.08);
          color: #f4f6fa;
        }
        .shub-widget.guest .w-avatar { background: #1b2230; color: #8b96ad; }
      }

      .shub-widget .w-save {
        width: 22px; height: 22px;
        border-radius: 6px;
        border: none;
        background: transparent;
        color: #64748b;
        cursor: pointer;
        display: grid;
        place-items: center;
        font-size: 12px;
        padding: 0;
        transition: all .18s ease;
        flex-shrink: 0;
        font-family: inherit;
        line-height: 1;
      }
      .shub-widget .w-save:hover {
        background: rgba(0,0,0,.06);
        color: #1e293b;
      }
      .shub-widget .w-save.dirty {
        background: linear-gradient(135deg, #6366f1, #8b5cf6);
        color: #fff;
        animation: shub-save-pulse 2s infinite;
      }
      .shub-widget .w-save.dirty:hover { filter: brightness(1.08); }
      @keyframes shub-save-pulse {
        0%   { box-shadow: 0 0 0 0 rgba(99,102,241,.5); }
        70%  { box-shadow: 0 0 0 6px rgba(99,102,241,0); }
        100% { box-shadow: 0 0 0 0 rgba(99,102,241,0); }
      }
      [data-theme="dark"] .shub-widget .w-save { color: #8b96ad; }
      [data-theme="dark"] .shub-widget .w-save:hover {
        background: rgba(255,255,255,.06);
        color: #f4f6fa;
      }

      /* Tooltip */
      .shub-widget-tip {
        position: fixed; top: 52px; left: 12px;
        padding: 6px 11px; border-radius: 8px;
        background: rgba(15,23,42,.92); color: #fff;
        font-size: 11.5px; font-weight: 500;
        white-space: nowrap; z-index: 99999;
        opacity: 0; pointer-events: none;
        transform: translateY(-4px);
        transition: opacity .2s, transform .2s;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        box-shadow: 0 4px 12px rgba(0,0,0,.2);
      }
      .shub-widget-tip.show {
        opacity: 1; transform: translateY(0);
      }

      @media (max-width: 720px) {
        .shub-widget {
          top: 10px; left: 10px;
          padding: 5px 10px 5px 5px;
          font-size: 11.5px;
        }
        .shub-widget .w-avatar { width: 20px; height: 20px; font-size: 10px; }
        .shub-widget .w-text { max-width: 80px; }
      }
    `;
    const s = document.createElement('style');
    s.id = 'shub-widget-styles';
    s.textContent = css;
    document.head.appendChild(s);
  }

  function build() {
    if (document.getElementById('shub-widget')) return;
    injectStyles();

    const w = document.createElement('a');
    w.className = 'shub-widget';
    w.id = 'shub-widget';
    w.href = 'index.html';
    document.body.appendChild(w);

    const tip = document.createElement('div');
    tip.className = 'shub-widget-tip';
    document.body.appendChild(tip);

    function escape(str) {
      return String(str).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    }

    function refresh() {
      const u = window.Auth.current();
      if (u) {
        w.classList.remove('guest');
        w.innerHTML = `
          <span class="w-avatar">${escape(u[0].toUpperCase())}</span>
          <span class="w-text">${escape(u)}</span>
          <button class="w-save" id="shub-widget-save" type="button" title="保存到云端">✓</button>
          <span class="w-dot" id="shub-widget-dot"></span>
        `;
        tip.textContent = `已登录为 ${u} · 点击返回首页`;
      } else {
        w.classList.add('guest');
        w.innerHTML = `
          <span class="w-avatar">?</span>
          <span class="w-text">未登录 · 前往首页</span>
        `;
        tip.textContent = '未登录 · 点击前往登录 / 注册';
      }
      updateSaveButton();
    }

    w.addEventListener('mouseenter', () => tip.classList.add('show'));
    w.addEventListener('mouseleave', () => tip.classList.remove('show'));

    function updateSaveButton() {
      var btn = document.getElementById('shub-widget-save');
      if (!btn) return;
      if (!window.Sync || !window.Auth.current()) {
        btn.style.display = 'none';
        return;
      }
      btn.style.display = '';
      var st = window.Sync.status();
      if (st.dirty) {
        btn.classList.add('dirty');
        btn.textContent = '💾';
        btn.title = '有未保存的改动 · 点击保存到云端';
      } else {
        btn.classList.remove('dirty');
        btn.textContent = '✓';
        btn.title = '已与云端同步';
      }
    }

    w.addEventListener('click', function (e) {
      var t = e.target;
      var btn = t && t.closest ? t.closest('#shub-widget-save') : null;
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();
      if (btn.dataset.saving === '1') return;
      if (!window.Sync || !window.Auth.current()) return;
      btn.dataset.saving = '1';
      btn.textContent = '⏳';
      btn.classList.remove('dirty');
      window.Sync.push(true).then(function (r) {
        btn.textContent = '✅';
        btn.title = '已保存 ' + r.files + ' 项';
        setTimeout(function () { btn.dataset.saving = '0'; updateSaveButton(); }, 1200);
      }).catch(function (err) {
        btn.textContent = '❌';
        btn.title = '保存失败：' + ((err && err.message) || '未知错误');
        btn.classList.add('dirty');
        setTimeout(function () { btn.dataset.saving = '0'; updateSaveButton(); }, 1800);
      });
    });

    if (window.Sync) {
      window.Sync.on(function (event) {
        if (event === 'dirty' || event === 'pushed' || event === 'pulled' || event === 'auto-sync') {
          updateSaveButton();
        }
      });
    }
    setInterval(updateSaveButton, 2500);

    /* 监听同步状态（如果 sync.js 存在） */
    if (window.Sync) {
      window.Sync.on((event) => {
        const dot = document.getElementById('shub-widget-dot');
        if (!dot) return;
        if (event === 'auto-sync') {
          dot.classList.remove('syncing', 'error');
        } else if (event === 'auto-error') {
          dot.classList.add('error');
          dot.classList.remove('syncing');
        }
      });
      // 监听 dirty 事件闪烁
      const _origMarkDirty = window.Sync.markDirty;
      if (_origMarkDirty) {
        window.Sync.markDirty = function () {
          _origMarkDirty.apply(this, arguments);
          const dot = document.getElementById('shub-widget-dot');
          if (dot) {
            dot.classList.add('syncing');
            setTimeout(() => dot.classList.remove('syncing'), 3000);
          }
        };
      }
    }

    var lastUser = window.Auth.current();
    window.Auth.onChange(function (u) {
      refresh();
      // 从未登录 → 已登录：reload 让页面重新读取账户数据
      if (!lastUser && u) {
        setTimeout(function () { location.reload(); }, 600);
      }
      lastUser = u;
    });
    refresh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();