#!/usr/bin/env node
/**
 * 激活码生成器（Node 18+，零依赖）
 *
 * 生成 Ed25519 签名的激活码，用于国内渠道（面包多等卡密平台）自动发货。
 * 私钥只在你本机，扩展内置公钥离线验签——无法被伪造。
 *
 * 用法：
 *   node keygen.mjs gen-keypair --out <目录>        生成密钥对（license-private.pem / license-public.pem）
 *   node keygen.mjs issue --private <私钥.pem> --count 200 [--out keys.txt]   批量签发激活码
 *   node keygen.mjs verify --key ARTK-... --public <公钥.pem>                  验证单个激活码
 *
 * 安全提示：
 *   - license-private.pem 是命根子，请保存在安全位置（不要放进 git 仓库 / 不要发给任何人）
 *   - 私钥丢失 = 已发出去的所有激活码失效，只能重新生成一批
 */
'use strict';

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const PRODUCT_PRO = 0x01; // 1 = Pro 版

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}
function unb64(s) {
  return Buffer.from(s, 'base64url');
}

// ---------- 生成密钥对 ----------
function genKeypair(outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  fs.writeFileSync(
    path.join(outDir, 'license-private.pem'),
    privateKey.export({ type: 'pkcs8', format: 'pem' })
  );
  fs.writeFileSync(
    path.join(outDir, 'license-public.pem'),
    publicKey.export({ type: 'spki', format: 'pem' })
  );
  // 供嵌入扩展的原始公钥（base64url，32 字节）
  const jwk = publicKey.export({ format: 'jwk' });
  console.log('已生成密钥对：');
  console.log('  私钥: ' + path.join(outDir, 'license-private.pem') + '  ← 务必妥善保管');
  console.log('  公钥: ' + path.join(outDir, 'license-public.pem'));
  console.log('');
  console.log('嵌入扩展的 PUBLIC_KEY（base64url，请填入 background/service-worker.js）：');
  console.log(jwk.x);
}

// ---------- 签发一批激活码 ----------
function issue(privatePemPath, count, outFile) {
  const privateKey = crypto.createPrivateKey(fs.readFileSync(privatePemPath));
  const lines = [];
  for (let i = 0; i < count; i++) {
    const payload = Buffer.alloc(9);
    payload[0] = PRODUCT_PRO;
    payload.writeUInt32BE(crypto.randomBytes(4).readUInt32BE(0), 1); // 随机订单号
    payload.writeUInt32BE(Math.floor(Date.now() / 1000), 5);          // 签发时间戳
    const sig = crypto.sign(null, payload, privateKey);               // Ed25519
    lines.push(`ARTK-${b64url(payload)}-${b64url(sig)}`);
  }
  const text = lines.join('\n') + '\n';
  if (outFile) {
    fs.writeFileSync(outFile, text);
    console.log(`已签发 ${count} 个激活码 → ${outFile}`);
    console.log('示例：');
    console.log(lines[0]);
  } else {
    process.stdout.write(text);
  }
}

// ---------- 验证单个激活码 ----------
function verify(code, publicPemPath) {
  const publicKey = crypto.createPublicKey(fs.readFileSync(publicPemPath));
  const m = /^ARTK-([A-Za-z0-9_-]{12})-([A-Za-z0-9_-]{86})$/.exec(code.trim());
  if (!m) {
    console.log('✗ 格式不正确（应为 ARTK-12字符-86字符）');
    return false;
  }
  const payload = unb64(m[1]);
  const sig = unb64(m[2]);
  const ok = crypto.verify(null, payload, publicKey, sig);
  if (!ok) {
    console.log('✗ 签名无效（激活码被篡改或来自其它密钥）');
    return false;
  }
  const product = payload[0] === PRODUCT_PRO ? 'Pro' : '未知产品(' + payload[0] + ')';
  const ts = payload.readUInt32BE(5);
  console.log(`✓ 有效激活码：产品=${product}，签发时间=${new Date(ts * 1000).toISOString()}`);
  return true;
}

// ---------- CLI ----------
const args = process.argv.slice(2);
const get = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};

const cmd = args[0];
try {
  if (cmd === 'gen-keypair') {
    genKeypair(get('--out') || '.');
  } else if (cmd === 'issue') {
    const pem = get('--private');
    const count = parseInt(get('--count') || '1', 10);
    if (!pem || !fs.existsSync(pem)) throw new Error('请用 --private 指定私钥文件路径');
    if (!(count >= 1 && count <= 100000)) throw new Error('--count 需在 1-100000 之间');
    issue(pem, count, get('--out') || null);
  } else if (cmd === 'verify') {
    const code = get('--key');
    const pub = get('--public');
    if (!code || !pub) throw new Error('用法: node keygen.mjs verify --key ARTK-... --public license-public.pem');
    if (!verify(code, pub)) process.exit(1);
  } else {
    console.log(
      [
        '用法：',
        '  node keygen.mjs gen-keypair --out <目录>',
        '  node keygen.mjs issue --private <私钥.pem> --count 200 [--out keys.txt]',
        '  node keygen.mjs verify --key ARTK-... --public <公钥.pem>',
      ].join('\n')
    );
    process.exit(1);
  }
} catch (e) {
  console.error('错误: ' + e.message);
  process.exit(1);
}
