import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const NEAR_EARTH_CSV = path.join(__dirname, '../near_earth_asteroids_2025.csv');
const CLOSE_APPROACH_CSV = path.join(__dirname, '../asteroid_close_approaches_2015_2035.csv');
const OUT_DIR = path.join(__dirname, '../public/data');
const EPHEMERIS_CACHE = path.join(OUT_DIR, 'ephemeris_cache.json');
const TAU = Math.PI * 2;
const J2000_MS = Date.UTC(2000, 0, 1);
const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;
const MIN_EVENTS_FOR_FIT = 3;

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

function normalizeDesignation(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[()]/g, ' ')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

function hash32(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stableUnit(seed) {
  return hash32(seed) / 4294967296;
}

function stableAngle(seed) {
  return stableUnit(seed) * TAU;
}

function wrapAngle(value) {
  return ((value % TAU) + TAU) % TAU;
}

function yearFromTimestamp(timestampMs) {
  return 2000 + (timestampMs - J2000_MS) / MS_PER_YEAR;
}

function earthPositionAu(year) {
  const angle = (year - 2000) * TAU;
  return {
    x: Math.cos(angle),
    y: 0,
    z: Math.sin(angle),
  };
}

function asteroidPositionAu(orbit, om, w, phaseOffset, year) {
  const aAu = orbit.a;
  const e = orbit.e;
  const inc = orbit.inc;
  const periodYears = Math.sqrt(aAu * aAu * aAu);
  const n = TAU / Math.max(periodYears, 1e-6);

  let M = n * (year - 2000) + phaseOffset;
  M = wrapAngle(M);

  let E = M;
  for (let i = 0; i < 8; i++) {
    E = E - (E - e * Math.sin(E) - M) / Math.max(1 - e * Math.cos(E), 1e-6);
  }

  const xp = aAu * (Math.cos(E) - e);
  const yp = aAu * Math.sqrt(Math.max(1 - e * e, 0)) * Math.sin(E);

  const cosw = Math.cos(w);
  const sinw = Math.sin(w);
  const cosi = Math.cos(inc);
  const sini = Math.sin(inc);
  const cosom = Math.cos(om);
  const sinom = Math.sin(om);

  const xPlane = xp * cosw - yp * sinw;
  const yPlane = xp * sinw + yp * cosw;

  const x = cosom * xPlane - sinom * cosi * yPlane;
  const y = sinom * xPlane + cosom * cosi * yPlane;
  const z = sini * yPlane;

  // Match runtime axis convention used in render components.
  return { x, y: z, z: y };
}

function computeDistanceRmse(orbit, events, params) {
  const om = wrapAngle(params[0]);
  const w = wrapAngle(params[1]);
  const phaseOffset = wrapAngle(params[2]);

  let sumSq = 0;
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const year = yearFromTimestamp(event.timestampMs);
    const earthPos = earthPositionAu(year);
    const asteroidPos = asteroidPositionAu(orbit, om, w, phaseOffset, year);

    const dx = asteroidPos.x - earthPos.x;
    const dy = asteroidPos.y - earthPos.y;
    const dz = asteroidPos.z - earthPos.z;

    const modeledDistAu = Math.hypot(dx, dy, dz);
    const err = modeledDistAu - event.distAu;
    sumSq += err * err;
  }

  return Math.sqrt(sumSq / Math.max(events.length, 1));
}

