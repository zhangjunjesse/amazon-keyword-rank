/**
 * Amazon 搜索结果页解析器（content script）
 *
 * 运行于亚马逊搜索结果页（URL 匹配 /s*），在页面加载完成后自动提取
 * 页面上的所有商品（data-asin），判定广告位与自然位，并把结果发送给
 * background service worker。
 *
 * 兼容性说明：亚马逊各站点（com / co.uk / de / jp 等）的搜索结果页
 * 都使用统一的 `div[data-asin]` + `data-component-type` 结构，
 * 本脚本主要依赖这两个稳定的属性，避免依赖某个站点特有的 CSS 类名。
 */
(() => {
  'use strict';

  if (window.__amzRankExtractedOnce) return;
  window.__amzRankExtractedOnce = true;

  // ---------------- 纯提取逻辑（便于单元测试） ----------------

  /**
   * 从当前文档提取搜索结果。
   * @param {Document} doc
   * @returns {{items: Array, noResults: boolean}}
   */
  function extractSearchResults(doc) {
    const slot =
      doc.querySelector('div.s-main-slot') ||
      doc.querySelector('#search') ||
      doc.body;

    // 1) 收集所有带 data-asin 的节点
    const allNodes = Array.from(
      slot.querySelectorAll('div[data-asin], li[data-asin]')
    ).filter((n) => {
      const a = (n.getAttribute('data-asin') || '').trim();
      return a.length > 0;
    });

    // 2) 优先只看真正的搜索结果节点（排除轮播/推荐组件）
    let nodes = allNodes.filter((n) => {
      const ct = (n.getAttribute('data-component-type') || '').toLowerCase();
      return (
        ct.startsWith('s-search-result') || ct.startsWith('sp-sponsored-result')
      );
    });
    if (nodes.length === 0) nodes = allNodes; // 旧版布局兜底

    // 3) 按 ASIN 去重（保留第一个出现的位置）
    const seen = new Set();
    const items = [];
    let rawPos = 0; // 页面内总排名（1 起）
    let orgPos = 0; // 页面内自然排名（1 起，广告位不占位）

    for (const node of nodes) {
      const asin = (node.getAttribute('data-asin') || '').trim();
      if (seen.has(asin)) continue;
      seen.add(asin);
      rawPos++;

      const sponsored = isSponsored(node);
      const organicPosition = sponsored ? null : ++orgPos;

      items.push({
        asin,
        page: 1, // 由 background 在合并时校正为真实页码
        rawPosition: rawPos,
        organicPosition,
        sponsored,
        title: extractTitle(node),
        price: extractPrice(node),
        url: extractUrl(node),
      });
    }

    const noResults =
      !!doc.querySelector('#noResultsTitle') ||
      /did not match|没有找到|に一致する商品はありません|Keine Ergebnisse/i.test(
        doc.body ? doc.body.textContent.slice(0, 2000) : ''
      );

    return { items, noResults };
  }

  /** 判定节点是否为广告位（Sponsored）。 */
  function isSponsored(node) {
    // 现代布局：data-component-type 直接标注
    const ct = (node.getAttribute('data-component-type') || '').toLowerCase();
    if (ct.startsWith('sp-sponsored-result')) return true;

    // 部分页面广告位被包在父容器里
    if (node.closest('[data-component-type="sp-sponsored-result"]')) return true;

    // 兜底：看标签文本（各站点语言不同，取最常见的几种）
    const label =
      node.querySelector('[aria-label*="ponsored" i]') ||
      node.querySelector('.puis-sponsored-label-text, .a-color-secondary');
    if (label) {
      const t = (label.getAttribute('aria-label') || label.textContent || '');
      if (/sponsored|广告|gesponsert|sponsorizzato|publicit|patrocinado|スポンサー/i.test(t)) {
        return true;
      }
    }
    return false;
  }

  /** 提取标题。 */
  function extractTitle(node) {
    const h2 = node.querySelector('h2');
    if (h2) return (h2.textContent || '').trim();
    const any = node.querySelector('a h2, .a-text-normal');
    return any ? (any.textContent || '').trim() : '';
  }

  /** 提取价格（尽量取可见价）。 */
  function extractPrice(node) {
    const off = node.querySelector('.a-price .a-offscreen');
    if (off) return (off.textContent || '').trim();
    const whole = node.querySelector('.a-price-whole');
    if (whole) return (whole.textContent || '').trim();
    return '';
  }

  /** 提取商品链接。 */
  function extractUrl(node) {
    const a =
      node.querySelector('h2 a.a-link-normal') ||
      node.querySelector('a.a-link-normal[href*="/dp/"]') ||
      node.querySelector('a[href*="/dp/"]');
    if (!a) return '';
    try {
      return new URL(a.href, location.origin).href;
    } catch (e) {
      return a.href || '';
    }
  }

  // ---------------- 与 background 通信 ----------------

  function sendExtracted() {
    const { items, noResults } = extractSearchResults(document);
    const url = location.href;
    const kw = new URL(url).searchParams.get('k') || '';
    try {
      chrome.runtime.sendMessage({
        type: 'searchExtracted',
        keyword: kw,
        url,
        noResults,
        items,
      });
    } catch (e) {
      /* 测试环境或上下文失效时忽略 */
    }
  }

  // 页面加载后自动提取一次（document_idle 已保证 DOM 就绪，再加一点缓冲）
  setTimeout(sendExtracted, 400);

  // 也响应 background 的主动请求（双保险）
  try {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg && msg.type === 'extractSearch') {
        const { items, noResults } = extractSearchResults(document);
        sendResponse({ type: 'searchExtracted', items, noResults });
      }
    });
  } catch (e) {
    /* ignore */
  }

  // 供测试与调试使用
  window.__amzExtractSearchResults = extractSearchResults;
})();
