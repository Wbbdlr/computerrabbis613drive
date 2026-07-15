# Tester's Guide — Computer Rabbis Offline Torah Drive

Thank you for helping test the drive before it goes out to the community. The whole point of this
product is that it works **with no internet, no installation, and no updates — forever** — so the most
valuable thing you can do is try to break that promise.

## Before you start

1. Copy the **contents of the `usb-root/` folder** onto a USB stick (exFAT, 32 GB recommended).
2. **Pull the network** — unplug ethernet and turn off Wi‑Fi. Everything below must work with the
   computer fully offline. If anything tries to reach the internet, that's a bug — write it down.
3. Test on more than one computer if you can (different Windows versions; a Mac if available).

## What to check

### 1. START-HERE page
- [ ] Double-clicking `START-HERE.html` opens it in the default browser.
- [ ] The Computer Rabbis logo and wordmark show correctly.
- [ ] All three sections are present: **Library**, **Zmanim & Luach**, **Dictionaries**.
- [ ] Every "Open the…" button leads to the right page.

### 2. Library — browser reader
- [ ] Opens from START-HERE with no program to install.
- [ ] The category tree is in **proper Torah order** (e.g. Tanach → Torah → Bereishis, Shemos,
      Vayikra, Bamidbar, Devarim — **not** alphabetical). Flag anything out of order.
- [ ] Open a Chumash (e.g. Bereishis) — Hebrew renders right‑to‑left and readable.
- [ ] For a sefer **with English** (e.g. Berakhos, Bereishis) the עברית / Both / English toggle works.
- [ ] Title search finds a sefer by name (try a few in Hebrew).
- [ ] "Find in this sefer" highlights matches inside an open book.
- [ ] **Contents / תוכן** button jumps to sections.
- [ ] **Settings** (top right): change background (Light / Sepia / Dark), font, size, and nikud on/off —
      each visibly changes the text.
- [ ] Highlight a passage, add a note, then reopen the sefer — the highlight and note are still there.
- [ ] Pin a sefer; it appears on the **Home** view. "Recently viewed" fills in as you read.
- [ ] The sidebar collapses and reopens (button **and** the little arrow on its edge).
- [ ] **Export your data** downloads a file; **Import** on another computer restores your notes,
      highlights, and pins. *(This is how a person's markings follow the drive between computers.)*

### 3. Dictionaries
- [ ] Opens from START-HERE or the reader header.
- [ ] All four sources listed with counts (Jastrow, BDB, BDB Aramaic, Klein).
- [ ] Type a Hebrew/Aramaic word (try **אב**, **חכם**, **שבת**) — results appear as you type.
- [ ] Search works **with and without nikud**.
- [ ] Clicking a result shows the full entry with its dictionary named as the source.
- [ ] The per-dictionary filter buttons ("Jastrow", "BDB"…) narrow the search.

### 4. Zmanim & Luach toolkit
- [ ] Opens offline.
- [ ] Pick your city from the list (or a few different cities) — zmanim update.
- [ ] Spot-check a couple of times against a luach you trust (sunrise/sunset, candle lighting).
- [ ] Walk each tab: **Zmanim, Date Converter, Holidays, Yahrzeit, Daily Learning, Sefiras HaOmer,
      Molad, Shiurim, Gematria** — each produces sensible output.
- [ ] Try a **future year** and a **past year** — dates and holidays still compute.
- [ ] **Print** a zmanim/luach page — it lays out cleanly.
- [ ] **Export .ics** and open it in a calendar app — events look right.

### 5. Otzaria app (optional full-text search)
- [ ] `Otzaria-Windows/otzaria.exe` launches (note if antivirus/SmartScreen interferes — **record the
      exact message**).
- [ ] If it asks for the library folder, point it at the `Library` folder on the drive.
- [ ] A full-text search across all seforim returns results.

## How to report

For each issue, please note:
- **Which computer / OS** (e.g. "Windows 10, Dell laptop").
- **Where** — page and what you clicked.
- **What happened** vs. what you expected.
- A **screenshot** if you can.
- Especially: **anything that needed the internet**, any **antivirus warning**, or any **Hebrew that
  rendered wrong**.

Send findings back to the Computer Rabbis team. Yasher koach!
