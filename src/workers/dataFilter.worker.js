let sourceData = [];

self.onmessage = function (e) {
  const { type, filterType, payload, requestId } = e.data;

  if (type === 'SET_DATA') {
    sourceData = Array.isArray(payload) ? payload : [];
    return;
  }

  if (type === 'FILTER') {
    if (filterType === 'NONE') {
      self.postMessage({ type: 'FILTERED_DATA', payload: [], requestId });
      return;
    }

    if (filterType === 'ALL') {
      self.postMessage({ type: 'USE_SOURCE_DATA', requestId });
      return;
    }

    let filtered = [];
    if (filterType === 'PHA') {
      filtered = sourceData.filter((orbit) => orbit[7] === 1);
    } else if (filterType === 'SAFE') {
      filtered = sourceData.filter((orbit) => orbit[7] === 0);
    }

    self.postMessage({ type: 'FILTERED_DATA', payload: filtered, requestId });
  }
};
