"""Frame-by-frame capture of the portfolio on a virtual clock.

Every frame: move the scripted camera (scroll) and pointer, advance the page's clock by exactly
1/FPS (timers, requestAnimationFrame, CSS animations and transitions), then take a screenshot.
Usage: python capture.py <out_dir> [max_seconds]
"""
import math, os, sys, time
from playwright.sync_api import sync_playwright

OUT = sys.argv[1]
LIMIT = float(sys.argv[2]) if len(sys.argv) > 2 else 1e9
URL = 'http://127.0.0.1:5517/?capture=1'
FPS = 30
VW, VH, DSF = 1440, 810, 4 / 3  # -> 1920x1080 frames
DURATION = 48.3

INIT = r"""
window.__capture = true;
(() => {
  let vt = 0;
  const d0 = Date.now();
  performance.now = () => vt;
  Date.now = () => d0 + vt;
  let rafId = 0, rafQ = new Map();
  window.requestAnimationFrame = (cb) => { const id = ++rafId; rafQ.set(id, cb); return id; };
  window.cancelAnimationFrame = (id) => { rafQ.delete(id); };
  let tid = 0; const timers = new Map();
  window.setTimeout = (fn, ms, ...a) => { const id = ++tid; timers.set(id, { fn, at: vt + Math.max(0, +ms || 0), a }); return id; };
  window.clearTimeout = (id) => { timers.delete(id); };
  window.setInterval = (fn, ms, ...a) => { const e = Math.max(1, +ms || 0); const id = ++tid; timers.set(id, { fn, at: vt + e, every: e, a }); return id; };
  window.clearInterval = (id) => { timers.delete(id); };
  window.__step = (dt) => {
    const target = vt + dt;
    for (let guard = 0; guard < 500; guard++) {
      let best = null, bid = null;
      for (const [id, t] of timers) if (t.at <= target && (!best || t.at < best.at)) { best = t; bid = id; }
      if (!best) break;
      vt = Math.max(vt, best.at);
      if (best.every) best.at += best.every; else timers.delete(bid);
      try { typeof best.fn === 'function' ? best.fn(...best.a) : (0, eval)(best.fn); } catch (e) { console.error(e); }
    }
    vt = target;
    for (const an of document.getAnimations()) {
      if (an.__ct === undefined) { an.__ct = 0; try { an.pause(); } catch (e) {} }
      else an.__ct += dt * (an.playbackRate || 1);
      try { an.currentTime = an.__ct; } catch (e) {}
    }
    const q = rafQ; rafQ = new Map();
    for (const cb of q.values()) { try { cb(vt); } catch (e) { console.error(e); } }
    return vt;
  };
})();
"""

HIDE_CSS = """
html { scroll-behavior: auto !important; }
.hero__hint, .scroll-cue { display: none !important; }
::-webkit-scrollbar { display: none; }
html { scrollbar-width: none; }
"""


def ease(t):  # ease-in-out cubic
    return 4 * t * t * t if t < 0.5 else 1 - (-2 * t + 2) ** 3 / 2


def track(keys, t):
    """keys: [(time, value)], eased between neighbours, value may be a tuple."""
    if t <= keys[0][0]:
        return keys[0][1]
    for (t0, v0), (t1, v1) in zip(keys, keys[1:]):
        if t <= t1:
            u = ease((t - t0) / (t1 - t0)) if t1 > t0 else 1
            if isinstance(v0, tuple):
                return tuple(a + (b - a) * u for a, b in zip(v0, v1))
            return v0 + (v1 - v0) * u
    return keys[-1][1]


