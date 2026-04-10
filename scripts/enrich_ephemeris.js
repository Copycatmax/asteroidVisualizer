import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const NEAR_EARTH_CSV = path.join(__dirname, '../near_earth_asteroids_2025.csv');
const OUT_DIR = path.join(__dirname, '../public/data');
const CACHE_PATH = path.join(OUT_DIR, 'ephemeris_cache.json');

const TAU = Math.PI * 2;
const DEG_TO_RAD = Math.PI / 180;
const J2000_JD = 2451544.5;

function wrapAngle(value) {
  return ((value % TAU) + TAU) % TAU;
}

function jdToYear(jd) {
  return 2000 + (jd - J2000_JD) / 365.25;
}

function parseArgs(argv) {
  const args = {
    max: Number.POSITIVE_INFINITY,
    concurrency: 6,
    retryCount: 2,
    retryDelayMs: 450,
    failTtlHours: 24,
    force: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    const next = argv[i + 1];
    if (token === '--max' && next) {
      args.max = Number(next);
      i++;
    } else if (token === '--concurrency' && next) {
      args.concurrency = Math.max(1, Number(next));
      i++;
    } else if (token === '--retry-count' && next) {
      args.retryCount = Math.max(0, Number(next));
      i++;
    } else if (token === '--retry-delay-ms' && next) {
      args.retryDelayMs = Math.max(0, Number(next));
      i++;
    } else if (token === '--fail-ttl-hours' && next) {
      args.failTtlHours = Math.max(0, Number(next));
      i++;
    } else if (token === '--force') {
      args.force = true;
    }
  }

  if (!Number.isFinite(args.max) || args.max <= 0) {
    args.max = Number.POSITIVE_INFINITY;
  }
  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toElementMap(elements) {
  const byName = new Map();
  for (const element of elements || []) {
    if (element?.name) byName.set(element.name, element);
  }
  return byName;
}

function readCsvRows(filePath) {
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => rows.push(row))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

function loadCache() {
  if (!fs.existsSync(CACHE_PATH)) {
    return {};
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveCache(cache) {
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache));
}

async function fetchSbdb(spk) {
  const url = `https://ssd-api.jpl.nasa.gov/sbdb.api?spk=${encodeURIComponent(spk)}&full-prec=1`;
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok || body?.code) {
    const message = body?.message || `HTTP ${response.status}`;
    throw new Error(message);
  }
  return body;
}

function buildEphemerisEntry(spk, payload) {
  const orbit = payload?.orbit;
  const elements = toElementMap(orbit?.elements);

  const aAu = toNumber(elements.get('a')?.value);
  const e = toNumber(elements.get('e')?.value);
  const iDeg = toNumber(elements.get('i')?.value);
  const omDeg = toNumber(elements.get('om')?.value);
  const wDeg = toNumber(elements.get('w')?.value);
  const maDeg = toNumber(elements.get('ma')?.value);
  const epochJd = toNumber(orbit?.epoch);

  if (
    aAu === null ||
    e === null ||
    iDeg === null ||
    omDeg === null ||
    wDeg === null ||
    maDeg === null ||
    epochJd === null
  ) {
    throw new Error('Missing one or more required orbital elements');
  }

  const iRad = iDeg * DEG_TO_RAD;
  const omRad = wrapAngle(omDeg * DEG_TO_RAD);
  const wRad = wrapAngle(wDeg * DEG_TO_RAD);
  const maRad = wrapAngle(maDeg * DEG_TO_RAD);

  const periodYears = Math.sqrt(aAu * aAu * aAu);
  const n = TAU / Math.max(periodYears, 1e-6);
  const epochYear = jdToYear(epochJd);
  const phaseOffsetRad = wrapAngle(maRad - n * (epochYear - 2000));

  return {
    status: 'ok',
    source: 'sbdb',
    fetchedAt: new Date().toISOString(),
    spk: String(spk),
    des: payload?.object?.des || null,
    fullname: payload?.object?.fullname || null,
    epochJd,
    aAu,
    e,
    iRad,
    omRad,
    wRad,
    maRad,
    phaseOffsetRad,
    conditionCode: orbit?.condition_code || null,
    dataArcDays: toNumber(orbit?.data_arc),
    rms: toNumber(orbit?.rms),
    orbitId: orbit?.orbit_id || null,
  };
}

function shouldSkip(cacheEntry, nowMs, failTtlMs, force) {
  if (!cacheEntry || force) return false;
  if (cacheEntry.status === 'ok') return true;

  if (!cacheEntry.lastTriedAt) return false;
  const age = nowMs - Date.parse(cacheEntry.lastTriedAt);
  return Number.isFinite(age) && age < failTtlMs;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const failTtlMs = args.failTtlHours * 60 * 60 * 1000;

  const rows = await readCsvRows(NEAR_EARTH_CSV);
  const cache = loadCache();

  const uniqueSpk = [];
  const seen = new Set();
  for (const row of rows) {
    const spk = String(row.spkid || '').trim();
    if (!spk || seen.has(spk)) continue;
    seen.add(spk);
    uniqueSpk.push(spk);
  }

  const candidates = [];
  const nowMs = Date.now();
  for (const spk of uniqueSpk) {
    const cached = cache[spk];
    if (!shouldSkip(cached, nowMs, failTtlMs, args.force)) {
      candidates.push(spk);
    }
    if (candidates.length >= args.max) break;
  }
  const queueTotal = candidates.length;

  console.log(`Ephemeris cache: ${Object.keys(cache).length} existing entries.`);
  console.log(`Ephemeris enrichment queue: ${candidates.length} objects.`);

  let completed = 0;
  let success = 0;
  let failed = 0;
  const start = Date.now();

  async function worker() {
    while (candidates.length > 0) {
      const spk = candidates.shift();
      if (!spk) return;

      let attempt = 0;
      let lastError = null;

      while (attempt <= args.retryCount) {
        try {
          const payload = await fetchSbdb(spk);
          cache[spk] = buildEphemerisEntry(spk, payload);
          success++;
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
          attempt++;
          if (attempt <= args.retryCount) {
            await sleep(args.retryDelayMs * attempt);
          }
        }
      }

      if (lastError) {
        cache[spk] = {
          status: 'error',
          source: 'sbdb',
          lastTriedAt: new Date().toISOString(),
          message: lastError.message,
        };
        failed++;
      }

      completed++;
      if (completed % 100 === 0 || completed === queueTotal) {
        const elapsedSec = Math.max((Date.now() - start) / 1000, 1);
        const rate = completed / elapsedSec;
        console.log(`Progress ${completed}/${queueTotal} | ok=${success} err=${failed} | ${rate.toFixed(2)} req/s`);
        saveCache(cache);
      }
    }
  }

  const workers = Array.from({ length: args.concurrency }, () => worker());
  await Promise.all(workers);

  saveCache(cache);
  console.log(`Ephemeris enrichment done. success=${success}, failed=${failed}, total=${completed}`);
  console.log(`Cache written to ${CACHE_PATH}`);
}

main().catch((err) => {
  console.error('Failed to enrich ephemeris cache:', err);
  process.exit(1);
});
