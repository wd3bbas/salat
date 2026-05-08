const axios = require("axios");
const os = require("os");
const fs = require("fs");
const path = require("path");

const formatDate = (date = new Date()) => {
  const day   = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year  = date.getFullYear();
  return `${day}-${month}-${year}`;
};

// "in 5 minutes" / "3 hours ago" / "just now"
const fromNow = (targetDate) => {
  const diffMs  = targetDate - Date.now();
  const past    = diffMs < 0;
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

// Parse "Fajr=+5,Dhuhr=-2" → { Fajr: 5, Dhuhr: -2 }
const parseOffsets = (str) => {
  if (!str) return {};
  const offsets = {};
  for (const part of str.split(",")) {
    const match = part.trim().match(/^(\w+)=([+-]?\d+)$/);
    if (match) offsets[match[1]] = parseInt(match[2], 10);
  }
  return offsets;
};

// Apply minute offsets to a prayer times map; returns new object
const applyOffsets = (prayerTimes, offsets) => {
  if (!offsets || Object.keys(offsets).length === 0) return prayerTimes;
  const result = { ...prayerTimes };
  for (const [prayer, minutes] of Object.entries(offsets)) {
    if (result[prayer] === undefined) continue;
    const { h, m }   = parseTime(result[prayer]);
    const totalMins   = ((h * 60 + m + minutes) % 1440 + 1440) % 1440;
    result[prayer]    = `${String(Math.floor(totalMins / 60)).padStart(2, "0")}:${String(totalMins % 60).padStart(2, "0")}`;
  }
  return result;
};

// "████████░░░░░░░░  50%" — progress through current prayer period
const makeProgressBar = (startDate, endDate, width = 20) => {
  const pct    = Math.max(0, Math.min(1, (Date.now() - startDate.getTime()) / (endDate.getTime() - startDate.getTime())));
  const filled = Math.round(pct * width);
  return "█".repeat(filled) + "░".repeat(width - filled) + `  ${Math.round(pct * 100)}%`;
};

async function getIpInfo() {
  try {
    const response = await axios.get("https://ipinfo.io");
    const { city, country, loc } = response.data;
    const [latitude, longitude]  = loc ? loc.split(",").map(Number) : [null, null];
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
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
}

function writeCache(key, data) {
  const file = path.join(getCacheDir(), key.replace(/[^a-z0-9-]/gi, "_") + ".json");
  try { fs.writeFileSync(file, JSON.stringify(data), "utf8"); } catch {}
}

// ─── Config ───────────────────────────────────────────────────────────────────

function getConfigPath() {
  return path.join(os.homedir(), ".config", "salat", "config.json");
}

function readConfig() {
  const file = getConfigPath();
  if (!fs.existsSync(file)) return {};
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return {}; }
}

function writeConfig(data) {
  const file = getConfigPath();
  const dir  = path.dirname(file);
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
  parseOffsets,
  applyOffsets,
  makeProgressBar,
  getIpInfo,
  readCache,
  writeCache,
  readConfig,
  writeConfig,
  getConfigPath,
};
