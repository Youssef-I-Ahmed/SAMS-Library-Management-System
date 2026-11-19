import { useCallback, useEffect, useState } from 'react';

// Retain a same-query snapshot on refresh failure, never across filters or sessions.
export function useCirculationList(load, { token, status, page, pageSize }) {
  const key = JSON.stringify([token, status, page, pageSize]);
  const [read, setRead] = useState({ key: null, result: null, loading: true, error: null });
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((value) => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setRead((previous) => ({ key, result: previous.key === key ? previous.result : null, loading: true, error: null }));
    load(token, { status, page, pageSize }, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setRead({ key, result, loading: false, error: null });
      })
      .catch((error) => {
        if (!controller.signal.aborted && error.name !== 'AbortError') {
          setRead((previous) => ({ ...previous, loading: false, error }));
        }
      });
    return () => controller.abort();
  }, [load, token, status, page, pageSize, key, version]);

  const updateRecord = useCallback((record) => {
    if (!record?.id) return;
    setRead((previous) => previous.key !== key || !previous.result ? previous : {
      ...previous,
      result: { ...previous.result, data: previous.result.data.map((entry) =>
        entry.id === record.id ? { ...entry, ...record } : entry) }
    });
  }, [key]);

  return {
    result: read.key === key ? read.result : null,
    error: read.key === key ? read.error : null,
    loading: read.key !== key || read.loading,
    reload,
    updateRecord
  };
}
