#!/usr/bin/env node
const axios = require("axios");
const chalk = require("chalk");
const notifier = require("node-notifier");
const { program } = require("commander");
require("dotenv").config({ path: __dirname + "/.env" });

const {
  formatDate,
  fromNow,
  tomorrowAt,
  parseTime,
  getCurrentPrayer,
  getNextPrayerTime,
  getIpInfo,
  readCache,
  writeCache,
  readConfig,
  writeConfig,
  getConfigPath,
} = require("./func.js");

const config = readConfig();

program
  .name("salat")
  .description("Display Islamic prayer times in your terminal")
  .option("--country <country>", "country name or code", process.env.COUNTRY || config.country)
  .option("--city <city>", "city name", process.env.CITY || config.city)
  .option(
    "-m, --method <number>",
    "calculation method 0-23 (2=ISNA, 3=MWL, 4=Umm Al-Qura, 5=Egyptian, 8=Gulf)",
    process.env.METHOD || config.method || "8"
  )
  .option(
    "--notify [minutes]",
    "send a desktop notification if a prayer is within N minutes (default: 5) — run via cron: '* * * * * salat --notify'"
  )
  .option("--watch", "live mode: refresh display every minute")
  .option("--week",  "show prayer times for the next 7 days")
  .option("--qibla", "show Qibla direction for your location")
  .option("--save",  "save --country, --city, --method as defaults in ~/.config/salat/config.json")
  .parse(process.argv);

const opts = program.opts();

// ─── Constants ────────────────────────────────────────────────────────────────

const PRAYERS    = ["Fajr", "Dhuhr", "Asr", "Maghrib", "Isha"];
const STRIP      = ["Sunrise", "Imsak", "Midnight", "Firstthird", "Lastthird"];
const DAY_NAMES  = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON_NAMES  = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const COMPASS    = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];

const inshaAllah    = (rel) => rel.charAt(0).toUpperCase() + rel.slice(1) + " Insha'allah";
const shortDate     = (d)   => `${DAY_NAMES[d.getDay()]} ${MON_NAMES[d.getMonth()]} ${String(d.getDate()).padStart(2, "0")}`;
const toCompass     = (deg) => COMPASS[Math.round(deg / 22.5) % 16];

// ─── API + cache ──────────────────────────────────────────────────────────────

const fetchPrayerTimes = async (country, city, dateStr, method) => {
  const cacheKey = `${method}-${country}-${city}-${dateStr}`;
  const cached = readCache(cacheKey);
  if (cached && cached.meta) return cached; // skip cache if missing meta (old format)

  const res = await axios.get(
    `http://api.aladhan.com/v1/timingsByCity/${dateStr}?method=${method}&country=${country}&city=${city}`
  );
  const data = {
    timings: res.data.data.timings,
    hijri:   res.data.data.date.hijri,
    meta: {
      latitude:  res.data.data.meta.latitude,
      longitude: res.data.data.meta.longitude,
    },
  };
  writeCache(cacheKey, data);
  return data;
};

