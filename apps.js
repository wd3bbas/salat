const axios = require("axios");
const chalk = require("chalk");
const moment = require("moment");
require('dotenv').config();

// Import functions from a separate file
const {
  formatDate,
  getCurrentPrayer,
  getNextPrayerTime,
} = require("./func.js");

// API URL from Aladhan.com to get prayer times
const API_URL = `http://api.aladhan.com/v1/timingsByCity/${formatDate()}?method=8&`;

// Function to get prayer times from Aladhan.com
const getPrayerTimes = async (country, city) =>
  await axios.get(`${API_URL}&country=${country}&city=${city}`);

// Function to get prayer times data from Aladhan.com
const getPrayerTimesData = async (country, city) =>
  await getPrayerTimes(country, city).then((res) => res.data.data.timings);

const printPrayerTimes = async (
  country = process.argv[2] || process.env.COUNTRY,
  city = process.argv[3] || process.env.CITY
) => {
  if (!country || !city) {
    console.log("Please provide a country and city.");
    return;
  }

  const prayerTimes = await getPrayerTimesData(country, city);

  console.log(` 🕌 ${city}, ${country} Prayer Times 🕌`);
  console.log(` 📆 ${new Date().toDateString()}  \n`);

  const currentPrayer = getCurrentPrayer(prayerTimes);
  const nextPrayer = getNextPrayerTime(prayerTimes);

  const currentPrayerTime = prayerTimes[currentPrayer];
  const nextPrayerTime = prayerTimes[nextPrayer.name];

  const [currentHour, currentMinute] = currentPrayerTime.split(":").map(Number);
  const [nextHour, nextMinute] = nextPrayerTime.split(":").map(Number);

  const currentMoment = moment().hours(currentHour).minutes(currentMinute);
  const nextPrayerMoment = moment().hours(nextHour).minutes(nextMinute);

  const currentDifference = currentMoment.fromNow();
  const nextDifference = nextPrayerMoment.fromNow();

  console.log(`Current Prayer: ${currentPrayer} - ${currentPrayerTime} | ${currentDifference}`);
  console.log(`Next Prayer: ${nextPrayer.name} - ${nextPrayerTime} | Insha'allah in ${nextDifference}\n`);
  
  console.log("Prayer Times for the Day:");
  console.log(`
  ${chalk.cyan("Fajr")}     -->   ${currentPrayerTime == prayerTimes.Fajr ? chalk.green.bold(prayerTimes.Fajr): chalk.green(prayerTimes.Fajr)}
  ${chalk.cyan("Dhuhr")}    -->   ${currentPrayerTime == prayerTimes.Dhuhr ? chalk.green.bold(prayerTimes.Dhuhr): chalk.green(prayerTimes.Dhuhr)}
  ${chalk.cyan("Asr")}      -->   ${currentPrayerTime == prayerTimes.Asr ? chalk.green.bold(prayerTimes.Asr): chalk.green(prayerTimes.Asr)}
  ${chalk.cyan("Maghrib")}  -->   ${currentPrayerTime == prayerTimes.Maghrib ? chalk.green.bold(prayerTimes.Maghrib): chalk.green(prayerTimes.Maghrib)}
  ${chalk.cyan("Isha")}     -->   ${currentPrayerTime == prayerTimes.Isha ? chalk.green.bold(prayerTimes.Isha): chalk.green(prayerTimes.Isha)}
  `);
};

// Call the printPrayerTimes function to display prayer times
printPrayerTimes();
