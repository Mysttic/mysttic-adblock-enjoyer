// Generic static decoder for Ad-Shield's packed snippets, both the inline <script> bodies and
// the onload/onerror attribute values. Nothing from the page is evaluated: the argument
// objects are parsed by hand and the two decoding stages are re-implemented.
//
// Shape of a packed snippet:
//   ((A,B[,C])=>{var ...,DEC=(s,n,E)=>{for(n=n||s[X.len],E=E||n,acc=X.empty,r=X.zero;r<E;r++)acc+=s[(r+X.add)*X.mul%n];return acc};
//     (async()=>{ev=W[DEC(..)],new(0,W[DEC(..)])(ARG,ev(DEC(SRC))(DEC(P1+P2+..)+W[DEC(..)](DEC(..)),KEY,EXTRA))(cb)})(),
//     flag||(W[DEC(..)][DEC(..)]=DEC(U1+U2+..,N))})({..},{..}[,{..}])
'use strict';
const fs = require('fs');
const path = require('path');

const [htmlPath, outDir] = process.argv.slice(2);
if (!htmlPath || !outDir) {
  console.error('usage: node tools/research/decode-snippets.js <page.html> <outDir>');
  process.exit(2);
}
const html = fs.readFileSync(htmlPath, 'utf8');
fs.mkdirSync(outDir, { recursive: true });

function parseArgs(src) {
  const start = src.indexOf('})({') + 2;
  let i = start + 1;
  const objs = [];
  while (i < src.length && src[i] !== ')') {
    if (src[i] === ',') { i++; continue; }
    if (src[i] !== '{') throw new Error('expected { at ' + i + ': ' + src.slice(i, i + 20));
    i++;
    const o = {};
    while (src[i] !== '}') {
      if (src[i] === ',') { i++; continue; }
      const km = /^[A-Za-z_$][\w$]*/.exec(src.slice(i, i + 40));
      if (!km) throw new Error('bad key at ' + i + ': ' + src.slice(i, i + 20));
      i += km[0].length;
      if (src[i] !== ':') throw new Error('expected : at ' + i);
      i++;
      if (src[i] === "'") {
        let j = i + 1;
        let v = '';
        while (src[j] !== "'") {
          if (src[j] === '\\') { v += src[j + 1]; j += 2; continue; }
          v += src[j];
          j++;
        }
        o[km[0]] = v;
        i = j + 1;
      } else {
        // Non-string values are numbers or window references such as "[window,void 0][0]".
        let j = i;
        let depth = 0;
        while (depth > 0 || (src[j] !== ',' && src[j] !== '}')) {
          if (src[j] === '[' || src[j] === '(') depth++;
          else if (src[j] === ']' || src[j] === ')') depth--;
          j++;
        }
        const raw = src.slice(i, j);
        o[km[0]] = /^-?\d+$/.test(raw) ? Number(raw) : { raw };
        i = j;
      }
    }
    i++;
    objs.push(o);
  }
  return { objs, head: src.slice(0, start) };
}

