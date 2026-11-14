# Yasmine Benzayed · portfolio

A static one-page portfolio for Yasmine Benzayed, bioinformatician and geneticist.
Plain HTML, CSS and JavaScript, no build step. A 3D DNA double helix (three.js, vendored in
`assets/vendor`) runs behind the whole page; its base pairs break off and turn into lines of code.

```
index.html            the page
404.html              self-contained "page not found"
assets/css/style.css  all styles
assets/js/helix.js    the 3D helix (WebGL, ES module): hover unzips it, a click bursts it, a replication
                      wave runs down it, it zips shut after the intro, open pairs release code
assets/js/main.js     nav, menu, copy email, pause motion, scroll strand, peptide scan, no-WebGL fallback
assets/js/fx.js       sequencing intro, DNA-decode headings, typed prompt, marquee, counters,
                      spotlight cards, magnetic buttons, cursor ring
assets/js/workflow.js the "process" section: sticky window with FASTA, alignment, tree, report views
assets/js/lab.js      the sequence lab: GC, composition, molecular weight, reverse complement,
                      mRNA, translation, longest ORF, and the same steps written in Biopython
assets/vendor/        three.js r170 (MIT) and its bloom post-processing files
assets/img/           the portrait (cut-out, two sizes) and the round avatar
assets/icons/         brand and interface icons (CC0 / ISC, see icons-credits.json)
assets/share.jpg      1200x630 link preview image (the hero with her portrait)
```

## Preview locally

Any static server works. From this folder:

```bash
python -m http.server 5517
```

Then open http://localhost:5517. Opening `index.html` straight from the disk (file://) will not load
the helix, because browsers block ES modules there.

## Publish on GitHub Pages

1. Create a GitHub repository and push this folder to its `main` branch.
   `Client Data/` is listed in `.gitignore` and must stay out of the repository: it holds the
   client's private documents.
2. In the repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. The workflow in `.github/workflows/deploy.yml` publishes on every push to `main`. It copies only
   `index.html`, `404.html`, `robots.txt` and `assets/` into the site.

The site works both as a user site (`username.github.io`) and as a project site
(`username.github.io/repo/`), because every path in it is relative.

## Things to fill in

- **Social profiles.** In `index.html`, search for `data-social=`. Each of the five links
  (LinkedIn, Upwork, GitHub, Facebook, Instagram) points at the platform's home page for now.
  Replace each `href` with the real profile URL and delete its `data-pending` attribute.
- **Link previews.** Once the final address is known, make `og:image` in `index.html` an absolute
  URL (for example `https://username.github.io/assets/share.jpg`) and add
  `<meta property="og:url" content="https://username.github.io/">`. Some sites (LinkedIn, Facebook)
  ignore relative preview images.

## Content sources

All facts come from the client's documents: the Master certificate (Saad Dahlab University Blida 1,
Genetics, 2021), the two recommendation letters (Dr. Louiza Derouiche, Aug 2021; Ramdane Mohamed
Said, Feb 2021), the Saylor Academy certificates (BIO101, CS105), the substitute-teaching records
(2023) and the CV with the Upwork history. Phone number, home address, date of birth, marital status
and student ID numbers were deliberately left off the site.
