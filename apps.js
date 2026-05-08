#!/usr/bin/env node
const fs = require("fs");
const axios = require("axios");
const chalk = require("chalk");
const notifier = require("node-notifier");
const { program } = require("commander");
require("dotenv").config({ path: __dirname + "/.env" });

const {
  formatDate,
  fromNow,
  todayAt,
  tomorrowAt,
  parseTime,
  getCurrentPrayer,
  getNextPrayerTime,
  parseOffsets,
  applyOffsets,
  makeProgressBar,
  getIpInfo,
  readCache,
  writeCache,
  readConfig,
  writeConfig,
  getConfigPath,
} = require("./func.js");

const config = readConfig();

program
  .name("salah")
  .description("Display Islamic prayer times in your terminal")
  .option("--country <country>",      "country name or code",                                    process.env.COUNTRY || config.country)
  .option("--city <city>",            "city name",                                               process.env.CITY    || config.city)
  .option("-m, --method <number>",    "calculation method 0-23 (2=ISNA 3=MWL 4=Umm Al-Qura 5=Egyptian 8=Gulf)", process.env.METHOD || config.method || "8")
  .option("--offset <adjustments>",   'adjust times in minutes e.g. "Fajr=+5,Dhuhr=-2"',        process.env.OFFSET  || config.offset)
  .option("--notify [minutes]",       "desktop notification N min before prayer (default 5) — for cron: '* * * * * salat --notify'")
  .option("--watch",                  "live mode: refresh every minute")
  .option("--week",                   "7-day prayer schedule")
  .option("--qibla",                  "Qibla direction for your location")
  .option("--export [filename]",      "export 7 days as .ics calendar file")
  .option("--ar",                     "show Arabic prayer names alongside English")
  .option("--save",                   "persist current settings to ~/.config/salat/config.json")
  .parse(process.argv);

const opts    = program.opts();
const offsets = parseOffsets(opts.offset);

// ─── Constants ────────────────────────────────────────────────────────────────

const PRAYERS   = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];
const STRIP     = ["Sunrise", "Sunset", "Imsak", "Midnight", "Firstthird", "Lastthird"];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const COMPASS   = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];

const ARABIC = {
  Fajr: "الفجر", Dhuhr: "الظهر", Asr: "العصر",
  Maghrib: "المغرب", Isha: "العشاء", Imsak: "الإمساك",
};

const inshaAllah = (rel) => rel.charAt(0).toUpperCase() + rel.slice(1) + " Insha'allah";
const shortDate  = (d)   => `${DAY_NAMES[d.getDay()]} ${MON_NAMES[d.getMonth()]} ${String(d.getDate()).padStart(2, "0")}`;
const toCompass  = (deg) => COMPASS[Math.round(deg / 22.5) % 16];

const icsDateTime = (d) =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}` +
  `T${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}00`;

// ─── API + cache ──────────────────────────────────────────────────────────────

const fetchPrayerTimes = async (country, city, dateStr, method) => {
  const cacheKey = `${method}-${country}-${city}-${dateStr}`;
  const cached   = readCache(cacheKey);
  if (cached && cached.meta) return cached;

  const res  = await axios.get(`http://api.aladhan.com/v1/timingsByCity/${dateStr}?method=${method}&country=${country}&city=${city}`);
  const data = {
    timings: res.data.data.timings,
    hijri:   res.data.data.date.hijri,
    meta:    { latitude: res.data.data.meta.latitude, longitude: res.data.data.meta.longitude },
  };
  writeCache(cacheKey, data);
  return data;
};

const geocodeCity = async (city, country) => {
  const cacheKey = `geo-${city}-${country}`;
  const cached   = readCache(cacheKey);
  if (cached) return cached;

  const res = await axios.get("https://nominatim.openstreetmap.org/search", {
    params: { city, country, format: "json", limit: 1 },
    headers: { "User-Agent": "salat-cli/1.0" },
  });
  if (!res.data || res.data.length === 0) return null;
  const coords = { latitude: parseFloat(res.data[0].lat), longitude: parseFloat(res.data[0].lon) };
  writeCache(cacheKey, coords);
  return coords;
};

const fetchQibla = async (latitude, longitude) => {
  const cacheKey = `qibla-${latitude.toFixed(4)}-${longitude.toFixed(4)}`;
  const cached   = readCache(cacheKey);
  if (cached !== null) return cached;

  const res       = await axios.get(`http://api.aladhan.com/v1/qibla/${latitude}/${longitude}`);
  const direction = res.data.data.direction;
  writeCache(cacheKey, direction);
  return direction;
};

// ─── Location ─────────────────────────────────────────────────────────────────

