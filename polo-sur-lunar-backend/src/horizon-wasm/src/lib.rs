//! Lunar horizon mask ray-marching and solar disk visibility calculations.
//!
//! # Coordinate & Unit Conventions
//! - `dem` is a contiguous **row-major** slice of length `height * width` containing
//!   elevations in **meters**.
//! - Row `0` is north; increasing row moves south, and increasing column moves east.
//! - Azimuth `0°` points north (`drow = -1, dcol = 0`) and increases clockwise
//!   (`90°` is east: `drow = 0, dcol = +1`).
//! - Lunar curvature correction uses [`LUNAR_RADIUS_M`] (`1_737_400.0` m):
//!   `z_corr = z_terrain - d^2 / (2 * LUNAR_RADIUS_M)`.

use std::f64::consts::PI;

/// Mean lunar radius in meters used for curvature correction.
pub const LUNAR_RADIUS_M: f64 = 1_737_400.0;

#[inline]
fn bilinear_interpolate(dem: &[f32], width: usize, height: usize, row: f64, col: f64) -> f64 {
    let mut r0 = row.floor() as isize;
    if r0 < 0 {
        r0 = 0;
    } else if r0 >= (height - 1) as isize {
        r0 = (height - 2) as isize;
    }
    let r0_u = r0 as usize;
    let r1_u = r0_u + 1;
    let dr = row - (r0_u as f64);

    let mut c0 = col.floor() as isize;
    if c0 < 0 {
        c0 = 0;
    } else if c0 >= (width - 1) as isize {
        c0 = (width - 2) as isize;
    }
    let c0_u = c0 as usize;
    let c1_u = c0_u + 1;
    let dc = col - (c0_u as f64);

    let z00 = dem[r0_u * width + c0_u] as f64;
    let z01 = dem[r0_u * width + c1_u] as f64;
    let z10 = dem[r1_u * width + c0_u] as f64;
    let z11 = dem[r1_u * width + c1_u] as f64;

    (1.0 - dr) * (1.0 - dc) * z00
        + (1.0 - dr) * dc * z01
        + dr * (1.0 - dc) * z10
        + dr * dc * z11
}

