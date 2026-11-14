# Re-rendering the video

Needs Python with Playwright (and its Chromium) and ffmpeg. Serve the site on port 5517 first
(`python -m http.server 5517 --bind 127.0.0.1` from the site folder), then from this folder:

```bash
python capture.py frames            # 1365 frames of the live site on a virtual clock (~3.5 min)
python overlays.py ov ../../assets/img/avatar.webp   # captions, vertical background, end cards (with her photo)
python compose.py frames ov ..      # writes both MP4s into video/
python covers.py frames/f00290.jpg ..
python audio.py soundtrack_raw.wav  # music and effects, synthesized (~15 s)
```

Then master and add the sound (two-pass loudness to -14 LUFS, true peak -1.5 dB):

```bash
ffmpeg -i soundtrack_raw.wav -af loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json -f null -
# put the measured_* values from that output into the second pass:
ffmpeg -i soundtrack_raw.wav -af "loudnorm=I=-14:TP=-1.5:LRA=11:measured_I=..:measured_TP=..:measured_LRA=..:measured_thresh=..:offset=..:linear=true" soundtrack.wav
ffmpeg -i ../yasmine-portfolio-16x9.mp4 -i soundtrack.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -shortest out-16x9.mp4
```

`capture.py` holds the storyboard (scroll positions, pointer path, clicks, timings) and
`overlays.py` holds the on-screen text, and the timeline at the top of `audio.py` holds the sound
cues. Change the times in all three together.

## The portrait

`assets/img/portrait.webp`, `portrait-560.webp` and `avatar.webp` come from the client's photo
(`Client Data/portrait-original.webp`, not published). The cut-out was made with rembg
(`isnet-general-use` model, alpha matting on), then `portrait_enhance.py` cleaned the edge, set the
tone and colour, and added the soft mint and blue rim light. Her face is not retouched.