function optimizeAngles(orbit, events, seedKey) {
  const baseOm = stableAngle(`${seedKey}|om`);
  const baseW = stableAngle(`${seedKey}|w`);
  const basePhase = stableAngle(`${seedKey}|phase`);

  const starts = [
    [baseOm, baseW, basePhase],
    [baseOm + Math.PI / 2, baseW, basePhase],
    [baseOm, baseW + Math.PI / 2, basePhase],
    [baseOm, baseW, basePhase + Math.PI / 2],
    [baseOm + Math.PI, baseW + Math.PI, basePhase],
    [baseOm + Math.PI / 3, baseW + Math.PI / 3, basePhase + Math.PI / 3],
  ];

  let bestParams = starts[0].map(wrapAngle);
  let bestRmse = Number.POSITIVE_INFINITY;

  for (let s = 0; s < starts.length; s++) {
    let params = starts[s].map(wrapAngle);
    let rmse = computeDistanceRmse(orbit, events, params);
    let step = Math.PI;

    for (let iter = 0; iter < 22; iter++) {
      let improved = false;

      for (let axis = 0; axis < 3; axis++) {
        for (const dir of [-1, 1]) {
          const candidate = params.slice();
          candidate[axis] = wrapAngle(candidate[axis] + dir * step);
          const candidateRmse = computeDistanceRmse(orbit, events, candidate);
          if (candidateRmse < rmse) {
            params = candidate;
            rmse = candidateRmse;
            improved = true;
          }
        }
      }

      if (!improved) {
        step *= 0.55;
      }

      if (step < 1e-4) break;
    }

    if (rmse < bestRmse) {
      bestRmse = rmse;
      bestParams = params;
    }
  }

  return {
    om: wrapAngle(bestParams[0]),
    w: wrapAngle(bestParams[1]),
    phaseOffset: wrapAngle(bestParams[2]),
    rmseAu: bestRmse,
  };
}

function fallbackAngles(seedKey) {
  return {
    om: stableAngle(`${seedKey}|om`),
    w: stableAngle(`${seedKey}|w`),
    phaseOffset: stableAngle(`${seedKey}|phase`),
    rmseAu: null,
  };
}

