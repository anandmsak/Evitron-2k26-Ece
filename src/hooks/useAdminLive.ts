// src/hooks/useAdminLive.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import { RegistrationRecord } from '../types';
import { fetchAdminRegistrations } from '../services/api';

export interface AdminStats {
  totalRegistrations: number;
  totalParticipants: number;
  workshopCount: number;
  technicalCount: number;
  paidCount: number;
  pendingCount: number;
  eventCounts: Record<string, number>;
  eventTeamCounts: Record<string, number>;
}

export type LiveStatus = 'connecting' | 'live' | 'reconnecting';

/**
 * Single source of truth for the dashboard.
 *  - stats / registrations are `null` until the FIRST successful load (render "—", never 0)
 *  - a failed refetch NEVER clears existing values
 *  - every request carries a sequence number; stale responses are dropped
 *  - one EventSource per token; filters are applied client-side, so typing in the
 *    search box never tears down the stream or refetches
 */
export function useAdminLive(token: string | null, onAuthError: () => void) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [registrations, setRegistrations] = useState<RegistrationRecord[] | null>(null);
  const [status, setStatus] = useState<LiveStatus>('connecting');
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const seq = useRef(0);
  const inFlight = useRef<AbortController | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const authErrRef = useRef(onAuthError);
  authErrRef.current = onAuthError;

  const refresh = useCallback(async () => {
    if (!token) return;
    const mySeq = ++seq.current;
    inFlight.current?.abort();
    const ctrl = new AbortController();
    inFlight.current = ctrl;

    try {
      // Single unified call returning registrations and stats together
      const data = await fetchAdminRegistrations(token, ctrl.signal);
      if (mySeq !== seq.current) return; // a newer request superseded this one
      
      setStats(data.stats);
      setRegistrations(data.registrations);
      setError(null);
      setLastUpdated(Date.now());
      setStatus('live');
    } catch (err: any) {
      if (ctrl.signal?.aborted || mySeq !== seq.current) return;
      if (err?.status === 401) {
        authErrRef.current();
        return;
      }
      // Keep last known values; just surface the degraded state.
      setError(err?.message || 'Failed to sync with real-time server.');
      setStatus('reconnecting');
    }
  }, [token]);

  const scheduleRefresh = useCallback(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    // One registration touches 4 tables -> coalesce the burst into one fetch
    debounceTimer.current = setTimeout(refresh, 300);
  }, [refresh]);

  useEffect(() => {
    if (!token) {
      seq.current++;
      inFlight.current?.abort();
      setStats(null);
      setRegistrations(null);
      setStatus('connecting');
      setError(null);
      return;
    }

    let es: EventSource | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let delay = 1000; // exponential backoff starts at 1s

    function connect() {
      if (es) {
        es.close();
      }
      es = new EventSource(`/api/admin/realtime-stream?token=${encodeURIComponent(token!)}`);

      es.onopen = () => {
        setStatus('live');
        delay = 1000; // reset delay on successful connection
        refresh(); // catch up on anything missed while disconnected
      };

      es.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'change') scheduleRefresh();
        } catch {
          /* ignore malformed frames */
        }
      };

      es.onerror = () => {
        setStatus('reconnecting');
        if (es && es.readyState === EventSource.CLOSED) {
          es.close();
          es = null;
          // Reconnect with exponential backoff (max 30 seconds)
          const nextDelay = Math.min(delay * 2, 30000);
          console.warn(`[SSE] Real-time stream disconnected. Retrying in ${delay}ms...`);
          reconnectTimeout = setTimeout(() => {
            delay = nextDelay;
            connect();
          }, delay);
        }
      };
    }

    connect();

    return () => {
      if (es) es.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      inFlight.current?.abort();
    };
  }, [token, refresh, scheduleRefresh]);

  return { stats, registrations, status, lastUpdated, refresh, error };
}
