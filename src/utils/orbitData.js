let orbitsRowsCache = null;
let orbitsRowsPromise = null;
let orbitIndexByNameCache = null;

export function normalizeDesignation(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[()]/g, ' ')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

function buildOrbitIndexByName(rows) {
  const byName = new Map();

  for (let i = 0; i < rows.length; i++) {
    const orbit = rows[i];
    if (!orbit) continue;

    const nameKey = normalizeDesignation(orbit[8]);
    if (nameKey && !byName.has(nameKey)) {
      byName.set(nameKey, orbit);
    }

    const idKey = normalizeDesignation(orbit[0]);
    if (idKey && !byName.has(idKey)) {
      byName.set(idKey, orbit);
    }
  }

  return byName;
}

export function loadOrbitsRows() {
  if (orbitsRowsCache) {
    return Promise.resolve(orbitsRowsCache);
  }

  if (orbitsRowsPromise) {
    return orbitsRowsPromise;
  }

  orbitsRowsPromise = fetch('/data/orbits.json')
    .then((res) => {
      if (!res.ok) {
        throw new Error(`Failed to load orbits.json: HTTP ${res.status}`);
      }
      return res.json();
    })
    .then((rows) => {
      if (!Array.isArray(rows)) {
        throw new Error('Invalid orbits.json format');
      }
      orbitsRowsCache = rows;
      return rows;
    })
    .finally(() => {
      orbitsRowsPromise = null;
    });

  return orbitsRowsPromise;
}

export function loadOrbitIndexByName() {
  if (orbitIndexByNameCache) {
    return Promise.resolve(orbitIndexByNameCache);
  }

  return loadOrbitsRows().then((rows) => {
    if (!orbitIndexByNameCache) {
      orbitIndexByNameCache = buildOrbitIndexByName(rows);
    }
    return orbitIndexByNameCache;
  });
}
