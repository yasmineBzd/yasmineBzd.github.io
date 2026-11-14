/* Effects: the sequencing intro, DNA-decode headings, the typed prompt, the marquee,
   number counters, spotlight cards, magnetic buttons and the cursor ring. */
(function () {
  'use strict';

  var root = document.documentElement;
  var reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  var fine = window.matchMedia('(pointer: fine)').matches;
  var BASES = 'ATGC';
  var BASE_COL = { A: '#4fe3c1', T: '#5aa9ff', G: '#ffb547', C: '#ff7a66' };
  function still() { return reduceMQ.matches || root.classList.contains('motion-paused'); }
  function rnd(n) { return (Math.random() * n) | 0; }
  function randBase() { return BASES[rnd(4)]; }
  function randSeq(n) { var s = ''; for (var i = 0; i < n; i++) s += randBase(); return s; }

  /* ===================== the sequencing intro ===================== */
  var loader = document.getElementById('loader');
  function finishLoader() {
    root.classList.remove('is-loading');
    try { sessionStorage.setItem('yb-intro', '1'); } catch (e) {}
    window.dispatchEvent(new Event('yb:loaded'));
  }
  if (loader && root.classList.contains('is-loading')) {
    var reads = document.getElementById('loader-reads');
    var nameEl = document.getElementById('loader-name');
    var bar = document.getElementById('loader-bar');
    var pctEl = document.getElementById('loader-pct');
    var target = nameEl.textContent;

    // background: rows of reads drifting sideways
    var rows = Math.ceil(window.innerHeight / 26) + 1;
    var html = '';
    for (var r = 0; r < rows; r++) {
      var line = randSeq(140);
      var colored = '';
      for (var c = 0; c < line.length; c++) {
        colored += Math.random() < 0.05 ? '<b style="color:' + BASE_COL[line[c]] + '">' + line[c] + '</b>' : line[c];
      }
      html += '<p style="--d:' + (r % 2 ? -1 : 1) + ';--s:' + (14 + rnd(12)) + 's">' + colored + colored + '</p>';
    }
    reads.innerHTML = html;

    var t0 = performance.now();
    var MIN = 1500;
    var helixOk = false;
    var fontsOk = false;
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { fontsOk = true; });
    else fontsOk = true;
    var obs = new MutationObserver(function () {
      if (root.classList.contains('helix-ready') || root.classList.contains('no-webgl')) helixOk = true;
    });
    obs.observe(root, { attributes: true, attributeFilter: ['class'] });

    var shown = 0;
    (function tick(now) {
      var elapsed = now - t0;
      var ready = (helixOk && fontsOk) || elapsed > 3600;
      var goal = ready ? Math.min(1, elapsed / MIN) : Math.min(0.86, elapsed / (MIN * 1.6));
      shown += (goal - shown) * 0.14;
      if (ready && elapsed > MIN && shown > 0.995) shown = 1;
      var p = shown;
      bar.style.transform = 'scaleX(' + p.toFixed(4) + ')';
      pctEl.textContent = String(Math.round(p * 100)).padStart(3, '0');
      // the name resolves letter by letter as the reads come in
      var out = '';
      var solved = Math.floor(p * target.length * 1.05);
      for (var i = 0; i < target.length; i++) {
        var ch = target[i];
        if (ch === ' ') out += ' ';
        else if (i < solved) out += ch;
        else out += '<span style="color:' + BASE_COL[BASES[rnd(4)]] + '">' + randBase() + '</span>';
      }
      nameEl.innerHTML = out;
      if (p < 1) return requestAnimationFrame(tick);
      obs.disconnect();
      setTimeout(function () {
        loader.classList.add('is-out');
        setTimeout(finishLoader, 420); // the page starts entering while the strands part
        setTimeout(function () { loader.remove(); }, 1300);
      }, 260);
    })(t0);
  } else if (loader) {
    loader.remove();
  }

  /* ===================== DNA-decode headings ===================== */
  // Each letter of a heading arrives as a random base first, then settles. The real text stays in an
  // aria-label for screen readers, and the original markup comes back once it is done.
  function prepDecode(el) {
    var text = el.textContent;
    el.setAttribute('aria-label', text.trim());
    el.dataset.original = el.innerHTML;
    var words = text.split(/(\s+)/);
    var html = '';
    var idx = 0;
    words.forEach(function (w) {
      if (/^\s+$/.test(w)) { html += w; return; }
      if (!w) return;
      html += '<span class="dw" aria-hidden="true">';
      for (var i = 0; i < w.length; i++) {
        html += '<span class="dc is-hidden" data-i="' + idx++ + '" data-g="' + randBase() + '">' + w[i].replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</span>';
      }
      html += '</span>';
    });
    el.innerHTML = html;
    el.classList.add('is-decoding');
  }
  function runDecode(el) {
    var chars = el.querySelectorAll('.dc');
    var n = chars.length;
    var dur = Math.min(1300, 380 + n * 22);
    var start = performance.now();
    var lead = 7;
    (function step(now) {
      var p = Math.min(1, (now - start) / dur);
      var front = Math.floor(p * (n + lead));
      for (var i = 0; i < n; i++) {
        var c = chars[i];
        if (i < front - lead) {
          if (c.className !== 'dc is-done') c.className = 'dc is-done';
        } else if (i < front) {
          c.className = 'dc is-scramble';
          if (Math.random() < 0.5) {
            var b = randBase();
            c.setAttribute('data-g', b);
            c.style.setProperty('--g', BASE_COL[b]);
          }
        } else {
          c.className = 'dc is-hidden';
        }
      }
      if (p < 1) requestAnimationFrame(step);
      else {
        el.innerHTML = el.dataset.original;
        el.classList.remove('is-decoding');
        el.removeAttribute('aria-label');
      }
    })(start);
  }
  var decodeEls = Array.prototype.slice.call(document.querySelectorAll('[data-decode]'));
  if (decodeEls.length && 'IntersectionObserver' in window && !still()) {
    decodeEls.forEach(prepDecode);
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          io.unobserve(en.target);
          runDecode(en.target);
        }
      });
    }, { threshold: 0.35, rootMargin: '0px 0px -8% 0px' });
    decodeEls.forEach(function (el) { io.observe(el); });
    // if motion is paused while headings wait, show them as they are
    window.addEventListener('motionchange', function (e) {
      if (!e.detail || !e.detail.paused) return;
      decodeEls.forEach(function (el) {
        if (el.dataset.original && el.classList.contains('is-decoding')) {
          io.unobserve(el);
          el.innerHTML = el.dataset.original;
          el.classList.remove('is-decoding');
          el.removeAttribute('aria-label');
        }
      });
    });
  }

  /* ===================== the typed prompt ===================== */
  var typer = document.getElementById('typer');
  if (typer) {
    var words;
    try { words = JSON.parse(typer.getAttribute('data-words')); } catch (e) { words = [typer.textContent]; }
    var wi = 0;
    var ci = words[0].length;
    var deleting = false;
    var hold = 0;
    var last = 0;
    (function type(now) {
      requestAnimationFrame(type);
      if (still()) return;
      if (now - last < (deleting ? 28 : 62)) return;
      last = now;
      if (hold > 0) { hold--; return; }
      var w = words[wi];
      if (!deleting) {
        if (ci < w.length) { ci++; typer.textContent = w.slice(0, ci); }
        else { deleting = true; hold = 34; }
      } else {
        if (ci > 0) { ci--; typer.textContent = w.slice(0, ci); }
        else { deleting = false; wi = (wi + 1) % words.length; hold = 6; }
      }
    })(0);
  }

  /* ===================== marquee ===================== */
  var seqTrack = document.getElementById('marquee-seq');
  if (seqTrack) {
    var spike = 'ATGTTTGTTTTTCTTGTTTTATTGCCACTAGTCTCTAGTCAGTGTGTTAATCTTACAACCAGAACTCAATTA';
    var chunk = '';
    for (var k = 0; k < spike.length; k++) chunk += '<b class="b-' + spike[k] + '">' + spike[k] + '</b>';
    var piece = '<span class="seqline">5′ ' + chunk + ' 3′</span><i>✦</i>';
    seqTrack.innerHTML = piece + piece + piece + piece;
  }
  var tracks = Array.prototype.slice.call(document.querySelectorAll('.marquee__track'));
  var lastY = window.scrollY;
  var vel = 0;
  (function speed() {
    requestAnimationFrame(speed);
    var y = window.scrollY;
    vel += (Math.abs(y - lastY) - vel) * 0.1;
    lastY = y;
    var rate = 1 + Math.min(5, vel / 6);
    tracks.forEach(function (t) {
      var a = t.getAnimations ? t.getAnimations()[0] : null;
      if (a) a.playbackRate = rate;
    });
  })();

  /* ===================== counters ===================== */
  var counters = Array.prototype.slice.call(document.querySelectorAll('[data-count]'));
  if (counters.length && 'IntersectionObserver' in window && !still()) {
    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        cio.unobserve(en.target);
        var el = en.target;
        var to = parseFloat(el.getAttribute('data-count'));
        var from = parseFloat(el.getAttribute('data-from') || '0');
        var dec = parseInt(el.getAttribute('data-dec') || '0', 10);
        var t0 = performance.now();
        var dur = 1400;
        el.style.minWidth = el.offsetWidth + 'px';
        (function f(now) {
          var p = Math.min(1, (now - t0) / dur);
          var e = 1 - Math.pow(1 - p, 4);
          el.textContent = (from + (to - from) * e).toFixed(dec);
          if (p < 1) requestAnimationFrame(f);
          else el.textContent = to.toFixed(dec);
        })(t0);
      });
    }, { threshold: 0.6 });
    counters.forEach(function (c) { cio.observe(c); });
  }

  /* ===================== spotlight cards ===================== */
  var SPOT = '.card, .tgroup, .quote, .cert, .project, .panel, .lab, .wf__frame';
  document.querySelectorAll(SPOT).forEach(function (el) {
    var s = document.createElement('span');
    s.className = 'spot';
    s.setAttribute('aria-hidden', 'true');
    el.appendChild(s);
  });
  if (fine) {
    document.addEventListener('pointermove', function (e) {
      var el = e.target.closest && e.target.closest(SPOT);
      if (!el) return;
      var r = el.getBoundingClientRect();
      el.style.setProperty('--mx', (e.clientX - r.left).toFixed(0) + 'px');
      el.style.setProperty('--my', (e.clientY - r.top).toFixed(0) + 'px');
    }, { passive: true });
  }

  /* ===================== magnetic buttons ===================== */
  if (fine) {
    document.querySelectorAll('.btn').forEach(function (b) {
      b.addEventListener('pointermove', function (e) {
        if (still()) return;
        var r = b.getBoundingClientRect();
        var dx = e.clientX - (r.left + r.width / 2);
        var dy = e.clientY - (r.top + r.height / 2);
        b.style.translate = (dx * 0.18).toFixed(1) + 'px ' + (dy * 0.3).toFixed(1) + 'px';
      });
      b.addEventListener('pointerleave', function () { b.style.translate = ''; });
    });
  }

  /* ===================== cursor ring ===================== */
  var cursor = document.getElementById('cursor');
  var label = document.getElementById('cursor-label');
  if (cursor && fine && !reduceMQ.matches) {
    root.classList.add('has-cursor');
    var cx = -100, cy = -100, tx = -100, ty = -100, seen = false, overUI = false;
    document.addEventListener('pointermove', function (e) {
      tx = e.clientX; ty = e.clientY;
      if (!seen) { cx = tx; cy = ty; seen = true; cursor.classList.add('is-on'); }
      var t = e.target;
      overUI = !!(t.closest && t.closest('a, button, input, textarea, select, label, [role="button"]'));
      cursor.classList.toggle('is-link', overUI);
    }, { passive: true });
    document.documentElement.addEventListener('pointerleave', function () { cursor.classList.remove('is-on'); seen = false; });
    document.addEventListener('pointerdown', function () { cursor.classList.add('is-down'); });
    document.addEventListener('pointerup', function () { cursor.classList.remove('is-down'); });
    (function follow() {
      requestAnimationFrame(follow);
      cx += (tx - cx) * 0.22;
      cy += (ty - cy) * 0.22;
      cursor.style.transform = 'translate3d(' + cx.toFixed(1) + 'px,' + cy.toFixed(1) + 'px,0)';
      var h = window.__helix;
      var dna = !!(h && h.near && !overUI && Math.abs(tx - h.x) < h.width + 40);
      if (dna !== cursor.classList.contains('is-dna')) {
        cursor.classList.toggle('is-dna', dna);
        label.textContent = dna ? 'click' : '';
      }
    })();
  }
})();
