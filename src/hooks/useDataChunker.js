import { useState, useEffect, useRef } from 'react';

export function useDataChunker(activeYear) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const yearCacheRef = useRef(new Map());

  useEffect(() => {
    if (!activeYear || activeYear < 2015 || activeYear > 2035) {
      setData([]);
      setLoading(false);
      return;
    }

    const cached = yearCacheRef.current.get(activeYear);
    if (cached) {
      setData(cached);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    fetch(`/data/approaches_${activeYear}.json`, { signal: controller.signal })
      .then((res) => res.json())
      .then((chunk) => {
        yearCacheRef.current.set(activeYear, chunk);
        setData(chunk);
        setLoading(false);
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        console.error('Failed to load chunk for year', activeYear, err);
        setData([]);
        setLoading(false);
      });

    return () => {
      controller.abort();
    };
  }, [activeYear]);

  return { data, loading };
}
