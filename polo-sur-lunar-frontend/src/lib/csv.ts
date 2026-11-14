import type { SiteAnalysis } from "../engine/index";

const esc = (v: string): string => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function metricsCsv(analyses: readonly SiteAnalysis[], startIso: string, spanDays: number, maskDeg: number): string {
  const head = [
    "site",
    "lat_deg",
    "lon_deg_east",
    "window_start_utc",
    "window_days",
    "horizon_mask_deg",
    "sun_pct",
    "earth_pct",
    "both_pct",
    "longest_dark_h",
    "longest_comms_blackout_h",
    "max_sun_elevation_deg",
    "max_earth_elevation_deg",
    "score",
  ];
  const rows = analyses.map((a) =>
    [
      esc(a.site.name),
      a.site.lat.toFixed(3),
      a.site.lon.toFixed(3),
      startIso,
      String(spanDays),
      maskDeg.toFixed(1),
      (a.metrics.sunPct * 100).toFixed(1),
      (a.metrics.earthPct * 100).toFixed(1),
      (a.metrics.bothPct * 100).toFixed(1),
      a.metrics.longestDarkH.toFixed(1),
      a.metrics.longestBlackoutH.toFixed(1),
      a.metrics.maxSunEl.toFixed(2),
      a.metrics.maxEarthEl.toFixed(2),
      a.score.toFixed(1),
    ].join(","),
  );
  return [head.join(","), ...rows].join("\n");
}

export function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
