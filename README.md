# Aaron in the Kitchen - readable text, Metric / US and recipe videos

Complete static HTML/CSS/JavaScript website with all 43 recipes from the supplied
export. No framework, account, dependency installation or build step is needed.
Photos remain local placeholders. No font binaries are included; the original
optional Google Fonts setting is retained, with system-font fallbacks.

## Install this update

Replace the previous website folder with the contents of this one, keeping a
backup first. This is NOT a CSS-only update: it changes the 43 recipe HTML files,
the shared stylesheet, and adds `assets/js/recipe-tools.js` and
`assets/js/recipe-videos.js`. Retain your existing `assets/js/config.js` if you have
already configured the contact form or changed the font preference.

The navigation and ordinary pages still work by opening `index.html` directly.
For reliable YouTube embeds, serve the folder over HTTP/HTTPS rather than file://.
For example, from this folder, with Python installed:

```sh
python -m http.server 8000
```

Then open `http://localhost:8000`. On Windows, `py -m http.server 8000` is an
alternative when the Python launcher is installed. An existing web host, GitHub
Pages or your editor's local web server can also serve these static files.

## Text size

Recipe body text is now 20 px on desktop, 19 px on tablet and 18 px on phones,
with comfortable line spacing and a modestly wider reading column. The script
headings, white/tan palette and overall design have not been replaced.

## Measurements

Metric is the default. The selector above the ingredients switches all annotated
measurements in that recipe, including the instructions, oven temperatures and
pan dimensions. It remembers the preference in that browser. A URL ending in
`?units=metric` or `?units=us` selects that system for the page.

The print button prints the current system. Switching does not reset checked-off
ingredients. Without JavaScript, the metric recipe remains complete and readable.
Conversion assumptions, supported ingredient densities, source conflicts and
rounding rules are documented in `MEASUREMENTS.md` and on the affected recipe pages.

## Recipe videos - what is and is not restored

19 recipe pages have a primary YouTube ID recovered from the actual timestamp
links in the supplied export. Their click-to-load native YouTube players use the
privacy-enhanced youtube-nocookie.com host. No video or thumbnail request is made
before a visitor clicks Play. Matching timestamp links in the instructions seek
the same embedded video; links to other recipes remain ordinary external links.

24 recipe pages still lack their original primary video URL. The earlier browser
export replaced video players with generic placeholders and did not retain those
IDs. No unrelated videos or invented IDs have been substituted. Those pages show
an honest missing-video notice and a link to the original recipe.

The source links were recovered from the upload, NOT verified by playing each
video live. Availability and permission to embed are controlled by YouTube and
the video owner. A Watch on YouTube fallback link remains available. Local file://
previews may be rejected by YouTube because they lack an HTTP referrer.

### Recover the remaining video links without re-exporting the whole site

Open `tools/restore-videos.html`. Drag the **Collect recipe videos** bookmark to
your bookmarks bar. Open the original Aaron in the Kitchen website, activate the
bookmark and start its scan. It reads the recipe pages on that same website and
collects embedded video IDs; it does not upload anything or submit forms.

After the scan, download `recipe-videos.js` and replace
`assets/js/recipe-videos.js` with that file. The existing recipe pages will pick up
the recovered IDs automatically. The utility also lets you paste video URLs
manually. It preserves the 19 previously known IDs when no better source is found.
The utility has local fixture tests, not a verified live-site scan; browser or
site restrictions can still prevent discovery. Keep and review its report.

You can also edit the mapping file by hand. Each recipe slug has an 11-character
YouTube video ID or `null`. For example, a watch URL whose `v=` parameter is
`IyBHs4ApmGQ` supplies the ID for Blueberry Cobbler. Only use the recipe's own
primary video, not a related frosting or crust video.

## Preserved features

Home, About, Contact, category indexes, searchable recipe directory, site map,
responsive navigation, ingredient checklists and print layout are retained. The
Contact form still requires a configured endpoint to send; preview validation is
not email delivery. The /welcome and /ols/products routes remain home redirects,
reflecting what was actually present in the export rather than inventing a shop.

## Audit files

`_build/measurement-audit.json`: conversion inputs, outputs, assumptions and
source notes; also lists three explicitly documented food-safety corrections in
two recipes. No claim is made that the recipes have been kitchen-tested.

`_build/video-audit.json`: known and missing primary video IDs, with source URLs.

`_build/qa-report.json`: current-version automated checks and limitations.
The environment blocks browser navigation, so layout and interaction checks
rendered the actual HTML/CSS/JS in memory, with external requests blocked and
local storage mocked. This is not live YouTube playback verification.

When editing an annotated quantity manually, update its displayed metric text
and both `data-metric` / `data-us` attributes so the two versions stay in sync.

`_build/previous/`: older-version checks retained as history, not current QA.
