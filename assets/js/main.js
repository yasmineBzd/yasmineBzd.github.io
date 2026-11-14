/* Page behaviour: nav, menu, copy email, motion toggle, readout, peptide scan, helix fallback. */
(function () {
  'use strict';

  var root = document.documentElement;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  function isPaused() { return reduce.matches || root.classList.contains('motion-paused'); }

  /* ---------- nav: solid on scroll, current section ---------- */
  var nav = document.getElementById('nav');
  function onScrollNav() { nav.classList.toggle('nav--solid', window.scrollY > 24); }
  onScrollNav();
  window.addEventListener('scroll', onScrollNav, { passive: true });

  var links = Array.prototype.slice.call(document.querySelectorAll('.nav__links a'));
  var sections = Array.prototype.slice.call(document.querySelectorAll('main section[id]'));

  /* ---------- menu ---------- */
  var toggle = document.getElementById('menu-toggle');
  var menu = document.getElementById('menu');
  function setMenu(open) {
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close the menu' : 'Open the menu');
    menu.hidden = !open;
    document.body.style.overflow = open ? 'hidden' : '';
    if (open) nav.classList.add('nav--solid'); else onScrollNav();
  }
  toggle.addEventListener('click', function () { setMenu(toggle.getAttribute('aria-expanded') !== 'true'); });
  menu.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !menu.hidden) { setMenu(false); toggle.focus(); }
  });
  window.addEventListener('resize', function () { if (window.innerWidth > 1020 && !menu.hidden) setMenu(false); });

  /* ---------- copy the email address ---------- */
  var status = document.getElementById('copy-status');
  document.querySelectorAll('[data-copy]').forEach(function (btn) {
    var label = btn.querySelector('span');
    var original = label ? label.textContent : '';
    btn.addEventListener('click', function () {
      var text = btn.getAttribute('data-copy');
      var done = function () {
        btn.classList.add('is-done');
        if (label) label.textContent = 'Address copied';
        if (status) status.textContent = 'Email address copied to the clipboard';
        setTimeout(function () {
          btn.classList.remove('is-done');
          if (label) label.textContent = original;
          if (status) status.textContent = '';
        }, 2200);
      };
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(done, function () { legacyCopy(text) && done(); });
      } else if (legacyCopy(text)) {
        done();
      }
    });
  });
  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', '');
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  /* ---------- year ---------- */
  var year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());

  /* ---------- pause motion ---------- */
  var motionBtn = document.getElementById('motion-toggle');
  function syncMotionBtn() {
    var p = root.classList.contains('motion-paused');
    motionBtn.setAttribute('aria-pressed', String(p));
    motionBtn.textContent = p ? 'Play motion' : 'Pause motion';
  }
  if (motionBtn) {
    syncMotionBtn();
    motionBtn.addEventListener('click', function () {
      var p = !root.classList.contains('motion-paused');
      root.classList.toggle('motion-paused', p);
      try { localStorage.setItem('yb-motion', p ? 'paused' : 'playing'); } catch (e) {}
      syncMotionBtn();
      window.dispatchEvent(new CustomEvent('motionchange', { detail: { paused: isPaused() } }));
    });
  }

  /* ---------- readout + active nav link ---------- */
  var bar = document.getElementById('readout-bar');
  var sec = document.getElementById('readout-sec');
  var readout = document.querySelector('.readout');
  var names = { top: 'top', services: 'services', research: 'research', toolkit: 'toolkit', experience: 'experience', letters: 'letters', courses: 'courses', contact: 'contact' };
  var lastId = '';
  var ticking = false;
  function updateReadout() {
    ticking = false;
    var max = document.documentElement.scrollHeight - window.innerHeight;
    var p = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    if (bar) bar.style.transform = 'scaleY(' + p.toFixed(4) + ')';
    if (readout) readout.classList.toggle('is-on', window.scrollY > window.innerHeight * 0.4);

    var mid = window.innerHeight * 0.45;
    var current = sections[0];
    for (var i = 0; i < sections.length; i++) {
      if (sections[i].getBoundingClientRect().top <= mid) current = sections[i];
    }
    var id = current ? current.id : 'top';
    if (id !== lastId) {
      lastId = id;
      var idx = sections.indexOf(current);
      if (sec) sec.textContent = String(idx).padStart(2, '0') + ' · ' + (names[id] || id);
      links.forEach(function (a) {
        if (a.getAttribute('href') === '#' + id) a.setAttribute('aria-current', 'true');
        else a.removeAttribute('aria-current');
      });
    }
  }
  function requestReadout() { if (!ticking) { ticking = true; requestAnimationFrame(updateReadout); } }
  window.addEventListener('scroll', requestReadout, { passive: true });
  window.addEventListener('resize', requestReadout);
  updateReadout();

  /* ---------- peptide: a 9-residue window scanning HPV16 E6 ---------- */
  var pep = document.getElementById('peptide');
  if (pep) {
    var seq = pep.getAttribute('data-seq') || '';
    var cls = function (r) {
      if ('AVLIMFWC'.indexOf(r) > -1) return 'r-h';
      if ('KRH'.indexOf(r) > -1) return 'r-p';
      if ('DE'.indexOf(r) > -1) return 'r-n';
      return 'r-o';
    };
    var cells = [];
    var frag = document.createDocumentFragment();
    for (var i = 0; i < seq.length; i++) {
      var s = document.createElement('span');
      s.textContent = seq[i];
      s.className = cls(seq[i]);
      cells.push(s);
      frag.appendChild(s);
    }
    var pos = document.createElement('p');
    pos.className = 'peptide__pos';
    pos.innerHTML = '<span>E6 · residues 1–' + seq.length + '</span><span id="pep-win">9-mer 1–9</span>';
    frag.appendChild(pos);
    pep.appendChild(frag);
    var win = pos.querySelector('#pep-win');

    var W = 9, start = 0, timer = null;
    function paint() {
      for (var j = 0; j < cells.length; j++) {
        var on = j >= start && j < start + W;
        cells[j].classList.toggle('on', on);
        cells[j].classList.toggle('on-first', j === start);
      }
      win.textContent = '9-mer ' + (start + 1) + '–' + (start + W);
    }
    function step() {
      start = (start + 1) % (cells.length - W + 1);
      paint();
    }
    function run() {
      clearInterval(timer);
      timer = null;
      if (!isPaused()) timer = setInterval(step, 420);
    }
    paint();
    // only animate while it is on screen
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) run(); else { clearInterval(timer); timer = null; }
        });
      }).observe(pep);
    } else {
      run();
    }
    window.addEventListener('motionchange', run);
  }

  /* ---------- helix fallback: a still drawing, shown until (or instead of) WebGL ---------- */
  var fb = document.getElementById('helix-fallback');
  setTimeout(function () { root.classList.add('helix-slow'); }, 2500);
  if (fb) {
    var w = 300, h = 1200, R = 92, turns = 7, steps = 420;
    var a = '', b = '', rungs = '';
    var colors = ['#4fe3c1', '#5aa9ff', '#ffb547', '#ff7a66'];
    for (var k = 0; k <= steps; k++) {
      var y = (k / steps) * h;
      var th = (k / steps) * turns * Math.PI * 2;
      var xa = w / 2 + R * Math.sin(th);
      var xb = w / 2 + R * Math.sin(th + 2.45);
      a += (k ? 'L' : 'M') + xa.toFixed(1) + ' ' + y.toFixed(1);
      b += (k ? 'L' : 'M') + xb.toFixed(1) + ' ' + y.toFixed(1);
      if (k % 6 === 3) {
        var c = colors[(k / 6) % 4 | 0];
        rungs += '<line x1="' + xa.toFixed(1) + '" y1="' + y.toFixed(1) + '" x2="' + xb.toFixed(1) + '" y2="' + y.toFixed(1) + '" stroke="' + c + '" stroke-opacity=".55" stroke-width="3" stroke-linecap="round"/>';
      }
    }
    fb.innerHTML =
      '<svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">' +
      rungs +
      '<path d="' + a + '" fill="none" stroke="#4fe3c1" stroke-width="5" stroke-linecap="round" opacity=".85"/>' +
      '<path d="' + b + '" fill="none" stroke="#5aa9ff" stroke-width="5" stroke-linecap="round" opacity=".7"/>' +
      '</svg>';
  }
})();
