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
export declare const LUNAR_RADIUS_M = 1737400;
/** Default apparent solar angular radius in degrees (~16 arcminutes). */
export declare const DEFAULT_SOLAR_ANGULAR_RADIUS_DEG = 0.2666;
/** Supported array types for row-major DEM elevation buffers in meters. */
export type DemArray = Float32Array | Float64Array | readonly number[];
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
export declare function bilinearInterpolate(dem: DemArray, width: number, height: number, row: number, col: number): number;
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
export declare function computeHorizonMask(dem: DemArray, width: number, height: number, obsRow: number, obsCol: number, resolutionM: number, nAzimuths?: number, maxDistanceM?: number | null | undefined, observerHeightM?: number, lunarRadiusM?: number): Float32Array;
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
export declare function solarDiskFraction(sunCenterElevationDeg: number, horizonElevationDeg: number, solarAngularRadiusDeg?: number): number;
export { bilinearInterpolate as bilinear_interpolate, computeHorizonMask as compute_horizon_mask, solarDiskFraction as solar_disk_fraction, solarDiskFraction as solar_disk_visible_fraction, };
