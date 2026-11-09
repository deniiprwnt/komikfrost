"use client";

import { useEffect, useState } from "react";

const SEGMENTS = 12;

/**
 * Meteran "stamina" untuk halaman 429: terisi kembali selama `seconds`
 * (default 60 = jendela rate limit /api). Murni informatif — tidak
 * memblokir tombol apa pun.
 */
export function Cooldown({ seconds = 60 }: { seconds?: number }) {
  const [left, setLeft] = useState(seconds);

  useEffect(() => {
    const id = setInterval(() => setLeft((n) => (n > 0 ? n - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, []);

  const done = left === 0;
  const filled = Math.round(((seconds - left) / seconds) * SEGMENTS);
  const mm = String(Math.floor(left / 60)).padStart(1, "0");
  const ss = String(left % 60).padStart(2, "0");

  return (
    <div className="mg-meter" role="timer" aria-live="off">
      <div className="mg-meter-head">
        <span>Stamina Yuki</span>
        <output>{done ? "PENUH" : `${mm}:${ss}`}</output>
      </div>
      <div className="mg-meter-bar" aria-hidden="true">
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <i key={i} data-on={i < filled ? "1" : "0"} />
        ))}
      </div>
      <p className="mg-meter-msg">{done ? "Sudah pulih — silakan lanjut membaca." : "Sedang mengatur napas…"}</p>
    </div>
  );
}
