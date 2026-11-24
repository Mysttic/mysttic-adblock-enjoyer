// Defuses the Ad-Shield anti-adblock tags before they run.
//
// A page that uses Ad-Shield (loader SDK 1.2.x) ships two of them in <head>:
//   1. The loader: <script src="https://html-load.com/..." onload="..." onerror="...">
//      It runs an "integrity check" that reads 174 native APIs. If a read throws (ad blockers
//      make window.open throw to stop popunders) it wipes <head> and <body>, then calls
//      confirm("Please allow ads on this site..."): OK redirects to report.error-report.com,
//      Cancel reloads. The onload/onerror attributes raise the same wall when the loader is
//      blocked or does not answer a postMessage handshake.
//   2. An inline watchdog that raises the wall when tag 1 is missing from the DOM.
//
// So tag 1 must stay in the DOM but inert, and tag 2 must not execute. This script runs in the
// extension's isolated world at document_start: the parser has not reached <head> yet, and
// Chromium delivers MutationObserver records before it prepares a parser-inserted script.
//
// It only acts on that exact pattern. Older Ad-Shield embeds work differently and are left
// alone, because disabling half of one is what triggers the wall.
(() => {
  'use strict';

  // Hosts Ad-Shield loads code from or reports to.
  const AD_SHIELD_HOSTS = [
    'html-load.com',
    'html-load.cc',
    'content-loader.com',
    'css-load.com',
    'img-load.com',
    '07c225f3.online',
    'error-report.com',
    'ad-shield.io',
    'd2w3kkzkbwx7b4.cloudfront.net',
  ];

  // Every packed Ad-Shield snippet starts with its string decoder, an index permutation of
  // the form  acc += s[(i + add) * mul % n]  and then builds its payload with new(0, Function).
  const DECODER = /[\w$]+\+=[\w$]+\[\([\w$]+\+[\w$.]+\)\*[\w$.]+%[\w$]+\]/;
  const HEAD_CHARS = 2000;
  // No legitimate inline onload/onerror attribute comes close to this (Ad-Shield's are ~4000).
  const LONG_HANDLER = 1000;

  const isPacked = (code) => {
    const head = code.slice(0, HEAD_CHARS);
    return head.includes('new(0,') && DECODER.test(head);
  };

  const hasAdShieldSrc = (script) => {
    const src = script.getAttribute('src');
    if (!src) return false;
    try {
      const { hostname } = new URL(src, document.baseURI);
      return AD_SHIELD_HOSTS.some((host) => hostname === host || hostname.endsWith('.' + host));
    } catch {
      return false;
    }
  };

  // Tag 1. The second test keeps working if the packer changes: still a huge inline handler
  // on a tag that is otherwise recognisably Ad-Shield's.
  const isLoader = (script) =>
    ['onload', 'onerror'].some((name) => {
      const code = script.getAttribute(name);
      if (code === null) return false;
      if (isPacked(code)) return true;
      return code.length >= LONG_HANDLER && (script.hasAttribute('data-sdk') || hasAdShieldSrc(script));
    });

  // Tag 2.
  const isWatchdog = (script) => !script.hasAttribute('src') && isPacked(script.textContent);

  let found = false;

  // Not removed from the DOM: the watchdog looks the loader tag up by id.
  const defuse = (script) => {
    found = true;
    script.removeAttribute('onload');
    script.removeAttribute('onerror');
    script.removeAttribute('src');
    script.setAttribute('type', 'text/plain');
  };

  const inspect = (script) => {
    if (isLoader(script) || isWatchdog(script)) defuse(script);
  };

  // Script text arrives as a child text node, possibly after the element itself.
  const owningScript = (node) => {
    const element = node.nodeType === Node.TEXT_NODE ? node.parentNode : node;
    return element && element.localName === 'script' ? element : null;
  };

  const onMutations = (records) => {
    for (const record of records) {
      if (record.type !== 'childList') {
        const script = owningScript(record.target);
        if (script) inspect(script);
        continue;
      }
      for (const node of record.addedNodes) {
        const script = owningScript(node);
        if (script) inspect(script);
        else if (node.nodeType === Node.ELEMENT_NODE) {
          for (const nested of node.getElementsByTagName('script')) inspect(nested);
        }
      }
    }
  };

  const observer = new MutationObserver(onMutations);
  observer.observe(document, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['src', 'onload', 'onerror'],
  });

  for (const script of document.getElementsByTagName('script')) inspect(script);

  // Both tags are parser-inserted, so a page without them needs no watching once parsing ends.
  // A page that has them stays watched in case a tag is inserted again.
  document.addEventListener('DOMContentLoaded', () => {
    if (!found) observer.disconnect();
  }, { once: true });
})();
