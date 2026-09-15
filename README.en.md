# Amazon Keyword Rank Tracker (Chrome Extension)

Batch-check how your ASINs rank in Amazon search results — for many keywords at once, with organic vs sponsored position detection and one-click **Excel export**.

![Matrix](screenshots/03-matrix.png)

## Features

- **Batch lookup** — paste any number of keywords × any number of ASINs; the extension opens each keyword's search page in background tabs automatically
- **Sponsored detection** — ad placements are identified automatically; see both **total position** and **organic position**
- **21 marketplaces** — amazon.com / co.uk / de / fr / it / es / co.jp / ca / com.mx / com.au / in / com.br / nl / se / pl / com.tr / sg / ae / sa / eg / co.th
- **Multi-page scan** — optionally scan pages 1–3, with cross-page de-duplication (keeps the best/minimum rank)
- **Bot-detection friendly** — configurable delay between keywords; captcha pages are detected and reported per keyword
- **Views** — ASIN × keyword rank matrix (switch total/organic), full details (title, price, link, ad flag)
- **Export** — Excel (.xlsx: Rank Summary / Full Details / Not-Found sheets) or CSV, one click
- **Resilient** — job state persists locally; resumes automatically if the service worker is suspended; closing the popup doesn't stop the job

## Install (Developer mode)

1. Open `chrome://extensions`, enable **Developer mode** (top-right)
2. Click **Load unpacked** and select the `amazon-rank-tracker` folder (the one containing `manifest.json`)
3. The orange **A** icon appears in your toolbar

## Usage

1. Open any Amazon marketplace page (e.g. `https://www.amazon.com`, ideally logged in). The active marketplace becomes the query market.
2. Click the orange **A** icon:
   - **Keywords**: one per line
   - **ASINs**: one per line (10-character alphanumeric)
   - Optional: pages to scan, delay between keywords
3. Click **Start**. Search pages open in background tabs; progress is shown live.
4. Review results — **Rank Matrix** (rows = ASIN, columns = keyword, green = rank, orange badge = sponsored ad) or **Details**, switch between organic/total positions.
5. **Export Excel** or **CSV**.

## Export (xlsx) sheets

| Sheet | Content |
|---|---|
| Rank Summary | ASIN × keyword matrix; cell = rank number ("Not found" for missing ASINs; sponsored ads shown by total rank) |
| Full Details | Every product found per keyword: total rank, organic rank, ad flag, title, link; target ASINs not found are listed explicitly |
| Not Found | Which keyword × ASIN pairs didn't appear within the scanned pages |

## Project structure

```
amazon-rank-tracker/
├── manifest.json                  # MV3 manifest
├── background/service-worker.js   # job orchestration: tabs, merging, persistence, resume
├── content/search-extractor.js    # search-page parsing: data-asin ranks, ad detection
├── popup/                         # popup UI (popup.html / popup.css / popup.js)
├── vendor/xlsx.full.min.js        # SheetJS (bundled locally, offline Excel export)
├── icons/                         # extension icons
├── screenshots/                   # Chrome Web Store screenshots (1280×800)
├── demo/                          # standalone UI preview pages
├── store-listing.md               # ready-to-paste Chrome Web Store listing copy
├── privacy-policy.html            # privacy policy (host on GitHub Pages)
└── test/                          # jsdom unit tests (node test/run-tests.js)
```

## Development

```bash
node --check background/service-worker.js
node --check content/search-extractor.js
node --check popup/popup.js
cd test && npm install && npm test   # 22 unit cases
```

## Privacy

No data leaves your device. All processing is local. See [PRIVACY.md](./PRIVACY.md) / [privacy-policy.html](./privacy-policy.html).

## Disclaimer

A helper utility for sellers to review their own public listings. Follow Amazon's Terms of Service, keep query frequency reasonable, and use at your own risk.
