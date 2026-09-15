/**
 * Background Service Worker（MV3）
 *
 * 职责：
 *  1. 接收 popup 发来的任务（关键词列表 + ASIN 列表 + 页数 + 间隔）
 *  2. 逐个关键词、逐页打开后台标签页访问亚马逊搜索页
 *  3. 等待 content script 提取结果（或检测到验证码/超时）
 *  4. 合并去重、计算排名，把进度与结果广播给 popup
 *  5. 任务状态持久化到 chrome.storage.session，service worker 重启后可续跑
 *
 * 安全注意：所有抓取都在用户自己的浏览器标签页里完成（复用登录态与
 * Cookie），不通过 fetch 直连亚马逊，规避 CORS 与风控；关键词之间
 * 保留可配置间隔，避免触发亚马逊机器人检测。
 */
'use strict';

const STATE_KEY = 'jobState';

// 各主要市场站点校验
const AMAZON_HOST_RE =
  /(^|\.)amazon\.(com|co\.uk|de|fr|it|es|co\.jp|ca|com\.mx|com\.au|in|com\.br|nl|se|pl|com\.tr|sg|ae|sa|eg|co\.th)(\.|$)/i;

// ---------------- Pro 激活（免费/付费分层） ----------------

const LS_API = 'https://api.lemonsqueezy.com/v1/licenses';
// 自有激活码公钥（Ed25519 raw key, base64url）—— 由 tools/keygen.mjs gen-keypair 生成。
// 重新生成密钥对后，必须同步更新这里，否则旧卡密全部失效。
const PRO_PUBLIC_KEY = '2E69IAsrGBuk2WIkcPU8Dg1aorn87QBhCuLr-mJC8ms';
const OWN_KEY_RE = /^ARTK-([A-Za-z0-9_-]{12})-([A-Za-z0-9_-]{86})$/;
const PRODUCT_PRO = 0x01;

// 免费版限制（Pro 解除）
const FREE_LIMITS = { keywords: 3, asins: 10, pages: 1 };

function b64urlToBytes(s) {
  let b = s.replace(/-/g, '+').replace(/_/g, '/');
  while (b.length % 4) b += '=';
  const bin = atob(b);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

async function sha256Short(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 8);
}

async function getProState() {
  try {
    const r = await chrome.storage.local.get('proActivation');
    return r.proActivation
      ? { pro: true, activation: r.proActivation }
      : { pro: false, activation: null };
  } catch (e) {
    return { pro: false, activation: null };
  }
}

/** 自有签名码：本地 Ed25519 验签，离线可用 */
async function verifyOwnKey(code) {
  try {
    const m = OWN_KEY_RE.exec(code);
    if (!m) return { ok: false, error: '激活码格式不正确（应为 ARTK-…）' };
    const key = await crypto.subtle.importKey(
      'raw',
      b64urlToBytes(PRO_PUBLIC_KEY),
      { name: 'Ed25519' },
      false,
      ['verify']
    );
    const payload = b64urlToBytes(m[1]);
    const sig = b64urlToBytes(m[2]);
    const ok = await crypto.subtle.verify({ name: 'Ed25519' }, key, sig, payload);
    if (!ok) return { ok: false, error: '激活码签名无效' };
    if (payload[0] !== PRODUCT_PRO) return { ok: false, error: '激活码与产品不匹配' };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: '校验失败：' + ((e && e.message) || e) };
  }
}

async function getInstanceId() {
  const r = await chrome.storage.local.get('instanceId');
  if (r.instanceId) return r.instanceId;
  const id = 'art-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  await chrome.storage.local.set({ instanceId: id });
  return id;
}

/** Lemon Squeezy 激活码：在线激活（一次性授权） */
async function activateLSKey(key) {
  try {
    const instance = await getInstanceId();
    const res = await fetch(LS_API + '/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ license_key: key, instance_name: instance }),
    });
    const j = await res.json();
    if (j && j.activated) {
      return { ok: true, instanceId: j.instance && j.instance.id };
    }
    return { ok: false, error: (j && j.error) || ('HTTP ' + res.status) };
  } catch (e) {
    return { ok: false, error: '网络错误：' + ((e && e.message) || e) };
  }
}

