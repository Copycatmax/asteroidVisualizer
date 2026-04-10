import { useState, useEffect, useRef } from 'react';

function parseChunkResponse(response, year) {
  if (!response.ok) {
    throw new Error(`Failed to load approaches_${year}.json: HTTP ${response.status}`);
  }
  return response.json();
}

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
        .then((res) => parseChunkResponse(res, year))
        .then((chunk) => {
          if (!Array.isArray(chunk)) {
            throw new Error(`Invalid chunk format for approaches_${year}.json`);
          }
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
      .then((res) => parseChunkResponse(res, activeYear))
      .then((chunk) => {
        if (!Array.isArray(chunk)) {
          throw new Error(`Invalid chunk format for approaches_${activeYear}.json`);
        }
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
