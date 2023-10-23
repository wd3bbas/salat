const moment = require("moment");
const axios = require("axios");

const formatDate = (date = new Date()) => {
  // const date = new Date();
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
};

const getCurrentPrayer = (prayerTimes) => {
  // Get the current date and time
  const now = new Date();

  // Extract the current hour and minute
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();

  // Format current time as "hh:mm"
  const currentTime = `${currentHour
    .toString()
    .padStart(2, "0")}:${currentMinute.toString().padStart(2, "0")}`;

  let currentPrayer = null;

  //   console.log("The current time is:", currentTime)

  // Compare the current time with the prayer times
  for (const prayer in prayerTimes) {
    if (currentTime >= prayerTimes[prayer]) {
      currentPrayer = prayer;
    } else {
      break;
    }
  }

  return currentPrayer;
};

const getNextPrayerTime = (prayerTimes) => {
  const currentMoment = moment();

  let nextPrayerTime = null;

  // Iterate through the prayer times to find the next one
  for (const prayer in prayerTimes) {
    const prayerMoment = moment(prayerTimes[prayer], "HH:mm");

    if (prayerMoment.isAfter(currentMoment)) {
      nextPrayerTime = {
        name: prayer,
        time: prayerMoment.format("HH:mm"),
        in: prayerMoment.fromNow(),
      };
      break;
    }
  }

  return nextPrayerTime;
};



async function getIpInfo() {
  try {
    const response = await axios.get('https://ipinfo.io');
    const data = response.data;

    const { city, country } = data;
    
    return { city, country };
  } catch (error) {
    console.error('Error fetching IP information:', error.message);
    return null;
  }
}

module.exports = { formatDate, getCurrentPrayer,getNextPrayerTime,getIpInfo };
