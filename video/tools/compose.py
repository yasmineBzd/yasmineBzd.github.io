"""Builds the two videos from the captured frames and the overlay PNGs.
Usage: python compose.py <frames_dir> <overlay_dir> <out_dir>"""
import os, subprocess, sys

FR, OV, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(OUT, exist_ok=True)
FPS = 30
TOTAL = 48.3
END_AT = 44.1
# caption windows (seconds), in the same order as overlays.py
CAPS = [(0.3, 3.2), (3.6, 7.0), (7.3, 10.3), (10.7, 13.5), (14.0, 24.6), (25.4, 33.0), (33.4, 37.2), (37.7, 40.6), (41.0, 43.9)]
FADE = 0.35
X264 = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', str(FPS), '-movflags', '+faststart', '-an']


def caption_chain(first_input, kind, base_label):
    inputs, filt = [], []
    prev = base_label
    for i, (a, b) in enumerate(CAPS):
        d = b - a
        inputs += ['-loop', '1', '-framerate', str(FPS), '-t', f'{d:.3f}', '-i', os.path.join(OV, f'cap{i}_{kind}.png')]
        k = first_input + i
        filt.append(f'[{k}:v]format=rgba,fade=t=in:st=0:d={FADE}:alpha=1,fade=t=out:st={d - FADE:.3f}:d={FADE}:alpha=1,setpts=PTS-STARTPTS+{a}/TB[c{i}]')
        filt.append(f'[{prev}][c{i}]overlay=0:0:eof_action=pass[v{i}]')
        prev = f'v{i}'
    k = first_input + len(CAPS)
    inputs += ['-loop', '1', '-framerate', str(FPS), '-t', f'{TOTAL - END_AT:.3f}', '-i', os.path.join(OV, f'end_{kind}.png')]
    filt.append(f'[{k}:v]format=rgba,fade=t=in:st=0:d=0.7:alpha=1,setpts=PTS-STARTPTS+{END_AT}/TB[ce]')
    filt.append(f'[{prev}][ce]overlay=0:0:eof_action=pass,fade=t=out:st={TOTAL - 0.5}:d=0.5,format=yuv420p[out]')
    return inputs, filt


def run(cmd):
    print(' '.join(cmd[:6]), '...', flush=True)
    subprocess.run(cmd, check=True)


frames = ['-framerate', str(FPS), '-i', os.path.join(FR, 'f%05d.jpg')]

# 16:9, 1920x1080
inp, filt = caption_chain(1, 'wide', '0:v')
run(['ffmpeg', '-v', 'error', '-y', *frames, *inp, '-filter_complex', ';'.join(filt), '-map', '[out]', '-t', str(TOTAL), *X264,
     os.path.join(OUT, 'yasmine-portfolio-16x9.mp4')])

# 9:16, 1080x1920: the site plays in the middle, captions above, name and role below
bg = ['-loop', '1', '-framerate', str(FPS), '-t', str(TOTAL), '-i', os.path.join(OV, 'tall_bg.png')]
inp, filt = caption_chain(2, 'tall', 'base')
pre = ['[1:v]scale=1080:608:flags=lanczos[site]', '[0:v][site]overlay=0:758:shortest=1[base]']
run(['ffmpeg', '-v', 'error', '-y', *bg, *frames, *inp, '-filter_complex', ';'.join(pre + filt), '-map', '[out]', '-t', str(TOTAL), *X264,
     os.path.join(OUT, 'yasmine-portfolio-9x16.mp4')])
print('ok')