const resolveLocation = async (country, city, silent = false) => {
  if (country && city) return { country, city, latitude: null, longitude: null };
  if (!silent) console.log(chalk.yellow("  Location not set. Auto-detecting via IP..."));
  const ipInfo = await getIpInfo();
  if (!ipInfo) return null;
  if (!silent) console.log(chalk.green(`  Detected: ${ipInfo.city}, ${ipInfo.country}`));
  return ipInfo;
};

// ─── Notify mode (silent — for cron) ─────────────────────────────────────────

const checkAndNotify = async (country, city, method, offsets, leadMinutes) => {
  const loc = await resolveLocation(country, city, true);
  if (!loc) process.exit(1);

  let prayerData;
  try { prayerData = await fetchPrayerTimes(loc.country, loc.city, formatDate(), method); }
  catch { process.exit(1); }

  const raw  = { ...prayerData.timings };
  STRIP.forEach((k) => delete raw[k]);
  const times = applyOffsets(raw, offsets);
  const now   = new Date();

  for (const name of PRAYERS) {
    if (!times[name]) continue;
    const { h, m } = parseTime(times[name]);
    const target   = new Date();
    target.setHours(h, m, 0, 0);
    const diffMins = Math.round((target - now) / 60000);
    if (diffMins >= 0 && diffMins <= leadMinutes) {
      const label = diffMins === 0 ? "now" : `in ${diffMins} minute${diffMins !== 1 ? "s" : ""}`;
      notifier.notify({ title: "Prayer Time", message: `${name} ${label} — Insha'allah`, sound: true, wait: false });
      break;
    }
  }
};

// ─── Qibla mode ───────────────────────────────────────────────────────────────

const showQibla = async (country, city) => {
  let latitude, longitude;

  if (!country || !city) {
    const ipInfo = await getIpInfo();
    if (!ipInfo || ipInfo.latitude === null) { console.error(chalk.red("  Failed to determine location.")); return; }
    country = ipInfo.country; city = ipInfo.city;
    latitude = ipInfo.latitude; longitude = ipInfo.longitude;
  } else {
    let coords;
    try { coords = await geocodeCity(city, country); }
    catch { console.error(chalk.red("  Failed to geocode city.")); return; }
    if (!coords) { console.error(chalk.red(`  Could not find coordinates for ${city}, ${country}.`)); return; }
    latitude = coords.latitude; longitude = coords.longitude;
  }

  let direction;
  try { direction = await fetchQibla(latitude, longitude); }
  catch { console.error(chalk.red("  Failed to fetch Qibla direction.")); return; }

  console.log(`\n 🕋  Qibla Direction — ${city}, ${country}`);
  console.log(`\n     Coordinates : ${latitude.toFixed(4)}°, ${longitude.toFixed(4)}°`);
  console.log(`     Bearing     : ${chalk.green.bold(direction.toFixed(1) + "°")} ${chalk.cyan("(" + toCompass(direction) + ")")}\n`);
};

// ─── Week mode ────────────────────────────────────────────────────────────────

const printWeekView = async (country, city, method, offsets) => {
  const loc = await resolveLocation(country, city);
  if (!loc) { console.error(chalk.red("  Failed to determine location.")); return; }

  console.log(`\n 🕌  ${loc.city}, ${loc.country} — Weekly Prayer Times\n`);

  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() + i); return d;
  });

  let weekData;
  try {
    weekData = await Promise.all(dates.map((d) => fetchPrayerTimes(loc.country, loc.city, formatDate(d), method)));
  } catch { console.error(chalk.red("  Failed to fetch weekly prayer times.")); return; }

  const SEP = " " + "─".repeat(57);
  console.log(chalk.dim(SEP));
  console.log(chalk.dim(`  ${"Date".padEnd(13)} Fajr   Dhuhr  Asr    Maghrib Isha`));
  console.log(chalk.dim(SEP));

  weekData.forEach((data, i) => {
    const adjusted  = applyOffsets(data.timings, offsets);
    const isFri     = dates[i].getDay() === 5;
    const cols      = [adjusted.Fajr, adjusted.Dhuhr, adjusted.Asr, adjusted.Maghrib, adjusted.Isha]
      .map((t) => (t ? t.split(" ")[0] : "–").padEnd(7))
      .join(" ");
    const jumuahTag = isFri ? chalk.yellow(" · Jumu'ah") : "";
    const row       = `  ${shortDate(dates[i]).padEnd(13)} ${cols}`;
    if (i === 0) {
      process.stdout.write(chalk.cyan.bold(row) + chalk.yellow(" ← today") + jumuahTag + "\n");
    } else {
      process.stdout.write(row + jumuahTag + "\n");
    }
  });

  console.log(chalk.dim(SEP) + "\n");
};

// ─── ICS export mode ──────────────────────────────────────────────────────────

