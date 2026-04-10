self.onmessage = function (e) {
  const { type, data, filterType } = e.data;

  if (type === 'FILTER') {
    if (filterType === 'NONE') {
        self.postMessage({ type: 'FILTERED_DATA', payload: [] });
        return;
    }

    let filtered = [];
    if (filterType === 'ALL') {
      filtered = data;
    } else if (filterType === 'PHA') {
      filtered = data.filter(orbit => orbit[7] === 1);
    } else if (filterType === 'SAFE') {
      filtered = data.filter(orbit => orbit[7] === 0);
    }

    self.postMessage({ type: 'FILTERED_DATA', payload: filtered });
  }
};
