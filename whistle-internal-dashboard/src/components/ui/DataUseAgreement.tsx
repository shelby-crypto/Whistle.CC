'use client';

/**
 * DATA USE AGREEMENT MODAL
 *
 * Implements CPO Finding 5:
 *   - Research users must accept before their first export
 *   - Acceptance is logged with timestamp and version
 *   - Covers: no sharing, no re-identification, secure deletion
 */

import { useState } from 'react';
import { FileText, Shield, CheckCircle } from 'lucide-react';
import { DATA_USE_AGREEMENT_TEXT, CURRENT_DATA_USE_VERSION } from '@/lib/exports';

interface DataUseAgreementProps {
  onAccept: () => void;
  onDecline: () => void;
}

export function DataUseAgreement({ onAccept, onDecline }: DataUseAgreementProps) {
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const [checked, setChecked] = useState(false);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 20) {
      setScrolledToBottom(true);
    }
  };

  const handleAccept = async () => {
    try {
      await fetch('/api/auth/data-use-agreement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: CURRENT_DATA_USE_VERSION }),
      });
      onAccept();
    } catch {
      // Handle error
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.7)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        background: '#111827', border: '1px solid #1E293B',
        borderRadius: 16, maxWidth: 600, width: '100%',
        maxHeight: '80vh', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #1E293B' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileText size={20} color="#06B6D4" />
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#F1F5F9', margin: 0 }}>
              Data Use Agreement
            </h2>
          </div>
          <p style={{ fontSize: 13, color: '#64748B', marginTop: 4 }}>
            Version {CURRENT_DATA_USE_VERSION} — Required before exporting research data
          </p>
        </div>

        <div
          onScroll={handleScroll}
          style={{
            flex: 1, overflow: 'auto', padding: 24,
            fontSize: 13, color: '#94A3B8', lineHeight: 1.7,
            fontFamily: 'monospace', whiteSpace: 'pre-wrap',
          }}
        >
          {DATA_USE_AGREEMENT_TEXT}
        </div>

        <div style={{ padding: '16px 24px', borderTop: '1px solid #1E293B' }}>
          {!scrolledToBottom && (
            <p style={{ fontSize: 12, color: '#64748B', marginBottom: 12, textAlign: 'center' }}>
              Please scroll to the bottom to read the full agreement
            </p>
          )}

          <label style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            marginBottom: 16, opacity: scrolledToBottom ? 1 : 0.4,
            cursor: scrolledToBottom ? 'pointer' : 'not-allowed',
          }}>
            <input
              type="checkbox"
              checked={checked}
              onChange={e => scrolledToBottom && setChecked(e.target.checked)}
              disabled={!scrolledToBottom}
              style={{ marginTop: 3, accentColor: '#06B6D4' }}
            />
            <span style={{ fontSize: 13, color: '#F1F5F9' }}>
              I have read and agree to the terms of this data use agreement. I understand
              that all exports are watermarked and traceable to my account.
            </span>
          </label>

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              onClick={onDecline}
              style={{
                padding: '10px 20px', borderRadius: 8,
                background: 'transparent', border: '1px solid #374151',
                color: '#94A3B8', fontSize: 13, cursor: 'pointer',
              }}
            >
              Decline
            </button>
            <button
              onClick={handleAccept}
              disabled={!checked || !scrolledToBottom}
              style={{
                padding: '10px 20px', borderRadius: 8,
                background: checked && scrolledToBottom ? '#06B6D420' : '#111827',
                border: `1px solid ${checked && scrolledToBottom ? '#06B6D440' : '#1E293B'}`,
                color: checked && scrolledToBottom ? '#06B6D4' : '#64748B',
                fontSize: 13, fontWeight: 600,
                cursor: checked && scrolledToBottom ? 'pointer' : 'not-allowed',
                opacity: checked && scrolledToBottom ? 1 : 0.5,
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <CheckCircle size={14} /> Accept & Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
