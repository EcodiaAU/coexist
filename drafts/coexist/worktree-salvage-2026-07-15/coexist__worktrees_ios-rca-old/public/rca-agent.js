// RCA page agent: streams input/focus/viewport events to the collector and
// provides a remote-eval channel. Dev-only instrumentation, never committed.
(function () {
  var BASE = 'http://localhost:9777';
  var CLIENT = location.port + (window.__RCA_TAG || '');
  function send(ev) {
    try {
      fetch(BASE + '/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.assign({ client: CLIENT, url: location.pathname }, ev)),
        keepalive: true,
      }).catch(function () {});
    } catch (e) {}
  }
  function describe(el) {
    if (!el || !el.tagName) return String(el);
    return (
      el.tagName.toLowerCase() +
      (el.id ? '#' + el.id : '') +
      (el.type ? '[type=' + el.type + ']' : '') +
      (el.getAttribute && el.getAttribute('aria-label') ? '[aria=' + el.getAttribute('aria-label') + ']' : '')
    );
  }
  window.addEventListener('error', function (e) {
    send({ kind: 'jserror', msg: String(e.message), src: String(e.filename) + ':' + e.lineno });
  });
  ['focusin', 'focusout'].forEach(function (k) {
    document.addEventListener(k, function (e) {
      send({ kind: k, target: describe(e.target), active: describe(document.activeElement) });
    }, true);
  });
  ['compositionstart', 'compositionend'].forEach(function (k) {
    document.addEventListener(k, function (e) {
      send({ kind: k, target: describe(e.target), data: e.data });
    }, true);
  });
  document.addEventListener('input', function (e) {
    var t = e.target;
    send({ kind: 'input', target: describe(t), value: t && t.value, inputType: e.inputType });
  }, true);
  document.addEventListener('beforeinput', function (e) {
    send({ kind: 'beforeinput', target: describe(e.target), data: e.data, inputType: e.inputType });
  }, true);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', function () {
      send({ kind: 'vv-resize', h: window.visualViewport.height, w: window.visualViewport.width, offTop: window.visualViewport.offsetTop, innerH: window.innerHeight });
    });
    window.visualViewport.addEventListener('scroll', function () {
      send({ kind: 'vv-scroll', h: window.visualViewport.height, offTop: window.visualViewport.offsetTop, pageTop: window.visualViewport.pageTop });
    });
  }
  send({ kind: 'agent-boot', ua: navigator.userAgent, innerH: window.innerHeight, innerW: window.innerWidth, vvH: window.visualViewport ? window.visualViewport.height : null });
  // remote eval loop
  function loop() {
    fetch(BASE + '/cmd?client=' + CLIENT)
      .then(function (r) { return r.json(); })
      .then(function (cmd) {
        if (cmd && cmd.js) {
          var out;
          try {
            out = { id: cmd.id, client: CLIENT, ok: true, value: new Function(cmd.js)() };
          } catch (e) {
            out = { id: cmd.id, client: CLIENT, ok: false, error: String(e) };
          }
          Promise.resolve(out.value)
            .then(function (v) { out.value = v; })
            .catch(function (e) { out.ok = false; out.error = String(e); })
            .then(function () {
              return fetch(BASE + '/result', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(out),
              });
            })
            .catch(function () {})
            .then(function () { setTimeout(loop, 150); });
          return;
        }
        setTimeout(loop, 300);
      })
      .catch(function () { setTimeout(loop, 1000); });
  }
  loop();
})();
