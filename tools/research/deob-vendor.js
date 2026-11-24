// Static string-array deobfuscation for the Ad-Shield main script (obfuscator.io style).
// The script is only read as text: the string table is parsed by hand, the rotation check
// is evaluated with a tiny arithmetic evaluator, and lookups are inlined as literals.
'use strict';
const fs = require('fs');

const [inPath, outPath, tablePath] = process.argv.slice(2);
if (!inPath || !outPath) {
  console.error('usage: node tools/research/deob-vendor.js <vendor.js> <out.js> [table.json]');
  process.exit(2);
}
const src = fs.readFileSync(inPath, 'utf8');

// ---- 1. locate lookup function + string table -------------------------------------------
const lookupM = /function (\w+)\(t,e\)\{const n=(\w+)\(\);return\(\1=function\(t,e\)\{return n\[t-=(\d+)\]\}\)\(t,e\)\}/.exec(src);
if (!lookupM) throw new Error('lookup function not found');
const [, lookupName, tableName, offsetStr] = lookupM;
const offset = Number(offsetStr);

const tableHead = `function ${tableName}(){const t=[`;
const tableStart = src.indexOf(tableHead);
if (tableStart < 0) throw new Error('table not found');

function readString(s, i) {
  const q = s[i];
  let out = '';
  i++;
  while (s[i] !== q) {
    if (s[i] === '\\') {
      const c = s[i + 1];
      if (c === 'n') { out += '\n'; i += 2; }
      else if (c === 't') { out += '\t'; i += 2; }
      else if (c === 'r') { out += '\r'; i += 2; }
      else if (c === 'b') { out += '\b'; i += 2; }
      else if (c === 'f') { out += '\f'; i += 2; }
      else if (c === 'v') { out += '\v'; i += 2; }
      else if (c === '0' && !/\d/.test(s[i + 2])) { out += '\0'; i += 2; }
      else if (c === 'x') { out += String.fromCharCode(parseInt(s.substr(i + 2, 2), 16)); i += 4; }
      else if (c === 'u') {
        if (s[i + 2] === '{') {
          const end = s.indexOf('}', i);
          out += String.fromCodePoint(parseInt(s.slice(i + 3, end), 16));
          i = end + 1;
        } else { out += String.fromCharCode(parseInt(s.substr(i + 2, 4), 16)); i += 6; }
      } else if (c === '\n') { i += 2; }
      else { out += c; i += 2; }
      continue;
    }
    out += s[i];
    i++;
  }
  return [out, i + 1];
}

const table = [];
let p = tableStart + tableHead.length;
for (;;) {
  const c = src[p];
  if (c === ']') { p++; break; }
  if (c === ',') { p++; continue; }
  if (c === '"' || c === "'") {
    const [v, np] = readString(src, p);
    table.push(v);
    p = np;
    continue;
  }
  throw new Error('unexpected char in table at ' + p + ': ' + src.slice(p, p + 30));
}

// ---- 2. rotation ------------------------------------------------------------------------
const rotM = /for\(;;\)try\{if\((\d+)==(.*?)\)break;e\.push\(e\.shift\(\)\)\}catch\(t\)\{e\.push\(e\.shift\(\)\)\}/.exec(src.slice(p, p + 2000));
if (!rotM) throw new Error('rotation loop not found');
const target = Number(rotM[1]);
const expr = rotM[2];

function jsParseInt(s) {
  const m = /^\s*[-+]?\d+/.exec(String(s));
  return m ? Number(m[0]) : NaN;
}

function evalExpr(text, tbl) {
  let i = 0;
  const peek = () => text[i];
  function atom() {
    if (peek() === '-') { i++; return -atom(); }
    if (peek() === '+') { i++; return +atom(); }
    if (peek() === '(') { i++; const v = sum(); if (peek() !== ')') throw new Error('paren'); i++; return v; }
    const m = /^parseInt\(\w+\((\d+)\)\)/.exec(text.slice(i));
    if (m) { i += m[0].length; return jsParseInt(tbl[Number(m[1]) - offset]); }
    const n = /^\d+/.exec(text.slice(i));
    if (n) { i += n[0].length; return Number(n[0]); }
    throw new Error('unexpected in expr at ' + i + ': ' + text.slice(i, i + 20));
  }
  function product() {
    let v = atom();
    while (peek() === '*' || peek() === '/') {
      const op = text[i++];
      const r = atom();
      v = op === '*' ? v * r : v / r;
    }
    return v;
  }
  function sum() {
    let v = product();
    while (peek() === '+' || peek() === '-') {
      const op = text[i++];
      const r = product();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }
  const v = sum();
  if (i !== text.length) throw new Error('trailing expr: ' + text.slice(i));
  return v;
}

let rotations = 0;
for (; rotations <= table.length; rotations++) {
  let v;
  try { v = evalExpr(expr, table); } catch (e) { throw e; }
  if (v === target) break;
  table.push(table.shift());
}
if (rotations > table.length) throw new Error('rotation not resolved');

// ---- 3. alias discovery -----------------------------------------------------------------
const aliases = new Set([lookupName]);
for (let changed = true; changed;) {
  changed = false;
  const re = /(?:const |let |var |,|;|\{|\()([A-Za-z_$][\w$]*)=([A-Za-z_$][\w$]*)(?=[,;)}])/g;
  let m;
  while ((m = re.exec(src))) {
    if (aliases.has(m[2]) && !aliases.has(m[1])) { aliases.add(m[1]); changed = true; }
  }
}

// ---- 4. inline lookups ------------------------------------------------------------------
let replaced = 0;
let skipped = 0;
const out = src.replace(/(?<![\w$.])([A-Za-z_$][\w$]*)\((\d+)\)/g, (all, name, num) => {
  const idx = Number(num) - offset;
  if (!aliases.has(name) || idx < 0 || idx >= table.length) { skipped++; return all; }
  replaced++;
  return JSON.stringify(table[idx]);
});

fs.writeFileSync(outPath, out);
if (tablePath) fs.writeFileSync(tablePath, JSON.stringify(table.map((v, i) => [i + offset, v]), null, 0));
console.log(JSON.stringify({ lookupName, tableName, offset, strings: table.length, rotations, target, aliases: aliases.size, replaced, skipped, outLen: out.length }));