const geocodeCity = async (city, country) => {
  const cacheKey = `geo-${city}-${country}`;
  const cached = readCache(cacheKey);
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
  const cached = readCache(cacheKey);
  if (cached !== null) return cached;

  const res = await axios.get(`http://api.aladhan.com/v1/qibla/${latitude}/${longitude}`);
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

// ─── Notify mode (silent — designed for cron) ─────────────────────────────────

const checkAndNotify = async (country, city, method, leadMinutes) => {
  const loc = await resolveLocation(country, city, true);
  if (!loc) process.exit(1);

  let prayerData;
  try {
    prayerData = await fetchPrayerTimes(loc.country, loc.city, formatDate(), method);
  } catch {
    process.exit(1);
  }

  const prayerTimes = { ...prayerData.timings };
  STRIP.forEach((k) => delete prayerTimes[k]);

  const now = new Date();
  for (const name of PRAYERS) {
    if (!prayerTimes[name]) continue;
    const { h, m } = parseTime(prayerTimes[name]);
    const target = new Date();
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
    // auto-detect: IP gives real coordinates
    const ipInfo = await getIpInfo();
    if (!ipInfo || ipInfo.latitude === null) {
      console.error(chalk.red("  Failed to determine location.")); return;
    }
    country  = ipInfo.country;
    city     = ipInfo.city;
    latitude  = ipInfo.latitude;
    longitude = ipInfo.longitude;
  } else {
    // explicit city: geocode via OpenStreetMap Nominatim
    let coords;
    try {
      coords = await geocodeCity(city, country);
    } catch {
      console.error(chalk.red("  Failed to geocode city.")); return;
    }
    if (!coords) { console.error(chalk.red(`  Could not find coordinates for ${city}, ${country}.`)); return; }
    latitude  = coords.latitude;
    longitude = coords.longitude;
  }

  let direction;
  try {
    direction = await fetchQibla(latitude, longitude);
  } catch {
    console.error(chalk.red("  Failed to fetch Qibla direction.")); return;
  }

  console.log(`\n 🕋  Qibla Direction — ${city}, ${country}`);
  console.log(`\n     Coordinates : ${latitude.toFixed(4)}°, ${longitude.toFixed(4)}°`);
  console.log(`     Bearing     : ${chalk.green.bold(direction.toFixed(1) + "°")} ${chalk.cyan("(" + toCompass(direction) + ")")}\n`);
};

// ─── Week mode ────────────────────────────────────────────────────────────────

const printWeekView = async (country, city, method) => {
  const loc = await resolveLocation(country, city);
  if (!loc) { console.error(chalk.red("  Failed to determine location.")); return; }

  console.log(`\n 🕌  ${loc.city}, ${loc.country} — Weekly Prayer Times\n`);

  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d;
  });

  let weekData;
  try {
    weekData = await Promise.all(
      dates.map((d) => fetchPrayerTimes(loc.country, loc.city, formatDate(d), method))
    );
  } catch {
    console.error(chalk.red("  Failed to fetch weekly prayer times.")); return;
  }

  const SEP = " " + "─".repeat(56);
  console.log(chalk.dim(SEP));
  console.log(chalk.dim(`  ${"Date".padEnd(13)} Fajr   Dhuhr  Asr    Maghrib Isha`));
  console.log(chalk.dim(SEP));

  weekData.forEach((data, i) => {
    const { timings } = data;
    const cols = [timings.Fajr, timings.Dhuhr, timings.Asr, timings.Maghrib, timings.Isha]
      .map((t) => t.split(" ")[0].padEnd(7))
      .join(" ");
    const row = `  ${shortDate(dates[i]).padEnd(13)} ${cols}`;
    if (i === 0) {
      process.stdout.write(chalk.cyan.bold(row) + chalk.yellow(" ← today") + "\n");
    } else {
      console.log(row);
    }
  });

  console.log(chalk.dim(SEP) + "\n");
};

// ─── Print mode (default) ─────────────────────────────────────────────────────

