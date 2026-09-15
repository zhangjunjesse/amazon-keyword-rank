/**
 * Popup 主逻辑
 *  - 输入关键词 / ASIN，启动后台查询任务
 *  - 实时渲染进度、排名总表与明细
 *  - 导出 Excel（SheetJS）与 CSV
 */
'use strict';

(() => {
  // ---------- 付费配置（建好商品后把链接填到 url） ----------
  // zh：国内渠道（推荐面包多 mianbaoduo.com，卡密自动发货，微信/支付宝收款）
  // intl：国际渠道（Lemon Squeezy，付款后自动发激活码）
  const PAYMENT = {
    zh: {
      price: '¥49（一次性）',
      note: '国内用户 · 微信/支付宝付款，自动发码',
      url: 'https://mianbaoduo.com/ （面包多商品建好后替换此链接）',
    },
    intl: {
      price: '$19.99（一次性）',
      note: '国际用户 · 信用卡付款，自动发码',
      url: 'https://amazonkeywordranktools.lemonsqueezy.com/checkout/buy/588cfe46-9396-42d8-b492-03e89efff47f',
    },
  };
  const isZh = /^zh/i.test((navigator.language || '').replace('_', '-'));

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const el = {
    statusLine: $('statusLine'),
    siteTag: $('siteTag'),
    keywords: $('keywords'),
    asins: $('asins'),
    pages: $('pages'),
    delay: $('delay'),
    startBtn: $('startBtn'),
    stopBtn: $('stopBtn'),
    progressWrap: $('progressWrap'),
    progressFill: $('progressFill'),
    progressText: $('progressText'),
    resultWrap: $('resultWrap'),
    matrixView: $('matrixView'),
    detailView: $('detailView'),
    errorList: $('errorList'),
    exportXlsx: $('exportXlsx'),
    exportCsv: $('exportCsv'),
    footerInfo: $('footerInfo'),
    proLocked: $('proLocked'),
    proUnlocked: $('proUnlocked'),
    proPrice: $('proPrice'),
    proBuy: $('proBuy'),
    proKey: $('proKey'),
    proActivate: $('proActivate'),
    proDeactivate: $('proDeactivate'),
    proMsg: $('proMsg'),
    proInfo: $('proInfo'),
  };

  // ---------- 状态 ----------
  let job = null;        // 最近一次任务快照（含 results）
  let running = false;
  let currentKeyword = '';
  let doneCount = 0;
  let totalCount = 0;
  let isPro = false;

  // ---------- 工具 ----------
  function setStatus(text, cls) {
    el.statusLine.textContent = text;
    el.statusLine.className = 'status' + (cls ? ' ' + cls : '');
  }

  function setRunning(r) {
    running = r;
    el.startBtn.disabled = r;
    el.stopBtn.disabled = !r;
  }

  function fmtTime() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  }

  // ---------- 初始化 ----------
  async function init() {
    // 当前站点标记
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.url) {
        const u = new URL(tab.url);
        if (/amazon\./.test(u.hostname)) {
          el.siteTag.textContent = u.hostname;
          el.siteTag.title = `将以 ${u.hostname} 作为查询市场`;
        } else {
          el.siteTag.textContent = '⚠ 非亚马逊页';
          el.siteTag.title = '请在亚马逊页面打开本插件后再开始查询';
        }
      }
    } catch (e) { /* ignore */ }

    // Pro 状态
    try {
      const ps = await chrome.runtime.sendMessage({ type: 'getProState' });
      renderProPanel(ps && ps.pro);
    } catch (e) { /* ignore */ }

    // 恢复上次任务状态 / 结果
    try {
      const res = await chrome.runtime.sendMessage({ type: 'getJobState' });
      const state = res && res.state;
      if (state) {
        if (state.status === 'running' || state.status === 'idle') {
          restoreRunning(state);
        } else if (state.status === 'done' || state.status === 'cancelled') {
          setStatus(
            state.status === 'done' ? '查询完成，可导出结果' : '已停止',
            state.status === 'done' ? 'done' : ''
          );
          renderResults(state);
        }
      } else if (res && res.last) {
        setStatus('上次查询结果已保留，可导出', 'done');
        renderResults(res.last);
      }
    } catch (e) { /* 首次打开无任务 */ }
  }

  // ---------- Pro 面板 ----------
  function renderProPanel(pro) {
    isPro = !!pro;
    el.proLocked.classList.toggle('hidden', isPro);
    el.proUnlocked.classList.toggle('hidden', !isPro);
    if (isPro) {
      el.proInfo.textContent = '已解锁全部功能（无限关键词 / 多页扫描 / 导出）。';
    } else {
      const pay = isZh ? PAYMENT.zh : PAYMENT.intl;
      el.proPrice.textContent = pay.price + ' · ' + pay.note;
      el.proBuy.href = pay.url;
      el.proBuy.title = pay.url;
    }
    el.proMsg.textContent = '';
    el.proMsg.className = 'pro-msg';
  }

  el.proActivate.addEventListener('click', async () => {
    const key = el.proKey.value.trim();
    if (!key) { showProMsg('请输入激活码', false); return; }
    el.proActivate.disabled = true;
    showProMsg('正在校验…', null);
    try {
      const res = await chrome.runtime.sendMessage({ type: 'activateKey', key });
      if (res && res.ok) {
        showProMsg(res.msg || 'Pro 已激活', true);
        renderProPanel(true);
      } else {
        showProMsg((res && res.error) || '激活失败', false);
      }
    } catch (e) {
      showProMsg('激活失败：' + (e.message || e), false);
    }
    el.proActivate.disabled = false;
  });

  el.proDeactivate.addEventListener('click', async () => {
    try { await chrome.runtime.sendMessage({ type: 'deactivatePro' }); } catch (e) { /* ignore */ }
    renderProPanel(false);
    showProMsg('已解除绑定', null);
  });

  function showProMsg(text, ok) {
    el.proMsg.textContent = text || '';
    el.proMsg.className = 'pro-msg' + (ok === true ? ' ok' : ok === false ? ' err' : '');
  }

  function restoreRunning(state) {
    job = state;
    doneCount = state.progress.done;
    totalCount = state.progress.total;
    currentKeyword = state.progress.currentKeyword || '';
    setRunning(true);
    setStatus(`查询中 ${doneCount}/${totalCount}：${currentKeyword || '…'}`, 'running');
    renderProgress(state.progress);
    renderResults(state);
  }

  // ---------- 启动 / 停止 ----------
  el.startBtn.addEventListener('click', async () => {
    const keywords = parseLines(el.keywords.value);
    const asinsRaw = parseLines(el.asins.value).map((a) => a.toUpperCase());
    const validAsins = asinsRaw.filter((a) => /^[A-Z0-9]{10}$/.test(a));
    const invalidAsins = asinsRaw.filter((a) => !/^[A-Z0-9]{10}$/.test(a));

    if (!keywords.length) { setStatus('请先输入至少一个关键词', 'error'); return; }
    if (!validAsins.length) { setStatus('请先输入有效的 ASIN（10 位字母数字）', 'error'); return; }
    if (invalidAsins.length) {
      setStatus(`已忽略 ${invalidAsins.length} 个无效 ASIN（${invalidAsins.slice(0, 3).join(', ')}${invalidAsins.length > 3 ? '…' : ''}）`, 'error');
    }

    job = null;
    doneCount = 0;
    totalCount = keywords.length;
    el.errorList.innerHTML = '';
    el.resultWrap.classList.add('hidden');
    el.progressWrap.classList.remove('hidden');
    renderProgress({ done: 0, total: totalCount, currentKeyword: '' });

    try {
      const res = await chrome.runtime.sendMessage({
        type: 'startJob',
        keywords,
        asins: validAsins,
        pages: parseInt(el.pages.value, 10) || 1,
        delayMs: parseFloat(el.delay.value) || 0,
      });
      if (!res.ok) {
        setStatus(res.error || '启动失败', 'error');
        el.progressWrap.classList.add('hidden');
        return;
      }
      if (res.pro !== undefined) isPro = res.pro;
      // 免费版被裁剪时提示
      if (!isPro && res.truncated) {
        const t = res.truncated;
        const parts = [];
        if (t.keywords) parts.push(`关键词 ${t.keywords} → 3`);
        if (t.asins) parts.push(`ASIN ${t.asins} → 10`);
        if (t.pages) parts.push('页数 → 第 1 页');
        setStatus(`免费版已裁剪（${parts.join('，')}），解锁 Pro 可解除限制`, 'error');
      }
      setRunning(true);
      setStatus(`查询中 0/${totalCount}`, 'running');
    } catch (e) {
      setStatus('启动失败：' + (e.message || e), 'error');
      el.progressWrap.classList.add('hidden');
    }
  });

  el.stopBtn.addEventListener('click', async () => {
    try { await chrome.runtime.sendMessage({ type: 'cancelJob' }); } catch (e) { /* ignore */ }
    setRunning(false);
    setStatus('正在停止…');
  });

  // ---------- 解析输入 ----------
  function parseLines(text) {
    const seen = new Set();
    const out = [];
    for (const raw of String(text || '').split(/[\n\r,;]+/)) {
      const v = raw.trim();
      if (v && !seen.has(v.toLowerCase())) {
        seen.add(v.toLowerCase());
        out.push(v);
      }
    }
    return out;
  }

  // ---------- 后台消息 ----------
  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || typeof msg.type !== 'string') return;
    switch (msg.type) {
      case 'progress':
        currentKeyword = msg.keyword;
        doneCount = msg.done;
        totalCount = msg.total;
        renderProgress({ done: msg.done, total: msg.total, currentKeyword: msg.keyword, page: msg.page, pages: msg.pages });
        break;
      case 'keywordDone': {
        if (job) {
          job.results = job.results || {};
          job.results[msg.keyword] = msg.items;
          if (msg.error) job.errors = { ...(job.errors || {}), [msg.keyword]: msg.error };
        }
        doneCount = msg.done;
        totalCount = msg.total;
        setStatus(`查询中 ${msg.done}/${msg.total}`, 'running');
        break;
      }
      case 'jobState':
        if (msg.state) renderResults(msg.state);
        break;
      case 'jobDone':
        onJobDone(msg.state);
        break;
      case 'jobError':
        setStatus(msg.message || '任务出错', 'error');
        setRunning(false);
        break;
    }
  });

  function onJobDone(state) {
    setRunning(false);
    el.progressWrap.classList.add('hidden');
    if (!state) return;
    job = state;
    if (state.status === 'cancelled') {
      setStatus('已停止' + (state.progress.done ? `（已完成 ${state.progress.done}/${state.progress.total}）` : ''), '');
    } else {
      setStatus(`查询完成：${state.progress.done}/${state.progress.total} 个关键词`, 'done');
    }
    renderResults(state);
  }

  // ---------- 进度 ----------
  function renderProgress(p) {
    el.progressWrap.classList.remove('hidden');
    const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
    el.progressFill.style.width = pct + '%';
    const pageInfo = p.page ? ` · 第 ${p.page}/${p.pages} 页` : '';
    el.progressText.textContent = `第 ${p.done + 1} 个关键词：${p.currentKeyword || '…'}${pageInfo}`;
  }

  // ---------- 结果渲染 ----------
  function renderResults(state) {
    if (!state || !state.keywords || !state.asins) return;
    job = state;
    el.resultWrap.classList.remove('hidden');
    el.exportXlsx.disabled = false;
    el.exportCsv.disabled = false;

    // 错误提示
    const errs = state.errors || {};
    const errKeys = Object.keys(errs);
    el.errorList.innerHTML = errKeys
      .map((k) => `<div>⚠ ${esc(k)}：${esc(errs[k])}</div>`)
      .join('');
    el.footerInfo.textContent = `关键词 ${state.keywords.length} 个 · ASIN ${state.asins.length} 个 · 页数 ${state.pages}`;

    renderMatrix();
    renderDetail();
  }

  function rankMode() {
    const r = document.querySelector('input[name="rankMode"]:checked');
    return r ? r.value : 'natural';
  }

  /** 计算某个 ASIN 在某关键词下的展示文本 */
  function rankInfo(asins, keyword) {
    const items = (job.results && job.results[keyword]) || [];
    return items.find((it) => it.asin === asins) || null;
  }

  function renderMatrix() {
    const mode = rankMode();
    const { keywords, asins } = job;
    const header = ['ASIN', ...keywords];
    const rows = asins.map((a) => {
      const row = [a];
      for (const kw of keywords) {
        const it = rankInfo(a, kw);
        if (!it) {
          row.push({ text: '—', cls: 'missing', title: '未在该关键词搜索结果中找到' });
        } else {
          const pos = mode === 'natural'
            ? (it.globalOrganicPosition != null ? it.globalOrganicPosition : it.globalPosition)
            : it.globalPosition;
          const sponsored = !!it.sponsored;
          row.push({
            text: String(pos),
            cls: sponsored ? 'sponsored' : '',
            title: `${sponsored ? '广告位，' : '自然位，'}总排名 ${it.globalPosition}` + (it.globalOrganicPosition != null ? `，自然排名 ${it.globalOrganicPosition}` : '') + `（${esc(it.title || '')}）`,
            badge: sponsored ? '广告' : '',
          });
        }
      }
      return row;
    });

    let html = '<table><thead><tr>';
    for (const h of header) html += `<th>${esc(h)}</th>`;
    html += '</tr></thead><tbody>';
    for (const row of rows) {
      html += '<tr>';
      row.forEach((cell, i) => {
        if (i === 0) {
          html += `<td class="asin">${esc(cell)}</td>`;
        } else {
          html += `<td class="rank-cell ${cell.cls}" title="${cell.title}">${cell.text}${cell.badge ? `<span class="badge">${cell.badge}</span>` : ''}</td>`;
        }
      });
      html += '</tr>';
    }
    html += '</tbody></table>';
    el.matrixView.innerHTML = html;
  }

  function renderDetail() {
    const { keywords, asins } = job;
    const rows = [];
    for (const kw of keywords) {
      const found = (job.results && job.results[kw]) || [];
      const foundSet = new Set(found.map((f) => f.asin));
      for (const it of found) {
        rows.push({ kw, it });
      }
      for (const a of asins) {
        if (!foundSet.has(a)) {
          rows.push({ kw, missing: a });
        }
      }
    }
    if (!rows.length) {
      el.detailView.innerHTML = '<div style="padding:12px;color:#8a919e">暂无明细数据</div>';
      return;
    }
    let html = '<table><thead><tr><th>关键词</th><th>ASIN</th><th>总排名</th><th>自然排名</th><th>广告</th><th>标题</th><th>链接</th></tr></thead><tbody>';
    for (const r of rows) {
      if (r.missing) {
        html += `<tr><td>${esc(r.kw)}</td><td class="asin">${esc(r.missing)}</td><td class="rank-cell missing" colspan="5">未找到（第 ${job.pages} 页内）</td></tr>`;
        continue;
      }
      const it = r.it;
      html += `<tr>
        <td>${esc(r.kw)}</td>
        <td class="asin">${esc(it.asin)}</td>
        <td class="rank-cell">${it.globalPosition}</td>
        <td class="rank-cell">${it.globalOrganicPosition != null ? it.globalOrganicPosition : '—'}</td>
        <td>${it.sponsored ? '是' : '否'}</td>
        <td title="${esc(it.title)}" style="max-width:200px;overflow:hidden;text-overflow:ellipsis">${esc(it.title)}</td>
        <td><a href="${esc(it.url)}" target="_blank" rel="noreferrer">打开</a></td>
      </tr>`;
    }
    html += '</tbody></table>';
    el.detailView.innerHTML = html;
  }

  // ---------- 标签切换 / 排名模式 ----------
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      el.matrixView.classList.toggle('hidden', tab !== 'matrix');
      el.detailView.classList.toggle('hidden', tab !== 'detail');
    });
  });
  document.querySelectorAll('input[name="rankMode"]').forEach((r) => {
    r.addEventListener('change', () => { if (job) renderMatrix(); });
  });

  // ---------- 导出 ----------
  function buildSheetsData() {
    if (!job) return null;
    const mode = rankMode();
    const { keywords, asins } = job;

    // 1) 排名汇总
    const header = ['ASIN', ...keywords];
    const matrix = [header];
    const comments = {}; // addr -> note
    for (const a of asins) {
      const row = [a];
      for (const kw of keywords) {
        const it = rankInfo(a, kw);
        if (!it) {
          row.push('未找到');
        } else if (mode === 'natural' && it.globalOrganicPosition != null && !it.sponsored) {
          row.push(it.globalOrganicPosition);
        } else {
          row.push(it.globalPosition);
        }
      }
      matrix.push(row);
    }

    // 2) 明细
    const detail = [['关键词', 'ASIN', '总排名', '自然排名', '是否广告', '标题', '链接']];
    const missingSheet = [['关键词', '未找到的ASIN']];
    for (const kw of keywords) {
      const found = (job.results && job.results[kw]) || [];
      const foundSet = new Set(found.map((f) => f.asin));
      for (const it of found) {
        detail.push([kw, it.asin, it.globalPosition, it.globalOrganicPosition != null ? it.globalOrganicPosition : '', it.sponsored ? '是' : '否', it.title || '', it.url || '']);
      }
      for (const a of asins) {
        if (!foundSet.has(a)) missingSheet.push([kw, a]);
      }
    }
    return { matrix, detail, missingSheet };
  }

  function exportXlsx() {
    const d = buildSheetsData();
    if (!d) return;
    const XLSX = window.XLSX;
    const wb = XLSX.utils.book_new();

    const ws1 = XLSX.utils.aoa_to_sheet(d.matrix);
    ws1['!cols'] = [{ wch: 12 }].concat(d.matrix[0].slice(1).map(() => ({ wch: 14 })));
    XLSX.utils.book_append_sheet(wb, ws1, '排名汇总');

    const ws2 = XLSX.utils.aoa_to_sheet(d.detail);
    ws2['!cols'] = [{ wch: 24 }, { wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 60 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(wb, ws2, '完整明细');

    if (d.missingSheet.length > 1) {
      const ws3 = XLSX.utils.aoa_to_sheet(d.missingSheet);
      ws3['!cols'] = [{ wch: 24 }, { wch: 14 }];
      XLSX.utils.book_append_sheet(wb, ws3, '未找到清单');
    }

    XLSX.writeFile(wb, `amazon-rank-${fmtTime()}.xlsx`);
  }

  function exportCsv() {
    const d = buildSheetsData();
    if (!d) return;
    const csv = d.matrix.map((row) =>
      row.map((c) => {
        const s = String(c);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      }).join(',')
    ).join('\r\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `amazon-rank-${fmtTime()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  el.exportXlsx.addEventListener('click', exportXlsx);
  el.exportCsv.addEventListener('click', exportCsv);

  // ---------- 工具 ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  init();
})();