/** 统一激活入口：先识别自有码，再尝试 LS */
async function activateKey(key) {
  const k = String(key || '').trim();
  if (!k) return { ok: false, error: '请输入激活码' };

  if (/^ARTK-/i.test(k)) {
    const v = await verifyOwnKey(k);
    if (!v.ok) return v;
    await chrome.storage.local.set({
      proActivation: { source: 'own', keyHash: await sha256Short(k), activatedAt: Date.now() },
    });
    return { ok: true, source: 'own', msg: 'Pro 已激活（国内卡密）' };
  }

  const ls = await activateLSKey(k);
  if (!ls.ok) return { ok: false, error: ls.error || '激活失败，请检查激活码' };
  await chrome.storage.local.set({
    proActivation: {
      source: 'ls',
      keyHash: await sha256Short(k),
      instanceId: ls.instanceId,
      activatedAt: Date.now(),
    },
  });
  return { ok: true, source: 'ls', msg: 'Pro 已激活（Lemon Squeezy）' };
}

let job = null;          // 当前任务（内存态）
let lastResult = null;   // 最近一次完成/取消的任务快照（供 popup 重开恢复）
let pending = new Map(); // tabId -> { finish, timer }
let earlyResults = new Map(); // tabId -> {items,noResults}（上报早于 pending 注册时的暂存）
let runningPromise = null;
let stopping = false;    // 用户点击停止

// ---------------- 持久化 / 快照 ----------------

function snapshot() {
  if (!job) return null;
  return {
    id: job.id,
    status: job.status,
    baseUrl: job.baseUrl,
    keywords: job.keywords,
    asins: job.asins,
    pages: job.pages,
    delayMs: job.delayMs,
    results: job.results,
    progress: { ...job.progress },
    errors: { ...job.errors },
    finishedAt: job.finishedAt || null,
  };
}

async function persist() {
  try {
    await chrome.storage.session.set({
      [STATE_KEY]: {
        snap: snapshot(),
        last: lastResult,
        openTabs: Array.from(pending.keys()),
      },
    });
  } catch (e) {
    /* storage 不可用时忽略，任务照跑 */
  }
}

async function loadFromStorage() {
  try {
    const data = await chrome.storage.session.get(STATE_KEY);
    const rec = data[STATE_KEY];
    if (rec && rec.last) lastResult = rec.last;
    if (rec && rec.snap) {
      job = {
        id: rec.snap.id,
        status: rec.snap.status,
        baseUrl: rec.snap.baseUrl,
        keywords: rec.snap.keywords,
        asins: rec.snap.asins,
        pages: rec.snap.pages,
        delayMs: rec.snap.delayMs,
        results: rec.snap.results,
        progress: rec.snap.progress,
        errors: rec.snap.errors,
        finishedAt: rec.snap.finishedAt,
      };
      // 清理上次中断遗留的标签页
      if (Array.isArray(rec.openTabs)) {
        for (const tabId of rec.openTabs) {
          chrome.tabs.remove(tabId).catch(() => {});
        }
      }
      return rec.snap;
    }
  } catch (e) {
    /* ignore */
  }
  return null;
}

// ---------------- 工具 ----------------

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function broadcast(msg) {
  try {
    chrome.runtime.sendMessage(msg).catch(() => {});
  } catch (e) {
    /* popup 未打开时忽略 */
  }
}

/** 等待标签页加载完成（status === 'complete'）。 */
function waitTabComplete(tabId, timeoutMs) {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (!done) {
        done = true;
        chrome.tabs.onUpdated.removeListener(onUpd);
        resolve(false);
      }
    }, timeoutMs);

    const onUpd = (id, info) => {
      if (id !== tabId) return;
      if (info.status === 'complete') {
        if (!done) {
          done = true;
          clearTimeout(timer);
          chrome.tabs.onUpdated.removeListener(onUpd);
          resolve(true);
        }
      }
    };
    chrome.tabs.onUpdated.addListener(onUpd);
  });
}

