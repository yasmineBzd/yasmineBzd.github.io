/* The process section: a sticky window whose view follows the step being read.
   Views are drawn here: FASTA reads, an alignment that slides into place, a tree that draws itself. */
(function () {
  'use strict';

  var wf = document.getElementById('wf');
  if (!wf) return;
  var root = document.documentElement;
  var reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  function still() { return reduceMQ.matches || root.classList.contains('motion-paused'); }

  // 36 nt of the spike gene, then seven variants with a few substitutions and gaps.
  // Illustrative only: they show what an alignment looks like, not a result.
  var REF = 'ATGTTTGTTTTTCTTGTTTTATTGCCACTAGTCTCT';
  var NAMES = ['sample_01', 'sample_02', 'sample_03', 'sample_04', 'sample_05', 'sample_06', 'sample_07', 'sample_08'];
  var EDITS = [
    [],
    [[7, 'C']],
    [[7, 'C'], [22, 'A']],
    [[13, 'A']],
    [[13, 'A'], [29, 'G']],
    [[22, 'A'], [30, '-'], [31, '-'], [32, '-']],
    [[7, 'C'], [18, 'C']],
    [[13, 'A'], [29, 'G'], [33, 'T']],
  ];
  var rowsSeq = EDITS.map(function (ed) {
    var a = REF.split('');
    ed.forEach(function (e) { a[e[0]] = e[1]; });
    return a.join('');
  });
  var variable = {};
  for (var col = 0; col < REF.length; col++) {
    for (var r = 1; r < rowsSeq.length; r++) if (rowsSeq[r][col] !== REF[col]) variable[col] = true;
  }

  /* ---- view 0: FASTA ---- */
  var fasta = document.getElementById('wf-fasta');
  var fh = '';
  rowsSeq.slice(0, 6).forEach(function (s, i) {
    var raw = s.replace(/-/g, '');
    fh += '<p class="fasta__h" style="--i:' + i * 2 + '">&gt;' + NAMES[i] + ' spike gene, partial</p>';
    fh += '<p class="fasta__s" style="--i:' + (i * 2 + 1) + '">' + colorize(raw) + '</p>';
  });
  fasta.innerHTML = fh;

  function colorize(s) {
    var o = '';
    for (var i = 0; i < s.length; i++) o += '<b class="b-' + (s[i] === '-' ? 'gap' : s[i]) + '">' + s[i] + '</b>';
    return o;
  }

  /* ---- view 1: alignment ---- */
  var aln = document.getElementById('wf-aln');
  var ah = '<div class="aln__ruler"><span></span>';
  for (var c2 = 0; c2 < REF.length; c2++) ah += '<i class="' + (variable[c2] ? 'v' : '') + '">' + ((c2 + 1) % 10 === 0 ? c2 + 1 : '') + '</i>';
  ah += '</div>';
  rowsSeq.forEach(function (s, i) {
    var shift = [0, 3, -2, 5, -4, 2, -3, 4][i];
    ah += '<div class="aln__row" style="--shift:' + shift + ';--i:' + i + '"><span class="aln__name">' + NAMES[i] + '</span><div class="aln__cells">';
    for (var j = 0; j < s.length; j++) {
      var diff = i > 0 && s[j] !== REF[j];
      ah += '<b class="b-' + (s[j] === '-' ? 'gap' : s[j]) + (variable[j] ? ' v' : '') + (diff ? ' d' : '') + '">' + (i > 0 && !diff ? '·' : s[j]) + '</b>';
    }
    ah += '</div></div>';
  });
  aln.innerHTML = ah;

  /* ---- view 2: tree (rectangular cladogram, tips match the alignment rows) ---- */
  var tree = document.getElementById('wf-tree');
  // tips are drawn in tree order so each clade sits together
  var POS = { 0: 0, 1: 1, 2: 2, 6: 3, 3: 4, 4: 5, 7: 6, 5: 7 };
  var tipY = function (i) { return 26 + POS[i] * 35; };
  var nA = (tipY(1) + tipY(2)) / 2; // node joining samples 2 and 3 (C at site 8)
  var cA = (nA + tipY(6)) / 2; // with sample 7
  var nB = (tipY(4) + tipY(7)) / 2; // samples 5 and 8 (A at 14, G at 30)
  var cB = (tipY(3) + nB) / 2; // with sample 4
  var paths = [
    'M210 ' + tipY(1) + 'H300', 'M210 ' + tipY(2) + 'H300', 'M210 ' + tipY(1) + 'V' + tipY(2),
    'M150 ' + nA + 'H210', 'M150 ' + tipY(6) + 'H300', 'M150 ' + nA + 'V' + tipY(6),
    'M210 ' + tipY(4) + 'H300', 'M210 ' + tipY(7) + 'H300', 'M210 ' + tipY(4) + 'V' + tipY(7),
    'M150 ' + nB + 'H210', 'M150 ' + tipY(3) + 'H300', 'M150 ' + tipY(3) + 'V' + nB,
    'M90 ' + cA + 'H150', 'M90 ' + cB + 'H150',
    'M90 ' + tipY(0) + 'H300', 'M90 ' + tipY(5) + 'H300', 'M90 ' + tipY(0) + 'V' + tipY(5),
    'M20 ' + (tipY(0) + tipY(5)) / 2 + 'H90',
  ];
  var cols = ['#4fe3c1', '#5aa9ff', '#5aa9ff', '#ffb547', '#ffb547', '#ff7a66', '#5aa9ff', '#ffb547'];
  var th = '';
  paths.forEach(function (d, i) { th += '<path class="wtree__b" d="' + d + '" style="--i:' + i + '"/>'; });
  NAMES.forEach(function (n, i) {
    th += '<circle class="wtree__tip" cx="300" cy="' + tipY(i) + '" r="5" style="--c:' + cols[i] + ';--i:' + i + '"/>';
    th += '<text class="wtree__lab" x="312" y="' + (tipY(i) + 4) + '" style="--i:' + i + '">' + n + '</text>';
  });
  th += '<path class="wtree__scale" d="M20 290H80"/><text class="wtree__lab wtree__lab--s" x="86" y="293">0.01</text>';
  tree.innerHTML = th;

  /* ---- step tracking ---- */
  var steps = Array.prototype.slice.call(wf.querySelectorAll('.wf__step'));
  var views = Array.prototype.slice.call(wf.querySelectorAll('.wf__view'));
  var title = document.getElementById('wf-title');
  var num = document.getElementById('wf-n');
  var bar = document.getElementById('wf-bar');
  var active = -1;

  function setStep(i) {
    if (i === active) return;
    active = i;
    steps.forEach(function (s, k) { s.classList.toggle('is-on', k === i); });
    views.forEach(function (v, k) {
      v.classList.toggle('is-on', k === i);
      // replay the view's entrance each time it comes back
      if (k === i && !still()) {
        v.classList.remove('is-play');
        void v.offsetWidth;
        v.classList.add('is-play');
      } else if (k === i) {
        v.classList.add('is-play');
      }
    });
    title.textContent = steps[i].getAttribute('data-title');
    num.textContent = '0' + (i + 1) + ' / 04';
  }

  function update() {
    var mid = window.innerHeight * 0.55;
    var best = 0;
    for (var i = 0; i < steps.length; i++) {
      if (steps[i].getBoundingClientRect().top < mid) best = i;
    }
    setStep(best);
    var r = wf.getBoundingClientRect();
    var total = r.height - window.innerHeight * 0.6;
    var p = Math.min(1, Math.max(0, (window.innerHeight * 0.4 - r.top) / Math.max(1, total)));
    bar.style.transform = 'scaleX(' + p.toFixed(4) + ')';
  }
  var ticking = false;
  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; requestAnimationFrame(function () { ticking = false; update(); }); }
  }, { passive: true });
  window.addEventListener('resize', update);
  update();
})();
