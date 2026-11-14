"""Cover images: a real frame of the site plus a 4-word title (thumbnail checklist: few elements, high contrast).
Usage: python covers.py <frame.jpg> <out_dir>"""
import base64, os, sys
from playwright.sync_api import sync_playwright

frame, out = sys.argv[1], sys.argv[2]
src = 'data:image/jpeg;base64,' + base64.b64encode(open(frame, 'rb').read()).decode()

HEAD = """<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400..700&family=Geist+Mono:wght@400..600&display=block">
<style>*{margin:0;box-sizing:border-box}body{background:#05090b;color:#eaf4f1;font-family:Geist,sans-serif;-webkit-font-smoothing:antialiased}
em{font-style:normal;background:linear-gradient(100deg,#4fe3c1,#9ff3df 45%,#5aa9ff);-webkit-background-clip:text;background-clip:text;color:transparent}
.m{font-family:'Geist Mono',monospace}</style></head><body>"""

wide = HEAD + f"""
<div style="position:relative;width:1920px;height:1080px;overflow:hidden">
  <img src="{src}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transform:scale(1.18);transform-origin:78% 45%">
  <div style="position:absolute;inset:0;background:linear-gradient(90deg,rgba(5,9,11,1) 0%,rgba(5,9,11,.98) 44%,rgba(5,9,11,.35) 62%,rgba(5,9,11,0) 74%)"></div>
  <div style="position:absolute;left:110px;top:50%;transform:translateY(-50%)">
    <p class="m" style="font-size:30px;color:#4fe3c1">~/yasmine $ run portfolio</p>
    <p style="margin-top:28px;font-size:150px;font-weight:700;letter-spacing:-.055em;line-height:.92">DNA that<br><em>turns into<br>code</em></p>
    <p style="margin-top:36px;font-size:38px;color:#bccdc8">Yasmine Benzayed · geneticist</p>
  </div>
</div></body></html>"""

tall = HEAD + f"""
<div style="position:relative;width:1080px;height:1920px;overflow:hidden">
  <img src="{src}" style="position:absolute;top:600px;left:-1267px;height:1320px;width:auto">
  <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(5,9,11,1) 0%,rgba(5,9,11,.96) 34%,rgba(5,9,11,.25) 55%,rgba(5,9,11,0) 70%,rgba(5,9,11,.85) 100%)"></div>
  <div style="position:absolute;left:80px;right:80px;top:200px">
    <p class="m" style="font-size:32px;color:#4fe3c1">~/yasmine $ run portfolio</p>
    <p style="margin-top:30px;font-size:150px;font-weight:700;letter-spacing:-.055em;line-height:.92">DNA that<br><em>turns into<br>code</em></p>
  </div>
  <p style="position:absolute;left:80px;bottom:120px;font-size:42px;color:#eaf4f1;font-weight:600">Yasmine Benzayed</p>
  <p class="m" style="position:absolute;left:80px;bottom:76px;font-size:26px;color:#8aa29c">bioinformatics · genetics</p>
</div></body></html>"""

with sync_playwright() as p:
    b = p.chromium.launch()
    for html, w, h, name in ((wide, 1920, 1080, 'cover-16x9.jpg'), (tall, 1080, 1920, 'cover-9x16.jpg')):
        pg = b.new_page(viewport={'width': w, 'height': h})
        pg.set_content(html, wait_until='networkidle')
        pg.evaluate('document.fonts.ready')
        pg.wait_for_timeout(300)
        pg.screenshot(path=os.path.join(out, name), type='jpeg', quality=92)
        pg.close()
    b.close()
print('ok')
