import { useState, useEffect } from 'react';

export function useDataChunker(activeYear) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activeYear || activeYear < 2015 || activeYear > 2035) return;
    
    setLoading(true);
    fetch(`/data/approaches_${activeYear}.json`)
      .then(res => res.json())
      .then(chunk => {
        setData(chunk);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load chunk for year', activeYear, err);
        setLoading(false);
      });
  }, [activeYear]);

  return { data, loading };
}
