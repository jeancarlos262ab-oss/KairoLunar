/**
 * Lunar horizon mask ray-marching and solar disk visibility calculations.
 *
 * Coordinate & Unit Conventions:
 * - `dem` is a contiguous row-major array of length `height * width` containing
 *   terrain elevations in meters.
 * - Row `0` is north; increasing row moves south, and increasing column moves east.
 * - Azimuth `0°` points north (`drow = -1, dcol = 0`) and increases clockwise
 *   (`90°` is east: `drow = 0, dcol = +1`).
 * - Lunar curvature correction uses `LUNAR_RADIUS_M` (`1_737_400` m):
 *   `zCorr = zTerrain - d^2 / (2 * lunarRadiusM)`.
 */
/** Mean lunar radius in meters used for curvature correction. */
export const LUNAR_RADIUS_M = 1_737_400.0;
/** Default apparent solar angular radius in degrees (~16 arcminutes). */
export const DEFAULT_SOLAR_ANGULAR_RADIUS_DEG = 0.2666;
const RAD_TO_DEG = 180.0 / Math.PI;
function bilinearCore(dem, width, height, row, col) {
    let r0 = Math.floor(row);
    if (r0 < 0) {
        r0 = 0;
    }
    else if (r0 >= height - 1) {
        r0 = height - 2;
    }
    const r1 = r0 + 1;
    const dr = row - r0;
    let c0 = Math.floor(col);
    if (c0 < 0) {
        c0 = 0;
    }
    else if (c0 >= width - 1) {
        c0 = width - 2;
    }
    const c1 = c0 + 1;
    const dc = col - c0;
    const z00 = dem[r0 * width + c0];
    const z01 = dem[r0 * width + c1];
    const z10 = dem[r1 * width + c0];
    const z11 = dem[r1 * width + c1];
    return ((1.0 - dr) * (1.0 - dc) * z00 +
        (1.0 - dr) * dc * z01 +
        dr * (1.0 - dc) * z10 +
        dr * dc * z11);
}
function validateDemBuffer(dem, width, height) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2) {
        throw new RangeError(`DEM dimensions must be integers >= 2x2 pixels, got ${width}x${height}.`);
    }
    const expectedLen = width * height;
    if (!Number.isSafeInteger(expectedLen)) {
        throw new RangeError("DEM dimensions exceed safe integer range.");
    }
    if (dem.length !== expectedLen) {
        throw new RangeError(`DEM length mismatch: expected ${expectedLen} (${width}x${height}), got ${dem.length}.`);
    }
    for (let idx = 0; idx < expectedLen; idx++) {
        if (!Number.isFinite(dem[idx])) {
            throw new RangeError(`DEM contains non-finite (NaN or Inf) elevation value at index ${idx}.`);
        }
    }
}
/**
 * Bilinearly interpolate terrain elevation in meters at continuous `(row, col)` on a row-major DEM.
 *
 * @param dem Row-major elevation array in meters (`length === width * height`).
 * @param width Number of columns (`>= 2`).
 * @param height Number of rows (`>= 2`).
 * @param row Continuous row index in `[0, height - 1]`.
 * @param col Continuous column index in `[0, width - 1]`.
 * @returns Interpolated elevation in meters.
 */
export function bilinearInterpolate(dem, width, height, row, col) {
    validateDemBuffer(dem, width, height);
    if (!Number.isFinite(row) || !Number.isFinite(col)) {
        throw new RangeError(`Coordinates must be finite, got row=${row}, col=${col}.`);
    }
    const maxRow = height - 1;
    const maxCol = width - 1;
    if (row < 0.0 || row > maxRow || col < 0.0 || col > maxCol) {
        throw new RangeError(`Coordinates (row=${row}, col=${col}) lie outside DEM bounds [0, ${maxRow}] x [0, ${maxCol}].`);
    }
    return bilinearCore(dem, width, height, row, col);
}
/**
 * Compute a horizon elevation mask (in degrees) for an observer on a row-major DEM.
 *
 * Azimuths start at north (`0°`, decreasing row) and increase clockwise
 * (`90°` is east, increasing column). Elevations are corrected for lunar curvature via
 * `zCorr = zTerrain - d^2 / (2 * lunarRadiusM)`.
 *
 * @param dem Row-major terrain heights in meters (`length === width * height`).
 * @param width Number of columns (`>= 2`).
 * @param height Number of rows (`>= 2`).
 * @param obsRow Observer row coordinate in `[0, height - 1]`.
 * @param obsCol Observer column coordinate in `[0, width - 1]`.
 * @param resolutionM Square pixel spacing in meters per pixel (`> 0`).
 * @param nAzimuths Number of equally spaced azimuth rays clockwise from north (`>= 1`, default `360`).
 * @param maxDistanceM Optional maximum ray distance in meters (`> 0`, or `null`/`undefined` for DEM border).
 * @param observerHeightM Observer height above local surface in meters (`>= 0`, default `0`).
 * @param lunarRadiusM Lunar radius in meters for curvature correction (`> 0`, default `1_737_400`).
 * @returns `Float32Array` of length `nAzimuths` with maximum horizon elevation angles in degrees.
 */