/// Compute a horizon elevation mask (in degrees) for an observer on a row-major `f32` DEM.
///
/// # Arguments
/// * `dem` - Row-major terrain heights in meters (`length == width * height`).
/// * `width` - Number of columns (`>= 2`).
/// * `height` - Number of rows (`>= 2`).
/// * `obs_row` - Observer row index in `[0, height - 1]`.
/// * `obs_col` - Observer column index in `[0, width - 1]`.
/// * `resolution_m` - Square pixel spacing in meters per pixel (`> 0`).
/// * `n_azimuths` - Number of equally spaced azimuths clockwise from north (`>= 1`).
/// * `max_distance_m` - Optional maximum ray distance in meters (`> 0` if `Some`).
/// * `observer_height_m` - Observer height above local surface in meters (`>= 0`).
pub fn compute_horizon_mask(
    dem: &[f32],
    width: usize,
    height: usize,
    obs_row: f64,
    obs_col: f64,
    resolution_m: f64,
    n_azimuths: usize,
    max_distance_m: Option<f64>,
    observer_height_m: f64,
) -> Result<Vec<f32>, String> {
    if width < 2 || height < 2 {
        return Err(format!(
            "DEM dimensions must be at least 2x2 pixels, got {width}x{height}."
        ));
    }

    let expected_len = width
        .checked_mul(height)
        .ok_or_else(|| "DEM dimensions overflow usize.".to_string())?;
    if dem.len() != expected_len {
        return Err(format!(
            "DEM length mismatch: expected {expected_len} ({width}x{height}), got {}.",
            dem.len()
        ));
    }
    if !dem.iter().all(|v| v.is_finite()) {
        return Err("DEM contains non-finite (NaN or Inf) elevation values.".to_string());
    }

    if !obs_row.is_finite() || !obs_col.is_finite() {
        return Err(format!(
            "Observer coordinates must be finite, got ({obs_row}, {obs_col})."
        ));
    }
    let max_row = (height - 1) as f64;
    let max_col = (width - 1) as f64;
    if obs_row < 0.0 || obs_row > max_row || obs_col < 0.0 || obs_col > max_col {
        return Err(format!(
            "Observer coordinates ({obs_row}, {obs_col}) are outside DEM bounds [0, {max_row}] x [0, {max_col}]."
        ));
    }

    if !resolution_m.is_finite() || resolution_m <= 0.0 {
        return Err(format!(
            "resolution_m must be finite and > 0, got {resolution_m}."
        ));
    }
    if n_azimuths == 0 {
        return Err("n_azimuths must be >= 1.".to_string());
    }
    if !observer_height_m.is_finite() || observer_height_m < 0.0 {
        return Err(format!(
            "observer_height_m must be finite and >= 0, got {observer_height_m}."
        ));
    }
    if let Some(max_d) = max_distance_m {
        if !max_d.is_finite() || max_d <= 0.0 {
            return Err(format!(
                "max_distance_m must be finite and > 0 when provided, got {max_d}."
            ));
        }
    }

    let z_obs = bilinear_interpolate(dem, width, height, obs_row, obs_col) + observer_height_m;
    let inv_2r = 1.0 / (2.0 * LUNAR_RADIUS_M);

    let mut mask = Vec::with_capacity(n_azimuths);
    for i in 0..n_azimuths {
        let az_rad = (2.0 * PI * (i as f64)) / (n_azimuths as f64);
        let dcol = az_rad.sin();
        let drow = -az_rad.cos();

        let mut best_angle_rad = -0.5 * PI;
        let mut step: usize = 1;
        loop {
            let step_f = step as f64;
            let d = step_f * resolution_m;
            if let Some(max_d) = max_distance_m {
                if d > max_d {
                    break;
                }
            }

            let r = obs_row + step_f * drow;
            let c = obs_col + step_f * dcol;
            if r < 0.0 || r > max_row || c < 0.0 || c > max_col {
                break;
            }

            let z_terrain = bilinear_interpolate(dem, width, height, r, c);
            let z_corr = z_terrain - (d * d) * inv_2r;
            let angle_rad = (z_corr - z_obs).atan2(d);
            if angle_rad > best_angle_rad {
                best_angle_rad = angle_rad;
            }

            step += 1;
        }

        mask.push(best_angle_rad.to_degrees() as f32);
    }

    Ok(mask)
}

/// Compute the visible fraction `[0.0, 1.0]` of the solar disk above the local horizon.
///
/// Uses the circular-segment area formula with normalized center elevation:
/// `x = (sun_center_elevation_deg - horizon_elevation_deg) / solar_angular_radius_deg`.
///
/// Returns `0.0` when `x <= -1.0`, `1.0` when `x >= 1.0`, and the exact circular
/// segment fraction between both bounds.
pub fn solar_disk_fraction(
    sun_center_elevation_deg: f64,
    horizon_elevation_deg: f64,
    solar_angular_radius_deg: f64,
) -> Result<f64, String> {
    if !sun_center_elevation_deg.is_finite()
        || !horizon_elevation_deg.is_finite()
        || !solar_angular_radius_deg.is_finite()
    {
        return Err(
            "sun_center_elevation_deg, horizon_elevation_deg, and solar_angular_radius_deg must be finite."
                .to_string(),
        );
    }
    if solar_angular_radius_deg <= 0.0 {
        return Err(format!(
            "solar_angular_radius_deg must be > 0, got {solar_angular_radius_deg}."
        ));
    }

    let x = (sun_center_elevation_deg - horizon_elevation_deg) / solar_angular_radius_deg;
    if x <= -1.0 {
        return Ok(0.0);
    }
    if x >= 1.0 {
        return Ok(1.0);
    }

    let frac = 0.5 + (x.asin() + x * (1.0 - x * x).max(0.0).sqrt()) / PI;
    Ok(frac.clamp(0.0, 1.0))
}

