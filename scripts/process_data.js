import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const NEAR_EARTH_CSV = path.join(__dirname, '../near_earth_asteroids_2025.csv');
const CLOSE_APPROACH_CSV = path.join(__dirname, '../asteroid_close_approaches_2015_2035.csv');
const OUT_DIR = path.join(__dirname, '../public/data');

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

async function processNearEarthAsteroids() {
  const asteroids = [];
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

        if (!isNaN(a) && !isNaN(e) && !isNaN(i)) {
          // Generate procedural Longitude of Ascending Node (om) and Argument of Periapsis (w)
          const om = Math.random() * Math.PI * 2;
          const w = Math.random() * Math.PI * 2;
          
          // [0:spkid, 1:a, 2:e, 3:i_rad, 4:om_rad, 5:w_rad, 6:H, 7:pha_int]
          asteroids.push([spkid, a, e, i, om, w, H, pha]);
        }
      })
      .on('end', () => {
        // Flatten array for buffer attribute friendliness? 
        // No, Array of Arrays is fine for JSON payload, we can flatten on client
        fs.writeFileSync(
          path.join(OUT_DIR, 'orbits.json'),
          JSON.stringify(asteroids)
        );
        console.log(`Processed ${asteroids.length} orbits into orbits.json`);
        resolve();
      })
      .on('error', reject);
  });
}

async function processCloseApproaches() {
  const approachesByYear = {};
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

        if (!isNaN(distAu) && !isNaN(velKmS)) {
          // [0:name, 1:timestamp_ms, 2:distance_au, 3:velocity_kms, 4:H]
          approachesByYear[year].push([name, timestampStr, distAu, velKmS, H]);
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
        console.log(`Processed close approaches into ${Object.keys(approachesByYear).length} yearly chunks.`);
        resolve();
      })
      .on('error', reject);
  });
}

async function main() {
  try {
    await processNearEarthAsteroids();
    await processCloseApproaches();
    console.log('Data processing complete.');
  } catch (err) {
    console.error('Error processing data:', err);
    process.exit(1);
  }
}

main();
