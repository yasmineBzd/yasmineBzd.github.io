"""Renders the video's overlay graphics as PNGs, in the site's own fonts and colours."""
import base64, json, os, sys
from playwright.sync_api import sync_playwright

OUT = sys.argv[1]


def avatar(px, ring=3):
    return MARK.format(s=px)


# on-screen text: one idea per scene, specific, no hype words (create-viral-content rules)
CAPTIONS = [
    ('01', 'intro', 'This website boots like a <em>DNA sequencer</em>.'),
    ('02', 'the helix', 'The helix is real <em>SARS-CoV-2</em> spike sequence.'),
    ('03', 'interactive', 'Touch it and base pairs break off as <em>code</em>.'),
    ('04', 'headings', 'Every heading decodes from <b class="A">A</b>, <b class="T">T</b>, <b class="G">G</b> and <b class="C">C</b>.'),
    ('05', 'process', 'The workflow: FASTA <i>→</i> alignment <i>→</i> tree <i>→</i> report.'),
    ('06', 'sequence lab', 'A DNA lab that runs in the page and <em>writes the Python</em>.'),
    ('07', 'credentials', 'Master in Genetics · thesis <em>18.5/20</em> · published 2022'),
    ('08', 'digital marketing', 'Also <em>digital marketing</em>: AI video, social pages and ad campaigns.'),
    ('09', 'services', 'Phylogenetics, epitope prediction and <em>research writing</em>.'),
]

HEAD = """<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400..700&family=Geist+Mono:wght@400..600&family=Instrument+Serif:ital@0;1&display=block">
<style>
:root{--bg:#05090b;--ink:#eaf4f1;--ink2:#bccdc8;--muted:#8aa29c;--a:#4fe3c1;--t:#5aa9ff;--g:#ffb547;--c:#ff7a66;}
*{box-sizing:border-box;margin:0;padding:0}
html,body{background:transparent;color:var(--ink);font-family:Geist,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
em{font-style:normal;background:linear-gradient(100deg,var(--a),#9ff3df 40%,var(--t));-webkit-background-clip:text;background-clip:text;color:transparent}
b.A{color:var(--a)} b.T{color:var(--t)} b.G{color:var(--g)} b.C{color:var(--c)} b{font-family:'Geist Mono',monospace;font-weight:600}
i{font-style:normal;color:var(--g)}
.tag{font-family:'Geist Mono',monospace;color:var(--a);display:inline-flex;align-items:center;gap:12px}
.tag::before{content:"";width:10px;height:10px;border-radius:50%;background:var(--a);box-shadow:0 0 14px var(--a)}
.tag span{color:var(--muted)}
.mark{display:inline-block}
.glow{position:absolute;border-radius:50%;filter:blur(90px)}
</style></head><body>"""

MARK = """<svg class="mark" viewBox="0 0 32 32" width="{s}" height="{s}"><path d="M10 3c0 7 12 7 12 13S10 22 10 29" fill="none" stroke="#4fe3c1" stroke-width="2.4" stroke-linecap="round"/><path d="M22 3c0 7-12 7-12 13s12 6 12 13" fill="none" stroke="#5aa9ff" stroke-width="2.4" stroke-linecap="round"/><path d="M12.5 8.5h7M12.5 23.5h7M14 16h4" stroke="#ffb547" stroke-width="2" stroke-linecap="round"/></svg>"""


def wide_caption(n, tag, text):
    return HEAD + f"""
<div style="position:fixed;inset:0;width:1920px;height:1080px">
  <div style="position:absolute;left:0;right:0;bottom:0;height:330px;background:linear-gradient(to bottom,rgba(5,9,11,0),rgba(5,9,11,.72) 55%,rgba(5,9,11,.9))"></div>
  <div style="position:absolute;left:0;right:0;bottom:64px;text-align:center">
    <p class="tag" style="font-size:22px;margin-bottom:14px">{n}<span>· {tag}</span></p>
    <p style="font-size:56px;font-weight:600;letter-spacing:-.03em;line-height:1.1;max-width:1600px;margin:0 auto;text-shadow:0 4px 30px rgba(0,0,0,.6)">{text}</p>
  </div>
</div></body></html>"""


def tall_caption(n, tag, text):
    return HEAD + f"""
<div style="position:fixed;inset:0;width:1080px;height:1920px">
  <div style="position:absolute;left:76px;right:76px;top:300px;height:400px;display:flex;flex-direction:column;justify-content:flex-end">
    <p class="tag" style="font-size:26px;margin-bottom:22px">{n}<span>· {tag}</span></p>
    <p style="font-size:78px;font-weight:600;letter-spacing:-.035em;line-height:1.04">{text}</p>
  </div>
</div></body></html>"""


