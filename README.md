# TableTrade

Marketing site for **TableTrade** — *Trade here, now.*

A product of **Central Alberta Technologies**. Lead Developer **Matt Sumegi**.

This repo is the public marketing site only. It is **not** the web app.

| Page | Path |
| --- | --- |
| Home | `/` |
| About | `/about/` |

The About page uses `media/matt-sumegi.jpg` (Matt’s smiling headshot).

| | URL |
| --- | --- |
| **Marketing site (this repo)** | https://msumegi.github.io/tabletrade/ |
| **About** | https://msumegi.github.io/tabletrade/about/ |
| **App (separate repo)** | https://msumegi.github.io/tableping/ |

Pokémon and Pokémon card art belong to their owners. TableTrade is an unofficial fan tool.

## GitHub Pages

Static files live at the repo root (`index.html`). A GitHub Actions workflow deploys on every push to `main`.

If the live site 404s after the first deploy:

1. Repo **Settings → Pages**
2. **Build and deployment → Source:** GitHub Actions
   (or **Deploy from a branch** → `main` → `/ (root)`)
3. Wait for **Deploy GitHub Pages** to finish
4. Open https://msumegi.github.io/tabletrade/

The address bar should say **tabletrade**, not tableping.