function buildSearchUrl(base, keyword, page) {
  const k = encodeURIComponent(keyword);
  const p = page > 1 ? `&page=${page}` : '';
  return `${base}/s?k=${k}${p}`;
}

/** 打开一个搜索页标签并等待 content script 返回提取结果。 */
function openAndExtract(base, keyword, page) {
  return new Promise(async (resolve) => {
    const url = buildSearchUrl(base, keyword, page);
    let tabId = null;
    let settled = false;

    const finish = (payload) => {
      if (settled) return;
      settled = true;
      const p = pending.get(tabId);
      if (p) {
        clearTimeout(p.timer);
        pending.delete(tabId);
      }
      if (tabId != null) chrome.tabs.remove(tabId).catch(() => {});
      resolve(payload);
    };

    try {
      const tab = await chrome.tabs.create({ url, active: false });
      tabId = tab.id;

      // 等待页面加载完成
      const loaded = await waitTabComplete(tabId, 30000);
      if (!loaded) return finish({ ok: false, error: '页面加载超时' });

      await sleep(700); // 让页面 JS 稳定

      if (stopping) return finish({ ok: false, cancelled: true });

      // 检查是否被亚马逊重定向到验证码页
      const t = await chrome.tabs.get(tabId);
      const u = t.url || '';
      if (/captcha|validateCaptcha|robot/i.test(u)) {
        return finish({ ok: false, captcha: true });
      }
      if (!/\/s[\/?]/.test(u)) {
        // 被重定向到非搜索页（如首页）
        return finish({ ok: true, items: [], noResults: true, redirect: u });
      }

      // 注册 pending，等待 content script 回传
      pending.set(tabId, {
        finish,
        timer: setTimeout(() => finish({ ok: false, error: '页面解析超时' }), 10000),
      });

      // content script 可能在 pending 注册前就已自动上报，先消费暂存
      if (earlyResults.has(tabId)) {
        const e = earlyResults.get(tabId);
        earlyResults.delete(tabId);
        return finish({ ok: true, items: e.items, noResults: e.noResults });
      }

      // 主动请求一次（content script 也会自动上报，双保险）
      try {
        const resp = await chrome.tabs.sendMessage(tabId, { type: 'extractSearch' });
        if (resp && resp.items) {
          const p = pending.get(tabId);
          if (p) {
            clearTimeout(p.timer);
            pending.delete(tabId);
            finish({ ok: true, items: resp.items, noResults: !!resp.noResults });
          }
        }
      } catch (e) {
        /* content script 可能尚未注入，超时兜底 */
      }
    } catch (e) {
      finish({ ok: false, error: String((e && e.message) || e) });
    }
  });
}

// ---------------- 主任务循环 ----------------

