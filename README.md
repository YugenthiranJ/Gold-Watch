# Gold Watch – local-first mobile PWA

A personal gold-price dashboard starter. It runs as a static website and stores data in the current browser using localStorage.

## Included
- Previous settlement vs latest CME quote comparison
- Indicative 24K / 22K / 18K INR-per-gram calculations
- Local price history and chart
- Custom threshold alerts checked when the app is open/refreshed
- CSV import/export
- PWA manifest and service worker for install/offline shell

## Important data limitation
This starter does **not** automatically fetch CME or FX quotes. Enter verified prices manually or import a CSV. Do not scrape CME or embed private API credentials in browser JavaScript. Before automatic integration, select a market-data provider whose API terms permit the intended use.

The app uses:
`theoretical 24K INR/g = CME USD/oz × USD/INR ÷ 31.1034768`
Then it purity-adjusts to 22K and 18K. This is not an official Indian retail quote. Import costs, applicable duties, domestic premium/discount, taxes, jewellery wastage and making charges are not fully modelled.

## Run locally
1. Extract the ZIP.
2. Open a terminal in the `GoldWatch` folder.
3. Run `python -m http.server 8000`
4. Open `http://localhost:8000` in your browser.

For PWA install/service-worker support, use localhost or deploy the static files to an HTTPS static host such as GitHub Pages. A plain `file://` open may not enable PWA features.

## Android phone
For phone access, publish the static files to an HTTPS static host, then open its URL in Chrome and choose **Add to Home screen** / **Install app**. This starter does not require a backend or cloud database. Each browser/device has its own local data; export CSV to back it up.

## CSV import format
The importer expects a header row followed by:
`date,cme_usd_per_oz,usd_inr`
Example:
`2026-11-20,4050.00,89.50`

For previous-day comparison, include a row for each trading day. Enter the previous settlement's actual trading date separately (for example, Friday's settlement when today's quote is Monday).
