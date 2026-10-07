/* ============================================================
   Study Hub · Supabase 云同步 v3
   依赖：auth.js（提供 Auth API + Supabase 客户端）
   ------------------------------------------------------------
   · 数据直接存 Supabase user_data 表（RLS 自动隔离）
   · 登录后 30 秒防抖自动同步
   · 不再需要 GitHub Token / 仓库配置
   ============================================================ */
(function (global) {
  'use strict';

  /* ============ 常量 ============ */
  var STATE_KEY   = 'shub:sync:state';
  var DATA_PREFIX = 'shub:data:';
  var AUTO_DELAY  = 30000;   // 30 秒防抖

  /* ============ 状态存储 ============ */
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
  function loadState() { return loadJSON(STATE_KEY, {}); }
  function saveState(s) { saveJSON(STATE_KEY, s); }

  /* ============ 事件 ============ */
  var listeners = new Set();
  function emit(event, payload) {
    listeners.forEach(function (fn) {
      try { fn(event, payload); } catch (e) {}
    });
  }

  /* ============ Supabase 客户端 ============ */
  function getClient() {
    if (!global.Auth || !Auth.getClient) {
      throw new Error('auth.js 未加载或版本过旧，请更新 auth.js');
    }
    return Auth.getClient();
  }

  /* ============ 本地数据打包 ============ */
  function collectLocalData() {
    var u = Auth.current();
    if (!u) return {};
    var prefix = DATA_PREFIX + u + ':';
    var data = {};
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
    var prefix = DATA_PREFIX + u + ':';
    var count = 0;
    Object.keys(data).forEach(function (k) {
      if (k.charAt(0) === '_') return;   // 跳过元数据字段
      try {
        localStorage.setItem(prefix + k, JSON.stringify(data[k]));
        count++;
      } catch (e) {}
    });
    return count;
  }

  /* ============ 云端读写 ============ */
  async function getUserId() {
    var client = getClient();
    var resp = await client.auth.getUser();
    var user = resp.data && resp.data.user;
    if (!user) throw new Error('请先登录账户');
    return user.id;
  }

  async function pushToCloud() {
    var client = getClient();
    var userId = await getUserId();
    var localData = collectLocalData();
    var keys = Object.keys(localData);
    if (!keys.length) return { files: 0 };

    var now = new Date().toISOString();
    var rows = keys.map(function (k) {
      return {
        user_id: userId,
        key: k,
        value: localData[k],
        updated_at: now
      };
    });

    var res = await client
      .from('user_data')
      .upsert(rows, { onConflict: 'user_id,key' });

    if (res.error) throw new Error(res.error.message || '推送失败');
    return { files: rows.length };
  }

  async function pullFromCloud() {
    var client = getClient();
    var userId = await getUserId();   // 权限校验（RLS 会再次过滤）

    var res = await client
      .from('user_data')
      .select('key, value, updated_at');

    if (res.error) throw new Error(res.error.message || '拉取失败');

    var data = {};
    var maxTs = 0;
    (res.data || []).forEach(function (row) {
      data[row.key] = row.value;
      var ts = new Date(row.updated_at).getTime();
      if (ts > maxTs) maxTs = ts;
    });

    if (!Object.keys(data).length) {
      return { files: 0, remoteTs: 0 };
    }

    var count = applyRemoteData(data);
    return { files: count, remoteTs: maxTs };
  }

  async function getRemoteLatestTs() {
    var client = getClient();
    var res = await client
      .from('user_data')
      .select('updated_at')
      .order('updated_at', { ascending: false })
      .limit(1);
    if (res.error || !res.data || !res.data.length) return 0;
    return new Date(res.data[0].updated_at).getTime();
  }

  /* ============ 核心 Sync 对象 ============ */
  var Sync = {

    /* 当前状态 */
    status: function () {
      var st = loadState();
      var username = Auth.current();
      return {
        configured: !!username,
        provider: 'supabase',
        user: username || '',
        auto: st.auto !== false,
        lastSync: st.lastSync || 0,
        lastError: st.lastError || null,
        dirty: st.dirty === true
      };
    },

    /* 兼容旧 API：旧版保存 GitHub 配置，现在只处理 auto */
    configure: function (partial) {
      var st = loadState();
      if (partial && typeof partial.auto === 'boolean') {
        st.auto = partial.auto;
      }
      saveState(st);
      return st;
    },

    /* 测试连接 */
    testConnection: async function () {
      var client = getClient();
      var resp = await client.auth.getUser();
      var user = resp.data && resp.data.user;
      if (!user) throw new Error('请先登录账户');

      // 探测 user_data 表是否可访问
      var probe = await client.from('user_data').select('key').limit(1);
      if (probe.error) {
        throw new Error('无法访问数据库：' + probe.error.message);
      }
      return { login: Auth.current() || user.email, avatar: null };
    },

    /* 推送本地 → 云端 */
    push: async function (force) {
      if (!Auth.current()) throw new Error('请先登录账户');
      var result = await pushToCloud();

      var st = loadState();
      st.lastSync = Date.now();
      st.lastError = null;
      st.dirty = false;
      saveState(st);

      emit('pushed', { files: result.files });
      return { files: result.files, syncedAt: st.lastSync };
    },

    /* 拉取云端 → 本地 */
    pull: async function (force) {
      if (!Auth.current()) throw new Error('请先登录账户');
      var result = await pullFromCloud();

      var st = loadState();
      st.lastSync = result.remoteTs || Date.now();
      st.lastError = null;
      st.dirty = false;
      saveState(st);

      emit('pulled', { files: result.files });
      return { files: result.files, syncedAt: st.lastSync };
    },

    /* 双向智能同步 */
    sync: async function () {
      if (!Auth.current()) throw new Error('请先登录账户');

      var st = loadState();
      var isDirty = st.dirty === true;

      // 本地有修改 → 推送
      if (isDirty) {
        return Object.assign({ action: 'pushed' }, await Sync.push(true));
      }

      // 检查云端是否有更新
      var remoteTs = await getRemoteLatestTs();
      var localTs  = st.lastSync || 0;

      if (remoteTs > localTs + 1000) {
        return Object.assign({ action: 'pulled' }, await Sync.pull(true));
      }

      emit('in-sync');
      return { action: 'in-sync' };
    },

    /* 标记本地已修改 */
    markDirty: function () {
      var st = loadState();
      if (st.dirty) return;
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
      if (!Auth.current()) return;        // 未登录不同步
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

    /* 清空同步状态（不影响账户） */
    reset: function () {
      localStorage.removeItem(STATE_KEY);
      emit('reset');
    },

    /* 事件订阅 */
    on: function (fn) {
      listeners.add(fn);
      return function () { listeners.delete(fn); };
    },

    /* 手动全量操作（设置界面用） */
    pushAll: async function () { return Sync.push(true); },
    pullAll: async function () { return Sync.pull(true); }
  };

  /* ============ 拦截 localStorage 自动标记 dirty ============ */
  function installDirtyHook() {
    var _set = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function (k, v) {
      var r = _set(k, v);
      // 只标记业务数据（shub:data:<user>:*），且仅在已登录时
      if (typeof k === 'string' && k.indexOf(DATA_PREFIX) === 0) {
        if (Auth.current() && typeof Sync !== 'undefined' && Sync.markDirty) {
          Sync.markDirty();
        }
      }
      return r;
    };
  }

  /* ============ 跨标签页同步 ============ */
  function installStorageListener() {
    global.addEventListener('storage', function (e) {
      // 另一个标签页登录/登出 → 本页也调整同步状态
      if (e.key === 'shub:session') {
        emit('session-change', e.newValue);
        if (e.newValue) {
          // 换了用户 → 清掉脏标记，重新安排同步
          var st = loadState();
          st.dirty = false;
          saveState(st);
          Sync.scheduleAuto();
        }
      }
      // 其他标签页标记 dirty → 本页也参与同步队列
      if (e.key === STATE_KEY && e.newValue) {
        try {
          var s = JSON.parse(e.newValue);
          if (s.dirty === true && Auth.current()) {
            Sync.scheduleAuto();
          }
        } catch (err) {}
      }
    });
  }

  /* ============ 初始化 ============ */
  global.Sync = Sync;

  function boot() {
    installDirtyHook();
    installStorageListener();
    // 启动时若已有脏数据且已登录 → 安排一次同步
    if (Auth.current() && loadState().dirty === true) {
      Sync.scheduleAuto();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})(window);