async function runJob() {
  if (!job || runningPromise) return;
  stopping = false;

  runningPromise = (async () => {
    job.status = 'running';
    await persist();
    broadcast({ type: 'jobState', state: snapshot() });

    const { keywords, pages } = job;

    for (let ki = job.progress.currentKeywordIndex; ki < keywords.length; ki++) {
      if (stopping) break;
      const kw = keywords[ki];
      job.progress.currentKeywordIndex = ki;
      job.progress.currentKeyword = kw;
      await persist();

      const merged = new Map(); // asin -> item（跨页合并，保留最小排名）
      let pageOffset = 0;       // 已扫描页面的商品累计数（用于估算全局排名）
      let pageCaptcha = false;
      let pageError = '';

      for (let pg = 1; pg <= pages; pg++) {
        if (stopping) break;
        job.progress.currentPage = pg;
        await persist();
        broadcast({
          type: 'progress',
          keyword: kw,
          page: pg,
          pages,
          done: job.progress.done,
          total: keywords.length,
        });

        const res = await openAndExtract(job.baseUrl, kw, pg);

        if (res.cancelled) break;
        if (res.captcha) {
          pageCaptcha = true;
          pageError = '触发亚马逊验证码（Captcha），本关键词中断';
          break;
        }
        if (!res.ok) {
          pageError = res.error || '未知错误';
          break;
        }
        if (res.items && res.items.length) {
          for (const it of res.items) {
            it.page = pg;
            it.globalPosition = pageOffset + it.rawPosition;
            it.globalOrganicPosition =
              it.organicPosition == null
                ? null
                : pageOffset + it.organicPosition;
            const prev = merged.get(it.asin);
            if (!prev || prev.globalPosition > it.globalPosition) {
              merged.set(it.asin, it);
            }
          }
          pageOffset += res.items.length;
        }
        // 关键词之间/页面之间留间隔
        if (!(pg === pages)) await sleep(job.delayMs);
      }

      if (!stopping) {
        job.results[kw] = Array.from(merged.values());
        job.progress.done++;
        if (pageError) job.errors[kw] = pageError;
        await persist();
        broadcast({
          type: 'keywordDone',
          keyword: kw,
          items: job.results[kw],
          error: pageError || null,
          done: job.progress.done,
          total: keywords.length,
        });
      }
      // 关键词之间留间隔
      if (!stopping && ki < keywords.length - 1) await sleep(job.delayMs);
    }

    if (stopping) {
      job.status = 'cancelled';
    } else {
      job.status = 'done';
      job.finishedAt = Date.now();
    }
    await persist();
    lastResult = snapshot();
    await persist();
    broadcast({ type: 'jobDone', state: snapshot() });
    runningPromise = null;
    job = null; // 清空，等待下次任务
  })();

  await runningPromise;
}

// ---------------- 消息处理 ----------------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== 'string') return;

  switch (msg.type) {
    case 'startJob': {
      handleStart(msg)
        .then((res) => sendResponse(res))
        .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
      return true; // 异步响应
    }
    case 'cancelJob': {
      stopping = true;
      sendResponse({ ok: true });
      return;
    }
    case 'activateKey': {
      activateKey(msg.key)
        .then((res) => sendResponse(res))
        .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
      return true; // 异步响应
    }
    case 'getProState': {
      getProState().then((s) => sendResponse(s));
      return true; // 异步响应
    }
    case 'deactivatePro': {
      chrome.storage.local.remove('proActivation').then(() => sendResponse({ ok: true }));
      return true; // 异步响应
    }
    case 'getJobState': {
      if (job) {
        sendResponse({ state: snapshot(), last: lastResult });
        return;
      }
      // worker 刚唤醒、内存态还没恢复时，从 storage 补读
      loadFromStorage().then(() => {
        sendResponse({ state: snapshot(), last: lastResult });
      });
      return true; // 异步响应
    }
    case 'searchExtracted': {
      // content script 自动上报
      if (sender.tab) {
        const tabId = sender.tab.id;
        const p = pending.get(tabId);
        if (p) {
          clearTimeout(p.timer);
          pending.delete(tabId);
          chrome.tabs.remove(tabId).catch(() => {});
          p.finish({
            ok: true,
            items: msg.items || [],
            noResults: !!msg.noResults,
          });
        } else {
          // 早于 pending 注册到达：暂存，等待 openAndExtract 消费
          earlyResults.set(tabId, {
            items: msg.items || [],
            noResults: !!msg.noResults,
          });
        }
        sendResponse({ received: true });
      }
      return;
    }
    default:
      return;
  }
});

