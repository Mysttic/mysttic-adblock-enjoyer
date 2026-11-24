// Static survey: how is Ad-Shield embedded on a given page? Fetches the HTML only and reports
// the script tags that look like Ad-Shield (by host, by packed snippet, by markers).
// Nothing from the fetched pages is executed.
//
// usage: node tools/research/survey.js [--save <dir>] <url>...
'use strict';
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
let saveDir = null;
const urls = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--save') saveDir = args[++i];
  else urls.push(args[i]);
}

const HOSTS = ['html-load.com', 'html-load.cc', 'content-loader.com', 'css-load.com', 'img-load.com', '07c225f3.online', 'error-report.com', 'ad-shield.io', 'd2w3kkzkbwx7b4.cloudfront.net'];
const PACKED = /[\w$]+\+=[\w$]+\[\([\w$]+\+[\w$.]+\)\*[\w$.]+%[\w$]+\]/;
const isAdShieldHost = (h) => HOSTS.some((d) => h === d || h.endsWith('.' + d));

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
          if (end < 0) break;
          val = doc.slice(j + 1, end);
          j = end + 1;
        } else {
          const um = /^[^\s>]*/.exec(doc.slice(j, j + 20000));
          val = um[0];
          j += val.length;
        }
      }
      attrs[nm[0].toLowerCase()] = val;
    }
    const close = doc.indexOf('</script', j);
    yield { attrs, body: doc.slice(j + 1, close < 0 ? doc.length : close), offset: open };
    i = close < 0 ? doc.length : close + 9;
  }
}

async function survey(url) {
  const out = { url };
  let html;
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(25000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,pl;q=0.8',
      },
    });
    out.status = res.status;
    out.finalUrl = res.url;
    html = await res.text();
  } catch (e) {
    out.error = String(e.cause || e).slice(0, 120);
    return out;
  }
  out.bytes = html.length;
  if (saveDir) {
    fs.mkdirSync(saveDir, { recursive: true });
    fs.writeFileSync(path.join(saveDir, new URL(url).hostname + '.html'), html);
  }
  const headEnd = html.indexOf('</head>');
  out.markers = {};
  for (const m of ['html-load', 'content-loader', 'css-load', 'error-report', 'data-sdk', 'loader.min.js', 'nowprocket', '07c225f3']) {
    const n = html.split(m).length - 1;
    if (n) out.markers[m] = n;
  }
  out.scripts = 0;
  out.hits = [];
  for (const { attrs, body, offset } of scriptTags(html)) {
    out.scripts++;
    const hit = { inHead: headEnd < 0 ? null : offset < headEnd };
    let host = null;
    if (attrs.src) {
      try { host = new URL(attrs.src.replace(/&amp;/g, '&'), url).hostname; } catch {}
    }
    const t = body.trim();
    const reasons = [];
    if (host && isAdShieldHost(host)) reasons.push('host');
    for (const k of ['onload', 'onerror']) {
      if (k in attrs) {
        if (PACKED.test(attrs[k].slice(0, 2000))) reasons.push(k + ':packed');
        else if (attrs[k].length >= 1000) reasons.push(k + ':long');
      }
    }
    if (!attrs.src && PACKED.test(t.slice(0, 2000))) reasons.push('inline:packed');
    if (!reasons.length && /html-load|content-loader\.com|css-load\.com|error-report\.com/.test(t) && !attrs.src) reasons.push('inline:mentions-host');
    if (!reasons.length) continue;
    hit.reasons = reasons;
    hit.src = attrs.src ? attrs.src.slice(0, 70) : null;
    hit.attrs = Object.keys(attrs).filter((k) => k !== 'src').map((k) => (k === 'onload' || k === 'onerror' ? `${k}(${attrs[k].length})` : attrs[k] && attrs[k].length < 20 ? `${k}=${attrs[k]}` : k)).join(' ');
    hit.bodyLen = t.length;
    hit.bodyHead = t.slice(0, 90);
    hit.asyncIife = /\(async\(\)=>\{/.test(t.slice(0, 2000)) || ['onload', 'onerror'].some((k) => /\(async\(\)=>\{/.test((attrs[k] || '').slice(0, 2000)));
    hit.newZero = /new\(0,/.test(t.slice(0, 2000)) || ['onload', 'onerror'].some((k) => /new\(0,/.test((attrs[k] || '').slice(0, 2000)));
    out.hits.push(hit);
  }
  return out;
}

(async () => {
  const results = await Promise.all(urls.map(survey));
  for (const r of results) {
    if (r.error) { console.log(`\n## ${r.url}\n   ERROR ${r.error}`); continue; }
    console.log(`\n## ${r.url} -> ${r.status} ${r.finalUrl !== r.url ? r.finalUrl : ''} (${r.bytes} bytes, ${r.scripts} scripts)`);
    console.log('   markers:', JSON.stringify(r.markers));
    for (const h of r.hits) {
      console.log(`   - [${h.reasons.join(',')}] head=${h.inHead} src=${h.src} attrs="${h.attrs}" body=${h.bodyLen} async=${h.asyncIife} new0=${h.newZero}`);
      if (h.bodyLen) console.log(`       ${JSON.stringify(h.bodyHead)}`);
    }
    if (!r.hits.length) console.log('   (no Ad-Shield-looking script tags in the HTML)');
  }
})();
