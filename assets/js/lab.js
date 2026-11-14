/* Sequence lab: DNA checks computed in the page, and the same steps written in Python (Biopython). */
(function () {
  'use strict';

  var app = document.getElementById('lab-app');
  if (!app) return;
  var root = document.documentElement;
  var reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
  function still() { return reduceMQ.matches || root.classList.contains('motion-paused'); }

  var $ = function (id) { return document.getElementById(id); };
  var input = $('lab-seq');
  var err = $('lab-err');
  var status = $('lab-status');

  var PRESETS = {
    // SARS-CoV-2 spike (S) gene, nt 1-72 of the coding sequence (MN908947.3): MFVFLVLLPLVSSQCVNLTTRTQL
    spike: '>MN908947.3 SARS-CoV-2 spike gene, nt 1-72\nATGTTTGTTTTTCTTGTTTTATTGCCACTAGTCTCTAGTCAGTGTGTTAATCTTACAACCAGAACTCAATTA',
    gattaca: 'GATTACA',
  };

  /* standard genetic code */
  var CODE = {};
  (function () {
    var b = 'TCAG';
    var aa = 'FFLLSSSSYY**CC*WLLLLPPPPHHQQRRRRIIIMTTTTNNKKSSRRVVVVAAAADDEEGGGG';
    var n = 0;
    for (var i = 0; i < 4; i++) for (var j = 0; j < 4; j++) for (var k = 0; k < 4; k++) CODE[b[i] + b[j] + b[k]] = aa[n++];
  })();
  var SENSE = Object.keys(CODE).filter(function (c) { return CODE[c] !== '*' && c !== 'ATG'; });

  function randomGene() {
    var n = 22 + ((Math.random() * 14) | 0);
    var s = 'ATG';
    for (var i = 0; i < n; i++) s += SENSE[(Math.random() * SENSE.length) | 0];
    s += ['TAA', 'TAG', 'TGA'][(Math.random() * 3) | 0];
    return '>random_gene ' + (s.length) + ' nt, ATG to stop\n' + s;
  }

  /* ---------- parsing ---------- */
  function parse(raw) {
    var lines = raw.split(/\r?\n/);
    var header = '';
    var body = '';
    lines.forEach(function (l) {
      if (/^\s*>/.test(l)) { if (!header) header = l.trim().slice(1).trim(); }
      else body += l;
    });
    body = body.replace(/[\s\d]/g, '').toUpperCase().replace(/U/g, 'T');
    var bad = body.replace(/[ACGTN]/g, '');
    return { header: header, seq: body, bad: bad };
  }

  /* ---------- biology ---------- */
  var COMP = { A: 'T', T: 'A', G: 'C', C: 'G', N: 'N' };
  function revcomp(s) { var o = ''; for (var i = s.length - 1; i >= 0; i--) o += COMP[s[i]]; return o; }
  function translate(s, frame) {
    var o = '';
    for (var i = frame || 0; i + 3 <= s.length; i += 3) o += CODE[s.substr(i, 3)] || 'X';
    return o;
  }
  function longestOrf(s) {
    var best = null;
    for (var f = 0; f < 3; f++) {
      for (var i = f; i + 3 <= s.length; i += 3) {
        if (s.substr(i, 3) !== 'ATG') continue;
        for (var j = i; j + 3 <= s.length; j += 3) {
          if (CODE[s.substr(j, 3)] === '*') {
            var len = j + 3 - i;
            if (!best || len > best.len) best = { start: i, end: j + 3, len: len, frame: f + 1 };
            break;
          }
        }
      }
    }
    return best;
  }
  function stats(s) {
    var c = { A: 0, T: 0, G: 0, C: 0, N: 0 };
    for (var i = 0; i < s.length; i++) c[s[i]]++;
    var acgt = c.A + c.T + c.G + c.C;
    var gc = acgt ? ((c.G + c.C) / acgt) * 100 : 0;
    // anhydrous molecular weight of a single-stranded oligo (OligoCalc formula)
    var mw = acgt ? c.A * 313.21 + c.T * 304.2 + c.C * 289.18 + c.G * 329.21 - 61.96 : 0;
    return { c: c, acgt: acgt, gc: gc, mw: mw };
  }

  /* ---------- rendering ---------- */
  var AA_CLASS = function (a) {
    if (a === '*') return 'aa-stop';
    if ('AVLIMFWC'.indexOf(a) > -1) return 'aa-h';
    if ('KRH'.indexOf(a) > -1) return 'aa-p';
    if ('DE'.indexOf(a) > -1) return 'aa-n';
    return 'aa-o';
  };
  function esc(t) { return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function colorSeq(s, max) {
    var o = '';
    var n = Math.min(s.length, max);
    for (var i = 0; i < n; i++) o += '<b class="b-' + s[i] + '">' + s[i] + '</b>';
    if (s.length > max) o += '<span class="more">… ' + (s.length - max).toLocaleString('en') + ' more</span>';
    return o;
  }

  function countTo(el, to, dec, instant) {
    var from = parseFloat(el.textContent.replace(/,/g, '')) || 0;
    if (instant || still() || from === to) { el.textContent = fmt(to, dec); return; }
    var t0 = performance.now();
    (function f(now) {
      var p = Math.min(1, (now - t0) / 650);
      var e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(from + (to - from) * e, dec);
      if (p < 1) requestAnimationFrame(f);
    })(t0);
  }
  function fmt(v, dec) { return v.toLocaleString('en', { minimumFractionDigits: dec, maximumFractionDigits: dec }); }

  /* ---------- python ---------- */
  function pyString(seq) {
    if (!seq) return '    ""';
    var lines = [];
    var shown = seq.slice(0, 240);
    for (var i = 0; i < shown.length; i += 60) lines.push('    "' + shown.slice(i, i + 60) + '"');
    if (seq.length > 240) lines.push('    # … ' + (seq.length - 240).toLocaleString('en') + ' more nt');
    return lines.join('\n');
  }
  function trunc(s, n) { return s.length > n ? s.slice(0, n) + '…' : s; }
  function pyCode(p, st, rc, prot) {
    var seq = p.seq;
    var partial = seq.length % 3 ? '  # last ' + (seq.length % 3) + ' nt are not a full codon' : '';
    return [
      '# analysis.py · the same steps in Python',
      'from Bio.Seq import Seq',
      'from Bio.SeqUtils import gc_fraction',
      '',
      'seq = Seq(',
      pyString(seq),
      ')',
      '',
      'print(len(seq))                          # ' + seq.length,
      'print(round(gc_fraction(seq) * 100, 1))  # ' + st.gc.toFixed(1),
      'print(seq.reverse_complement())          # ' + trunc(rc, 24),
      'print(seq.transcribe())                  # ' + trunc(seq.replace(/T/g, 'U'), 24),
      'print(seq.translate())                   # ' + trunc(prot, 24) + partial,
    ].join('\n');
  }
  function highlight(code) {
    return code.split('\n').map(function (line) {
      var hash = line.indexOf('#');
      var codePart = hash > -1 ? line.slice(0, hash) : line;
      var comment = hash > -1 ? line.slice(hash) : '';
      var h = esc(codePart)
        .replace(/("[^"]*")/g, '<span class="t-str">$1</span>')
        .replace(/\b(from|import|print|round|len)\b/g, function (m) {
          return /from|import/.test(m) ? '<span class="t-kw">' + m + '</span>' : '<span class="t-fn">' + m + '</span>';
        })
        .replace(/\b(\d+(?:\.\d+)?)\b(?![^<]*<\/span>)/g, '<span class="t-num">$1</span>')
        .replace(/\.(reverse_complement|transcribe|translate)\b/g, '.<span class="t-fn">$1</span>')
        .replace(/\b(Seq|gc_fraction)\b/g, '<span class="t-cls">$1</span>');
      return '<span class="ln">' + h + (comment ? '<span class="t-com">' + esc(comment) + '</span>' : '') + '</span>';
    }).join('\n');
  }

  /* ---------- run ---------- */
  var lastCode = '';
  var runTimer = null;
  function run(animate) {
    var p = parse(input.value);
    if (p.bad) {
      var uniq = Array.from(new Set(p.bad.split(''))).slice(0, 6).join(', ');
      err.textContent = 'Use the letters A, C, G and T (N for unknown). Found: ' + uniq + '.';
      input.setAttribute('aria-invalid', 'true');
      status.textContent = 'error';
      status.className = 'lab__status is-err';
      return;
    }
    err.textContent = '';
    input.removeAttribute('aria-invalid');
    if (p.seq.length > 20000) p.seq = p.seq.slice(0, 20000);

    var s = p.seq;
    var st = stats(s);
    var rc = revcomp(s);
    var prot = translate(s, 0);
    var orf = longestOrf(s);

    countTo($('lab-len'), s.length, 0, !animate);
    countTo($('lab-gc'), st.gc, 1, !animate);
    countTo($('lab-mw'), st.mw, 1, !animate);
    $('lab-gcbar').style.transform = 'scaleX(' + (st.gc / 100).toFixed(4) + ')';
    $('lab-orf').textContent = orf ? orf.len + ' nt, ' + (orf.len / 3 - 1) + ' aa · frame +' + orf.frame + ' · ' + (orf.start + 1) + '–' + orf.end : 'none (no ATG … stop)';

    var comp = '';
    ['A', 'T', 'G', 'C'].forEach(function (b) {
      var pct = st.acgt ? (st.c[b] / st.acgt) * 100 : 0;
      comp += '<div class="cbar"><span class="cbar__b b-' + b + '">' + b + '</span><span class="cbar__track"><i class="cbar__fill fill-' + b + '" style="transform:scaleX(' + (pct / 100).toFixed(4) + ')"></i></span><span class="cbar__n">' + st.c[b] + ' · ' + pct.toFixed(1) + '%</span></div>';
    });
    $('lab-comp').innerHTML = comp;

    $('lab-rc').innerHTML = s ? colorSeq(rc, 180) : '<span class="more">—</span>';
    $('lab-rna').innerHTML = s ? colorSeq(s.replace(/T/g, 'U'), 180).replace(/b-U/g, 'b-T') : '<span class="more">—</span>';
    var ph = '';
    for (var i = 0; i < Math.min(prot.length, 120); i++) ph += '<b class="' + AA_CLASS(prot[i]) + '">' + prot[i] + '</b>';
    if (prot.length > 120) ph += '<span class="more">… ' + (prot.length - 120) + ' more</span>';
    $('lab-prot').innerHTML = ph || '<span class="more">' + (s.length && s.length < 3 ? 'needs at least one codon' : '—') + '</span>';

    var ch = '';
    for (var k = 0; k + 3 <= s.length && k < 120; k += 3) {
      var cod = s.substr(k, 3);
      var a = CODE[cod] || 'X';
      ch += '<span class="codon' + (cod === 'ATG' ? ' is-start' : '') + (a === '*' ? ' is-stop' : '') + '" style="--i:' + k / 3 + '"><span class="codon__n">' + colorSeq(cod, 3) + '</span><span class="codon__a ' + AA_CLASS(a) + '">' + (a === '*' ? 'stop' : a) + '</span></span>';
    }
    var codonEl = $('lab-codons');
    codonEl.innerHTML = ch;
    codonEl.classList.toggle('is-play', !!animate && !still());

    var code = pyCode(p, st, rc, prot);
    lastCode = code;
    var pre = $('lab-py');
    clearInterval(runTimer);
    if (animate && !still()) {
      // type the script out line by line, like a run
      var lines = highlight(code).split('\n');
      var n = 0;
      status.textContent = 'running';
      status.className = 'lab__status is-run';
      pre.innerHTML = '';
      runTimer = setInterval(function () {
        n++;
        pre.innerHTML = lines.slice(0, n).join('\n') + (n < lines.length ? '\n<span class="cursor-block"></span>' : '');
        if (n >= lines.length) {
          clearInterval(runTimer);
          status.textContent = 'done · ' + s.length + ' nt';
          status.className = 'lab__status is-ok';
        }
      }, 55);
    } else {
      pre.innerHTML = highlight(code);
      status.textContent = s.length ? 'done · ' + s.length + ' nt' : 'ready';
      status.className = 'lab__status' + (s.length ? ' is-ok' : '');
    }
  }

  var debounce = null;
  input.addEventListener('input', function () {
    clearTimeout(debounce);
    debounce = setTimeout(function () { run(false); }, 180);
  });

  app.querySelectorAll('[data-preset]').forEach(function (b) {
    b.addEventListener('click', function () {
      var k = b.getAttribute('data-preset');
      input.value = k === 'random' ? randomGene() : k === 'clear' ? '' : PRESETS[k];
      run(k !== 'clear');
      if (k === 'clear') input.focus();
    });
  });

  $('lab-copy').addEventListener('click', function () {
    var btn = this;
    var done = function () {
      btn.textContent = 'Code copied';
      setTimeout(function () { btn.textContent = 'Copy code'; }, 1800);
    };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(lastCode).then(done, function () {});
    else {
      var ta = document.createElement('textarea');
      ta.value = lastCode;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); done(); } catch (e) {}
      ta.remove();
    }
  });

  // start with the spike example, and run it with the typing effect the first time it is seen
  input.value = PRESETS.spike;
  run(false);
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) {
        io.disconnect();
        run(true);
      }
    }, { threshold: 0.35 });
    io.observe(app);
  }
})();