function loadEphemerisCache() {
  if (!fs.existsSync(EPHEMERIS_CACHE)) return {};

  try {
    const parsed = JSON.parse(fs.readFileSync(EPHEMERIS_CACHE, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function authoritativeFromCache(cacheEntry) {
  if (!cacheEntry || cacheEntry.status !== 'ok') return null;

  const aAu = Number(cacheEntry.aAu);
  const e = Number(cacheEntry.e);
  const inc = Number(cacheEntry.iRad);
  const om = Number(cacheEntry.omRad);
  const w = Number(cacheEntry.wRad);
  const phaseOffset = Number(cacheEntry.phaseOffsetRad);

  if (
    !Number.isFinite(aAu) ||
    !Number.isFinite(e) ||
    !Number.isFinite(inc) ||
    !Number.isFinite(om) ||
    !Number.isFinite(w) ||
    !Number.isFinite(phaseOffset)
  ) {
    return null;
  }

  return { aAu, e, inc, om, w, phaseOffset };
}

async function processNearEarthAsteroids(approachEventsByKey) {
  const asteroids = [];
  const ephemerisCache = loadEphemerisCache();
  let authoritativeCount = 0;
  let fittedCount = 0;
  let fallbackCount = 0;
  console.log('Processing Near-Earth Asteroids...');

  return new Promise((resolve, reject) => {
    fs.createReadStream(NEAR_EARTH_CSV)
      .pipe(csv())
      .on('data', (data) => {
        const a = parseFloat(data.a);
        const e = parseFloat(data.e);
        const i = parseFloat(data.i) * (Math.PI / 180); // convert deg to radians
        const H = parseFloat(data.H) || 20; // default magnitude if missing
        const pha = data.pha === 'True' ? 1 : 0;
        const spkid = parseInt(data.spkid) || 0;
        const nameData = data.name?.trim() || data.pdes?.trim() || data.full_name?.trim() || '';

        if (!isNaN(a) && !isNaN(e) && !isNaN(i)) {
          const cacheEntry = ephemerisCache[String(spkid)];
          const authoritative = authoritativeFromCache(cacheEntry);

          const orbitCore = {
            a: authoritative ? authoritative.aAu : a,
            e: authoritative ? authoritative.e : e,
            inc: authoritative ? authoritative.inc : i,
          };

          const rawKeys = [data.name, data.pdes, data.full_name, String(spkid)];
          const normalizedKeys = [];
          for (let idx = 0; idx < rawKeys.length; idx++) {
            const key = normalizeDesignation(rawKeys[idx]);
            if (key && !normalizedKeys.includes(key)) {
              normalizedKeys.push(key);
            }
          }

          let matchedEvents = [];
          for (let idx = 0; idx < normalizedKeys.length; idx++) {
            const events = approachEventsByKey.get(normalizedKeys[idx]);
            if (events && events.length > matchedEvents.length) {
              matchedEvents = events;
            }
          }

          const seedKey = `${spkid}|${nameData || data.pdes || ''}`;
          let angles = fallbackAngles(seedKey);
          let fitMode = 0;
          let fitRmseAu = null;

          if (authoritative) {
            angles = {
              om: authoritative.om,
              w: authoritative.w,
              phaseOffset: authoritative.phaseOffset,
              rmseAu: null,
            };
            fitMode = 2;
            authoritativeCount++;
            if (matchedEvents.length > 0) {
              fitRmseAu = computeDistanceRmse(orbitCore, matchedEvents, [angles.om, angles.w, angles.phaseOffset]);
            }
          } else if (matchedEvents.length >= MIN_EVENTS_FOR_FIT) {
            angles = optimizeAngles(orbitCore, matchedEvents, seedKey);
            fitMode = 1;
            fitRmseAu = angles.rmseAu;
            fittedCount++;
          } else {
            fallbackCount++;
          }

          // [0:spkid, 1:a, 2:e, 3:i_rad, 4:om_rad, 5:w_rad, 6:H, 7:pha_int, 8:name, 9:phase_offset_rad, 10:fit_mode(0=fallback,1=fitted,2=authoritative), 11:fit_event_count, 12:fit_rmse_au]
          asteroids.push([
            spkid,
            orbitCore.a,
            orbitCore.e,
            orbitCore.inc,
            angles.om,
            angles.w,
            H,
            pha,
            nameData,
            angles.phaseOffset,
            fitMode,
            matchedEvents.length,
            fitRmseAu,
          ]);
        }
      })
      .on('end', () => {
        fs.writeFileSync(
          path.join(OUT_DIR, 'orbits.json'),
          JSON.stringify(asteroids)
        );
        console.log(`Processed ${asteroids.length} orbits into orbits.json`);
        console.log(`Orbit source stats: ${authoritativeCount} authoritative, ${fittedCount} fitted, ${fallbackCount} fallback.`);
        resolve();
      })
      .on('error', reject);
  });
}

async function processCloseApproaches() {
  const approachesByYear = {};
  const eventsByDesignation = new Map();
  console.log('Processing Close Approaches...');

  return new Promise((resolve, reject) => {
    fs.createReadStream(CLOSE_APPROACH_CSV)
      .pipe(csv())
      .on('data', (data) => {
        const dateStr = data.close_approach_date;
        if (!dateStr) return;

        const dateObj = new Date(dateStr);
        if (isNaN(dateObj.getTime())) return;

        const year = dateObj.getFullYear();
        if (year < 2015 || year > 2035) return;

        if (!approachesByYear[year]) {
          approachesByYear[year] = [];
        }

        const timestampStr = dateObj.getTime();
        const distAu = parseFloat(data.distance_au);
        const velKmS = parseFloat(data.velocity_km_s);
        const H = parseFloat(data.absolute_magnitude) || 25;
        const name = data.designation || '';
        const normalizedDesignation = normalizeDesignation(name);

        if (!isNaN(distAu) && !isNaN(velKmS)) {
          // [0:name, 1:timestamp_ms, 2:distance_au, 3:velocity_kms, 4:H]
          approachesByYear[year].push([name, timestampStr, distAu, velKmS, H]);

          if (normalizedDesignation) {
            if (!eventsByDesignation.has(normalizedDesignation)) {
              eventsByDesignation.set(normalizedDesignation, []);
            }
            eventsByDesignation.get(normalizedDesignation).push({ timestampMs: timestampStr, distAu });
          }
        }
      })
      .on('end', () => {
        for (const [year, events] of Object.entries(approachesByYear)) {
          // sort events chronologically
          events.sort((a, b) => a[1] - b[1]);
          fs.writeFileSync(
            path.join(OUT_DIR, `approaches_${year}.json`),
            JSON.stringify(events)
          );
        }

        for (const events of eventsByDesignation.values()) {
          events.sort((a, b) => a.timestampMs - b.timestampMs);
        }

        console.log(`Processed close approaches into ${Object.keys(approachesByYear).length} yearly chunks.`);
        resolve(eventsByDesignation);
      })
      .on('error', reject);
  });
}

async function main() {
  try {
    const approachEventsByKey = await processCloseApproaches();
    await processNearEarthAsteroids(approachEventsByKey);
    console.log('Data processing complete.');
  } catch (err) {
    console.error('Error processing data:', err);
    process.exit(1);
  }
}

main();