def tall_bg():
    return HEAD.replace('background:transparent', 'background:#05090b') + f"""
<div style="position:fixed;inset:0;width:1080px;height:1920px;overflow:hidden;background:#05090b">
  <div class="glow" style="width:700px;height:700px;left:-260px;top:-200px;background:rgba(79,227,193,.16)"></div>
  <div class="glow" style="width:640px;height:640px;right:-260px;bottom:120px;background:rgba(90,169,255,.14)"></div>
  <div style="position:absolute;inset:0;background-image:linear-gradient(rgba(190,255,236,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(190,255,236,.035) 1px,transparent 1px);background-size:60px 60px"></div>
  <div style="position:absolute;left:76px;right:76px;top:110px;display:flex;align-items:center;gap:18px">
    {avatar(64, 2)}
    <div><p style="font-size:34px;font-weight:600;letter-spacing:-.01em;line-height:1.1">Yasmine Benzayed</p>
    <p style="font-size:22px;color:#8aa29c;margin-top:4px">Bioinformatician and geneticist</p></div>
    <p style="margin-left:auto;font-family:'Geist Mono',monospace;font-size:22px;color:#8aa29c">portfolio</p>
  </div>
  <div style="position:absolute;left:0;right:0;top:756px;height:612px;border-top:2px solid rgba(190,255,236,.18);border-bottom:2px solid rgba(190,255,236,.18);background:#000"></div>
  <div style="position:absolute;left:76px;right:76px;top:1470px">
    <p style="font-family:'Geist Mono',monospace;font-size:24px;color:#8aa29c;letter-spacing:.04em">bioinformatics · genetics · research writing</p>
    <p style="margin-top:26px;font-size:44px;font-weight:500;letter-spacing:-.02em;color:#bccdc8">Phylogenetics, haplotypes and epitope prediction for researchers and students.</p>
  </div>
  <div style="position:absolute;left:0;right:0;bottom:0;height:8px;background:linear-gradient(90deg,#4fe3c1,#5aa9ff,#ffb547,#ff7a66)"></div>
</div></body></html>"""


def end_card(w, h):
    big = 96 if w > h else 92
    return HEAD.replace('background:transparent', 'background:#05090b') + f"""
<div style="position:fixed;inset:0;width:{w}px;height:{h}px;overflow:hidden;background:#05090b;display:flex;align-items:center;justify-content:center;text-align:center">
  <div class="glow" style="width:820px;height:820px;left:-280px;top:-260px;background:rgba(79,227,193,.17)"></div>
  <div class="glow" style="width:760px;height:760px;right:-260px;bottom:-260px;background:rgba(90,169,255,.15)"></div>
  <div style="position:relative;padding:0 80px;display:flex;flex-direction:column;align-items:center">
    {avatar(170 if w > h else 230, 4)}
    <p style="margin-top:44px;font-size:{big}px;font-weight:600;letter-spacing:-.045em;line-height:1">Send Yasmine<br>your <em>sequences</em>.</p>
    <p style="margin-top:34px;font-size:{38 if w > h else 40}px;color:#bccdc8;letter-spacing:-.01em">Yasmine Benzayed · Bioinformatics and genetics analysis</p>
    <p style="margin:46px auto 0;display:inline-flex;align-items:center;gap:16px;padding:22px 38px;border-radius:999px;background:#4fe3c1;color:#03120e;font-family:'Geist Mono',monospace;font-size:{34 if w > h else 36}px;font-weight:600">bzdyasmine97@gmail.com</p>
    <p style="margin-top:34px;font-family:'Geist Mono',monospace;font-size:26px;color:#8aa29c">Upwork · Facebook · LinkedIn · GitHub</p>
  </div>
  <div style="position:absolute;left:0;right:0;bottom:0;height:8px;background:linear-gradient(90deg,#4fe3c1,#5aa9ff,#ffb547,#ff7a66)"></div>
</div></body></html>"""


with sync_playwright() as p:
    b = p.chromium.launch()
    def render(html, w, h, name, transparent=True):
        pg = b.new_page(viewport={'width': w, 'height': h}, device_scale_factor=1)
        pg.set_content(html, wait_until='networkidle')
        pg.evaluate('document.fonts.ready')
        pg.wait_for_timeout(300)
        pg.screenshot(path=os.path.join(OUT, name), omit_background=transparent, type='png')
        pg.close()

    for i, (n, tag, text) in enumerate(CAPTIONS):
        render(wide_caption(n, tag, text), 1920, 1080, f'cap{i}_wide.png')
        render(tall_caption(n, tag, text), 1080, 1920, f'cap{i}_tall.png')
    render(tall_bg(), 1080, 1920, 'tall_bg.png', transparent=False)
    render(end_card(1920, 1080), 1920, 1080, 'end_wide.png', transparent=False)
    render(end_card(1080, 1920), 1080, 1920, 'end_tall.png', transparent=False)
    b.close()
print('ok')
