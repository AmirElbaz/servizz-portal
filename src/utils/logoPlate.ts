import { useEffect, useState } from "react";

// Universal "logo plate" — the surface every project logo sits on.
//
// Project logos are uncontrolled artwork: some white, some dark, some a
// brand color that happens to match the project's accent. So the plate
// can NOT be derived from the accent/theme color (an earlier attempt did
// that — the plate came out the same hue as the logo and blended just as
// badly as white-on-white, Amir 2026-05-19).
//
// Instead the plate is chosen from the LOGO ITSELF: measure the average
// brightness of its opaque pixels once, then put a light/white logo on a
// dark slate tile and a dark logo on a white tile. Neutral, never the
// accent, so it can never clash. Zero per-logo config.
//
// The on-screen plate and the PDF plate must match: the frontend resolves
// the tile here and passes the chosen background to the export endpoint
// (the backend can't decode pixels — no image library). Same logo file →
// same decision, so screen and PDF agree.

export interface LogoPlate {
  /** Tile background color. */
  bg: string;
  /** Whether to draw a hairline border (true for the white tile so a light
   *  logo's edges don't bleed into the page). */
  border: boolean;
}

// Light / white logos → dark slate (NOT pure black, so a near-black detail
// still reads). Dark logos → white tile with a hairline border.
export const PLATE_DARK: LogoPlate = { bg: "#1F2933", border: false };
export const PLATE_LIGHT: LogoPlate = { bg: "#FFFFFF", border: true };

// Per-project override from `avaya_projects.logo_plate_mode`. When set, it
// short-circuits the brightness analysis — admins (via DB UPDATE for now)
// can force a logo onto the opposite tile when auto-pick reads wrong.
export type LogoPlateOverride = "dark" | "light" | null | undefined;

// Pixels dimmer/brighter than this (0..255 luma) flip the tile. Biased a
// little toward the dark tile because white/light logos were the reported
// failure and read crisply on slate, while mid-tone brand colors still
// have plenty of contrast there.
const FLIP_AT = 120;

// One measurement per distinct src for the whole session. Returns the same
// promise to every caller (component render AND the export handler) so the
// decision is always identical.
const cache = new Map<string, Promise<LogoPlate>>();

function measure(src: string): Promise<LogoPlate> {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      try {
        const N = 36; // tiny — logos are simple; this is plenty to average
        const canvas = document.createElement("canvas");
        canvas.width = N;
        canvas.height = N;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return resolve(PLATE_DARK);
        ctx.drawImage(img, 0, 0, N, N);
        const { data } = ctx.getImageData(0, 0, N, N);

        let sum = 0;
        let weight = 0;
        for (let i = 0; i < data.length; i += 4) {
          const a = data[i + 3] / 255;
          if (a < 0.1) continue; // ignore (near-)transparent padding
          const luma =
            0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
          sum += luma * a;
          weight += a;
        }
        if (weight === 0) return resolve(PLATE_DARK);
        const mean = sum / weight; // 0..255 over opaque area
        resolve(mean >= FLIP_AT ? PLATE_DARK : PLATE_LIGHT);
      } catch {
        // Same-origin canvas shouldn't taint; if anything goes wrong fall
        // back to the dark tile (correct for the common light/white logo).
        resolve(PLATE_DARK);
      }
    };
    img.onerror = () => resolve(PLATE_DARK);
    img.src = src;
  });
}

// Resolve (and cache) the tile for a logo URL. The export handler awaits
// this so the PDF gets the exact tile the screen rendered. `override` from
// the DB short-circuits the analysis when set.
export function getLogoPlate(
  src: string | null | undefined,
  override?: LogoPlateOverride,
): Promise<LogoPlate> {
  if (override === "dark") return Promise.resolve(PLATE_DARK);
  if (override === "light") return Promise.resolve(PLATE_LIGHT);
  if (!src || !src.trim()) return Promise.resolve(PLATE_DARK);
  let p = cache.get(src);
  if (!p) {
    p = measure(src);
    cache.set(src, p);
  }
  return p;
}

// Hook form for render. Defaults to the dark tile until measured — that's
// the right answer for the majority (light/white logos), so there's no
// jarring flip for them; dark logos correct to the white tile on load. An
// explicit `override` resolves synchronously (no flash, no measurement).
export function useLogoPlate(
  src: string | null | undefined,
  override?: LogoPlateOverride,
): LogoPlate {
  const initial =
    override === "dark" ? PLATE_DARK : override === "light" ? PLATE_LIGHT : PLATE_DARK;
  const [plate, setPlate] = useState<LogoPlate>(initial);
  useEffect(() => {
    if (override === "dark") {
      setPlate(PLATE_DARK);
      return;
    }
    if (override === "light") {
      setPlate(PLATE_LIGHT);
      return;
    }
    let alive = true;
    getLogoPlate(src).then((p) => {
      if (alive) setPlate(p);
    });
    return () => {
      alive = false;
    };
  }, [src, override]);
  return plate;
}
