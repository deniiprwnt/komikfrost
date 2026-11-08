import type { E2EConfig } from "e2e";
import { web } from "@e2e-dev/web";

export default {
  // Data live (scraping 3 sumber): 1 test bisa menunggu lama pada hari
  // tertentu, jadi deadline attempt digeser longgar (default 120 dtk
  // membunuh test yang sebenarnya sehat) dan worker diserialkan —
  // run paralel membuat scraping berebut upstream dan API timeout,
  // padahal run serial stabil.
  timeout: 300000,
  workers: 1,
  targets: [
    {
      name: "web",
      engine: web({ viewport: { width: 1280, height: 800 } }),
      app: {
        // Pakai dev server yang sudah jalan di :3100 (jangan start lagi).
        url: "http://localhost:3100",
      },
    },
  ],
} satisfies E2EConfig;
