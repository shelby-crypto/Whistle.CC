'use client';

/**
 * CONTENT WARNING WITH PURPOSE SELECTOR
 *
 * Implements:
 *   - CISO Code Review Finding 3: Purpose selector required before content reveal
 *   - CPO Finding 2: Purpose logged in audit trail
 *   - CPO Finding 6: Content warning + wellbeing message
 */

import { useState } from 'react';
import { AlertTriangle, Eye, EyeOff, Shield } from 'lucide-react';
import type { ContentViewPurpose } from '@/types';

interface ContentWarningProps {
  incidentId: string;
  onReveal: (purpose: ContentViewPurpose) => void;
  onSkip: () => void;
}

const PURPOSE_OPTIONS: { value: ContentViewPurpose; label: string; description: string }[] = [
  {
    value: 'quality_review',
    label: 'Quality review',
    description: 'Reviewing classifier accuracy or detection quality',
  },
  {
    value: 'client_inquiry',
    label: 'Client inquiry',
    description: 'A client has asked about a specific incident',
  },
  {
    value: 'incident_investigation',
    label: 'Incident investigation',
    description: 'Investigating a pattern or escalated case',
  },
];

export function ContentWarning({ incidentId, onReveal, onSkip }: ContentWarningProps) {
  const [selectedPurpose, setSelectedPurpose] = useState<ContentViewPurpose | null>(null);

  return (
    <div style={{
      background: '#7F1D1D20',
      border: '1px solid #EF444430',
      borderRadius: 12,
      padding: 24,
    }}>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <AlertTriangle size={28} color="#F59E0B" style={{ marginBottom: 8 }} />
        <h3 style={{ fontSize: 16, fontWeight: 600, color: '#F1F5F9', marginBottom: 4 }}>
          This incident contains abusive content.
        </h3>
        <p style={{ fontSize: 13, color: '#64748B' }}>
          Viewing is logged for audit purposes.
        </p>
      </div>

      {/* Purpose selector — REQUIRED before reveal */}
      <div style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#94A3B8', marginBottom: 10 }}>
          Why are you viewing this content?
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {PURPOSE_OPTIONS.map(option => (
            <label
              key={option.value}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px',
                background: selectedPurpose === option.value ? '#1E3A5F' : '#1E293B',
                border: `1px solid ${selectedPurpose === option.value ? '#3B82F6' : '#374151'}`,
                borderRadius: 8, cursor: 'pointer', transition: 'all 0.15s',
              }}
            >
              <input
                type="radio"
                name="purpose"
                value={option.value}
                checked={selectedPurpose === option.value}
                onChange={() => setSelectedPurpose(option.value)}
                style={{ marginTop: 2, accentColor: '#3B82F6' }}
              />
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: '#F1F5F9' }}>
                  {option.label}
                </div>
                <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                  {option.description}
                </div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
        <button
          onClick={() => selectedPurpose && onReveal(selectedPurpose)}
          disabled={!selectedPurpose}
          style={{
            padding: '10px 20px', borderRadius: 8,
            background: selectedPurpose ? '#1E293B' : '#111827',
            border: `1px solid ${selectedPurpose ? '#374151' : '#1E293B'}`,
            color: selectedPurpose ? '#F1F5F9' : '#64748B',
            fontSize: 13, fontWeight: 500, cursor: selectedPurpose ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', gap: 6,
            opacity: selectedPurpose ? 1 : 0.5,
            transition: 'all 0.15s',
          }}
        >
          <Eye size={14} /> Reveal content
        </button>
        <button
          onClick={onSkip}
          style={{
            padding: '10px 20px', borderRadius: 8,
            background: 'transparent', border: '1px solid #374151',
            color: '#94A3B8', fontSize: 13, cursor: 'pointer',
          }}
        >
          Skip
        </button>
      </div>

      <p style={{ fontSize: 11, color: '#475569', textAlign: 'center', marginTop: 16 }}>
        <Shield size={11} style={{ verticalAlign: -2, marginRight: 4 }} />
        Incident {incidentId} · Access will be logged with your selected purpose
      </p>
    </div>
  );
}

/**
 * Post-reveal wellbeing message.
 * CPO Finding 6: Shown below abuse content after reveal.
 */
export function WellbeingReminder() {
  return (
    <p style={{
      fontSize: 12, color: '#64748B', textAlign: 'center',
      marginTop: 16, padding: '10px 16px',
      background: '#1E293B40', borderRadius: 8,
    }}>
      If viewing this content is affecting you, step away. Your wellbeing matters.
    </p>
  );
}
