#!/usr/bin/env node
const axios = require("axios");
const chalk = require("chalk");
const moment = require("moment");
require('dotenv').config({path: __dirname + '/.env'});

// Import functions from a separate file
const {
  formatDate,
  getCurrentPrayer,
  getNextPrayerTime,
  getIpInfo,
} = require("./func.js");

// Function to get prayer times from Aladhan.com
const getPrayerTimes = async (country, city, dateStr = formatDate()) => {
  return axios.get(`http://api.aladhan.com/v1/timingsByCity/${dateStr}?method=8&country=${country}&city=${city}`);
};

// Function to get prayer times data from Aladhan.com
const getPrayerTimesData = async (country, city, dateStr = formatDate()) => {
  const res = await getPrayerTimes(country, city, dateStr);
  return res.data.data.timings;
};

const printPrayerTimes = async (
  country = process.argv[2] || process.env.COUNTRY,
  city = process.argv[3] || process.env.CITY
) => {
  if (!country || !city) {
    console.log(chalk.yellow("City or country not provided. Attempting to auto-detect location..."));
    const ipInfo = await getIpInfo();
    if (ipInfo && ipInfo.city && ipInfo.country) {
      city = ipInfo.city;
      country = ipInfo.country;
      console.log(chalk.green(`Detected location: ${city}, ${country}`));
    } else {
      console.log(chalk.red("Failed to auto-detect location. Please provide a country and city."));
      return;
    }
  }

  let prayerTimes;
  try {
    prayerTimes = await getPrayerTimesData(country, city);
  } catch (err) {
    console.error(chalk.red("Failed to fetch prayer times. Please check your internet connection or city/country names."));
    return;
  }

  const toDelete = ["Sunrise", "Imsak", "Midnight", "Firstthird", "Lastthird"];
  toDelete.forEach((d) =>
    prayerTimes.hasOwnProperty(d) ? delete prayerTimes[d] : ""
  );

  console.log(` 🕌 ${city}, ${country} Prayer Times 🕌`);
  console.log(` 📆 ${new Date().toDateString()}📆  \n`);

  const currentPrayer = getCurrentPrayer(prayerTimes);
  let nextPrayer = getNextPrayerTime(prayerTimes);

  let nextPrayerTime;
  let nextDifference;
  let isNextDay = false;

  if (!nextPrayer) {
    // It is past Isha, fetch tomorrow's Fajr
    isNextDay = true;
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tmrFormat = formatDate(tomorrow);
    
    let tomorrowPrayerTimes;
    try {
      tomorrowPrayerTimes = await getPrayerTimesData(country, city, tmrFormat);
    } catch (err) {
      console.error(chalk.red("Failed to fetch next day's prayer times."));
      return;
    }
    
    const tomorrowFajrTime = tomorrowPrayerTimes["Fajr"];
    const [fajrHour, fajrMinute] = tomorrowFajrTime.split(":").map(Number);
    const fajrMoment = moment().add(1, 'days').hours(fajrHour).minutes(fajrMinute);
    
    nextPrayer = { name: "Fajr" };
    nextPrayerTime = tomorrowFajrTime;
    nextDifference = fajrMoment.fromNow();
  } else {
    nextPrayerTime = prayerTimes[nextPrayer.name];
    const [nextHour, nextMinute] = nextPrayerTime.split(":").map(Number);
    const nextPrayerMoment = moment().hours(nextHour).minutes(nextMinute);
    nextDifference = nextPrayerMoment.fromNow();
  }

  let currentPrayerTime = "N/A";
  let currentDifference = "";
  if (currentPrayer) {
    currentPrayerTime = prayerTimes[currentPrayer];
    const [currentHour, currentMinute] = currentPrayerTime.split(":").map(Number);
    const currentMoment = moment().hours(currentHour).minutes(currentMinute);
    currentDifference = currentMoment.fromNow();
    console.log(`Current Prayer: ${currentPrayer} - ${currentPrayerTime} | ${currentDifference}`);
  } else {
    console.log(`Current Prayer: Before Fajr`);
  }

  console.log();
  console.log("Prayer Times for the Day:");
  
  const printRow = (name, time) => {
    let highlight = false;
    if (!isNextDay && nextPrayer && nextPrayer.name === name) {
      highlight = true;
    } else if (isNextDay && name === "Fajr") {
      highlight = true;
    }
    
    if (highlight) {
      return `  ${chalk.cyan(name.padEnd(7))}  -->   ${chalk.green.bold(time)} Insha'allah ${nextDifference}`;
    } else {
      return `  ${chalk.cyan(name.padEnd(7))}  -->   ${chalk.green(time)}`;
    }
  };

  console.log(printRow("Fajr", prayerTimes.Fajr));
  console.log(printRow("Dhuhr", prayerTimes.Dhuhr));
  console.log(printRow("Asr", prayerTimes.Asr));
  console.log(printRow("Maghrib", prayerTimes.Maghrib));
  console.log(printRow("Isha", prayerTimes.Isha));
};

// Call the printPrayerTimes function to display prayer times
printPrayerTimes();