export function computeHorizonMask(dem, width, height, obsRow, obsCol, resolutionM, nAzimuths = 360, maxDistanceM = null, observerHeightM = 0.0, lunarRadiusM = LUNAR_RADIUS_M) {
    validateDemBuffer(dem, width, height);
    if (!Number.isFinite(obsRow) || !Number.isFinite(obsCol)) {
        throw new RangeError(`Observer coordinates must be finite, got (${obsRow}, ${obsCol}).`);
    }
    const maxRow = height - 1;
    const maxCol = width - 1;
    if (obsRow < 0.0 || obsRow > maxRow || obsCol < 0.0 || obsCol > maxCol) {
        throw new RangeError(`Observer coordinates (${obsRow}, ${obsCol}) are outside DEM bounds [0, ${maxRow}] x [0, ${maxCol}].`);
    }
    if (!Number.isFinite(resolutionM) || resolutionM <= 0.0) {
        throw new RangeError(`resolutionM must be finite and > 0, got ${resolutionM}.`);
    }
    if (!Number.isInteger(nAzimuths) || nAzimuths < 1) {
        throw new RangeError(`nAzimuths must be an integer >= 1, got ${nAzimuths}.`);
    }
    if (!Number.isFinite(observerHeightM) || observerHeightM < 0.0) {
        throw new RangeError(`observerHeightM must be finite and >= 0, got ${observerHeightM}.`);
    }
    if (!Number.isFinite(lunarRadiusM) || lunarRadiusM <= 0.0) {
        throw new RangeError(`lunarRadiusM must be finite and > 0, got ${lunarRadiusM}.`);
    }
    if (maxDistanceM !== null && maxDistanceM !== undefined) {
        if (!Number.isFinite(maxDistanceM) || maxDistanceM <= 0.0) {
            throw new RangeError(`maxDistanceM must be finite and > 0 when provided, got ${maxDistanceM}.`);
        }
    }
    const zObs = bilinearCore(dem, width, height, obsRow, obsCol) + observerHeightM;
    const inv2R = 1.0 / (2.0 * lunarRadiusM);
    const mask = new Float32Array(nAzimuths);
    const twoPiOverN = (2.0 * Math.PI) / nAzimuths;
    for (let i = 0; i < nAzimuths; i++) {
        const azRad = twoPiOverN * i;
        const dcol = Math.sin(azRad);
        const drow = -Math.cos(azRad);
        let bestAngleRad = -0.5 * Math.PI;
        let step = 1;
        while (true) {
            const d = step * resolutionM;
            if (maxDistanceM !== null && maxDistanceM !== undefined && d > maxDistanceM) {
                break;
            }
            const r = obsRow + step * drow;
            const c = obsCol + step * dcol;
            if (r < 0.0 || r > maxRow || c < 0.0 || c > maxCol) {
                break;
            }
            const zTerrain = bilinearCore(dem, width, height, r, c);
            const zCorr = zTerrain - d * d * inv2R;
            const angleRad = Math.atan2(zCorr - zObs, d);
            if (angleRad > bestAngleRad) {
                bestAngleRad = angleRad;
            }
            step += 1;
        }
        mask[i] = bestAngleRad * RAD_TO_DEG;
    }
    return mask;
}
/**
 * Compute the visible fraction `[0.0, 1.0]` of the solar disk above the local horizon.
 *
 * Uses the circular-segment area formula with normalized center elevation:
 * `x = (sunCenterElevationDeg - horizonElevationDeg) / solarAngularRadiusDeg`.
 *
 * @param sunCenterElevationDeg Solar center elevation angle in degrees.
 * @param horizonElevationDeg Horizon mask elevation angle in degrees.
 * @param solarAngularRadiusDeg Apparent angular radius of the solar disk in degrees (`> 0`).
 * @returns Fraction of the solar disk above the horizon in `[0.0, 1.0]`.
 */
export function solarDiskFraction(sunCenterElevationDeg, horizonElevationDeg, solarAngularRadiusDeg = DEFAULT_SOLAR_ANGULAR_RADIUS_DEG) {
    if (!Number.isFinite(sunCenterElevationDeg) ||
        !Number.isFinite(horizonElevationDeg) ||
        !Number.isFinite(solarAngularRadiusDeg)) {
        throw new RangeError("sunCenterElevationDeg, horizonElevationDeg, and solarAngularRadiusDeg must be finite.");
    }
    if (solarAngularRadiusDeg <= 0.0) {
        throw new RangeError(`solarAngularRadiusDeg must be > 0, got ${solarAngularRadiusDeg}.`);
    }
    const x = (sunCenterElevationDeg - horizonElevationDeg) / solarAngularRadiusDeg;
    if (x <= -1.0) {
        return 0.0;
    }
    if (x >= 1.0) {
        return 1.0;
    }
    const frac = 0.5 + (Math.asin(x) + x * Math.sqrt(Math.max(0.0, 1.0 - x * x))) / Math.PI;
    return Math.min(1.0, Math.max(0.0, frac));
}
export { bilinearInterpolate as bilinear_interpolate, computeHorizonMask as compute_horizon_mask, solarDiskFraction as solar_disk_fraction, solarDiskFraction as solar_disk_visible_fraction, };
//# sourceMappingURL=index.js.map