async function handleStart(msg) {
  // 校验输入
  const keywords = cleanList(msg.keywords);
  const asins = cleanAsins(msg.asins);
  if (!keywords.length) return { ok: false, error: '没有有效关键词（每行一个）' };
  if (!asins.length) return { ok: false, error: '没有有效 ASIN（需为 10 位字母数字，每行一个）' };
  if (runningPromise) return { ok: false, error: '已有任务在运行，请先停止或等待完成' };

  // 免费/Pro 分层：免费版限制关键词数、ASIN 数、页数
  const proState = await getProState();
  const isPro = proState.pro;
  let finalKeywords = keywords;
  let finalAsins = asins;
  let effectivePages = clampInt(msg.pages, 1, 5, 1);
  const truncated = {};
  if (!isPro) {
    if (keywords.length > FREE_LIMITS.keywords) {
      finalKeywords = keywords.slice(0, FREE_LIMITS.keywords);
      truncated.keywords = keywords.length;
    }
    if (asins.length > FREE_LIMITS.asins) {
      finalAsins = asins.slice(0, FREE_LIMITS.asins);
      truncated.asins = asins.length;
    }
    if (effectivePages > 1) {
      effectivePages = FREE_LIMITS.pages;
      truncated.pages = true;
    }
  }

  // 从当前活动标签页推断市场站点
  let tab, u;
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) return { ok: false, error: '无法获取当前标签页' };
    u = new URL(tab.url);
  } catch (e) {
    return { ok: false, error: '无法解析当前标签页地址' };
  }
  if (!AMAZON_HOST_RE.test(u.hostname)) {
    return { ok: false, error: '请先在亚马逊站点（如 www.amazon.com / .de / .co.jp）打开一个页面，再点击“开始查询”' };
  }

  job = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    status: 'idle',
    baseUrl: u.origin,
    keywords: finalKeywords,
    asins: finalAsins,
    pages: effectivePages,
    delayMs: clampInt(msg.delayMs, 0, 30, 2) * 1000,
    results: {},
    errors: {},
    progress: { done: 0, total: finalKeywords.length, currentKeyword: null, currentKeywordIndex: 0, currentPage: 0 },
    finishedAt: null,
  };
  await persist();
  runJob(); // 不 await，后台跑
  return {
    ok: true,
    pro: isPro,
    truncated: Object.keys(truncated).length ? truncated : null,
    limits: FREE_LIMITS,
  };
}

function cleanList(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  const seen = new Set();
  for (const raw of arr) {
    for (const line of String(raw).split(/[\n\r,;]+/)) {
      const v = line.trim();
      if (v && !seen.has(v.toLowerCase())) {
        seen.add(v.toLowerCase());
        out.push(v);
      }
    }
  }
  return out;
}

function cleanAsins(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  const seen = new Set();
  for (const raw of arr) {
    for (const line of String(raw).split(/[\n\r,;\s]+/)) {
      const v = line.trim().toUpperCase();
      if (/^[A-Z0-9]{10}$/.test(v) && !seen.has(v)) {
        seen.add(v);
        out.push(v);
      }
    }
  }
  return out;
}

function clampInt(v, min, max, def) {
  const n = parseInt(v, 10);
  if (isNaN(n)) return def;
  return Math.min(max, Math.max(min, n));
}

// ---------------- 启动恢复 ----------------

chrome.runtime.onInstalled.addListener(() => {
  loadFromStorage().then((snap) => {
    if (snap && snap.status === 'running') {
      // 上次中断的任务续跑
      runJob();
    }
  });
});

chrome.runtime.onStartup.addListener(() => {
  loadFromStorage().then((snap) => {
    if (snap && snap.status === 'running') {
      runJob();
    }
  });
});

// 页面清理：标签被外部关闭时，避免 pending 悬挂
chrome.tabs.onRemoved.addListener((tabId) => {
  earlyResults.delete(tabId);
  const p = pending.get(tabId);
  if (p) {
    clearTimeout(p.timer);
    pending.delete(tabId);
    p.finish({ ok: false, error: '标签页被关闭' });
  }
});

// 初始加载（service worker 每次唤醒都会执行模块顶层）
loadFromStorage().then((snap) => {
  if (snap && snap.status === 'running' && !runningPromise) {
    runJob();
  }
});
