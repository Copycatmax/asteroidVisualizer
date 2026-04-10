import { useState, useEffect, useRef } from 'react';

export function useDataChunker(activeYear) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const yearCacheRef = useRef(new Map());
  const inflightPrefetchRef = useRef(new Set());

  useEffect(() => {
    const prefetchYear = (year) => {
      if (year < 2015 || year > 2035) return;
      if (yearCacheRef.current.has(year)) return;
      if (inflightPrefetchRef.current.has(year)) return;

      inflightPrefetchRef.current.add(year);
      fetch(`/data/approaches_${year}.json`)
        .then((res) => res.json())
        .then((chunk) => {
          yearCacheRef.current.set(year, chunk);
        })
        .catch(() => {
          // Best-effort optimization: ignore prefetch errors and rely on foreground fetch.
        })
        .finally(() => {
          inflightPrefetchRef.current.delete(year);
        });
    };

    if (!activeYear || activeYear < 2015 || activeYear > 2035) {
      setData([]);
      setLoading(false);
      return;
    }

    const cached = yearCacheRef.current.get(activeYear);
    if (cached) {
      setData(cached);
      setLoading(false);
      prefetchYear(activeYear - 1);
      prefetchYear(activeYear + 1);
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
        prefetchYear(activeYear - 1);
        prefetchYear(activeYear + 1);
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
