# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
# Local development (requires Jekyll)
bundle exec jekyll serve

# Or without bundler
jekyll serve
```

Site will be available at `http://localhost:4000`

## Architecture

Jekyll-based course website for GitHub Pages.

- `_config.yml` - Site configuration (title, description, baseurl)
- `_layouts/default.html` - Base HTML template
- `index.md` - Syllabus and schedule (home page)
- `lectures.md` - Lecture materials page
- `assets/css/style.css` - Styling

## Deployment

Push to `main` branch of a GitHub repo. Enable GitHub Pages in repo settings (Settings > Pages > Source: main branch).

For project sites (username.github.io/repo-name), set `baseurl: "/repo-name"` in `_config.yml`.

## Semesters

Lecture and homework pages are per-semester. `_data/semesters.yml` lists the semesters (newest first); each such page declares `series` (`eloadasok`, `hazi1`, `hazi2`) and `semester` (an id from the data file) in its front matter. The layout builds the semester switcher and the nav links from these; the nav points to the newest semester that has the page.

To add a semester: add it to the top of `_data/semesters.yml`, then create its pages (e.g. `2027-tavasz/eloadasok.md` with `permalink: /2027-tavasz/eloadasok/`, `series: eloadasok`, `semester: 2027-tavasz`) and put its files next to them. The 2026 Tavasz pages stay at `/eloadasok/`, `/hazi1/`, `/hazi2/`.
