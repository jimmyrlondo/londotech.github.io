# londo.tech

Static website for **Londo Technologies LTD** — IT, VoIP, connectivity, and media
services for business, farm, and home in Trumbull County, Ohio.

Live at <https://www.londo.tech> · hosted on GitHub Pages (`main` branch, root).

## How it deploys

There is no build step. GitHub Pages serves the files in this repo exactly as
they are. **Any push to `main` goes live within a minute or two** at
www.londo.tech. The `CNAME` file pins the custom domain; don't delete it.

## Working locally

Requires Python 3 (already installed) for the preview server. From the repo root:

```sh
python -m http.server 8000
```

Then open <http://localhost:8000>. Stop with Ctrl+C. Edits are picked up on
browser refresh — no restart needed.

## Layout

| Path                | What it is                                              |
|---------------------|--------------------------------------------------------|
| `index.html`        | Homepage (Bootstrap 5 + Inter, all CSS inline)          |
| `support.html`      | Remote support portal                                   |
| `privacy.html`      | Privacy policy                                          |
| `resume/`           | Professional resume page                                |
| `robots.txt` / `sitemap.xml` | SEO — keep the sitemap in sync when public pages change |
| `invoice-app/`      | Standalone browser tool (localStorage), noindex         |
| `ozone/`            | Ozone gallery access form, noindex                      |
| `Quote/qis/`        | Quality Imaging Solutions quote generator, noindex      |
| `watson/`           | Watson clinical-forms app, noindex                      |

The `/invoice-app/`, `/ozone/`, `/Quote/`, and `/watson/` trees are disallowed in
`robots.txt` and are effectively private tools that happen to share this host.

## Making a change

```sh
git checkout -b short-description      # optional but recommended for anything non-trivial
# ...edit...
python -m http.server 8000            # eyeball it locally
git add -A && git commit -m "what changed and why"
git push -u origin HEAD               # then open a PR, or push straight to main for tiny fixes
```