#[cfg(feature = "wasm")]
mod wasm_bindings {
    use wasm_bindgen::prelude::*;

    use super::{compute_horizon_mask, solar_disk_fraction};

    /// WASM wrapper for [`compute_horizon_mask`].
    ///
    /// Pass `undefined` / `None` for `max_distance_m` to march to the DEM border.
    #[wasm_bindgen(js_name = computeHorizonMask)]
    pub fn compute_horizon_mask_wasm(
        dem: &[f32],
        width: usize,
        height: usize,
        obs_row: f64,
        obs_col: f64,
        resolution_m: f64,
        n_azimuths: usize,
        max_distance_m: Option<f64>,
        observer_height_m: f64,
    ) -> Result<Vec<f32>, JsValue> {
        compute_horizon_mask(
            dem,
            width,
            height,
            obs_row,
            obs_col,
            resolution_m,
            n_azimuths,
            max_distance_m,
            observer_height_m,
        )
        .map_err(|e| JsValue::from_str(&e))
    }

    /// WASM wrapper for [`solar_disk_fraction`].
    #[wasm_bindgen(js_name = solarDiskFraction)]
    pub fn solar_disk_fraction_wasm(
        sun_center_elevation_deg: f64,
        horizon_elevation_deg: f64,
        solar_angular_radius_deg: f64,
    ) -> Result<f64, JsValue> {
        solar_disk_fraction(
            sun_center_elevation_deg,
            horizon_elevation_deg,
            solar_angular_radius_deg,
        )
        .map_err(|e| JsValue::from_str(&e))
    }
}

#[cfg(feature = "wasm")]
pub use wasm_bindings::{compute_horizon_mask_wasm, solar_disk_fraction_wasm};

#[cfg(test)]
mod tests {
    use super::*;

    fn make_synthetic_dem(
        width: usize,
        height: usize,
        base_m: f32,
        ridge_row: Option<usize>,
        ridge_height_m: f32,
    ) -> Vec<f32> {
        let mut dem = vec![base_m; width * height];
        if let Some(rr) = ridge_row {
            for col in 0..width {
                dem[rr * width + col] += ridge_height_m;
            }
        }
        dem
    }

    #[test]
    fn ridge_10m_at_1km_matches_geometry() {
        let width = 256;
        let height = 256;
        let resolution_m = 10.0;
        let center = 128;
        // 1 km north of row 128 at 10 m/px is row 28.
        let dem = make_synthetic_dem(width, height, 0.0, Some(28), 10.0);

        let mask = compute_horizon_mask(
            &dem,
            width,
            height,
            center as f64,
            center as f64,
            resolution_m,
            360,
            None,
            0.0,
        )
        .expect("valid horizon computation");

        let d = 1000.0;
        let z_corr = 10.0 - (d * d) / (2.0 * LUNAR_RADIUS_M);
        let expected_deg = z_corr.atan2(d).to_degrees();

        assert!(((mask[0] as f64) - expected_deg).abs() < 0.01);
        assert!(((mask[0] as f64) - expected_deg).abs() < 1e-4);
        assert!(mask[180] < 0.0);
    }

