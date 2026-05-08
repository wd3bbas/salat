# Salat — Prayer Times in Your Terminal

A fast, offline-capable CLI tool that displays Islamic prayer times with Hijri date,
live countdown, weekly schedule, Qibla direction, and desktop notifications.

---

## Features

- **5 daily prayer times** with current and next prayer highlighted
- **Hijri calendar** date shown alongside the Gregorian date
- **Insha'allah** countdown to the next prayer
- **Daily caching** — responses cached per-day; repeated runs are instant and work offline
- **Desktop notifications** — alert N minutes before each prayer (designed for cron)
- **Weekly view** — 7-day prayer schedule at a glance
- **Qibla direction** — accurate compass bearing to Mecca via OpenStreetMap geocoding
- **Watch mode** — live display that refreshes every minute
- **Auto-detect location** via IP when city/country are not configured
- **Persistent config** — save defaults to `~/.config/salat/config.json`
- **23 calculation methods** — ISNA, MWL, Umm Al-Qura, Egyptian, Gulf, and more

---

## Installation

```bash
git clone https://github.com/wd3bbas/salat.git
cd salat
npm install
npm link          # makes `salat` available globally
```

---

## Configuration

Settings are resolved in this priority order:

**CLI flags → environment variables (`.env`) → config file → IP auto-detect**

### Option 1 — Save via CLI (recommended)

```bash
salat --country KSA --city Jeddah --save
# Writes to ~/.config/salat/config.json
```

### Option 2 — Edit `.env` in the project directory

```
COUNTRY=KSA
CITY=Jeddah
METHOD=8
```

### Option 3 — Pass flags per run

```bash
salat --country US --city "New York" --method 2
```

If no location is configured, the tool auto-detects your city and country via your IP address.

---

## Usage

```bash
salat                                    # today's prayer times (default)
salat --week                             # 7-day prayer schedule
salat --qibla                            # Qibla direction for your location
salat --watch                            # live countdown, refreshes every minute
salat --notify                           # notify if a prayer is within 5 minutes
salat --notify 10                        # notify 10 minutes before
salat --country US --city "New York"     # one-off for a different city
salat --country SA --city Mecca --save   # change and persist location
salat --method 2                         # use ISNA calculation method
salat --help                             # full usage
```

---

## Sample Output

### Default view — `salat`

```
 🕌  Jeddah, KSA — Prayer Times
 📆  Fri May 08 2026  |  21 Dhū al-Qaʿdah 1447 AH

 Current prayer:  Fajr — 04:20 (8 minutes ago)
 Next prayer:     Dhuhr — 12:19 (In 8 hours Insha'allah)

 ─────────────────────────────
  Fajr      04:20
  Dhuhr     12:19  ← In 8 hours Insha'allah
  Asr       15:38
  Maghrib   18:51
  Isha      20:21
 ─────────────────────────────
```

### Weekly view — `salat --week`

```
 🕌  Jeddah, KSA — Weekly Prayer Times

 ────────────────────────────────────────────────────────
  Date          Fajr   Dhuhr  Asr    Maghrib Isha
 ────────────────────────────────────────────────────────
  Fri May 08    04:20   12:19   15:38   18:51   20:21   ← today
  Sat May 09    04:20   12:19   15:38   18:52   20:22
  Sun May 10    04:19   12:19   15:38   18:52   20:22
  Mon May 11    04:18   12:19   15:38   18:53   20:23
  Tue May 12    04:18   12:19   15:37   18:53   20:23
  Wed May 13    04:17   12:19   15:37   18:53   20:23
  Thu May 14    04:16   12:19   15:37   18:54   20:24
 ────────────────────────────────────────────────────────
```

### Qibla direction — `salat --qibla`

```
 🕋  Qibla Direction — Jeddah, KSA

     Coordinates : 21.5504°, 39.1742°
     Bearing     : 101.8° (ESE)
```

### Watch mode — `salat --watch`

Same as the default view but the screen refreshes every minute with a live countdown.
Press `Ctrl+C` to exit.

---

## Desktop Notifications (cron setup)

Run `salat --notify` every minute via cron to receive a system notification before each prayer:

```bash
crontab -e
```

```cron
# Notify 5 minutes before each prayer (default)
* * * * * /usr/local/bin/salat --notify

# Or set a custom lead time (e.g. 10 minutes)
* * * * * /usr/local/bin/salat --notify 10
```

The notify mode is silent (no terminal output) — designed to run quietly in the background.

---

## Calculation Methods

| # | Method |
|---|--------|
| 2 | Islamic Society of North America (ISNA) |
| 3 | Muslim World League (MWL) |
| 4 | Umm Al-Qura University, Makkah |
| 5 | Egyptian General Authority of Survey |
| 8 | Gulf Region — **default** |
| 12 | Union des Organisations Islamiques de France |
| 15 | Diyanet İşleri Başkanlığı (Turkey) |

Full list: [aladhan.com/prayer-times-api](https://aladhan.com/prayer-times-api)

---

## Cache & Config Locations

| Path | Purpose |
|------|---------|
| `~/.cache/salat/` | Daily prayer time cache (auto-expires per date) |
| `~/.config/salat/config.json` | Saved defaults (written by `--save`) |

---

## Development

```bash
npm test       # run unit tests (Jest)
```

Tests cover `getCurrentPrayer`, `getNextPrayerTime`, `fromNow`, and `formatDate`
across 20 cases.
