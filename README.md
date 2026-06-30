# WFM — What If?

A single-file, browser-based **workforce-management what-if simulator** for service-desk and contact-centre planning. Model a roster, then ask questions like *"What if we add 2 hours of training per person this week — what happens to service level?"* and see the impact instantly.

**[▶ Launch the tool](https://obsidianttrpgproject.github.io/wfm-what-if/)**

Source: [github.com/ObsidianTTRPGProject/wfm-what-if](https://github.com/ObsidianTTRPGProject/wfm-what-if)

## What it does

- **Erlang C / Erlang A engine** — service level, ASA, occupancy, and required-agent calculations on a 15-minute interval grid.
- **Roster simulation** — build a schedule or import an existing one, then layer on diverted activities (training, meetings, 1:1s) and watch the SLA impact.
- **What-if scenarios** — training placement (individual, hard-block, cohort-split), full-day modes, multi-week averaging, and back-office WIP allocation.
- **Analysis views** — coverage vs. required charts, daily SLA breakdown, occupancy comparison, and per-day driver call-outs.
- **Themes** — Dark (default) and Light.

Everything runs client-side. No data leaves the browser; there is no backend.

## Usage

Open `index.html` in any modern browser, or use the hosted GitHub Pages link. Build or import a roster, adjust the scenario controls, and read the results panels.

## Hosting on GitHub Pages

This repo is ready to publish as-is:

1. Push the repo to GitHub.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to *Deploy from a branch*, choose your default branch (e.g. `main`) and the `/ (root)` folder, then **Save**.
4. After a minute the site is live at `https://obsidianttrpgproject.github.io/wfm-what-if/`, served from `index.html`.

The included `.nojekyll` file disables Jekyll processing so the static HTML is served verbatim.

## Project layout

```
index.html     The entire application (self-contained: HTML + CSS + JS)
LICENSE        MIT
.nojekyll      Tells GitHub Pages to skip Jekyll
.gitignore
```

## Author

JoshP

## License

[MIT](LICENSE)