function decodeSnippet(src) {
  const { objs, head } = parseArgs(src);
  const params = /^\(\(([\w$,]+)\)=>/.exec(head)[1].split(',');
  const env = {};
  params.forEach((p, i) => { env[p] = objs[i]; });

  // Resolve "t.g" style references and "+"-joined concatenations of them.
  const ref = (expr) => {
    const m = /^([\w$]+)\.([\w$]+)$/.exec(expr);
    if (!m || !(m[1] in env)) throw new Error('unresolvable ref: ' + expr);
    return env[m[1]][m[2]];
  };
  const cat = (expr) => expr.split('+').map(ref).join('');

  const dm = /([\w$]+)=\(([\w$]+),([\w$]+),([\w$]+)\)=>\{for\(\3=\3\|\|\2\[([\w$.]+)\],\4=\4\|\|\3,[\w$]+=([\w$.]+),[\w$]+=([\w$.]+);[\w$]+<\4;[\w$]+\+\+\)[\w$]+\+=\2\[\([\w$]+\+([\w$.]+)\)\*([\w$.]+)%\3\];return [\w$]+\}/.exec(head);
  if (!dm) throw new Error('decoder loop not recognised');
  const decName = dm[1];
  if (ref(dm[5]) !== 'length' || ref(dm[6]) !== '' || ref(dm[7]) !== 0) throw new Error('unexpected decoder constants');
  const add = ref(dm[8]);
  const mul = ref(dm[9]);
  const dec = (s, n, E) => {
    n = n || s.length;
    E = E || n;
    let out = '';
    for (let r = 0; r < E; r++) out += s[(r + add) * mul % n];
    return out;
  };
  // Evaluate a "DEC(a.b+c.d[,x.y[,z.w]])" call found in the head.
  const call = (argText) => {
    const parts = argText.split(',');
    return dec(cat(parts[0]), parts[1] ? ref(parts[1]) : undefined, parts[2] ? ref(parts[2]) : undefined);
  };
  const D = decName.replace(/\$/g, '\\$');
  const A = '([\\w$.+,]+)';
  const main = new RegExp(
    `[\\w$]+=[\\w$.]+\\[${D}\\(${A}\\)\\],new\\(0,[\\w$.]+\\[${D}\\(${A}\\)\\]\\)\\(([\\w$.]+),[\\w$]+\\(${D}\\(${A}\\)\\)\\(${D}\\(${A}\\)\\+[\\w$.]+\\[${D}\\(${A}\\)\\]\\(${D}\\(${A}\\)\\),([\\w$.]+),([\\w$.]+)\\)\\)`
  ).exec(head);
  if (!main) throw new Error('main expression not recognised');
  const [, aEval, aCtor, argNameRef, aDecoder, aPayload, aGlobalFn, aGlobalArg, keyRef, extraRef] = main;
  const fail = new RegExp(`\\|\\|\\([\\w$.]+\\[${D}\\(${A}\\)\\]\\[${D}\\(${A}\\)\\]=${D}\\(${A}\\)\\)`).exec(head);

  const info = {
    evalName: call(aEval),
    ctorName: call(aCtor),
    globalFn: call(aGlobalFn),
    failTarget: fail ? call(fail[1]) + '.' + call(fail[2]) : null,
    failUrl: fail ? call(fail[3]) : null,
  };
  if (info.evalName !== 'eval' || info.ctorName !== 'Function' || info.globalFn !== 'atob') {
    throw new Error('unexpected globals: ' + JSON.stringify(info));
  }
  const decoderSrc = call(aDecoder);
  const lead = /for\([\w$]+ of\[(.*?),\.\.\.[\w$]+\.match/.exec(decoderSrc);
  if (!lead) throw new Error('unexpected stage 2 decoder: ' + decoderSrc);
  const leadTokens = lead[1].split(',').map((part) =>
    String.fromCharCode(...[...part.matchAll(/String\.fromCharCode\((\d+)\)/g)].map((x) => Number(x[1]))));

  let r = call(aPayload) + Buffer.from(call(aGlobalArg), 'base64').toString('latin1');
  for (const tok of [...leadTokens, ...ref(keyRef).match(/../g), ...ref(extraRef)]) {
    const f = r.split(tok);
    r = f.join(f.pop());
  }
  return { info, code: r };
}

const unescapeAttr = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

// Attribute-aware <script> scanner ('>' may appear inside quoted attribute values).
function* scriptTags(doc) {
  let i = 0;
  for (;;) {
    const open = doc.indexOf('<script', i);
    if (open < 0) return;
    let j = open + 7;
    const attrs = {};
    while (j < doc.length && doc[j] !== '>') {
      if (/[\s/]/.test(doc[j])) { j++; continue; }
      const nm = /^[^\s=>/]+/.exec(doc.slice(j, j + 200));
      if (!nm) { j++; continue; }
      j += nm[0].length;
      let val = '';
      if (doc[j] === '=') {
        j++;
        const q = doc[j];
        if (q === '"' || q === "'") {
          const end = doc.indexOf(q, j + 1);
          val = doc.slice(j + 1, end);
          j = end + 1;
        } else {
          const um = /^[^\s>]*/.exec(doc.slice(j, j + 5000));
          val = um[0];
          j += val.length;
        }
      }
      attrs[nm[0].toLowerCase()] = val;
    }
    const close = doc.indexOf('</script', j);
    yield { attrs, body: doc.slice(j + 1, close < 0 ? doc.length : close) };
    i = close < 0 ? doc.length : close + 9;
  }
}

const found = [];
let n = 0;
for (const { attrs, body } of scriptTags(html)) {
  n++;
  for (const name of ['onload', 'onerror']) {
    if (attrs[name] && attrs[name].length > 500) found.push({ label: `script${n}.${name}`, src: unescapeAttr(attrs[name]) });
  }
  const t = body.trim();
  if (/^\(\([\w$,]+\)=>\{var /.test(t) && t.includes('async()=>')) found.push({ label: `script${n}.inline`, src: t });
}

for (const f of found) {
  try {
    const { info, code } = decodeSnippet(f.src);
    const file = path.join(outDir, f.label + '.js');
    fs.writeFileSync(file, code);
    console.log(`${f.label}: packed ${f.src.length} -> ${code.length} chars, ${JSON.stringify(info)}`);
  } catch (e) {
    console.log(`${f.label}: FAILED ${e.message}`);
  }
}
console.log('snippets found:', found.length);
