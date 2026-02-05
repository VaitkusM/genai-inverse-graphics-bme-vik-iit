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
