/* ============================================================
   Study Hub · 账户核心 v3（自定义表 + RPC）
   ------------------------------------------------------------
   · 不用 Supabase Auth，无邮件、无 rate limit
   · 密码 bcrypt 哈希存服务端
   · 业务数据用随机 user_key 隔离
   ============================================================ */
(function (global) {
  'use strict';

  const NS          = 'shub';
  const SESSION_KEY = NS + ':session';
  const USERKEY_KEY = NS + ':userkey';
  const KNOWN_KEY   = NS + ':known-users';
  const RATE_KEY    = NS + ':rate';
  const FAIL_KEY    = NS + ':fail';
  const DATA_PREFIX = NS + ':data:';

  const KNOWN_MAX = 5;
  const LIMITS = {
    maxAccounts:      999,
    registerCooldown: 60 * 1000,
    loginMaxFail:     5,
    loginLockTime:    5 * 60 * 1000,
    minPwdLength:     6,
    maxUsernameLen:   20,
  };

  const SCOPED_PREFIXES = [
    'smart_schedule_', 'schedule_',
    'q7-', 'q7g-',
    'geolab-',
  ];

  /* ============ Supabase 客户端 ============ */
  let sb = null;
  function initSupabase() {
    if (sb) return sb;
    if (!global.supabase || !global.SUPABASE_URL || !global.SUPABASE_ANON_KEY) {
      throw new Error('Supabase 未配置，请检查 supabase-config.js');
    }
    sb = global.supabase.createClient(
      global.SUPABASE_URL,
      global.SUPABASE_ANON_KEY
    );
    return sb;
  }

  /* ============ 工具 ============ */
  function loadJSON(key, fb) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fb;
      const p = JSON.parse(raw);
      return p === null ? fb : p;
    } catch (_) { return fb; }
  }
  function saveJSON(key, obj) {
    try { localStorage.setItem(key, JSON.stringify(obj)); } catch (_) {}
  }
  function readStr(key, fb) {
    try { const v = localStorage.getItem(key); return v == null ? fb : v; }
    catch (_) { return fb; }
  }
  function writeStr(key, val) {
    try { localStorage.setItem(key, val); } catch (_) {}
  }
  function delStr(key) {
    try { localStorage.removeItem(key); } catch (_) {}
  }

  function setSession(username, userKey) {
    writeStr(SESSION_KEY, username);
    if (userKey) writeStr(USERKEY_KEY, userKey);
  }
  function clearSession() {
    delStr(SESSION_KEY);
    delStr(USERKEY_KEY);
    notify();
  }
  function getUserKey() { return readStr(USERKEY_KEY, ''); }

  /* ============ 密码强度 ============ */
  function checkStrength(pwd) {
    if (!pwd) return 0;
    let s = 0;
    if (pwd.length >= 6) s++;
    if (pwd.length >= 10) s++;
    const types = [/[a-zA-Z]/, /\d/, /[^a-zA-Z0-9]/].filter(r => r.test(pwd)).length;
    if (types >= 2) s++;
    if (types === 3) s++;
    return Math.min(4, s);
  }
  function strengthLabel(s) {
    return ['太弱', '弱', '中', '强', '极强'][s] || '太弱';
  }

  /* ============ 本机账户记忆 ============ */
  function getKnown() { return loadJSON(KNOWN_KEY, {}); }
  function rememberUser(username, createdAt) {
    const known = getKnown();
    known[username] = {
      username,
      createdAt: createdAt || (known[username] && known[username].createdAt) || Date.now(),
      lastLoginAt: Date.now(),
    };
    const entries = Object.entries(known)
      .sort((a, b) => (b[1].lastLoginAt || 0) - (a[1].lastLoginAt || 0))
      .slice(0, KNOWN_MAX);
    saveJSON(KNOWN_KEY, Object.fromEntries(entries));
  }
  function forgetUser(username) {
    const known = getKnown();
    delete known[username];
    saveJSON(KNOWN_KEY, known);
  }

  /* ============ 本地限流 ============ */
  function getRate() { return loadJSON(RATE_KEY, {}); }
  function checkRegisterRate() {
    const rate = getRate();
    const now = Date.now();
    if (rate.lastRegister && now - rate.lastRegister < LIMITS.registerCooldown) {
      const remain = Math.ceil((LIMITS.registerCooldown - (now - rate.lastRegister)) / 1000);
      throw new Error('操作过于频繁，请 ' + remain + ' 秒后再试');
    }
  }
  function recordRegister() {
    const r = getRate(); r.lastRegister = Date.now(); saveJSON(RATE_KEY, r);
  }
  function getFail(user) {
    const all = loadJSON(FAIL_KEY, {});
    return all[user] || { count: 0, lockedUntil: 0 };
  }
  function recordFail(user) {
    const all = loadJSON(FAIL_KEY, {});
    const cur = all[user] || { count: 0, lockedUntil: 0 };
    cur.count = (cur.count || 0) + 1;
    if (cur.count >= LIMITS.loginMaxFail) {
      cur.lockedUntil = Date.now() + LIMITS.loginLockTime;
      cur.count = 0;
    }
    all[user] = cur; saveJSON(FAIL_KEY, all);
  }
  function clearFail(user) {
    const all = loadJSON(FAIL_KEY, {});
    delete all[user]; saveJSON(FAIL_KEY, all);
  }
  function checkLoginLock(user) {
    const f = getFail(user);
    if (f.lockedUntil && Date.now() < f.lockedUntil) {
      const remain = Math.ceil((f.lockedUntil - Date.now()) / 1000);
      throw new Error('账户已锁定，请 ' + remain + ' 秒后再试');
    }
  }

  /* ============ 数据同步 ============ */
  async function pushLocalToCloud() {
    const username = Auth.current();
    const userKey = getUserKey();
    if (!username || !userKey) return;

    const client = initSupabase();
    const prefix = DATA_PREFIX + username + ':';
    const rows = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || k.indexOf(prefix) !== 0) continue;
      const short = k.slice(prefix.length);
      let value;
      try { value = JSON.parse(localStorage.getItem(k)); }
      catch (_) { value = localStorage.getItem(k); }
      rows.push({ user_key: userKey, key: short, value });
    }
    if (!rows.length) return;

    const { error } = await client
      .from('user_data')
      .upsert(rows, { onConflict: 'user_key,key' });
    if (error) throw new Error(error.message);
  }

  async function pullCloudToLocal() {
    const username = Auth.current();
    const userKey = getUserKey();
    if (!username || !userKey) return 0;

    const client = initSupabase();
    const { data, error } = await client
      .from('user_data')
      .select('key, value')
      .eq('user_key', userKey);
    if (error) throw new Error(error.message);

    const prefix = DATA_PREFIX + username + ':';
    let count = 0;
    (data || []).forEach(row => {
      try {
        localStorage.setItem(prefix + row.key, JSON.stringify(row.value));
        count++;
      } catch (_) {}
    });
    return count;
  }

  /* ============ Auth 对象 ============ */
  const Auth = {
    LIMITS: LIMITS,
    checkStrength: checkStrength,
    strengthLabel: strengthLabel,

    register: async function (username, password) {
      username = String(username || '').trim();
      if (!username) throw new Error('请输入用户名');
      if (username.length < 2) throw new Error('用户名至少 2 个字符');
      if (username.length > LIMITS.maxUsernameLen) {
        throw new Error('用户名最多 ' + LIMITS.maxUsernameLen + ' 个字符');
      }
      if (!/^[\u4e00-\u9fa5a-zA-Z0-9_-]+$/.test(username)) {
        throw new Error('用户名只能包含中英文、数字、下划线、连字符');
      }
      checkRegisterRate();
      if (!password || password.length < LIMITS.minPwdLength) {
        throw new Error('密码至少 ' + LIMITS.minPwdLength + ' 位');
      }
      if (checkStrength(password) < 2) {
        throw new Error('密码太弱，请使用「字母 + 数字」组合');
      }

      const client = initSupabase();
      const { data, error } = await client.rpc('register_user', {
        p_username: username,
        p_password: password,
      });
      if (error) throw new Error(error.message || '注册失败');
      if (!data) throw new Error('注册失败');
      if (data.error) throw new Error(data.error);

      recordRegister();
      setSession(data.username, data.user_key);
      rememberUser(data.username, Date.now());
      notify();
      return { username: data.username };
    },

    login: async function (username, password) {
      username = String(username || '').trim();
      if (!username) throw new Error('请输入用户名');
      if (!password) throw new Error('请输入密码');
      checkLoginLock(username);

      const client = initSupabase();
      const { data, error } = await client.rpc('login_user', {
        p_username: username,
        p_password: password,
      });
      if (error) {
        recordFail(username);
        throw new Error(error.message || '登录失败');
      }
      if (!data || data.error) {
        recordFail(username);
        throw new Error((data && data.error) || '用户名或密码错误');
      }

      clearFail(username);
      setSession(data.username, data.user_key);
      rememberUser(data.username, Date.now());
      notify();

      try { await pullCloudToLocal(); } catch (e) { console.warn('拉取失败:', e); }

      return { username: data.username };
    },

    logout: async function () {
      const username = Auth.current();
      if (username && getUserKey()) {
        try { await pushLocalToCloud(); } catch (_) {}
      }
      clearSession();
      notify();
    },

    current: function () { return readStr(SESSION_KEY, null); },

    list: function () {
      const known = getKnown();
      return Object.values(known)
        .map(function (u) { return { username: u.username, createdAt: u.createdAt || 0 }; })
        .sort(function (a, b) { return b.createdAt - a.createdAt; });
    },

    remainingSlots: function () {
      const n = Object.keys(getKnown()).length;
      return Math.max(0, LIMITS.maxAccounts - n);
    },
    totalAccounts: function () { return Object.keys(getKnown()).length; },

    registerCooldownLeft: function () {
      const r = getRate();
      if (!r.lastRegister) return 0;
      const left = LIMITS.registerCooldown - (Date.now() - r.lastRegister);
      return Math.max(0, Math.ceil(left / 1000));
    },

    changePassword: async function (oldPwd, newPwd) {
      if (!Auth.current()) throw new Error('未登录');
      if (newPwd.length < LIMITS.minPwdLength) {
        throw new Error('新密码至少 ' + LIMITS.minPwdLength + ' 位');
      }
      if (checkStrength(newPwd) < 2) throw new Error('新密码太弱');

      const client = initSupabase();
      const { data, error } = await client.rpc('change_password', {
        p_username: Auth.current(),
        p_old_password: oldPwd,
        p_new_password: newPwd,
      });
      if (error) throw new Error(error.message);
      if (data && data.error) throw new Error(data.error);
      notify();
      return true;
    },

    remove: async function (username, password) {
      username = String(username || '').trim();
      if (!username) throw new Error('账户不存在');

      const client = initSupabase();
      const { data, error } = await client.rpc('delete_user', {
        p_username: username,
        p_password: password,
      });
      if (error) throw new Error(error.message);
      if (data && data.error) throw new Error(data.error);

      const prefix = DATA_PREFIX + username + ':';
      const toDel = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.indexOf(prefix) === 0) toDel.push(k);
      }
      toDel.forEach(function (k) { localStorage.removeItem(k); });

      forgetUser(username);
      if (Auth.current() === username) clearSession();
      notify();
      return true;
    },

    export: function () {
      const u = Auth.current();
      if (!u) return null;
      const prefix = DATA_PREFIX + u + ':';
      const data = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || k.indexOf(prefix) !== 0) continue;
        const short = k.slice(prefix.length);
        try { data[short] = JSON.parse(localStorage.getItem(k)); }
        catch (_) { data[short] = localStorage.getItem(k); }
      }
      return {
        version: 'shub-backup-4',
        username: u,
        exportedAt: new Date().toISOString(),
        data: data,
      };
    },

    import: function (payload) {
      const u = Auth.current();
      if (!u) throw new Error('请先登录');
      if (!payload || !payload.data) throw new Error('数据格式错误');
      const prefix = DATA_PREFIX + u + ':';
      let count = 0;
      Object.keys(payload.data).forEach(function (k) {
        try {
          localStorage.setItem(prefix + k, JSON.stringify(payload.data[k]));
          count++;
        } catch (_) {}
      });
      return count;
    },

    getClient: function () { return initSupabase(); },
    getUserKey: getUserKey,

    /* 纯本地校验，绝不联网，避免误登出 */
    verify: async function () {
      const username = Auth.current();
      const userKey = getUserKey();
      if (!username || !userKey) {
        if (username) delStr(SESSION_KEY);
        return false;
      }
      return username;
    },

    onChange: function (fn) {
      listeners.add(fn);
      return function () { listeners.delete(fn); };
    },

    pushToCloud: pushLocalToCloud,
    pullFromCloud: pullCloudToLocal,
  };

  /* ============ localStorage 劫持 ============ */
  function installHook() {
    const _set = localStorage.setItem.bind(localStorage);
    const _get = localStorage.getItem.bind(localStorage);
    const _rm  = localStorage.removeItem.bind(localStorage);

    function isScoped(key) {
      if (typeof key !== 'string') return false;
      if (key.indexOf(NS + ':') === 0) return false;
      return SCOPED_PREFIXES.some(function (p) { return key.indexOf(p) === 0; });
    }
    function mapKey(key) {
      const u = Auth.current();
      if (u && isScoped(key)) return DATA_PREFIX + u + ':' + key;
      return key;
    }

    localStorage.setItem = function (k, v) { return _set(mapKey(k), v); };
    localStorage.getItem = function (k) { return _get(mapKey(k)); };
    localStorage.removeItem = function (k) { return _rm(mapKey(k)); };
  }

  /* ============ 事件 ============ */
  const listeners = new Set();
  function notify() {
    const u = Auth.current();
    listeners.forEach(function (fn) { try { fn(u); } catch (_) {} });
  }
  global.addEventListener('storage', function (e) {
    if (e.key === SESSION_KEY) notify();
  });

  /* ============ 挂载 ============ */
  global.Auth = Auth;
  installHook();

  /* 启动时清理无效会话（本地检查，不联网） */
  (function bootstrap() {
    const username = Auth.current();
    const userKey = getUserKey();
    if (username && !userKey) {
      /* 老版本遗留的 session，没 userkey，清掉 */
      delStr(SESSION_KEY);
      console.info('[auth] 检测到旧版会话，已清理');
    }
  })();

})(window);