// Crude JS line breaker for reading minified code (analysis aid only, output is not meant to run).
// Breaks after ';', '{', '}' outside of strings / template literals / (...) groups.
//
// usage: node tools/research/crude-format.js <in.js> <out.js>
'use strict';
const fs = require('fs');
const [inPath, outPath] = process.argv.slice(2);
const s = fs.readFileSync(inPath, 'utf8');

let out = '';
let indent = 0;
let paren = 0;
const parenStack = [];
const nl = () => { out = out.replace(/[ \t]+$/, ''); out += '\n' + '  '.repeat(Math.max(indent, 0)); };

function regexAllowed() {
  const t = out.replace(/\s+$/, '');
  const c = t[t.length - 1];
  if (c === undefined) return true;
  if ('(,=:[!&|?{};+-*%<>~^'.includes(c)) return true;
  return /(?:^|[^\w$.])(?:return|typeof|case|in|of|void|delete|throw|new)$/.test(t);
}

for (let i = 0; i < s.length; i++) {
  const c = s[i];
  if (c === '"' || c === "'" || c === '`') {
    let j = i + 1;
    while (j < s.length && s[j] !== c) { if (s[j] === '\\') j++; j++; }
    out += s.slice(i, j + 1);
    i = j;
    continue;
  }
  if (c === '/' && s[i + 1] === '/') {
    const j = s.indexOf('\n', i);
    const end = j < 0 ? s.length : j;
    out += s.slice(i, end);
    i = end - 1;
    nl();
    continue;
  }
  if (c === '/' && s[i + 1] === '*') {
    const j = s.indexOf('*/', i + 2);
    out += s.slice(i, j + 2);
    i = j + 1;
    continue;
  }
  if (c === '/' && regexAllowed()) {
    let j = i + 1;
    let inClass = false;
    while (j < s.length) {
      if (s[j] === '\\') { j += 2; continue; }
      if (s[j] === '[') inClass = true;
      else if (s[j] === ']') inClass = false;
      else if (s[j] === '/' && !inClass) break;
      else if (s[j] === '\n') break;
      j++;
    }
    out += s.slice(i, j + 1);
    i = j;
    continue;
  }
  if (c === '(' || c === '[') { paren++; out += c; continue; }
  if (c === ')' || c === ']') { paren--; out += c; continue; }
  if (c === '{') {
    parenStack.push(paren);
    paren = 0;
    indent++;
    out += c;
    nl();
    continue;
  }
  if (c === '}') {
    indent--;
    nl();
    out += c;
    paren = parenStack.length ? parenStack.pop() : 0;
    const next = s[i + 1];
    if (paren === 0 && next !== ')' && next !== ',' && next !== ';' && next !== '(' && next !== '.' && next !== ']') nl();
    continue;
  }
  if (c === ';' && paren === 0) { out += c; nl(); continue; }
  if (c === '\n') { nl(); continue; }
  out += c;
}
fs.writeFileSync(outPath, out);
console.log('lines:', out.split('\n').length);
