import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

// A snapshot belongs to one submitted query. Aborted/older reads never publish.
export function useStaffRead(loader, token, filters = {}, enabled = true, reconcile = true) {
  const key = JSON.stringify([token, filters]);
  const [read, setRead] = useState(null);
  const [revision, setRevision] = useState(0);
  const sequence = useRef(0);
  const store = session(token);
  const subscribe = useCallback((listener) => { store.listeners.add(listener); return () => store.listeners.delete(listener); }, [store]);
  const settled = useSyncExternalStore(subscribe, () => reconcile ? store.snapshot.settled : 0);
  const currentKey = useRef(key);
  currentKey.current = key;
  const reload = useCallback(() => {
    sequence.current++;
    setRead((previous) => previous && { ...previous, loading: true });
    setRevision((value) => value + 1);
  }, []);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const request = ++sequence.current;
    setRead((previous) => ({ key, settled, result: previous?.key === key ? previous.result : null, loading: true, error: null }));
    loader(token, JSON.parse(key)[1], controller.signal).then((result) => {
      if (!Array.isArray(result?.data)) throw new Error('Invalid list response');
      if (!controller.signal.aborted && currentKey.current === key && sequence.current === request) setRead({ key, settled, result, loading: false, error: null });
    }).catch((error) => {
      if (!controller.signal.aborted && currentKey.current === key && sequence.current === request) setRead((previous) => ({
        key, settled, result: previous?.key === key ? previous.result : null, loading: false, error
      }));
    });
    return () => controller.abort();
  }, [loader, token, key, revision, enabled, settled]);
  const active = enabled && read?.key === key ? read : null;
  return { result: active?.result || null, loading: enabled && (!active || active.loading || active.settled !== settled), error: active?.error || null, reload };
}

// One synchronous lock across circulation routes/modes, not just disabled buttons.
// Pending requests are not aborted on navigation: doing so cannot undo a server write.
const sessions = new Map();
function session(token) {
  if (!sessions.has(token)) sessions.set(token, { snapshot: { pending: null, error: null, uncertain: false, settled: 0 }, listeners: new Set() });
  return sessions.get(token);
}
function publish(store, patch) {
  store.snapshot = { ...store.snapshot, ...patch };
  store.listeners.forEach((listener) => listener());
}
export function useStaffMutation(token) {
  const store = session(token);
  const subscribe = useCallback((listener) => { store.listeners.add(listener); return () => store.listeners.delete(listener); }, [store]);
  const snapshot = useSyncExternalStore(subscribe, () => store.snapshot);
  const lifetime = useRef(null);
  useEffect(() => { lifetime.current = store; return () => { lifetime.current = null; }; }, [store]);
  async function run(id, request, onSuccess) {
    if (store.snapshot.pending || store.snapshot.uncertain) return;
    publish(store, { pending: id, error: null });
    try {
      const response = await request();
      if (!response?.data?.id || (typeof response.data.status !== 'string' && typeof response.data.isOpen !== 'boolean')) {
        throw new Error('Unconfirmed operation response');
      }
      if (lifetime.current === store) onSuccess(response.data);
    } catch (error) {
      publish(store, { error, uncertain: !error.status || error.status >= 500 || error.status === 408 });
    } finally {
      // Reconcile every mounted circulation read, including a route opened mid-write.
      publish(store, { pending: null, settled: store.snapshot.settled + 1 });
    }
  }
  return { ...snapshot, run,
    acknowledge: () => { if (!store.snapshot.pending) publish(store, { uncertain: false, error: null }); }
  };
}
