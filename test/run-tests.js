/**
 * 提取逻辑单元测试
 * 用 jsdom 模拟亚马逊搜索结果页，加载真实的 content script，
 * 校验：排名顺序、广告位识别、轮播组件排除、no-results 检测、消息上报。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const SCRIPT_PATH = path.join(__dirname, '..', 'content', 'search-extractor.js');
const SCRIPT_SRC = fs.readFileSync(SCRIPT_PATH, 'utf8');

let passed = 0;
let failed = 0;

function assert(cond, name, extra) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${extra ? '\n    → ' + JSON.stringify(extra) : ''}`);
  }
}

/** 构建一个 jsdom 页面，注入假 chrome，运行 content script */
function loadPage(html, url) {
  const dom = new JSDOM(html, {
    url: url || 'https://www.amazon.com/s?k=wireless+earbuds',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const sent = [];
  const listeners = [];
  window.chrome = {
    runtime: {
      sendMessage: (msg) => {
        sent.push(msg);
        return Promise.resolve();
      },
      onMessage: { addListener: (fn) => listeners.push(fn) },
    },
  };
  window.eval(SCRIPT_SRC);
  return { dom, window, sent, listeners };
}

// ---------- 用例 1：现代布局（数据属性齐全） ----------
console.log('\n[用例 1] 现代布局：广告 + 自然 + 轮播排除');
{
  const html = `<!DOCTYPE html><html><body>
    <div class="s-main-slot">
      <div data-asin="B0SPONSOR1" data-component-type="sp-sponsored-result">
        <h2><a class="a-link-normal" href="/dp/B0SPONSOR1"><span>Sponsored Product One</span></a></h2>
        <span class="puis-sponsored-label-text">Sponsored</span>
        <span class="a-price"><span class="a-offscreen">$19.99</span></span>
      </div>
      <div data-asin="B0ORGANIC01" data-component-type="s-search-result">
        <h2><a class="a-link-normal" href="/dp/B0ORGANIC01"><span>Organic Product One</span></a></h2>
        <span class="a-price"><span class="a-offscreen">$9.99</span></span>
      </div>
      <div data-asin="B0ORGANIC02" data-component-type="s-search-result">
        <h2><a class="a-link-normal" href="/dp/B0ORGANIC02"><span>Organic Product Two</span></a></h2>
        <span class="a-price"><span class="a-offscreen">$12.50</span></span>
      </div>
      <div data-asin="B0SPONSOR2" data-component-type="sp-sponsored-result">
        <h2><a class="a-link-normal" href="/dp/B0SPONSOR2"><span>Sponsored Product Two</span></a></h2>
        <span class="puis-sponsored-label-text">Sponsored</span>
      </div>
      <div data-asin="B0CAROUSEL" data-component-type="qtv--carousel">
        <h2><a href="/dp/B0CAROUSEL"><span>Carousel Item (应被排除)</span></a></h2>
      </div>
    </div>
  </body></html>`;

  const { window, sent } = loadPage(html);
  const r = window.__amzExtractSearchResults(window.document);

  assert(r.items.length === 4, '提取 4 个结果（轮播被排除）', r.items.map((i) => i.asin));
  assert(r.items[0].asin === 'B0SPONSOR1' && r.items[0].rawPosition === 1, '第 1 位 = 广告 B0SPONSOR1');
  assert(r.items[0].sponsored === true, 'B0SPONSOR1 识别为广告');
  assert(r.items[1].asin === 'B0ORGANIC01' && r.items[1].rawPosition === 2, '第 2 位 = 自然 B0ORGANIC01');
  assert(r.items[1].organicPosition === 1, 'B0ORGANIC01 自然排名 = 1');
  assert(r.items[1].sponsored === false, 'B0ORGANIC01 非广告');
  assert(r.items[2].organicPosition === 2, 'B0ORGANIC02 自然排名 = 2');
  assert(r.items[3].sponsored === true && r.items[3].organicPosition === null, 'B0SPONSOR2 广告且无自然排名');
  assert(r.items[1].title === 'Organic Product One', '标题提取正确', r.items[1].title);
  assert(r.items[1].price === '$9.99', '价格提取正确', r.items[1].price);
  assert(r.items[1].url.includes('/dp/B0ORGANIC01'), '链接提取正确', r.items[1].url);
  assert(r.noResults === false, '非空结果页 noResults=false');

  // 自动上报消息（需等待 400ms 定时器）
  setTimeout(() => {
    assert(sent.length >= 1 && sent[0].type === 'searchExtracted', '自动上报 searchExtracted 消息');
    assert(sent[0].keyword === 'wireless earbuds', '上报关键词从 URL 解析');
    assert(sent[0].items.length === 4, '上报含 4 个商品');
  }, 600);
}

// ---------- 用例 2：旧版布局（无 data-component-type，兜底全部计入） ----------
console.log('\n[用例 2] 旧版布局兜底');
{
  const html = `<!DOCTYPE html><html><body>
    <div class="s-main-slot">
      <div data-asin="B0LEGACY01"><h2><span>Legacy One</span></h2></div>
      <div data-asin="B0LEGACY02"><h2><span>Legacy Two</span></h2></div>
    </div>
  </body></html>`;
  const { window } = loadPage(html);
  const r = window.__amzExtractSearchResults(window.document);
  assert(r.items.length === 2, '无 data-component-type 时兜底计数 2 个', r.items.length);
  assert(r.items[1].rawPosition === 2 && r.items[1].organicPosition === 2, '位置顺序正确');
}

// ---------- 用例 3：无结果页 ----------
console.log('\n[用例 3] 无结果页检测');
{
  const html = `<!DOCTYPE html><html><body>
    <div id="noResultsTitle">No results for "zzzqqq"</div>
    <div class="s-main-slot"></div>
  </body></html>`;
  const { window } = loadPage(html, 'https://www.amazon.com/s?k=zzzqqq');
  const r = window.__amzExtractSearchResults(window.document);
  assert(r.items.length === 0, 'items 为空');
  assert(r.noResults === true, 'noResults=true');
}

// ---------- 用例 4：主动请求响应 ----------
console.log('\n[用例 4] 响应 background 的 extractSearch 请求');
{
  const html = `<!DOCTYPE html><html><body>
    <div class="s-main-slot">
      <div data-asin="B0REQ0001" data-component-type="s-search-result"><h2><span>Req One</span></h2></div>
    </div>
  </body></html>`;
  const { window, listeners } = loadPage(html);
  assert(listeners.length === 1, '注册了 onMessage 监听');
  let response = null;
  listeners[0]({ type: 'extractSearch' }, null, (resp) => (response = resp));
  assert(response && response.items.length === 1 && response.items[0].asin === 'B0REQ0001', '请求响应含 1 个商品');
  assert(response.items[0].rawPosition === 1, '响应中位置=1');
}

setTimeout(() => {
  console.log(`\n========== 结果：${passed} 通过 / ${failed} 失败 ==========`);
  process.exit(failed ? 1 : 0);
}, 900);
