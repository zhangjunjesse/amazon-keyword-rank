/**
 * keygen.mjs 回归测试（零依赖）
 * 跑法：node tools/keygen.test.mjs
 */
'use strict';

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let passed = 0, failed = 0;
const assert = (cond, name, extra) => {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}${extra ? ' → ' + JSON.stringify(extra) : ''}`); }
};

// ---------- 与扩展内一致的核心逻辑（直接 import 会执行 CLI，这里内联复制） ----------
const PRODUCT_PRO = 0x01;
const b64url = (buf) => Buffer.from(buf).toString('base64url');
const unb64 = (s) => Buffer.from(s, 'base64url');
const KEY_RE = /^ARTK-([A-Za-z0-9_-]{12})-([A-Za-z0-9_-]{86})$/;

function makeKey(privateKey) {
  const payload = Buffer.alloc(9);
  payload[0] = PRODUCT_PRO;
  payload.writeUInt32BE(crypto.randomBytes(4).readUInt32BE(0), 1);
  payload.writeUInt32BE(Math.floor(Date.now() / 1000), 5);
  const sig = crypto.sign(null, payload, privateKey);
  return { code: `ARTK-${b64url(payload)}-${b64url(sig)}`, payload, sig };
}

function checkKey(code, publicKey) {
  const m = KEY_RE.exec(code.trim());
  if (!m) return { ok: false, reason: 'format' };
  const payload = unb64(m[1]);
  const sig = unb64(m[2]);
  if (!crypto.verify(null, payload, publicKey, sig)) return { ok: false, reason: 'sig' };
  if (payload[0] !== PRODUCT_PRO) return { ok: false, reason: 'product' };
  return { ok: true, ts: payload.readUInt32BE(5) };
}

// ---------- 测试 ----------
console.log('\n[keygen 回归测试]');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'artk-'));
try {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const wrongPair = crypto.generateKeyPairSync('ed25519');

  const k1 = makeKey(privateKey);
  assert(checkKey(k1.code, publicKey).ok === true, '正常签发的码验证通过');
  assert(KEY_RE.test(k1.code), '激活码格式匹配 ARTK-12-86');
  assert(k1.code.length < 110, '激活码长度 < 110 字符（可读性好）', k1.code.length);

  // 篡改一个字符
  const ch = k1.code[10];
  const newCh = ch === 'A' ? 'B' : 'A';
  const tampered = k1.code.slice(0, 10) + newCh + k1.code.slice(11);
  assert(checkKey(tampered, publicKey).ok === false, '篡改一位 → 验证失败');

  // 换一把公钥
  assert(checkKey(k1.code, wrongPair.publicKey).ok === false, '用错误公钥 → 验证失败');

  // 批量签发一致性
  const many = new Set();
  for (let i = 0; i < 500; i++) many.add(makeKey(privateKey).code);
  assert(many.size === 500, '500 个码无重复');
  for (const code of many) assert(checkKey(code, publicKey).ok === true, `批量码 #${code.slice(0, 12)} 有效`);

  // 格式异常
  assert(checkKey('ARTK-short', publicKey).ok === false, '短码 → 格式失败');
  assert(checkKey('', publicKey).ok === false, '空串 → 格式失败');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n========== keygen 测试：${passed} 通过 / ${failed} 失败 ==========`);
process.exit(failed ? 1 : 0);
