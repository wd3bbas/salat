const { getCurrentPrayer, getNextPrayerTime, fromNow, formatDate } = require("../func");

const PRAYERS = {
  Fajr:    "05:00",
  Dhuhr:   "12:00",
  Asr:     "15:30",
  Maghrib: "18:00",
  Isha:    "20:00",
};

const at = (h, m) => {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
};

// ─── getCurrentPrayer ────────────────────────────────────────────────────────

describe("getCurrentPrayer", () => {
  it("returns null before Fajr", () => {
    expect(getCurrentPrayer(PRAYERS, at(4, 0))).toBeNull();
  });

  it("returns Fajr after Fajr starts", () => {
    expect(getCurrentPrayer(PRAYERS, at(5, 30))).toBe("Fajr");
  });

  it("returns Fajr at exact Fajr time", () => {
    expect(getCurrentPrayer(PRAYERS, at(5, 0))).toBe("Fajr");
  });

  it("returns Dhuhr after Dhuhr starts", () => {
    expect(getCurrentPrayer(PRAYERS, at(13, 0))).toBe("Dhuhr");
  });

  it("returns Asr after Asr starts", () => {
    expect(getCurrentPrayer(PRAYERS, at(16, 0))).toBe("Asr");
  });

  it("returns Maghrib after Maghrib starts", () => {
    expect(getCurrentPrayer(PRAYERS, at(18, 30))).toBe("Maghrib");
  });

  it("returns Isha after Isha starts", () => {
    expect(getCurrentPrayer(PRAYERS, at(21, 0))).toBe("Isha");
  });
});

// ─── getNextPrayerTime ───────────────────────────────────────────────────────

describe("getNextPrayerTime", () => {
  it("returns Fajr before any prayer", () => {
    expect(getNextPrayerTime(PRAYERS, at(4, 0)).name).toBe("Fajr");
  });

  it("returns Dhuhr during Fajr", () => {
    expect(getNextPrayerTime(PRAYERS, at(6, 0)).name).toBe("Dhuhr");
  });

  it("returns Asr during Dhuhr", () => {
    expect(getNextPrayerTime(PRAYERS, at(12, 30)).name).toBe("Asr");
  });

  it("returns Isha after Maghrib", () => {
    expect(getNextPrayerTime(PRAYERS, at(18, 30)).name).toBe("Isha");
  });

  it("returns null after Isha — caller must fetch tomorrow's Fajr", () => {
    expect(getNextPrayerTime(PRAYERS, at(21, 0))).toBeNull();
  });

  it("includes a time string", () => {
    const next = getNextPrayerTime(PRAYERS, at(4, 0));
    expect(next.time).toBe("05:00");
  });
});

// ─── fromNow ─────────────────────────────────────────────────────────────────

describe("fromNow", () => {
  it("returns 'in X minutes' for a future time", () => {
    expect(fromNow(new Date(Date.now() + 5 * 60000))).toBe("in 5 minutes");
  });

  it("returns 'X minutes ago' for a past time", () => {
    expect(fromNow(new Date(Date.now() - 10 * 60000))).toBe("10 minutes ago");
  });

  it("uses singular 'minute' correctly", () => {
    expect(fromNow(new Date(Date.now() + 1 * 60000))).toBe("in 1 minute");
  });

  it("converts to hours when >= 60 minutes", () => {
    expect(fromNow(new Date(Date.now() + 120 * 60000))).toBe("in 2 hours");
  });

  it("returns 'just now' for 0 minutes", () => {
    expect(fromNow(new Date())).toBe("just now");
  });
});

// ─── formatDate ──────────────────────────────────────────────────────────────

describe("formatDate", () => {
  it("formats a date as DD-MM-YYYY", () => {
    expect(formatDate(new Date(2026, 4, 8))).toBe("08-05-2026");
  });

  it("zero-pads single-digit day and month", () => {
    expect(formatDate(new Date(2026, 0, 3))).toBe("03-01-2026");
  });
});