    #[test]
    fn flat_terrain_reflects_lunar_curvature() {
        let width = 201;
        let height = 201;
        let resolution_m = 100.0;
        let dem = make_synthetic_dem(width, height, 50.0, None, 0.0);

        let mask_zero = compute_horizon_mask(
            &dem,
            width,
            height,
            100.0,
            100.0,
            resolution_m,
            36,
            None,
            0.0,
        )
        .expect("flat horizon");

        let expected_step1_deg = (-(100.0_f64 * 100.0) / (2.0 * LUNAR_RADIUS_M))
            .atan2(100.0)
            .to_degrees();
        for &angle in &mask_zero {
            assert!(angle < 0.0);
            assert!(((angle as f64) - expected_step1_deg).abs() < 1e-4);
        }

        let obs_h = 10.0;
        let mask_elev = compute_horizon_mask(
            &dem,
            width,
            height,
            100.0,
            100.0,
            resolution_m,
            36,
            None,
            obs_h,
        )
        .expect("elevated flat horizon");
        let expected_horizon_deg = (-(2.0 * obs_h / LUNAR_RADIUS_M).sqrt())
            .atan2(1.0)
            .to_degrees();
        for (&e, &z) in mask_elev.iter().zip(mask_zero.iter()) {
            assert!(e < z);
            assert!(((e as f64) - expected_horizon_deg).abs() < 0.01);
        }
    }

    #[test]
    fn raising_observer_lowers_apparent_ridge_elevation() {
        let width = 256;
        let height = 256;
        let resolution_m = 10.0;
        let dem = make_synthetic_dem(width, height, 0.0, Some(28), 20.0);

        let mask_low = compute_horizon_mask(
            &dem,
            width,
            height,
            128.0,
            128.0,
            resolution_m,
            72,
            None,
            0.0,
        )
        .unwrap();
        let mask_high = compute_horizon_mask(
            &dem,
            width,
            height,
            128.0,
            128.0,
            resolution_m,
            72,
            None,
            5.0,
        )
        .unwrap();

        assert!(mask_high[0] < mask_low[0]);
    }

    #[test]
    fn solar_disk_fraction_limits_and_symmetry() {
        let r = 0.2666;
        assert_eq!(solar_disk_fraction(0.0, 0.5, r).unwrap(), 0.0);
        assert!((solar_disk_fraction(1.0 - r, 1.0, r).unwrap() - 0.0).abs() < 1e-12);
        assert!((solar_disk_fraction(1.0, 1.0, r).unwrap() - 0.5).abs() < 1e-12);
        assert!((solar_disk_fraction(1.0 + r, 1.0, r).unwrap() - 1.0).abs() < 1e-12);
        assert_eq!(solar_disk_fraction(2.0, 1.0, r).unwrap(), 1.0);

        let f_low = solar_disk_fraction(1.0 - 0.5 * r, 1.0, r).unwrap();
        let f_high = solar_disk_fraction(1.0 + 0.5 * r, 1.0, r).unwrap();
        assert!(f_low > 0.0 && f_low < 0.5 && f_high > 0.5 && f_high < 1.0);
        assert!((f_low + f_high - 1.0).abs() < 1e-12);
    }

    #[test]
    fn validation_rejects_invalid_inputs() {
        let valid_dem = vec![0.0_f32; 16];
        assert!(compute_horizon_mask(&valid_dem, 1, 16, 0.0, 0.0, 10.0, 8, None, 0.0).is_err());
        assert!(compute_horizon_mask(&valid_dem, 4, 4, -0.1, 2.0, 10.0, 8, None, 0.0).is_err());
        assert!(compute_horizon_mask(&valid_dem[..15], 4, 4, 2.0, 2.0, 10.0, 8, None, 0.0).is_err());
        assert!(compute_horizon_mask(&valid_dem, 4, 4, 2.0, 2.0, 0.0, 8, None, 0.0).is_err());
        assert!(compute_horizon_mask(&valid_dem, 4, 4, 2.0, 2.0, 10.0, 0, None, 0.0).is_err());

        let mut nan_dem = valid_dem;
        nan_dem[5] = f32::NAN;
        assert!(compute_horizon_mask(&nan_dem, 4, 4, 2.0, 2.0, 10.0, 8, None, 0.0).is_err());

        assert!(solar_disk_fraction(1.0, 1.0, 0.0).is_err());
        assert!(solar_disk_fraction(f64::NAN, 1.0, 0.25).is_err());
    }
}
