# Custom email crawler on node.js

A small **Node.js** toolkit that bulk‑scans websites, grabs every reachable e‑mail address and writes a CSV. It is built around **[Crawlee](https://crawlee.dev)**.

Current repo layout:

| File             | Purpose                                                                                                   |
| ---------------- |-----------------------------------------------------------------------------------------------------------|
| **`crawler.js`** | Core scraper: recursive CheerioCrawler, MX‑check, host vs third‑party separation. Exports `crawlUrl(url)` |
| **`index.js`**   | Entry script reads `in.csv`, tests HTTPS & MX, calls `crawlUrl`, streams results to `out.csv`             |
| **`config.js`**  | Central tweak‑point (e.g. `MAX_CONCURRENCY`)                                                              |
| **`README.md`**  | You are here                                                                                              |

## 1. Installation

```bash
npm install
```

## 2. Input file (`in.csv`)

Single‑line entries separated by a semicolon**`;`**:

```csv
"Name of company website";https://www.example.com/
```

Duplicate lines are allowed; `index.js` de‑duplicates domains internally so each site is crawled once.

## 3. Running the batch

```bash
node index.js            # processes in.csv  →  out.csv
```

Flow inside **`index.js`**:

1. Opens **`./in.csv`**
2. For each domain:

    * checks if port 443 is open (HTTPS reachable).
    * verifies presence of MX records.
    * if HTTPS → calls `crawlUrl()` to grab emails.
3. Streams a UTF‑8‑BOM CSV to **`./out.csv`** with five columns:

   | # | Header (es)            | Meaning                                     |
      | - |------------------------|---------------------------------------------|
   | 1 | *Nombre de la empresa* | Original name from column 1                 |
   | 2 | *URL de la web*        | Domain                                      |
   | 3 | *Accesible*            | `true/false` – port 443 reachable           |
   | 4 | *Emails de contacto*   | List of host‑domain addresses joined by `,` |
   | 5 | *Emails de terceros*   | External emails (gmail, outlook…)           |

When the stream closes you’ll see **“Done”** in the console.

## 4. Configuration (`config.js`)

```js
export const config = {
  MAX_CONCURRENCY: 20,   // pages fetched in parallel by crawler.js
};
```

The value is imported inside `crawler.js` to set `maxConcurrency`. Tweak as your bandwidth / CPU allow.

## 5. Scraper internals (`crawler.js`)

* **Crawler type:** `CheerioCrawler` (static HTML).
  Change to `PlaywrightCrawler` when you need JavaScript rendering.
* `respectRobotsTxtFile` is currently **`true`** — set to `false` if you must ignore `robots.txt`.
* **MX caching:** results kept in `workingDomains : Map` to avoid redundant DNS lookups.
* **Email regex:** `/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi` – matches plain‑text & `mailto:`.
* After crawl, addresses split into:

    * **Host** → domain == siteHost *or* subdomain of it.
    * **Third‑party** → everything else.

`crawlUrl(url)` → returns `[hostEmails, thirdPartyEmails]`.

```js
import { crawlUrl } from './crawler.js';
const [host, ext] = await crawlUrl('https://example.com');
```

## 6. License

MIT © 2025 — Use responsibly.
