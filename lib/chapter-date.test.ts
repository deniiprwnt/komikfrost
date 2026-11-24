/**
 * Uji label tanggal chapter (jalankan: node lib/chapter-date.test.ts).
 * Batas hari dihitung di WIB, bukan zona waktu mesin.
 */
import assert from "node:assert/strict";
import { chapterDateFromIso, chapterDateLabel, parseDateId } from "./chapter-date.ts";

// 24/11/2026 10:00 WIB
const NOW = Date.UTC(2026, 10, 24, 3, 0, 0);
assert.equal(chapterDateLabel(parseDateId("24/11/2026"), undefined, NOW), "Hari ini");
assert.equal(chapterDateLabel(parseDateId("23/11/2026"), undefined, NOW), "Kemarin");
assert.equal(chapterDateLabel(parseDateId("21/11/2026"), undefined, NOW), "21/11/2026");
// Tanpa timestamp absolut → teks lama dari API dipakai apa adanya.
assert.equal(chapterDateLabel(undefined, "21/11/2026", NOW), "21/11/2026");
// 23:30 UTC = 24/11 06:30 WIB → tetap "Hari ini", bukan kemarin (bug zona waktu).
const lateUtc = Date.UTC(2026, 10, 23, 23, 30, 0);
assert.equal(chapterDateLabel(lateUtc, undefined, NOW), "Hari ini");
assert.deepEqual(chapterDateFromIso("2026-11-23T23:30:00.000Z"), {
  date: "24/11/2026",
  dateTs: lateUtc,
});
console.log("chapter-date.test: OK");
