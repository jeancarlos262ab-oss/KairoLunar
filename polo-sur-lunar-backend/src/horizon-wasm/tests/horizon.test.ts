import assert from "node:assert/strict";
import test from "node:test";

import {
  LUNAR_RADIUS_M,
  bilinearInterpolate,
  computeHorizonMask,
  solarDiskFraction,
} from "../src/index.ts";

function makeSyntheticDem(
  width: number,
  height: number,
  baseM: number,
  ridgeRow: number | null = null,
  ridgeHeightM = 0.0,
): Float32Array {
  const dem = new Float32Array(width * height);
  dem.fill(baseM);
  if (ridgeRow !== null) {
    const start = ridgeRow * width;
    for (let col = 0; col < width; col++) {
      dem[start + col] += ridgeHeightM;
    }
  }
  return dem;
}

test("10m ridge at 1km north matches geometric elevation within 0.01 deg", () => {
  const width = 256;
  const height = 256;
  const resolutionM = 10.0;
  const center = 128;
  // 1 km north of row 128 at 10 m/px is row 28.
  const dem = makeSyntheticDem(width, height, 0.0, 28, 10.0);

  const mask = computeHorizonMask(
    dem,
    width,
    height,
    center,
    center,
    resolutionM,
    360,
    null,
    0.0,
  );

  const d = 1000.0;
  const zCorr = 10.0 - (d * d) / (2.0 * LUNAR_RADIUS_M);
  const expectedDeg = (Math.atan2(zCorr, d) * 180.0) / Math.PI;

  assert.ok(Math.abs(mask[0] - expectedDeg) < 0.01);
  assert.ok(Math.abs(mask[0] - expectedDeg) < 1e-4);
  assert.ok(mask[180] < 0.0);
});

test("flat terrain reflects lunar curvature for ground and elevated observers", () => {
  const width = 201;
  const height = 201;
  const resolutionM = 100.0;
  const dem = makeSyntheticDem(width, height, 50.0);

  const maskZero = computeHorizonMask(dem, width, height, 100.0, 100.0, resolutionM, 36);
  const expectedStep1Deg =
    (Math.atan2(-(100.0 * 100.0) / (2.0 * LUNAR_RADIUS_M), 100.0) * 180.0) / Math.PI;

  for (const angle of maskZero) {
    assert.ok(angle < 0.0);
    assert.ok(Math.abs(angle - expectedStep1Deg) < 1e-4);
  }

  const obsH = 10.0;
  const maskElev = computeHorizonMask(
    dem,
    width,
    height,
    100.0,
    100.0,
    resolutionM,
    36,
    null,
    obsH,
  );
  const expectedHorizonDeg =
    (Math.atan2(-Math.sqrt((2.0 * obsH) / LUNAR_RADIUS_M), 1.0) * 180.0) / Math.PI;

  for (let i = 0; i < maskElev.length; i++) {
    assert.ok(maskElev[i] < maskZero[i]);
    assert.ok(Math.abs(maskElev[i] - expectedHorizonDeg) < 0.01);
  }
});

test("raising observer height reduces apparent ridge elevation", () => {
  const width = 256;
  const height = 256;
  const resolutionM = 10.0;
  const dem = makeSyntheticDem(width, height, 0.0, 28, 20.0);

  const maskLow = computeHorizonMask(dem, width, height, 128.0, 128.0, resolutionM, 72, null, 0.0);
  const maskHigh = computeHorizonMask(dem, width, height, 128.0, 128.0, resolutionM, 72, null, 5.0);

  assert.ok(maskHigh[0] < maskLow[0]);
});

test("bilinear interpolation evaluates exact values at centers and midpoints", () => {
  const dem = new Float32Array([
    0.0, 10.0,
    20.0, 30.0,
  ]);
  assert.equal(bilinearInterpolate(dem, 2, 2, 0.0, 0.0), 0.0);
  assert.equal(bilinearInterpolate(dem, 2, 2, 1.0, 1.0), 30.0);
  assert.ok(Math.abs(bilinearInterpolate(dem, 2, 2, 0.5, 0.5) - 15.0) < 1e-12);
});

test("solar disk fraction hits 0, 0.5, 1 bounds and preserves symmetry", () => {
  const r = 0.2666;
  assert.equal(solarDiskFraction(0.0, 0.5, r), 0.0);
  assert.ok(Math.abs(solarDiskFraction(1.0 - r, 1.0, r) - 0.0) < 1e-12);
  assert.ok(Math.abs(solarDiskFraction(1.0, 1.0, r) - 0.5) < 1e-12);
  assert.ok(Math.abs(solarDiskFraction(1.0 + r, 1.0, r) - 1.0) < 1e-12);
  assert.equal(solarDiskFraction(2.0, 1.0, r), 1.0);

  const fLow = solarDiskFraction(1.0 - 0.5 * r, 1.0, r);
  const fHigh = solarDiskFraction(1.0 + 0.5 * r, 1.0, r);
  assert.ok(fLow > 0.0 && fLow < 0.5 && fHigh > 0.5 && fHigh < 1.0);
  assert.ok(Math.abs(fLow + fHigh - 1.0) < 1e-12);
});

test("validation rejects invalid dimensions, NaN values, and out-of-range parameters", () => {
  const validDem = new Float32Array(16);

  assert.throws(() => computeHorizonMask(validDem, 1, 16, 0.0, 0.0, 10.0, 8), RangeError);
  assert.throws(() => computeHorizonMask(validDem, 4, 4, -0.1, 2.0, 10.0, 8), RangeError);
  assert.throws(
    () => computeHorizonMask(validDem.subarray(0, 15), 4, 4, 2.0, 2.0, 10.0, 8),
    RangeError,
  );
  assert.throws(() => computeHorizonMask(validDem, 4, 4, 2.0, 2.0, 0.0, 8), RangeError);
  assert.throws(() => computeHorizonMask(validDem, 4, 4, 2.0, 2.0, 10.0, 0), RangeError);
  assert.throws(
    () => computeHorizonMask(validDem, 4, 4, 2.0, 2.0, 10.0, 8, -5.0, 0.0),
    RangeError,
  );

  const nanDem = new Float32Array(validDem);
  nanDem[5] = Number.NaN;
  assert.throws(() => computeHorizonMask(nanDem, 4, 4, 2.0, 2.0, 10.0, 8), RangeError);

  assert.throws(() => solarDiskFraction(1.0, 1.0, 0.0), RangeError);
  assert.throws(() => solarDiskFraction(Number.NaN, 1.0, 0.25), RangeError);
});