const printPrayerTimes = async (country, city, method) => {
  if (!country || !city) {
    console.log(chalk.yellow("  Location not set. Auto-detecting via IP..."));
    const ipInfo = await getIpInfo();
    if (ipInfo && ipInfo.city && ipInfo.country) {
      city    = ipInfo.city;
      country = ipInfo.country;
      console.log(chalk.green(`  Detected: ${city}, ${country}`));
    } else {
      console.log(chalk.red("  Failed to auto-detect. Please provide --country and --city."));
      return;
    }
  }

  let prayerData;
  try {
    prayerData = await fetchPrayerTimes(country, city, formatDate(), method);
  } catch {
    console.error(chalk.red("  Failed to fetch prayer times. Check your connection or --city/--country values."));
    return;
  }

  const prayerTimes = { ...prayerData.timings };
  STRIP.forEach((k) => delete prayerTimes[k]);

  const { hijri } = prayerData;
  const hijriStr = hijri ? `${hijri.day} ${hijri.month.en} ${hijri.year} AH` : "";

  console.log(`\n 🕌  ${city}, ${country} — Prayer Times`);
  console.log(` 📆  ${new Date().toDateString()}${hijriStr ? "  |  " + hijriStr : ""}\n`);

  const currentPrayer = getCurrentPrayer(prayerTimes);
  let nextPrayer      = getNextPrayerTime(prayerTimes);
  let nextPrayerTime, nextDifference;
  let isNextDay = false;

  if (!nextPrayer) {
    isNextDay = true;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    let tomorrowData;
    try {
      tomorrowData = await fetchPrayerTimes(country, city, formatDate(tomorrow), method);
    } catch {
      console.error(chalk.red("  Failed to fetch tomorrow's prayer times.")); return;
    }
    const fajrTime = tomorrowData.timings["Fajr"];
    const { h, m } = parseTime(fajrTime);
    nextPrayer     = { name: "Fajr" };
    nextPrayerTime = fajrTime.split(" ")[0];
    nextDifference = fromNow(tomorrowAt(h, m));
  } else {
    nextPrayerTime = nextPrayer.time;
    nextDifference = nextPrayer.in;
  }

  if (currentPrayer) {
    const t      = prayerTimes[currentPrayer];
    const { h, m } = parseTime(t);
    const target = new Date();
    target.setHours(h, m, 0, 0);
    console.log(` Current prayer:  ${chalk.bold.cyan(currentPrayer)} — ${t.split(" ")[0]} (${fromNow(target)})`);
  } else {
    console.log(` Current prayer:  ${chalk.dim("before Fajr")}`);
  }

  console.log(` Next prayer:     ${chalk.bold.green(nextPrayer.name)} — ${nextPrayerTime} (${inshaAllah(nextDifference)})\n`);
  console.log(" ─────────────────────────────");

  const printRow = (name, time) => {
    const isNext = (!isNextDay && nextPrayer.name === name) || (isNextDay && name === "Fajr");
    const label   = chalk.cyan(name.padEnd(7));
    const timeStr = isNext ? chalk.green.bold(time.split(" ")[0]) : chalk.green(time.split(" ")[0]);
    const marker  = isNext ? chalk.yellow(`  ← ${inshaAllah(nextDifference)}`) : "";
    return `  ${label}   ${timeStr}${marker}`;
  };

  PRAYERS.forEach((name) => {
    if (prayerTimes[name]) console.log(printRow(name, prayerTimes[name]));
  });

  console.log(" ─────────────────────────────\n");
};

// ─── Watch mode ───────────────────────────────────────────────────────────────

const watchPrayerTimes = async (country, city, method) => {
  if (!country || !city) {
    const ipInfo = await getIpInfo();
    if (ipInfo) { country = ipInfo.country; city = ipInfo.city; }
    else { console.error(chalk.red("  Cannot determine location.")); process.exit(1); }
  }

  const refresh = async () => {
    process.stdout.write("\x1B[2J\x1B[H");
    await printPrayerTimes(country, city, method);
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
    await checkAndNotify(country, city, method, notifyMinutes);
  } else if (opts.qibla) {
    await showQibla(country, city);
  } else if (opts.week) {
    await printWeekView(country, city, method);
  } else if (opts.watch) {
    await watchPrayerTimes(country, city, method);
  } else {
    await printPrayerTimes(country, city, method);
    if (opts.save) {
      if (!country || !city) {
        console.log(chalk.yellow("  Cannot save: provide --country and --city explicitly."));
      } else {
        writeConfig({ country, city, method });
        console.log(chalk.green(`  Settings saved → ${getConfigPath()}\n`));
      }
    }
  }
})();
