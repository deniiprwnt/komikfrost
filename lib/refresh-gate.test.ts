/**
 * Uji cooldown auto-refresh. Jalankan: node lib/refresh-gate.test.ts
 */
import assert from "node:assert/strict";
import { createRefreshGate } from "./refresh-gate.ts";

const T0 = 1_000_000;
const g = createRefreshGate({ eventCooldownMs: 20_000, intervalMs: 120_000 });

assert.equal(g.allow("event", T0), true, "refresh pertama selalu boleh");
g.mark(T0);

// Beberapa event beruntun (visibility + focus + pageshow) = satu refresh.
assert.equal(g.allow("event", T0 + 1), false, "event beruntun ditolak");
assert.equal(g.allow("event", T0 + 19_999), false, "masih dalam cooldown");
assert.equal(g.allow("event", T0 + 20_000), true, "setelah cooldown boleh");

// Interval tidak boleh menyusul tepat setelah refresh karena event/tab lain.
assert.equal(g.allow("interval", T0 + 59_999), false, "interval terlalu dekat");
assert.equal(g.allow("interval", T0 + 60_000), true, "interval normal boleh");

// Refresh oleh tab lain (mark) ikut menahan tab ini.
const other = createRefreshGate({ eventCooldownMs: 20_000, intervalMs: 120_000 });
other.mark(T0 + 5_000);
assert.equal(other.allow("event", T0 + 6_000), false, "tab lain baru refresh");
assert.equal(other.allow("interval", T0 + 120_000), true, "interval berikutnya tetap jalan");

// Kembali ke foreground setelah lama di background harus tetap refresh.
assert.equal(g.allow("event", T0 + 10 * 60_000), true, "foreground setelah lama = refresh");

console.log("refresh-gate.test: OK");
