'use client';

/**
 * SESSION TIMEOUT UI
 *
 * Implements CISO Code Review Finding 4:
 *   - Shows warning toast at 25 minutes idle
 *   - Auto-redirects to login at 30 minutes idle
 *   - Activity heartbeat refreshes the server-side idle timeout
 *   - Displays session expiry countdown in the header
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Clock, AlertTriangle } from 'lucide-react';

interface SessionTimeoutProps {
  idleTimeoutAt: string;
  expiresAt: string;
  onLogout: () => void;
}

const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const WARNING_THRESHOLD_MS = 5 * 60 * 1000;   // Show warning at 5 min remaining

export function SessionTimeout({ idleTimeoutAt, expiresAt, onLogout }: SessionTimeoutProps) {
  const [showWarning, setShowWarning] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const lastActivityRef = useRef(Date.now());

  // ─── Activity tracking ─────────────────────────────────────────────
  const recordActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    setShowWarning(false);
  }, []);

  // Listen for user activity
  useEffect(() => {
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach(event => window.addEventListener(event, recordActivity));
    return () => events.forEach(event => window.removeEventListener(event, recordActivity));
  }, [recordActivity]);

  // ─── Heartbeat: refresh server-side idle timeout ───────────────────
  useEffect(() => {
    const interval = setInterval(async () => {
      // Only send heartbeat if user has been active recently
      if (Date.now() - lastActivityRef.current < HEARTBEAT_INTERVAL_MS) {
        try {
          await fetch('/api/auth/session', { method: 'POST' });
        } catch {
          // Heartbeat failure is non-fatal
        }
      }
    }, HEARTBEAT_INTERVAL_MS);

    return () => clearInterval(interval);
  }, []);

  // ─── Countdown timer ───────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      const idleMs = new Date(idleTimeoutAt).getTime() - Date.now();
      const hardMs = new Date(expiresAt).getTime() - Date.now();
      const remaining = Math.min(idleMs, hardMs);

      setTimeRemaining(remaining);

      if (remaining <= 0) {
        // Session expired — force logout
        onLogout();
      } else if (remaining <= WARNING_THRESHOLD_MS) {
        setShowWarning(true);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [idleTimeoutAt, expiresAt, onLogout]);

  const formatTime = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  // ─── Extend session ────────────────────────────────────────────────
  const extendSession = async () => {
    recordActivity();
    try {
      await fetch('/api/auth/session', { method: 'POST' });
      setShowWarning(false);
    } catch {
      // Extension failed — will timeout naturally
    }
  };

  return (
    <>
      {/* Warning toast */}
      {showWarning && (
        <div style={{
          position: 'fixed', top: 16, right: 16, zIndex: 1000,
          background: '#1A1A2E', border: '1px solid #F59E0B40',
          borderRadius: 12, padding: '16px 20px', maxWidth: 340,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          animation: 'slideIn 0.3s ease-out',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <AlertTriangle size={16} color="#F59E0B" />
            <span style={{ fontSize: 14, fontWeight: 600, color: '#F1F5F9' }}>Session expiring</span>
          </div>
          <p style={{ fontSize: 13, color: '#94A3B8', marginBottom: 12, lineHeight: 1.4 }}>
            Your session will expire in {formatTime(timeRemaining)}. Click below to stay signed in.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={extendSession}
              style={{
                padding: '8px 16px', borderRadius: 6,
                background: '#06B6D420', border: '1px solid #06B6D440',
                color: '#06B6D4', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Stay signed in
            </button>
            <button
              onClick={onLogout}
              style={{
                padding: '8px 16px', borderRadius: 6,
                background: 'transparent', border: '1px solid #374151',
                color: '#94A3B8', fontSize: 13, cursor: 'pointer',
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      `}</style>
    </>
  );
}
