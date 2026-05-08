const axios = require("axios");
const os = require("os");
const fs = require("fs");
const path = require("path");

const formatDate = (date = new Date()) => {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
};

// Returns "in X minutes", "X minutes ago", "just now"
const fromNow = (targetDate) => {
  const diffMs = targetDate - Date.now();
  const past = diffMs < 0;
  const absMins = Math.round(Math.abs(diffMs) / 60000);

  if (absMins === 0) return "just now";

  let unit;
  if (absMins < 60) {
    unit = `${absMins} minute${absMins !== 1 ? "s" : ""}`;
  } else {
    const hours = Math.round(absMins / 60);
    unit = `${hours} hour${hours !== 1 ? "s" : ""}`;
  }

  return past ? `${unit} ago` : `in ${unit}`;
};

const todayAt = (hour, minute) => {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d;
};

const tomorrowAt = (hour, minute) => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(hour, minute, 0, 0);
  return d;
};

// Strips any timezone suffix e.g. "17:30 (PKT)" → { h: 17, m: 30 }
const parseTime = (timeStr) => {
  const [h, m] = timeStr.split(" ")[0].split(":").map(Number);
  return { h, m };
};

const getCurrentPrayer = (prayerTimes, now = new Date()) => {
  const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  let currentPrayer = null;
  for (const prayer in prayerTimes) {
    if (currentTime >= prayerTimes[prayer].split(" ")[0]) {
      currentPrayer = prayer;
    } else {
      break;
    }
  }
  return currentPrayer;
};

const getNextPrayerTime = (prayerTimes, now = new Date()) => {
  for (const prayer in prayerTimes) {
    const { h, m } = parseTime(prayerTimes[prayer]);
    const prayerDate = todayAt(h, m);
    if (prayerDate > now) {
      return { name: prayer, time: prayerTimes[prayer].split(" ")[0], in: fromNow(prayerDate) };
    }
  }
  return null;
};

async function getIpInfo() {
  try {
    const response = await axios.get("https://ipinfo.io");
    const { city, country, loc } = response.data;
    const [latitude, longitude] = loc ? loc.split(",").map(Number) : [null, null];
    return { city, country, latitude, longitude };
  } catch (error) {
    console.error("Error fetching IP information:", error.message);
    return null;
  }
}

// ─── Cache ────────────────────────────────────────────────────────────────────

function getCacheDir() {
  const dir = path.join(os.homedir(), ".cache", "salat");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function readCache(key) {
  const file = path.join(getCacheDir(), key.replace(/[^a-z0-9-]/gi, "_") + ".json");
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function writeCache(key, data) {
  const file = path.join(getCacheDir(), key.replace(/[^a-z0-9-]/gi, "_") + ".json");
  try {
    fs.writeFileSync(file, JSON.stringify(data), "utf8");
  } catch {}
}

// ─── Config ───────────────────────────────────────────────────────────────────

function getConfigPath() {
  return path.join(os.homedir(), ".config", "salat", "config.json");
}

function readConfig() {
  const file = getConfigPath();
  if (!fs.existsSync(file)) return {};
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

function writeConfig(data) {
  const file = getConfigPath();
  const dir = path.dirname(file);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

module.exports = {
  formatDate,
  fromNow,
  todayAt,
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
};