const exportIcs = async (country, city, method, offsets, outputFile) => {
  const loc = await resolveLocation(country, city);
  if (!loc) { console.error(chalk.red("  Failed to determine location.")); return; }

  const filename = outputFile || `salat-${loc.city.replace(/\s+/g, "-")}-${formatDate()}.ics`;

  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() + i); return d;
  });

  let weekData;
  try {
    weekData = await Promise.all(dates.map((d) => fetchPrayerTimes(loc.country, loc.city, formatDate(d), method)));
  } catch { console.error(chalk.red("  Failed to fetch prayer times for export.")); return; }

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//salat-cli//Prayer Times//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:Prayer Times – ${loc.city}`,
    "X-WR-CALDESC:Islamic prayer times generated by salat-cli",
  ];

  weekData.forEach((data, dayIdx) => {
    const adjusted = applyOffsets(data.timings, offsets);
    PRAYERS.forEach((name) => {
      if (!adjusted[name]) return;
      const { h, m } = parseTime(adjusted[name]);
      const dtstart  = new Date(dates[dayIdx]);
      dtstart.setHours(h, m, 0, 0);
      const dtend = new Date(dtstart);
      dtend.setMinutes(dtend.getMinutes() + 30);

      lines.push(
        "BEGIN:VEVENT",
        `UID:${name.toLowerCase()}-${formatDate(dates[dayIdx])}@salat-cli`,
        `DTSTART:${icsDateTime(dtstart)}`,
        `DTEND:${icsDateTime(dtend)}`,
        `SUMMARY:🕌 ${name}`,
        `DESCRIPTION:${name} prayer — ${loc.city}`,
        "END:VEVENT"
      );
    });
  });

  lines.push("END:VCALENDAR");
  fs.writeFileSync(filename, lines.join("\r\n") + "\r\n", "utf8");
  console.log(chalk.green(`\n  Calendar exported → ${filename}`));
  console.log(chalk.dim("  Import into Apple Calendar, Google Calendar, or Outlook.\n"));
};

// ─── Print mode (default) ─────────────────────────────────────────────────────

