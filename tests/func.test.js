const {
  getCurrentPrayer,
  getNextPrayerTime,
  fromNow,
  formatDate,
  parseOffsets,
  applyOffsets,
  makeProgressBar,
} = require("../func");

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
  it("returns Fajr at exact Fajr time", () => {
    expect(getCurrentPrayer(PRAYERS, at(5, 0))).toBe("Fajr");
  });
  it("returns Fajr between Fajr and Dhuhr", () => {
    expect(getCurrentPrayer(PRAYERS, at(8, 0))).toBe("Fajr");
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
  it("returns null after Isha — caller fetches tomorrow's Fajr", () => {
    expect(getNextPrayerTime(PRAYERS, at(21, 0))).toBeNull();
  });
  it("includes correct time string", () => {
    expect(getNextPrayerTime(PRAYERS, at(4, 0)).time).toBe("05:00");
  });
});

// ─── fromNow ─────────────────────────────────────────────────────────────────

describe("fromNow", () => {
  it("returns 'in X minutes' for future time", () => {
    expect(fromNow(new Date(Date.now() + 5 * 60000))).toBe("in 5 minutes");
  });
  it("returns 'X minutes ago' for past time", () => {
    expect(fromNow(new Date(Date.now() - 10 * 60000))).toBe("10 minutes ago");
  });
  it("uses singular 'minute'", () => {
    expect(fromNow(new Date(Date.now() + 1 * 60000))).toBe("in 1 minute");
  });
  it("converts to hours when >= 60 min", () => {
    expect(fromNow(new Date(Date.now() + 120 * 60000))).toBe("in 2 hours");
  });
  it("returns 'just now' for 0 minutes", () => {
    expect(fromNow(new Date())).toBe("just now");
  });
});

// ─── formatDate ──────────────────────────────────────────────────────────────

describe("formatDate", () => {
  it("formats as DD-MM-YYYY", () => {
    expect(formatDate(new Date(2026, 4, 8))).toBe("08-05-2026");
  });
  it("zero-pads single-digit day and month", () => {
    expect(formatDate(new Date(2026, 0, 3))).toBe("03-01-2026");
  });
});

// ─── parseOffsets ─────────────────────────────────────────────────────────────

describe("parseOffsets", () => {
  it("parses positive and negative offsets", () => {
    expect(parseOffsets("Fajr=+5,Dhuhr=-2")).toEqual({ Fajr: 5, Dhuhr: -2 });
  });
  it("parses offset without explicit + sign", () => {
    expect(parseOffsets("Asr=3")).toEqual({ Asr: 3 });
  });
  it("returns empty object for undefined input", () => {
    expect(parseOffsets(undefined)).toEqual({});
  });
  it("returns empty object for empty string", () => {
    expect(parseOffsets("")).toEqual({});
  });
  it("ignores malformed entries", () => {
    expect(parseOffsets("Fajr=+5,bad,Isha=-10")).toEqual({ Fajr: 5, Isha: -10 });
  });
});

// ─── applyOffsets ─────────────────────────────────────────────────────────────

describe("applyOffsets", () => {
  it("adds positive minutes correctly", () => {
    const result = applyOffsets({ Fajr: "05:00" }, { Fajr: 10 });
    expect(result.Fajr).toBe("05:10");
  });
  it("subtracts negative minutes correctly", () => {
    const result = applyOffsets({ Dhuhr: "12:00" }, { Dhuhr: -5 });
    expect(result.Dhuhr).toBe("11:55");
  });
  it("wraps midnight correctly", () => {
    const result = applyOffsets({ Isha: "23:50" }, { Isha: 20 });
    expect(result.Isha).toBe("00:10");
  });
  it("does not mutate the original object", () => {
    const original = { Fajr: "05:00" };
    applyOffsets(original, { Fajr: 5 });
    expect(original.Fajr).toBe("05:00");
  });
  it("ignores unknown prayer names in offsets", () => {
    const result = applyOffsets({ Fajr: "05:00" }, { Unknown: 10 });
    expect(result.Fajr).toBe("05:00");
  });
  it("returns original times when offsets are empty", () => {
    const times = { Fajr: "05:00", Dhuhr: "12:00" };
    expect(applyOffsets(times, {})).toBe(times);
  });
});

// ─── makeProgressBar ──────────────────────────────────────────────────────────

describe("makeProgressBar", () => {
  it("shows 0% at period start", () => {
    const start = new Date(Date.now() - 1);
    const end   = new Date(Date.now() + 60 * 60000);
    expect(makeProgressBar(start, end)).toContain("0%");
  });
  it("shows 100% at period end", () => {
    const start = new Date(Date.now() - 60 * 60000);
    const end   = new Date(Date.now() - 1);
    expect(makeProgressBar(start, end)).toContain("100%");
  });
  it("bar contains only block characters and spaces", () => {
    const start = new Date(Date.now() - 30 * 60000);
    const end   = new Date(Date.now() + 30 * 60000);
    const bar   = makeProgressBar(start, end);
    expect(bar).toMatch(/^[█░]+\s+\d+%$/);
  });
});
