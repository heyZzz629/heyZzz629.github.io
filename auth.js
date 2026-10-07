/* ============================================================
   Study Hub · 账户核心 v2
   统一账户 · 防轰炸 · localStorage 隔离
   ============================================================ */
(function (global) {
  'use strict';

  const NS = 'shub';
  const USERS_KEY   = NS + ':users';
  const SESSION_KEY = NS + ':session';
  const DATA_PREFIX = NS + ':data:';
  const RATE_KEY    = NS + ':rate';
  const FAIL_KEY    = NS + ':fail';

  /* ---- 防轰炸参数 ---- */
  const LIMITS = {
    maxAccounts:       5,              // 本地最多 5 个账户
    registerCooldown:  60 * 1000,      // 注册冷却 60 秒
    loginMaxFail:      5,              // 登录失败 5 次
    loginLockTime:     5 * 60 * 1000,  // 锁定 5 分钟
    minPwdLength:      6,              // 密码最短 6 位
    maxUsernameLen:    20              // 用户名最长 20 字符
  };

  /* ---- 需要隔离的 localStorage 前缀 ---- */
  const SCOPED_PREFIXES = [
    'smart_schedule_', 'schedule_',
    'q7-', 'q7g-',
    'geolab-'
  ];

  /* ============ 工具 ============ */
  function loadJSON(key, fb) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fb;
      const p = JSON.parse(raw);
      return p === null ? fb : p;
    } catch (e) { return fb; }
  }
  function saveJSON(key, obj) {
    try { localStorage.setItem(key, JSON.stringify(obj)); } catch (e) {}
  }

  async function hashPwd(pwd) {
    if (global.crypto && crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pwd));
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    let h = 5381;
    for (let i = 0; i < pwd.length; i++) h = ((h << 5) + h + pwd.charCodeAt(i)) | 0;
    return 'weak_' + (h >>> 0).toString(16);
  }

  /* 密码强度：0-4 */
  function checkStrength(pwd) {
    if (!pwd) return 0;
    let s = 0;
    if (pwd.length >= 6) s++;
    if (pwd.length >= 10) s++;
    const hasL = /[a-zA-Z]/.test(pwd);
    const hasD = /\d/.test(pwd);
    const hasS = /[^a-zA-Z0-9]/.test(pwd);
    const types = [hasL, hasD, hasS].filter(Boolean).length;
    if (types >= 2) s++;
    if (types === 3) s++;
    return Math.min(4, s);
  }
  function strengthLabel(s) {
    return ['太弱', '弱', '中', '强', '极强'][s] || '太弱';
  }

  /* ============ 限流 ============ */
  function getRate() { return loadJSON(RATE_KEY, {}); }
  function checkRegisterRate() {
    const rate = getRate();
    const now = Date.now();
    if (rate.lastRegister && now - rate.lastRegister < LIMITS.registerCooldown) {
      const remain = Math.ceil((LIMITS.registerCooldown - (now - rate.lastRegister)) / 1000);
      throw new Error(`操作过于频繁，请 ${remain} 秒后再试`);
    }
    const users = loadJSON(USERS_KEY, {});
    if (Object.keys(users).length >= LIMITS.maxAccounts) {
      throw new Error(`已达本地账户上限（${LIMITS.maxAccounts} 个）`);
    }
    return true;
  }
  function recordRegister() {
    const r = getRate();
    r.lastRegister = Date.now();
    saveJSON(RATE_KEY, r);
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
    all[user] = cur;
    saveJSON(FAIL_KEY, all);
  }
  function clearFail(user) {
    const all = loadJSON(FAIL_KEY, {});
    delete all[user];
    saveJSON(FAIL_KEY, all);
  }
  function checkLoginLock(user) {
    const f = getFail(user);
    if (f.lockedUntil && Date.now() < f.lockedUntil) {
      const remain = Math.ceil((f.lockedUntil - Date.now()) / 1000);
      throw new Error(`账户已锁定，请 ${remain} 秒后再试`);
    }
  }

  /* ============ 核心 API ============ */
  const Auth = {
    LIMITS, checkStrength, strengthLabel,

    /* 注册 */
    async register(username, password) {
      username = String(username || '').trim();
      if (!username) throw new Error('请输入用户名');
      if (username.length < 2) throw new Error('用户名至少 2 个字符');
      if (username.length > LIMITS.maxUsernameLen) throw new Error(`用户名最多 ${LIMITS.maxUsernameLen} 个字符`);
      if (!/^[\u4e00-\u9fa5a-zA-Z0-9_-]+$/.test(username)) {
        throw new Error('用户名只能包含中英文、数字、下划线、连字符');
      }

      checkRegisterRate();

      if (!password || password.length < LIMITS.minPwdLength) {
        throw new Error(`密码至少 ${LIMITS.minPwdLength} 位`);
      }
      if (checkStrength(password) < 2) {
        throw new Error('密码太弱，请使用「字母 + 数字」组合');
      }

      const users = loadJSON(USERS_KEY, {});
      if (users[username]) throw new Error('用户名已存在');

      users[username] = {
        password: await hashPwd(password),
        createdAt: Date.now()
      };
      saveJSON(USERS_KEY, users);
      recordRegister();
      localStorage.setItem(SESSION_KEY, username);
      notify();
      return { username };
    },

    /* 登录 */
    async login(username, password) {
      username = String(username || '').trim();
      if (!username) throw new Error('请输入用户名');
      if (!password) throw new Error('请输入密码');

      checkLoginLock(username);

      const users = loadJSON(USERS_KEY, {});
      const user = users[username];
      if (!user) {
        recordFail(username);
        throw new Error('用户名或密码错误');
      }
      const h = await hashPwd(password);
      if (user.password !== h) {
        recordFail(username);
        throw new Error('用户名或密码错误');
      }

      clearFail(username);
      localStorage.setItem(SESSION_KEY, username);
      notify();
      return { username };
    },

    /* 退出 */
    logout() {
      localStorage.removeItem(SESSION_KEY);
      notify();
    },

    /* 当前用户 */
    current() {
      try { return localStorage.getItem(SESSION_KEY) || null; } catch (e) { return null; }
    },

    /* 用户列表 */
    list() {
      const users = loadJSON(USERS_KEY, {});
      return Object.keys(users).map(u => ({
        username: u,
        createdAt: users[u].createdAt || 0
      })).sort((a, b) => b.createdAt - a.createdAt);
    },

    /* 剩余账户额度 */
    remainingSlots() {
      const users = loadJSON(USERS_KEY, {});
      return Math.max(0, LIMITS.maxAccounts - Object.keys(users).length);
    },
    totalAccounts() {
      return Object.keys(loadJSON(USERS_KEY, {})).length;
    },

    /* 注册冷却剩余秒数 */
    registerCooldownLeft() {
      const r = getRate();
      if (!r.lastRegister) return 0;
      const left = LIMITS.registerCooldown - (Date.now() - r.lastRegister);
      return Math.max(0, Math.ceil(left / 1000));
    },

    /* 修改密码 */
    async changePassword(oldPwd, newPwd) {
      const cur = Auth.current();
      if (!cur) throw new Error('未登录');
      const users = loadJSON(USERS_KEY, {});
      if (!users[cur]) throw new Error('账户不存在');
      if (users[cur].password !== await hashPwd(oldPwd)) throw new Error('原密码错误');
      if (newPwd.length < LIMITS.minPwdLength) throw new Error(`新密码至少 ${LIMITS.minPwdLength} 位`);
      if (checkStrength(newPwd) < 2) throw new Error('新密码太弱');
      users[cur].password = await hashPwd(newPwd);
      saveJSON(USERS_KEY, users);
      return true;
    },

    /* 删除账户 */
    async remove(username, password) {
      const users = loadJSON(USERS_KEY, {});
      if (!users[username]) throw new Error('账户不存在');
      if (users[username].password !== await hashPwd(password)) throw new Error('密码错误');

      delete users[username];
      saveJSON(USERS_KEY, users);

      const prefix = DATA_PREFIX + username + ':';
      const toDel = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(prefix)) toDel.push(k);
      }
      toDel.forEach(k => localStorage.removeItem(k));

      if (Auth.current() === username) localStorage.removeItem(SESSION_KEY);
      notify();
      return true;
    },

    /* 导出当前用户数据 */
    export() {
      const u = Auth.current();
      if (!u) return null;
      const prefix = DATA_PREFIX + u + ':';
      const data = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith(prefix)) continue;
        const short = k.slice(prefix.length);
        try { data[short] = JSON.parse(localStorage.getItem(k)); }
        catch (e) { data[short] = localStorage.getItem(k); }
      }
      return {
        version: 'shub-backup-2',
        username: u,
        exportedAt: new Date().toISOString(),
        data
      };
    },

    /* 导入数据 */
    import(payload) {
      const u = Auth.current();
      if (!u) throw new Error('请先登录');
      if (!payload || !payload.data) throw new Error('数据格式错误');
      const prefix = DATA_PREFIX + u + ':';
      let count = 0;
      Object.keys(payload.data).forEach(k => {
        try {
          localStorage.setItem(prefix + k, JSON.stringify(payload.data[k]));
          count++;
        } catch (e) {}
      });
      return count;
    },

    /* 事件 */
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    }
  };

  /* ============ localStorage 劫持 ============ */
  function installHook() {
    const _set = localStorage.setItem.bind(localStorage);
    const _get = localStorage.getItem.bind(localStorage);
    const _rm  = localStorage.removeItem.bind(localStorage);

    function isScoped(key) {
      if (typeof key !== 'string') return false;
      if (key.indexOf(NS + ':') === 0) return false;
      return SCOPED_PREFIXES.some(p => key.indexOf(p) === 0);
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

  /* ============ 事件系统 ============ */
  const listeners = new Set();
  function notify() {
    const u = Auth.current();
    listeners.forEach(fn => { try { fn(u); } catch (e) {} });
  }
  global.addEventListener('storage', e => {
    if (e.key === SESSION_KEY) notify();
  });

  global.Auth = Auth;
  installHook();
})(window);