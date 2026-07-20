# ComputerRabbis Offline Torah Drive

A complete, **fully offline** Torah platform that runs from a USB drive or SD card with
**no installation and no internet** — ever. Copy one folder onto removable storage and it works
on any Windows or Mac computer.

It contains:

- **📚 A seforim library** — ~7,000 seforim (Tanach, Shas, Rambam, Shulchan Aruch, Mishnah Berurah,
  midrash, mussar, chassidus, shu"t and more), readable two ways:
  - a **no-install browser reader** (`Library-Web/`) — opens like a web page, no program to run.
    Includes full-text search across the entire library, type-a-reference jump-to (e.g. a masechta +
    daf, or a perek), a "Today's Learning" Daf Yomi shortcut, multi-tab research with split view,
    highlighting, and an embedded dictionary lookup on any selected word;
  - the optional **Otzaria** app (`Otzaria-Windows/`) for the same library as a native desktop app.
- **🕰️ A Jewish Calendar & Zmanim Toolkit** (`Zmanim/`) — zmanim for any location, Hebrew↔civil date
  conversion, holidays for any year, a yahrzeit calculator, printable luchos, and **.ics calendar
  export** — powered by `@hebcal/core` and `KosherZmanim`, entirely offline and valid in perpetuity.
- **📖 Offline dictionaries** (`Library-Web/dictionaries.html`) — unified lookup across **Jastrow**
  (Talmudic Aramaic & Hebrew), **BDB** (Biblical Hebrew & Aramaic), and the **Klein** etymological
  dictionary — ~34,000 entries, searchable with or without nikud.
- A branded **START-HERE** page and a **Sources & Dates** page documenting exactly what's inside and
  when it was captured.

## How this repo is organized

Git holds **code, not gigabytes**. The multi-GB texts are downloaded from upstream and built locally,
so the repo stays small and the platform stays fully reproducible.

| Path | In git? | What it is |
|------|:------:|------------|
| `usb-root/START-HERE.html`, `SOURCES-AND-DATES.html` | ✅ | Landing + provenance pages |
| `usb-root/Zmanim/` | ✅ | Calendar/zmanim toolkit + engines + city list |
| `usb-root/Library-Web/` (`index.html`, `reader.js`, `search-embed.js`, `dict-embed.js`, `fonts/`) | ✅ | Browser reader UI |
| `usb-root/licenses/` | ✅ | Third-party license texts |
| `build/`, `sources.json` | ✅ | Build scripts + machine-readable provenance |
| `usb-root/Library/`, `usb-root/Library-Web/books/`, `usb-root/Library-Web/search/`, `usb-root/Otzaria-Windows/` | ❌ (gitignored) | The big data — fetched/built |

## Building a complete drive

```powershell
git clone <this-repo>
cd offline-torah-drive
powershell -ExecutionPolicy Bypass -File build\fetch_sources.ps1
```

This downloads the Otzaria app + library and builds the browser-reader data into `usb-root\`.
Two more one-time build steps produce data that's also gitignored (regenerate after adding/changing books):

```powershell
python build\lexicon_build.py   # dictionaries (Jastrow/BDB/Klein) -> Library-Web/dictionaries/
python build\search_build.py    # full-text search index -> Library-Web/search/ (run last; can take ~an hour)
```

A third step, only needed when picking up a newer `@hebcal/core`/`@hebcal/learning` release, rebuilds the
Hebcal bundle (requires Node.js — this is the only build step that does):

```powershell
cd build\hebcal-bundle
npm install
npm run build   # -> Zmanim/hebcal.bundle.min.js (Daf/Rambam/Mishna Yomi, holidays, molad, etc.)
```

Then copy the **contents of `usb-root\`** to the root of a USB drive (exFAT; **32 GB recommended**).

## Distributing to end users

Because the assembled drive is ~8 GB, it exceeds GitHub's per-release limits, so the ready-to-copy
folder is **not** distributed through GitHub. Options for handing it to users:

1. **Self-build** — they clone + run `fetch_sources.ps1` (technical users only).
2. **Hosted download** — publish a pre-assembled `.zip` on ComputerRabbis infrastructure
   (Cloudflare R2 / the ComputerRabbis server / archive.org) and link it from computerrabbis.com.
3. **Physical drives** — the primary channel: hand out preloaded USB sticks.

Each release publishes a `checksums.txt` (SHA-256 of every file) so recipients can verify authenticity.

## Provenance & updates

See [`sources.json`](sources.json) and `usb-root/SOURCES-AND-DATES.html` for exact versions and snapshot
dates. The **calculations never expire**; only the **text snapshot** ages. Publish a new edition
periodically to refresh the texts.

## Licenses

Platform code by ComputerRabbis. Third-party components retain their own licenses (Otzaria: Unlicense;
KosherZmanim: LGPL-3.0; @hebcal/core: GPL-2.0; @hebcal/learning: BSD-2-Clause; texts: public-domain / CC-BY / CC-BY-SA / CC-BY-NC per
work). Full texts in `usb-root/licenses/`.

*Independent project — not affiliated with or endorsed by Sefaria, Dicta, Hebcal, or the Otzaria project.*
