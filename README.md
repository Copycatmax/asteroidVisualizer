# Asteroid Visualizer

Interactive 3D visualization of near-Earth asteroid orbits and close-approach events for years 2015 through 2035.

## Core Function

This application is built for exploratory analysis and education. It lets you:

- Render 41,000+ asteroid orbits in a heliocentric scene.
- Move through time by year (2015 to 2035).
- Inspect close approaches relative to Earth for the selected year.
- Filter and search objects by hazard-related categories and identifiers.
- Inspect per-object data provenance (authoritative, fitted, or fallback orientation mode).

At runtime, the app combines two datasets:

- Orbital elements dataset loaded from public/data/orbits.json.
- Yearly close-approach chunks loaded from public/data/approaches_YYYY.json.

## Prerequisites

- Node.js 20.19+ or 22.12+
- npm 10+

## Quick Start

```bash
npm install
npm run dev
```

## Processing Pipeline

The data pipeline has three stages.

1. Optional enrichment from JPL SBDB to obtain authoritative orbit orientation and epoch information.
2. Transformation of close approaches into yearly chunk files for fast client loading.
3. Construction of orbits.json with source-priority logic: authoritative first, then fitted, then deterministic fallback.

Run commands:

```bash
# 1) Optional but recommended
npm run enrich-ephemeris

# 2) Build app data artifacts in public/data
npm run process-data

# 3) Build production bundle
npm run build
```

Optional enrichment tuning:

```bash
npm run enrich-ephemeris -- --concurrency 8 --max 5000 --retry-count 2 --retry-delay-ms 450 --fail-ttl-hours 24
```

## Math and Calculations

The renderer and processing scripts use a simplified two-body style orbital model with fixed-element propagation.

### 1) Orbital period and mean motion

Given semi-major axis a in AU:

$$
T_{years} = \sqrt{a^3}
$$

$$
n = \frac{2\pi}{T_{years}}
$$

where n is mean motion in radians per year.

### 2) Mean anomaly over time

For year t:

$$
M(t) = n(t - 2000) + \phi
$$

- 2000 is the J2000 year reference used in this project.
- \phi is phase offset (from SBDB epoch conversion when available, otherwise fitted or deterministic fallback).

### 3) Kepler equation solve

Eccentric anomaly E is solved from:

$$
M = E - e\sin(E)
$$

using Newton-Raphson iterations:

$$
E_{k+1} = E_k - \frac{E_k - e\sin(E_k) - M}{1 - e\cos(E_k)}
$$

### 4) Position in orbital plane

With semi-major axis a and eccentricity e:

$$
x_p = a(\cos E - e)
$$

$$
y_p = a\sqrt{1 - e^2}\sin E
$$

### 5) Rotation into 3D space

Using longitude of ascending node \Omega, argument of perihelion \omega, and inclination i, the perifocal coordinates are rotated into 3D coordinates (implemented in scripts/process_data.js and runtime components).

### 6) Earth position model

Earth is represented as a circular orbit approximation:

$$
\alpha_E(t) = 2\pi(t - 2000)
$$

$$
\mathbf{r}_E(t) = [\cos\alpha_E, 0, \sin\alpha_E]
$$

This is intentionally simplified for visualization performance and consistency.

### 7) Fit objective for non-authoritative objects

When authoritative orientation is unavailable and at least 3 close-approach records exist, the pipeline fits \Omega, \omega, and \phi by minimizing distance RMSE against reported close-approach distance in AU:

$$
\operatorname{RMSE} = \sqrt{\frac{1}{N}\sum_{j=1}^{N}(d_{model,j} - d_{obs,j})^2}
$$

Optimization strategy:

- Multi-start seeded by deterministic hashes.
- Coordinate-wise hill-climb with shrinking step size.
- Best-parameter solution kept by minimum RMSE.

### 8) Authoritative phase conversion

For SBDB-provided mean anomaly at epoch MA_epoch and epoch year t_epoch:

$$
\phi = \operatorname{wrap}(MA_{epoch} - n(t_{epoch} - 2000))
$$

This gives a consistent phase offset at the project reference year.

## Data Sources

### Primary files in this repository

- near_earth_asteroids_2025.csv
  - Key columns used: spkid, full_name, pdes, name, pha, H, a, e, i.
- asteroid_close_approaches_2015_2035.csv
  - Key columns used: designation, close_approach_date, distance_au, velocity_km_s, absolute_magnitude.

### External authoritative source

- JPL Small-Body Database API (SBDB)
  - Endpoint used by enrichment script: https://ssd-api.jpl.nasa.gov/sbdb.api
  - Query pattern: spk plus full-precision flag.
  - Elements consumed: a, e, i, om, w, ma, epoch.

## Output Artifacts

Generated files in public/data:

- orbits.json
  - Per-orbit schema index summary:
  - 0 spkid
  - 1 a (AU)
  - 2 e
  - 3 i (rad)
  - 4 om (rad)
  - 5 w (rad)
  - 6 H
  - 7 pha (0 or 1)
  - 8 name
  - 9 phase_offset_rad
  - 10 fit_mode (0 fallback, 1 fitted, 2 authoritative)
  - 11 fit_event_count
  - 12 fit_rmse_au
- approaches_YYYY.json (2015 through 2035)
- ephemeris_cache.json (if enrichment is run)

## Orbit Source Modes

Interpretation of fit_mode field (index 10 in orbits.json):

- 2: authoritative SBDB ephemeris
- 1: fitted from close-approach records
- 0: deterministic fallback when constraints are insufficient

Snapshot on 2026-04-10:

- Total orbits: 41,281
- Authoritative mode 2: 41,253 (99.9322%)
- Fitted mode 1: 1 (0.0024%)
- Fallback mode 0: 27 (0.0654%)
- Ephemeris cache resolved: 41,253 of 41,281
- Ephemeris cache unresolved: 28

## Limitations

This project is a high-quality visualization tool, not an operational astrodynamics system.

1. No full n-body integration is performed.
2. Orbital elements are treated as static within the simplified propagation model.
3. Earth is modeled as a circular reference orbit for viewer consistency.
4. Time control is year-level and not continuous epoch propagation.
5. A small subset of objects still relies on fitted or fallback orientation.
6. Rendering uses level-of-detail thinning, which can hide distant objects.
7. Extremely close approach markers are clamped to avoid visual clipping through Earth.
8. Visualization coordinates are scaled for rendering and are not mission analysis coordinates.

## Recommended Disclaimer

Use this application for exploration, education, and qualitative trend analysis only.
Do not use it for navigation, mission design, planetary defense operations,
or quantitative impact-risk decisions.

## Tech Stack

- React and Vite
- three.js and @react-three/fiber
- Web Worker filtering
- Node.js preprocessing scripts with csv-parser
