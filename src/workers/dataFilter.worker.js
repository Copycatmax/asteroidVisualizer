let sourceData = [];

self.onmessage = function (e) {
  const { type, filterType, payload } = e.data;

  if (type === 'SET_DATA') {
    sourceData = Array.isArray(payload) ? payload : [];
    return;
  }

  if (type === 'FILTER') {
    if (filterType === 'NONE') {
      self.postMessage({ type: 'FILTERED_DATA', payload: [] });
      return;
    }

    let filtered = [];
    if (filterType === 'ALL') {
      filtered = sourceData;
    } else if (filterType === 'PHA') {
      filtered = sourceData.filter((orbit) => orbit[7] === 1);
    } else if (filterType === 'SAFE') {
      filtered = sourceData.filter((orbit) => orbit[7] === 0);
    }

    self.postMessage({ type: 'FILTERED_DATA', payload: filtered });
  }
};
