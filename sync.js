/* ============================================================
   Study Hub · GitHub 云同步 v2
   依赖：auth.js（提供 Auth API）
   功能：数据打包 / GitHub Contents API / 自动同步 / 冲突检测
   ============================================================ */
(function (global) {
  'use strict';

  /* ============ 常量 ============ */
  var CONFIG_KEY = 'shub:sync:config';
  var STATE_KEY  = 'shub:sync:state';
  var API_BASE   = 'https://api.github.com';
  var API_VER    = '2022-11-28';
  var AUTO_DELAY = 30000; // 30 秒防抖

  /* ============ 配置 & 状态 ============ */
  function loadJSON(key, fb) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fb;
      var p = JSON.parse(raw);
      return (p === null || p === undefined) ? fb : p;
    } catch (e) { return fb; }
  }
  function saveJSON(key, obj) {
    try { localStorage.setItem(key, JSON.stringify(obj)); } catch (e) {}
  }
  function loadConfig() { return loadJSON(CONFIG_KEY, {}); }
  function saveConfig(c) { saveJSON(CONFIG_KEY, c); }
  function loadState() { return loadJSON(STATE_KEY, {}); }
  function saveState(s) { saveJSON(STATE_KEY, s); }

  /* ============ Base64（Unicode 安全） ============ */
  function b64encode(str) {
    return btoa(unescape(encodeURIComponent(str)));
  }
  function b64decode(str) {
    return decodeURIComponent(escape(atob(String(str).replace(/\s/g, ''))));
  }

  /* ============ GitHub API 封装 ============ */
  async function api(path, options) {
    options = options || {};
    var cfg = loadConfig();
    if (!cfg.token) throw new Error('未配置 Token');

    var headers = {
      'Authorization': 'Bearer ' + cfg.token,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': API_VER
    };
    if (options.headers) {
      Object.keys(options.headers).forEach(function (k) {
        headers[k] = options.headers[k];
      });
    }

    var res;
    try {
      res = await fetch(API_BASE + path, {
        method: options.method || 'GET',
        headers: headers,
        body: options.body
      });
    } catch (e) {
      throw new Error('网络请求失败，请检查网络连接');
    }

    if (!res.ok) {
      var msg = 'HTTP ' + res.status;
      try {
        var errBody = await res.json();
        if (errBody && errBody.message) msg = errBody.message;
      } catch (e) {}
      if (res.status === 401) msg = 'Token 无效或已过期';
      if (res.status === 403) msg = '权限不足（需要 Contents: Read and write）';
      if (res.status === 404) msg = '文件不存在';
      if (res.status === 409) msg = '内容冲突，请稍后重试';
      if (res.status === 422) msg = '请求数据格式错误';
      var err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    if (res.status === 204) return null;
    return res.json();
  }

  /* ============ 远程文件读写 ============ */
  async function readRemote(path) {
    var cfg = loadConfig();
    var url = '/repos/' + cfg.owner + '/' + cfg.repo +
              '/contents/' + encodeURIComponent(path) +
              '?ref=' + encodeURIComponent(cfg.branch || 'main');
    try {
      var data = await api(url, { method: 'GET' });
      return {
        content: JSON.parse(b64decode(data.content)),
        sha: data.sha
      };
    } catch (e) {
      // 文件不存在（首次同步正常）
      if (e.status === 404) return null;
      throw e;
    }
  }

  async function writeRemote(path, content) {
    var cfg = loadConfig();
    var url = '/repos/' + cfg.owner + '/' + cfg.repo +
              '/contents/' + encodeURIComponent(path);

    // 检查现有文件，获取 SHA（更新必需）
    var sha = null;
    try {
      var existing = await api(url + '?ref=' + encodeURIComponent(cfg.branch || 'main'), { method: 'GET' });
      sha = existing.sha;
    } catch (e) {
      if (e.status !== 404) throw e;
    }

    var body = {
      message: 'sync: ' + new Date().toISOString(),
      content: b64encode(JSON.stringify(content, null, 2)),
      branch: cfg.branch || 'main'
    };
    if (sha) body.sha = sha;

    var res = await api(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return res.content.sha;
  }

  /* ============ 数据打包 / 还原 ============ */
  function collectLocalData() {
    var data = {};
    var u = Auth.current();
    if (!u) return data;
    var prefix = 'shub:data:' + u + ':';
    for (var i = 0; i < localStorage.length; i++) {
      var k = localStorage.key(i);
      if (!k || k.indexOf(prefix) !== 0) continue;
      var short = k.slice(prefix.length);
      var raw = localStorage.getItem(k);
      try { data[short] = JSON.parse(raw); }
      catch (e) { data[short] = raw; }
    }
    return data;
  }

  function applyRemoteData(data) {
    var u = Auth.current();
    if (!u) throw new Error('未登录');
    var prefix = 'shub:data:' + u + ':';
    var count = 0;
    Object.keys(data).forEach(function (k) {
      if (k.charAt(0) === '_') return; // 跳过元数据字段
      try {
        localStorage.setItem(prefix + k, JSON.stringify(data[k]));
        count++;
      } catch (e) {}
    });
    return count;
  }

  /* ============ 事件系统 ============ */
  var listeners = new Set();
  function emit(event, payload) {
    listeners.forEach(function (fn) {
      try { fn(event, payload); } catch (e) {}
    });
  }

  /* ============ 核心 Sync 对象 ============ */
  var Sync = {

    /* 当前状态 */
    status: function () {
      var cfg = loadConfig();
      var st = loadState();
      return {
        configured: !!(cfg.token && cfg.owner && cfg.repo),
        token: cfg.token ? '已设置' : '未设置',
        owner: cfg.owner || '',
        repo: cfg.repo || '',
        branch: cfg.branch || 'main',
        auto: st.auto !== false,
        lastSync: st.lastSync || 0,
        lastError: st.lastError || null,
        dirty: st.dirty === true
      };
    },

    /* 保存配置 */
    configure: function (partial) {
      var cur = loadConfig();
      Object.keys(partial).forEach(function (k) {
        cur[k] = partial[k];
      });
      saveConfig(cur);
      return cur;
    },

    /* 测试连接 */
    testConnection: async function () {
      var cfg = loadConfig();
      if (!cfg.token) throw new Error('请先设置 Token');
      var user = await api('/user', { method: 'GET' });
      if (!user || !user.login) throw new Error('Token 无效');
      if (cfg.owner && cfg.repo) {
        await api('/repos/' + cfg.owner + '/' + cfg.repo, { method: 'GET' });
      }
      return { login: user.login, avatar: user.avatar_url };
    },

    /* 文件路径（按当前用户） */
    filePath: function () {
      var u = Auth.current();
      if (!u) throw new Error('未登录');
      var safe = u.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5-]/g, '_');
      return 'sync-data/' + safe + '.json';
    },

    /* 推送本地 → 云端 */
    push: async function (force) {
      var cfg = loadConfig();
      var u = Auth.current();
      if (!u) throw new Error('请先登录账户');
      if (!cfg.token) throw new Error('请先配置 Token');

      var localData = collectLocalData();
      var remote = await readRemote(Sync.filePath());

      // 冲突检测
      if (remote && !force) {
        var remoteTs = (remote.content && remote.content._syncedAt) || 0;
        var localTs = loadState().lastSync || 0;
        if (remoteTs > localTs) {
          throw new Error('云端数据更新，请先「拉取」或强制推送');
        }
      }

      var payload = {
        _version:  'shub-sync-2',
        _user:     u,
        _syncedAt: Date.now(),
        _device:   (navigator.userAgent || '').slice(0, 100),
        data:      localData
      };

      await writeRemote(Sync.filePath(), payload);

      var st = loadState();
      st.lastSync = Date.now();
      st.lastError = null;
      st.dirty = false;
      saveState(st);

      emit('pushed', { files: Object.keys(localData).length });
      return { files: Object.keys(localData).length, syncedAt: st.lastSync };
    },

    /* 拉取云端 → 本地 */
    pull: async function (force) {
      var cfg = loadConfig();
      var u = Auth.current();
      if (!u) throw new Error('请先登录账户');
      if (!cfg.token) throw new Error('请先配置 Token');

      var remote = await readRemote(Sync.filePath());
      if (!remote) throw new Error('云端还没有同步数据');

      var payload = remote.content;
      if (!payload || !payload.data) throw new Error('云端数据格式错误');

      // 本地有未推送修改 → 需强制
      if (!force && loadState().dirty === true) {
        throw new Error('本地有未推送修改，请先「推送」或强制拉取');
      }

      var count = applyRemoteData(payload.data);

      var st = loadState();
      st.lastSync = payload._syncedAt || Date.now();
      st.lastError = null;
      st.dirty = false;
      saveState(st);

      emit('pulled', { files: count });
      return { files: count, syncedAt: st.lastSync };
    },

    /* 双向智能同步 */
    sync: async function () {
      var remote = await readRemote(Sync.filePath());
      var st = loadState();

      // 云端无数据 → 直接推送
      if (!remote) {
        return Object.assign({ action: 'pushed' }, await Sync.push(true));
      }

      var remoteTs = (remote.content && remote.content._syncedAt) || 0;
      var localTs = st.lastSync || 0;
      var isDirty = st.dirty === true;

      // 冲突：两边都改了
      if (isDirty && remoteTs > localTs) {
        emit('conflict', { local: localTs, remote: remoteTs });
        return { action: 'conflict', local: localTs, remote: remoteTs };
      }
      // 只有本地改了 → 推送
      if (isDirty) {
        return Object.assign({ action: 'pushed' }, await Sync.push(true));
      }
      // 只有云端改了 → 拉取
      if (remoteTs > localTs) {
        return Object.assign({ action: 'pulled' }, await Sync.pull(true));
      }
      // 一致
      emit('in-sync');
      return { action: 'in-sync' };
    },

    /* 标记本地已修改，触发自动同步 */
    markDirty: function () {
      var st = loadState();
      if (st.dirty) return; // 已在队列中
      st.dirty = true;
      saveState(st);
      Sync.scheduleAuto();
      emit('dirty');
    },

    /* 自动同步调度（30 秒防抖） */
    _timer: null,
    scheduleAuto: function () {
      var st = loadState();
      if (st.auto === false) return;
      if (Sync._timer) clearTimeout(Sync._timer);
      Sync._timer = setTimeout(async function () {
        Sync._timer = null;
        try {
          var r = await Sync.sync();
          emit('auto-sync', r);
        } catch (e) {
          var s = loadState();
          s.lastError = e.message;
          saveState(s);
          emit('auto-error', e.message);
        }
      }, AUTO_DELAY);
    },

    /* 开关自动同步 */
    setAuto: function (on) {
      var st = loadState();
      st.auto = on;
      saveState(st);
      if (on) {
        Sync.scheduleAuto();
      } else if (Sync._timer) {
        clearTimeout(Sync._timer);
        Sync._timer = null;
      }
    },

    /* 清空配置 */
    reset: function () {
      localStorage.removeItem(CONFIG_KEY);
      localStorage.removeItem(STATE_KEY);
      emit('reset');
    },

    /* 事件订阅 */
    on: function (fn) {
      listeners.add(fn);
      return function () { listeners.delete(fn); };
    }
  };

  /* ============ 拦截 localStorage 自动标记 dirty ============ */
  function installDirtyHook() {
    var _set = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function (k, v) {
      var r = _set(k, v);
      // 只标记业务数据（shub:data:<user>:*），避免自己触发自己
      if (typeof k === 'string' && k.indexOf('shub:data:') === 0) {
        if (typeof Sync !== 'undefined' && Sync.markDirty) {
          Sync.markDirty();
        }
      }
      return r;
    };
  }

  /* ============ 跨标签页同步脏标记 ============ */
  function installStorageListener() {
    global.addEventListener('storage', function (e) {
      // 另一个标签页修改了会话 → 通知自身刷新
      if (e.key === 'shub:session') {
        emit('session-change', e.newValue);
      }
      // 其他标签页标记 dirty → 本页也参与同步队列
      if (e.key === STATE_KEY && e.newValue) {
        try {
          var st = JSON.parse(e.newValue);
          if (st.dirty === true) {
            Sync.scheduleAuto();
          }
        } catch (err) {}
      }
    });
  }

  /* ============ 初始化 ============ */
  global.Sync = Sync;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      installDirtyHook();
      installStorageListener();
      // 启动时若已有脏数据，安排一次同步
      if (loadState().dirty === true) Sync.scheduleAuto();
    });
  } else {
    installDirtyHook();
    installStorageListener();
    if (loadState().dirty === true) Sync.scheduleAuto();
  }

})(window);