def main():
    os.makedirs(OUT, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--hide-scrollbars'])
        ctx = browser.new_context(viewport={'width': VW, 'height': VH}, device_scale_factor=DSF, color_scheme='dark',
                                  permissions=['clipboard-read', 'clipboard-write'])
        ctx.add_init_script(INIT)
        page = ctx.new_page()
        page.on('console', lambda m: m.type == 'error' and print('[page error]', m.text, flush=True))
        page.on('pageerror', lambda e: print('[page exception]', e, flush=True))
        page.goto(URL, wait_until='networkidle')
        page.add_style_tag(content=HIDE_CSS)
        page.evaluate('document.fonts.ready')
        page.wait_for_timeout(600)

        # layout anchors (scroll positions), measured once
        A = page.evaluate("""() => {
          const top = (sel) => document.querySelector(sel).getBoundingClientRect().top + scrollY;
          const H = innerHeight;
          const steps = [...document.querySelectorAll('.wf__step')].map(s => { const r = s.getBoundingClientRect(); return r.top + scrollY + r.height / 2 - H * 0.5; });
          return { H, services: top('#services'), steps, lab: top('#lab-app') - 96, letters: top('#letters'), marketing: top('#marketing') - 40, toolkit: top('#toolkit'),
                   contact: top('#contact'), max: document.documentElement.scrollHeight - H };
        }""")
        print('anchors', A, flush=True)
        H = A['H']
        lab = A['lab']

        scroll_keys = [
            (0, 0), (9.8, 0), (11.4, A['services']), (13.2, A['services']),
            (14.4, A['steps'][0]), (16.2, A['steps'][0]),
            (17.0, A['steps'][1]), (19.0, A['steps'][1]),
            (19.8, A['steps'][2]), (22.0, A['steps'][2]),
            (22.8, A['steps'][3]), (24.6, A['steps'][3]),
            (26.0, lab), (30.6, lab), (31.6, lab + 330), (33.0, lab + 330),
            (36.0, A['letters']), (37.0, A['letters']),
            (37.9, A['marketing']), (39.9, A['marketing']),
            (41.0, min(A['contact'], A['max'])), (DURATION, min(A['contact'], A['max'])),
        ]

        frames = int(DURATION * FPS)
        dt = 1000 / FPS
        helix_x = None
        mouse_keys = None
        clicks = {}
        btn = copy = email = None
        t_start = time.time()
        for f in range(frames):
            t = f / FPS
            if t > LIMIT:
                break
            y = track(scroll_keys, t)
            page.evaluate(f'window.scrollTo(0, {y:.2f})')

            # pointer script, built once the hero helix has settled
            if mouse_keys is None and t >= 4.0:
                hx = page.evaluate('window.__helix ? window.__helix.x : innerWidth * 0.75')
                pk = [(hx + 30, 250), (hx - 10, 420), (hx + 20, 600), (hx, 430)]
                mouse_keys = [
                    (0, (VW - 6, 300)), (4.4, (VW - 6, 300)), (5.2, pk[0]), (6.3, pk[1]), (7.3, pk[2]), (8.2, pk[1]),
                    (8.9, pk[0]), (9.4, pk[2]), (10.2, (pk[2][0] - 40, pk[2][1] + 40)), (11.6, (430, 560)), (13.0, (520, 640)),
                    (14.2, (VW * 0.62, 420)), (24.8, (VW * 0.62, 420)),
                ]
                clicks = {round(8.6 * FPS): pk[1], round(9.5 * FPS): pk[2]}

            # lab and contact targets are measured when the page is there
            if t >= 26.2 and btn is None:
                b = page.locator('[data-preset="random"]').bounding_box()
                btn = (b['x'] + b['width'] / 2, b['y'] + b['height'] / 2)
                mouse_keys += [(26.4, (VW * 0.62, 420)), (27.4, btn), (28.2, btn), (29.6, (VW * 0.7, 520)), (33.0, (VW * 0.72, 600))]
                clicks[round(27.7 * FPS)] = btn
            if t >= 41.1 and copy is None:
                e = page.locator('.email__addr').bounding_box()
                c = page.locator('.email__copy').bounding_box()
                email = (e['x'] + e['width'] * 0.6, e['y'] + e['height'] / 2)
                copy = (c['x'] + c['width'] / 2, c['y'] + c['height'] / 2)
                mouse_keys += [(41.2, (VW * 0.72, 600)), (41.8, email), (42.4, email), (43.0, copy), (DURATION, (copy[0] + 40, copy[1] + 120))]
                clicks[round(43.2 * FPS)] = copy

            if mouse_keys is not None:
                mx, my = track(mouse_keys, t)
                page.mouse.move(mx, my)
                if f in clicks:
                    cx, cy = clicks[f]
                    page.mouse.move(cx, cy)
                    page.mouse.down()
                    page.mouse.up()

            page.evaluate(f'window.__step({dt})')
            page.screenshot(path=os.path.join(OUT, f'f{f:05d}.jpg'), type='jpeg', quality=93)
            if f % 60 == 0:
                el = time.time() - t_start
                print(f'frame {f}/{frames}  t={t:.1f}s  elapsed {el:.0f}s', flush=True)
        browser.close()
        print('done', flush=True)


if __name__ == '__main__':
    main()