const printPrayerTimes = async (country, city, method, offsets) => {
  if (!country || !city) {
    console.log(chalk.yellow("  Location not set. Auto-detecting via IP..."));
    const ipInfo = await getIpInfo();
    if (ipInfo && ipInfo.city && ipInfo.country) {
      city = ipInfo.city; country = ipInfo.country;
      console.log(chalk.green(`  Detected: ${city}, ${country}`));
    } else {
      console.log(chalk.red("  Failed to auto-detect. Please provide --country and --city.")); return;
    }
  }

  let prayerData;
  try { prayerData = await fetchPrayerTimes(country, city, formatDate(), method); }
  catch { console.error(chalk.red("  Failed to fetch prayer times.")); return; }

  const { hijri }   = prayerData;
  const isRamadan   = hijri && hijri.month.number === 9;
  const isFriday    = new Date().getDay() === 5;

  // Apply offsets to all timings, then separate detection set from display set
  const allAdjusted = applyOffsets(prayerData.timings, offsets);
  const prayerTimes = { ...allAdjusted };
  STRIP.forEach((k) => delete prayerTimes[k]);

  // During Ramadan keep Imsak in display (but not in detection object)
  const displayTimes   = { ...prayerTimes };
  if (isRamadan && allAdjusted.Imsak) displayTimes.Imsak = allAdjusted.Imsak;
  const displayPrayers = isRamadan ? ["Imsak", ...PRAYERS] : PRAYERS;

  // Build a prayer label — handles Ramadan, Friday, Arabic
  const prayerLabel = (name) => {
    let label = name;
    if (isRamadan && name === "Imsak")   label = "Imsak / Suhoor";
    if (isRamadan && name === "Maghrib") label = "Maghrib / Iftar";
    if (isFriday  && name === "Dhuhr")   label = "Dhuhr / Jumu'ah";
    if (opts.ar && ARABIC[name])         label += ` (${ARABIC[name]})`;
    return label;
  };

  const labelWidth = Math.max(...displayPrayers.map((n) => prayerLabel(n).length), 7);

  // Header
  const hijriStr     = hijri ? `${hijri.day} ${hijri.month.en} ${hijri.year} AH` : "";
  const ramadanBadge = isRamadan ? "  🌙 Ramadan Mubarak" : "";

  console.log(`\n 🕌  ${city}, ${country} — Prayer Times${ramadanBadge}`);
  console.log(` 📆  ${new Date().toDateString()}${hijriStr ? "  |  " + hijriStr : ""}\n`);

  // Determine current / next prayer
  const currentPrayer = getCurrentPrayer(prayerTimes);
  let nextPrayer      = getNextPrayerTime(prayerTimes);
  let nextPrayerTime, nextDifference, nextPrayerDate;
  let isNextDay = false;

  if (!nextPrayer) {
    isNextDay = true;
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    let tomorrowData;
    try { tomorrowData = await fetchPrayerTimes(country, city, formatDate(tomorrow), method); }
    catch { console.error(chalk.red("  Failed to fetch tomorrow's prayer times.")); return; }
    const fajrTime  = applyOffsets(tomorrowData.timings, offsets).Fajr;
    const { h, m }  = parseTime(fajrTime);
    nextPrayer      = { name: "Fajr" };
    nextPrayerTime  = fajrTime.split(" ")[0];
    nextPrayerDate  = tomorrowAt(h, m);
    nextDifference  = fromNow(nextPrayerDate);
  } else {
    nextPrayerTime = nextPrayer.time;
    const { h, m } = parseTime(nextPrayerTime);
    nextPrayerDate = todayAt(h, m);
    nextDifference = fromNow(nextPrayerDate);
  }

  // Current prayer line
  if (currentPrayer) {
    const t        = prayerTimes[currentPrayer];
    const { h, m } = parseTime(t);
    const start    = new Date(); start.setHours(h, m, 0, 0);
    console.log(` Current prayer:  ${chalk.bold.cyan(prayerLabel(currentPrayer))} — ${t.split(" ")[0]} (${fromNow(start)})`);
  } else {
    console.log(` Current prayer:  ${chalk.dim("before Fajr")}`);
  }

  console.log(` Next prayer:     ${chalk.bold.green(prayerLabel(nextPrayer.name))} — ${nextPrayerTime} (${inshaAllah(nextDifference)})`);

  // Progress bar (only when inside a prayer period)
  if (currentPrayer) {
    const { h, m }  = parseTime(prayerTimes[currentPrayer]);
    const periodStart = new Date(); periodStart.setHours(h, m, 0, 0);
    console.log(` Progress:        ${chalk.blue(makeProgressBar(periodStart, nextPrayerDate))}`);
  }

  console.log();
  console.log(` ${"─".repeat(31)}`);

  const printRow = (name) => {
    const time = displayTimes[name];
    if (!time) return null;
    const isNext  = (!isNextDay && nextPrayer.name === name) || (isNextDay && name === "Fajr");
    const label   = chalk.cyan(prayerLabel(name).padEnd(labelWidth));
    const timeStr = isNext ? chalk.green.bold(time.split(" ")[0]) : chalk.green(time.split(" ")[0]);
    const marker  = isNext ? chalk.yellow(`  ← ${inshaAllah(nextDifference)}`) : "";
    return `  ${label}   ${timeStr}${marker}`;
  };

  displayPrayers.forEach((name) => {
    const row = printRow(name);
    if (row) console.log(row);
  });

  console.log(` ${"─".repeat(31)}\n`);
};

// ─── Watch mode ───────────────────────────────────────────────────────────────

const watchPrayerTimes = async (country, city, method, offsets) => {
  if (!country || !city) {
    const ipInfo = await getIpInfo();
    if (ipInfo) { country = ipInfo.country; city = ipInfo.city; }
    else { console.error(chalk.red("  Cannot determine location.")); process.exit(1); }
  }

  const refresh = async () => {
    process.stdout.write("\x1B[2J\x1B[H");
    await printPrayerTimes(country, city, method, offsets);
    process.stdout.write(chalk.dim(" [watch] Refreshing every minute — Ctrl+C to exit\n\n"));
  };

  await refresh();
  setInterval(refresh, 60 * 1000);
};

// ─── Entry point ──────────────────────────────────────────────────────────────

const { country, city, method } = opts;
const notifyMinutes = opts.notify === true ? 5 : opts.notify ? parseInt(opts.notify, 10) : null;

(async () => {
  if (notifyMinutes !== null) {
    await checkAndNotify(country, city, method, offsets, notifyMinutes);
  } else if (opts.qibla) {
    await showQibla(country, city);
  } else if (opts.week) {
    await printWeekView(country, city, method, offsets);
  } else if (opts.export !== undefined) {
    const exportFilename = opts.export === true ? undefined : opts.export;
    await exportIcs(country, city, method, offsets, exportFilename);
  } else if (opts.watch) {
    await watchPrayerTimes(country, city, method, offsets);
  } else {
    await printPrayerTimes(country, city, method, offsets);
    if (opts.save) {
      if (!country || !city) {
        console.log(chalk.yellow("  Cannot save: provide --country and --city explicitly."));
      } else {
        const saveData = { country, city, method };
        if (opts.offset) saveData.offset = opts.offset;
        writeConfig(saveData);
        console.log(chalk.green(`  Settings saved → ${getConfigPath()}\n`));
      }
    }
  }
})();
