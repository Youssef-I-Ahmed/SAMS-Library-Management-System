import { useCallback, useEffect, useRef, useState } from 'react';
import { getBranchesAnalytics, getOverview, getTopItems, getTrends } from './admin-api';

// Publish one complete UI snapshot. The four endpoints are not a database snapshot.
export function useAnalyticsSnapshot(token, filters, enabled = true) {
  const key = JSON.stringify([token, filters]);
  const currentKey = useRef(key);
  currentKey.current = key;
  const sequence = useRef(0);
  const [revision, setRevision] = useState(0);
  const [read, setRead] = useState(null);
  const reload = useCallback(() => {
    sequence.current++;
    setRead(previous => previous && ({ ...previous, loading: true }));
    setRevision(value => value + 1);
  }, []);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController(), request = ++sequence.current;
    const active = () => !controller.signal.aborted && currentKey.current === key && request === sequence.current;
    setRead(previous => ({ token, key, snapshot: previous?.token === token ? previous.snapshot : null, loading: true, error: null }));
    Promise.all([
      getOverview(token, filters, controller.signal), getTrends(token, filters, controller.signal),
      getBranchesAnalytics(token, filters, controller.signal), getTopItems(token, filters, controller.signal)
    ]).then(([overview, trends, branches, top]) => {
      if (!overview?.data || !Array.isArray(trends?.data?.data) || !Array.isArray(branches?.data?.data) || !Array.isArray(top?.data?.data)) {
        const error = new Error('Incomplete analytics response'); error.code = 'INCOMPLETE_ANALYTICS'; throw error;
      }
      if (active()) setRead({ token, key, loading: false, error: null,
        snapshot: { filters: { ...filters }, overview: overview.data, trends: trends.data, branches: branches.data, top: top.data } });
    }).catch(error => {
      if (active()) {
        setRead(previous => ({ token, key, snapshot: previous?.token === token ? previous.snapshot : null, loading: false, error }));
        controller.abort();
      }
    });
    return () => controller.abort();
  }, [token, key, revision, enabled]);
  const snapshot = read?.token === token ? read.snapshot : null;
  const loading = enabled && (!read || read.key !== key || read.loading);
  const error = read?.key === key ? read.error : null;
  return { snapshot, loading, error, stale: Boolean(snapshot && (!enabled || loading || error)), reload };
}

export function reportNumber(value, language) {
  return typeof value === 'number' && Number.isFinite(value) ? new Intl.NumberFormat(language, { maximumFractionDigits: 2 }).format(value) : '—';
}
export function reportPercent(value, language) {
  return typeof value === 'number' && Number.isFinite(value) ? `${reportNumber(value, language)}%` : '—';
}
export function reportDate(value, language, dateOnly = false) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(language === 'ar' ? 'ar-EG' : 'en-GB', { dateStyle: 'medium', ...(dateOnly ? {} : { timeStyle: 'short' }), timeZone: 'UTC' }).format(date);
}
