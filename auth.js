/* ============================================================
   Study Hub · 账户核心 v3（Supabase 版）
   ------------------------------------------------------------
   · 认证由 Supabase Auth 提供
   · 数据存储在 Supabase Postgres（带 RLS 隔离）
   · 对外 API 与 v2 完全兼容
   ============================================================ */
(function (global) {
  'use strict';

  const NS          = 'shub';
  const SESSION_KEY = NS + ':session';       // 当前用户名（UI 同步读取）
  const KNOWN_KEY   = NS + ':known-users';   // 本机记住的账户
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

  /* 用户名 → 虚拟邮箱 */
  function usernameToEmail(username) {
    return username.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_') + '@shub.app';
  }

  function setSession(username) {
    writeStr(SESSION_KEY, username);
  }
  function clearSession() {
    delStr(SESSION_KEY);
    notify();
  }

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

  /* ============ 本地限流（UX 层） ============ */
  function getRate() { return loadJSON(RATE_KEY, {}); }
  function checkRegisterRate() {
    const rate = getRate();
    const now = Date.now();
    if (rate.lastRegister && now - rate.lastRegister < LIMITS.registerCooldown) {
      const remain = Math.ceil((LIMITS.registerCooldown - (now - rate.lastRegister)) / 1000);
      throw new Error(`操作过于频繁，请 ${remain} 秒后再试`);
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
      throw new Error(`账户已锁定，请 ${remain} 秒后再试`);
    }
  }

  /* ============ 数据同步到 Supabase ============ */
  async function pushLocalToCloud() {
    const username = Auth.current();
    if (!username) return;
    initSupabase();

    const prefix = DATA_PREFIX + username + ':';
    const rows = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || k.indexOf(prefix) !== 0) continue;
      const short = k.slice(prefix.length);
      let value;
      try { value = JSON.parse(localStorage.getItem(k)); }
      catch (_) { value = localStorage.getItem(k); }
      rows.push({ key: short, value });
    }
    if (!rows.length) return;

    /* 先取一次 user，不要在 map 里 await */
    const resp = await sb.auth.getUser();
    const user = resp.data && resp.data.user;
    if (!user) throw new Error('未登录');

    const payload = rows.map(function (r) {
      return { user_id: user.id, key: r.key, value: r.value };
    });

    const { error } = await sb.from('user_data').upsert(
      payload,
      { onConflict: 'user_id,key' }
    );
    if (error) throw error;
  }

  async function pullCloudToLocal() {
    const username = Auth.current();
    if (!username) return 0;
    initSupabase();
    const { data, error } = await sb.from('user_data').select('key, value');
    if (error) throw error;
    const prefix = DATA_PREFIX + username + ':';
    let count = 0;
    (data || []).forEach(function (row) {
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

    /* ---------- 注册 ---------- */
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

      initSupabase();

      /* 检查用户名是否已被占用（可选，失败不阻塞） */
      try {
        const { data: existing } = await sb.rpc('get_email_by_username', { p_username: username });
        if (existing) throw new Error('用户名已存在');
      } catch (e) {
        /* 若 RPC 不存在或报错，让后面的 signUp 决定成败 */
        if (e && e.message === '用户名已存在') throw e;
      }

      const email = usernameToEmail(username);
      const { data, error } = await sb.auth.signUp({
        email: email,
        password: password,
        options: { data: { username: username } },
      });
      if (error) throw new Error(error.message);
      if (!data || !data.user) throw new Error('注册失败，请稍后重试');

      recordRegister();
      setSession(username);
      rememberUser(username, Date.now());
      notify();
      return { username: username };
    },

    /* ---------- 登录 ---------- */
    login: async function (username, password) {
      username = String(username || '').trim();
      if (!username) throw new Error('请输入用户名');
      if (!password) throw new Error('请输入密码');
      checkLoginLock(username);
      initSupabase();

      /* 通过用户名查虚拟邮箱 */
      let email = null;
      try {
        const { data } = await sb.rpc('get_email_by_username', { p_username: username });
        email = data;
      } catch (_) { email = null; }

      /* 若 RPC 不可用，退化为直接拼虚拟邮箱 */
      if (!email) email = usernameToEmail(username);

      const { data, error } = await sb.auth.signInWithPassword({
        email: email,
        password: password,
      });
      if (error) {
        recordFail(username);
        throw new Error('用户名或密码错误');
      }

      clearFail(username);
      setSession(username);
      if (data && data.user) rememberUser(username, data.user.created_at);
      else rememberUser(username, Date.now());
      notify();

      /* 拉取云端数据到本地 */
      try { await pullCloudToLocal(); } catch (_) {}

      return { username: username };
    },

    /* ---------- 登出 ---------- */
    logout: async function () {
      const username = Auth.current();
      if (username) {
        try { await pushLocalToCloud(); } catch (_) {}
      }
      try { initSupabase(); await sb.auth.signOut(); } catch (_) {}
      clearSession();
      notify();
    },

    /* ---------- 当前用户（同步） ---------- */
    current: function () { return readStr(SESSION_KEY, null); },

    /* ---------- 本机记住的账户 ---------- */
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

    /* ---------- 修改密码 ---------- */
    changePassword: async function (oldPwd, newPwd) {
      if (!Auth.current()) throw new Error('未登录');
      if (newPwd.length < LIMITS.minPwdLength) {
        throw new Error('新密码至少 ' + LIMITS.minPwdLength + ' 位');
      }
      if (checkStrength(newPwd) < 2) throw new Error('新密码太弱');
      initSupabase();
      const { error } = await sb.auth.updateUser({ password: newPwd });
      if (error) throw new Error(error.message);
      notify();
      return true;
    },

    /* ---------- 删除账户 ---------- */
    remove: async function (username, password) {
      username = String(username || '').trim();
      if (!username) throw new Error('账户不存在');
      initSupabase();

      /* 若当前登录的不是要删的账户，先登录 */
      if (Auth.current() !== username) {
        await Auth.login(username, password);
      }

      /* 拿当前 user id */
      const resp = await sb.auth.getUser();
      const user = resp.data && resp.data.user;
      if (!user) throw new Error('未登录');

      /* 删除云端数据（RLS 保证只能删自己的） */
      await sb.from('user_data').delete().eq('user_id', user.id);
      await sb.from('profiles').delete().eq('id', user.id);

      /* 注意：auth.users 记录的删除需要 service_role key，
         前端无法完成。若需彻底删除请到 Supabase 控制台手动操作。 */

      await sb.auth.signOut();

      /* 清本地数据 */
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

    /* ---------- 导出（本地隔离数据 → JSON） ---------- */
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
        version: 'shub-backup-3',
        username: u,
        exportedAt: new Date().toISOString(),
        data: data,
      };
    },

    /* ---------- 导入（JSON → 本地隔离数据） ---------- */
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

    /* ---------- 供 sync.js 使用的客户端 ---------- */
    getClient: function () { return initSupabase(); },

    /* ---------- 会话校验 ---------- */
    verify: async function () {
      try {
        initSupabase();
        const resp = await sb.auth.getUser();
        const user = resp.data && resp.data.user;
        if (!user) { clearSession(); return false; }

        const { data: profile } = await sb
          .from('profiles')
          .select('username')
          .eq('id', user.id)
          .single();

        if (profile && profile.username) {
          setSession(profile.username);
          rememberUser(profile.username, user.created_at);
          return profile.username;
        }
        return false;
      } catch (_) {
        return false;
      }
    },

    /* ---------- 事件订阅 ---------- */
    onChange: function (fn) {
      listeners.add(fn);
      return function () { listeners.delete(fn); };
    },
  };

  /* ============ localStorage 劫持（按用户隔离） ============ */
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

  /* 页面加载后异步校验会话 */
  (function autoVerify() {
    if (!Auth.current()) return;
    const run = function () {
      Auth.verify().then(function (name) {
        if (!name) console.info('[auth] 会话已过期，需要重新登录');
      }).catch(function () {});
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        setTimeout(run, 300);
      });
    } else {
      setTimeout(run, 300);
    }
  })();

})(window);
