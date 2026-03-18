'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface DmItem {
  id: string;
  created_at: string;
  platform: string;
  author_handle: string | null;
  content_text: string;
  risk_level: string;
  final_action: string;
  classifier_output: Record<string, unknown> | null;
  action_agent_output: Record<string, unknown> | null;
  safety_override_applied: boolean;
  raw_data: Record<string, unknown> | null;
}

const RISK_COLORS: Record<string, string> = {
  failed: 'bg-purple-700 text-white',
  error: 'bg-purple-500 text-white',
  severe: 'bg-red-500 text-white',
  high: 'bg-orange-500 text-white',
  medium: 'bg-yellow-500 text-gray-950',
  low: 'bg-blue-500 text-white',
  none: 'bg-gray-500 text-white',
};

export default function MessagesPage() {
  const [items, setItems] = useState<DmItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<DmItem | null>(null);

  const fetchDms = useCallback(async () => {
    setLoading(true);

    // Fetch pipeline runs joined with content_items where content_type = 'dm'
    const { data, error } = await supabase
      .from('pipeline_runs')
      .select(`
        id,
        created_at,
        final_risk_level,
        content_action,
        account_action,
        classifier_output,
        action_agent_output,
        safety_override_applied,
        content_item_id,
        content_items!inner (
          platform,
          author_handle,
          content,
          content_type,
          raw_data
        )
      `)
      .eq('content_items.content_type', 'dm')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('[messages] Fetch error:', error.message);
      setLoading(false);
      return;
    }

    const mapped: DmItem[] = (data ?? []).map((row: Record<string, unknown>) => {
      const ci = row.content_items as Record<string, unknown> | null;
      return {
        id: row.id as string,
        created_at: row.created_at as string,
        platform: (ci?.platform as string) ?? 'instagram',
        author_handle: (ci?.author_handle as string) ?? null,
        content_text: (ci?.content as string) ?? '',
        risk_level: (row.final_risk_level as string) ?? 'none',
        final_action: (row.content_action as string) ?? 'pass',
        classifier_output: row.classifier_output as Record<string, unknown> | null,
        action_agent_output: row.action_agent_output as Record<string, unknown> | null,
        safety_override_applied: (row.safety_override_applied as boolean) ?? false,
        raw_data: (ci?.raw_data as Record<string, unknown>) ?? null,
      };
    });

    setItems(mapped);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchDms();

    // Real-time subscription for new DMs
    const channel = supabase
      .channel('dm-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pipeline_runs' }, () => {
        fetchDms();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchDms]);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
      ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white">Messages</h1>
          <p className="text-sm text-gray-400 mt-1">
            DMs from new/unknown senders — scanned for harmful content
          </p>
        </div>
        <button
          onClick={fetchDms}
          className="px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="text-center text-gray-500 py-12">Loading...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-400 text-lg">No DMs flagged yet</p>
          <p className="text-gray-600 text-sm mt-2">
            When someone sends you a DM for the first time, it will be scanned and appear here if flagged.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => setSelectedItem(item)}
              className="w-full text-left bg-gray-900 hover:bg-gray-800 border border-gray-800 rounded-lg p-4 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-gray-300">
                      {item.author_handle ?? 'Unknown sender'}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${RISK_COLORS[item.risk_level] ?? RISK_COLORS.none}`}>
                      {item.risk_level}
                    </span>
                    {item.final_action !== 'pass' && item.final_action !== 'log' && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-300">
                        {item.final_action}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-400 truncate">{item.content_text}</p>
                </div>
                <span className="text-xs text-gray-600 whitespace-nowrap">
                  {formatDate(item.created_at)}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Detail modal */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">DM Details</h2>
              <button onClick={() => setSelectedItem(null)} className="text-gray-400 hover:text-white">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                  <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <span className="text-xs text-gray-500 uppercase">Sender</span>
                <p className="text-sm text-gray-200">{selectedItem.author_handle ?? 'Unknown'}</p>
              </div>
              <div>
                <span className="text-xs text-gray-500 uppercase">Message</span>
                <p className="text-sm text-gray-200 whitespace-pre-wrap">{selectedItem.content_text}</p>
              </div>
              <div className="flex gap-4">
                <div>
                  <span className="text-xs text-gray-500 uppercase">Risk Level</span>
                  <p className="mt-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${RISK_COLORS[selectedItem.risk_level] ?? RISK_COLORS.none}`}>
                      {selectedItem.risk_level}
                    </span>
                  </p>
                </div>
                <div>
                  <span className="text-xs text-gray-500 uppercase">Action</span>
                  <p className="text-sm text-gray-200">{selectedItem.final_action}</p>
                </div>
              </div>
              <div>
                <span className="text-xs text-gray-500 uppercase">Time</span>
                <p className="text-sm text-gray-200">{formatDate(selectedItem.created_at)}</p>
              </div>
              {selectedItem.action_agent_output && (
                <div>
                  <span className="text-xs text-gray-500 uppercase">Analysis</span>
                  <p className="text-sm text-gray-400 whitespace-pre-wrap">
                    {(selectedItem.action_agent_output as Record<string, unknown>).action_basis as string ?? 'N/A'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
