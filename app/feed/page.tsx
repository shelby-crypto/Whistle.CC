'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
// Inline SVG icon components (no external dependency)
function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
    </svg>
  );
}
function EyeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function EyeOffIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" /><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" /><line x1="2" x2="22" y1="2" y2="22" />
    </svg>
  );
}
function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 6 6 18" /><path d="m6 6 12 12" />
    </svg>
  );
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface HarmScoreEntry {
  score: 'none' | 'low' | 'medium' | 'high' | 'severe';
  confidence: 'high' | 'medium' | 'low';
}

interface ClassifierOutput {
  harm_scores: Record<string, HarmScoreEntry>;
  reasoning: string;
  [key: string]: unknown;
}

interface ActionAgentOutput {
  action_basis: string;
  final_risk_level: string;
  [key: string]: unknown;
}

interface PipelineRun {
  id: string;
  created_at: string;
  platform: string;
  author_handle: string | null;
  content_text: string;
  risk_level: string;
  final_action: string;
  classifier_output: ClassifierOutput | null;
  fp_checker_output: Record<string, unknown> | null;
  action_agent_output: ActionAgentOutput | null;
  safety_override_applied: boolean;
  stages_completed?: string[];
  irreversible_action_justification: string | null;
}

const RISK_ORDER: Record<string, number> = {
  failed: 6,
  error: 5,
  severe: 4,
  high: 3,
  medium: 2,
  low: 1,
  none: 0,
};

const RISK_COLORS: Record<string, string> = {
  failed: 'bg-purple-700 text-white',
  error: 'bg-purple-500 text-white',
  severe: 'bg-red-500 text-white',
  high: 'bg-orange-500 text-white',
  medium: 'bg-yellow-500 text-gray-950',
  low: 'bg-blue-500 text-white',
  none: 'bg-gray-500 text-white',
};

const HEADER_COLORS: Record<string, string> = {
  failed: 'bg-purple-800',
  error: 'bg-purple-600',
  severe: 'bg-red-600',
  high: 'bg-orange-600',
  medium: 'bg-yellow-600',
  low: 'bg-blue-600',
  none: 'bg-gray-600',
};

const HARM_CATEGORIES = [
  { key: 'H1_gender', label: 'Gender' },
  { key: 'H2_sexual_orientation', label: 'Sexual Orientation' },
  { key: 'H3_body_appearance', label: 'Body Appearance' },
  { key: 'H4_racial_identity', label: 'Racial' },
  { key: 'H5_political', label: 'Political' },
  { key: 'H6_professional_competence', label: 'Professional' },
  { key: 'H7_religion', label: 'Religion' },
  { key: 'H8_nationality_immigration', label: 'Nationality' },
  { key: 'H9_sexualization', label: 'Sexuality' },
  { key: 'H10_threats_violence', label: 'Threats/Violence' },
  { key: 'H11_doxxing_privacy', label: 'Privacy/Doxxing' },
  { key: 'H12_betting_harassment', label: 'Betting' },
  { key: 'H13_coordinated_harassment', label: 'Coordinated' },
];

// Convert a harm score entry (object with score/confidence) OR a raw string level to a display level
const scoreEntryToLevel = (entry: HarmScoreEntry | string | number | undefined): string => {
  if (!entry) return 'none';
  // Handle the actual classifier output format: { score: "medium", confidence: "high" }
  if (typeof entry === 'object' && 'score' in entry) return entry.score;
  // Handle raw string levels (e.g. from manually set data)
  if (typeof entry === 'string') return entry;
  // Legacy numeric fallback (should not happen with current pipeline)
  if (typeof entry === 'number') {
    if (entry >= 0.8) return 'severe';
    if (entry >= 0.6) return 'high';
    if (entry >= 0.4) return 'medium';
    if (entry >= 0.2) return 'low';
    return 'none';
  }
  return 'none';
};

const LEVEL_PERCENTAGES: Record<string, number> = {
  severe: 100,
  high: 75,
  medium: 50,
  low: 25,
  none: 0,
};

const levelToPercentage = (level: string): number => {
  return LEVEL_PERCENTAGES[level] ?? 0;
};

function ShieldCheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export default function FeedPage() {
  const [feeds, setFeeds] = useState<PipelineRun[]>([]);
  const [filteredFeeds, setFilteredFeeds] = useState<PipelineRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTab, setFilterTab] = useState<string>('all');
  const [searchText, setSearchText] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedFeed, setSelectedFeed] = useState<PipelineRun | null>(null);
  const [contentHidden, setContentHidden] = useState(true);
  const [adjustedHarmLevel, setAdjustedHarmLevel] = useState<string | null>(null);
  const [allowlistNotice, setAllowlistNotice] = useState<string | null>(null);

  // Quick-add to allowlist from feed
  const handleAddToAllowlist = async (authorHandle: string, platform: string) => {
    if (!authorHandle) return;
    try {
      const res = await fetch('/api/allowlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform,
          platform_username: authorHandle,
          note: 'Added from feed',
        }),
      });
      if (res.ok) {
        setAllowlistNotice(`@${authorHandle} added to allowlist`);
        setTimeout(() => setAllowlistNotice(null), 3000);
      } else {
        const data = await res.json();
        setAllowlistNotice(data.error || 'Failed to add');
        setTimeout(() => setAllowlistNotice(null), 3000);
      }
    } catch {
      setAllowlistNotice('Network error');
      setTimeout(() => setAllowlistNotice(null), 3000);
    }
  };

  // Fetch data from Supabase
  useEffect(() => {
    const fetchFeeds = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('pipeline_runs_feed')
          .select(
            'id, created_at, platform, author_handle, content_text, risk_level, final_action, classifier_output, fp_checker_output, action_agent_output, safety_override_applied, irreversible_action_justification'
          )
          .order('created_at', { ascending: false });

        if (error) throw error;
        setFeeds(data || []);
      } catch (err) {
        console.error('Error fetching feeds:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchFeeds();

    // Subscribe to realtime changes
    const subscription = supabase
      .channel('pipeline_runs_realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pipeline_runs' },
        (payload) => {
          fetchFeeds();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Apply filters
  useEffect(() => {
    let filtered = feeds;

    // Filter by risk level
    if (filterTab !== 'all') {
      const riskMap: Record<string, string[]> = {
        'high-harm': ['severe', 'high'],
        'medium-harm': ['medium'],
        questionable: ['low'],
        reviewed: ['none'],
      };
      const allowedRisks = riskMap[filterTab] || [];
      filtered = filtered.filter((f) => allowedRisks.includes(f.risk_level));
    }

    // Filter by search text
    if (searchText) {
      filtered = filtered.filter((f) =>
        f.content_text.toLowerCase().includes(searchText.toLowerCase())
      );
    }

    setFilteredFeeds(filtered);
  }, [feeds, filterTab, searchText]);

  // Group feeds by risk level
  const groupedFeeds = filteredFeeds.reduce(
    (acc, feed) => {
      const riskLevel = feed.risk_level || 'none';
      if (!acc[riskLevel]) {
        acc[riskLevel] = [];
      }
      acc[riskLevel].push(feed);
      return acc;
    },
    {} as Record<string, PipelineRun[]>
  );

  // Sort by risk order
  const sortedRiskLevels = Object.keys(groupedFeeds).sort(
    (a, b) => (RISK_ORDER[b] || 0) - (RISK_ORDER[a] || 0)
  );

  const handleSelectAll = (riskLevel: string, isSelected: boolean) => {
    const newSelected = new Set(selectedIds);
    groupedFeeds[riskLevel].forEach((feed) => {
      if (isSelected) {
        newSelected.add(feed.id);
      } else {
        newSelected.delete(feed.id);
      }
    });
    setSelectedIds(newSelected);
  };

  const handleSelectRow = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleRowClick = (feed: PipelineRun) => {
    setSelectedFeed(feed);
    setDetailModalOpen(true);
    setContentHidden(true);
    setAdjustedHarmLevel(null);
  };

  const getRiskLevelLabel = (riskLevel: string): string => {
    switch (riskLevel) {
      case 'failed':
        return 'Pipeline Failed — Manual Review Required';
      case 'error':
        return 'Pipeline Error — Needs Reprocessing';
      case 'severe':
        return 'High Harm';
      case 'high':
        return 'High Harm';
      case 'medium':
        return 'Medium Harm';
      case 'low':
        return 'Questionable';
      case 'none':
        return 'Reviewed';
      default:
        return 'Unknown';
    }
  };

  const getRiskCount = (riskLevel: string): number => {
    const riskMap: Record<string, string[]> = {
      'high-harm': ['severe', 'high'],
      'medium-harm': ['medium'],
      questionable: ['low'],
      reviewed: ['none'],
    };

    if (filterTab === 'all') {
      return (
        feeds.filter((f) => f.risk_level === riskLevel || f.risk_level === riskLevel).length
      );
    }

    const allowedRisks = riskMap[filterTab] || [];
    return feeds.filter((f) => allowedRisks.includes(f.risk_level)).length;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-950">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Allowlist Toast Notification */}
      {allowlistNotice && (
        <div className="fixed top-4 right-4 z-50 bg-teal-600 text-white px-4 py-3 rounded-lg shadow-lg text-sm font-medium flex items-center gap-2 animate-pulse">
          <ShieldCheckIcon className="w-4 h-4" />
          {allowlistNotice}
        </div>
      )}

      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900 p-6">
        <h1 className="text-3xl font-bold mb-6">Content Moderation</h1>

        {/* Filter Tabs */}
        <div className="flex gap-4 mb-6 border-b border-gray-800 pb-4">
          {['all', 'high-harm', 'medium-harm', 'questionable', 'reviewed'].map((tab) => (
            <button
              key={tab}
              onClick={() => setFilterTab(tab)}
              className={`px-4 py-2 rounded-t-lg font-medium transition-colors ${
                filterTab === tab
                  ? 'bg-gray-800 text-white border-b-2 border-blue-500'
                  : 'text-gray-400 hover:text-gray-300'
              }`}
            >
              {tab.replace('-', ' ').charAt(0).toUpperCase() + tab.replace('-', ' ').slice(1)}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative">
          <SearchIcon className="absolute left-3 top-3 w-5 h-5 text-gray-500" />
          <input
            type="text"
            placeholder="Search content..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-10 pr-4 py-2 text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      {/* Feed Table */}
      <div className="p-6">
        {sortedRiskLevels.length === 0 ? (
          <div className="text-center py-12 text-gray-500">No items to display</div>
        ) : (
          sortedRiskLevels.map((riskLevel) => (
            <div key={riskLevel} className="mb-8">
              {/* Risk Level Header */}
              <div className={`${HEADER_COLORS[riskLevel]} px-4 py-3 rounded-t-lg flex items-center justify-between`}>
                <h2 className="font-bold text-lg">{getRiskLevelLabel(riskLevel)}</h2>
                <span className="bg-black bg-opacity-30 px-3 py-1 rounded-full text-sm font-semibold">
                  {groupedFeeds[riskLevel].length}
                </span>
              </div>

              {/* Table */}
              <div className="bg-gray-900 border border-t-0 border-gray-800 rounded-b-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-800 border-b border-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left">
                        <input
                          type="checkbox"
                          onChange={(e) => handleSelectAll(riskLevel, e.target.checked)}
                          checked={
                            groupedFeeds[riskLevel].length > 0 &&
                            groupedFeeds[riskLevel].every((f) => selectedIds.has(f.id))
                          }
                          className="rounded border-gray-600"
                        />
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">
                        Author
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">
                        Content
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">
                        Platform
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">
                        Risk Level
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">
                        Action
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">
                        Date
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupedFeeds[riskLevel].map((feed) => (
                      <tr
                        key={feed.id}
                        onClick={() => handleRowClick(feed)}
                        className="border-b border-gray-800 hover:bg-gray-800/50 transition-colors cursor-pointer"
                      >
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(feed.id)}
                            onChange={() => handleSelectRow(feed.id)}
                            className="rounded border-gray-600"
                          />
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-300">
                          {feed.author_handle || 'Unknown'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-400 max-w-md truncate">
                          {feed.content_text}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-400">
                          {feed.platform || 'Unknown'}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${RISK_COLORS[feed.risk_level]}`}>
                            {feed.risk_level}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-400">
                          {feed.final_action || 'No action'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {new Date(feed.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-6 right-6 bg-gray-800 border border-gray-700 rounded-lg p-4 flex items-center justify-between">
          <span className="text-gray-300 font-medium">{selectedIds.size} selected</span>
          <div className="flex gap-3">
            <button className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors">
              Hide Selected
            </button>
            <button className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors">
              Block Authors
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-medium transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {detailModalOpen && selectedFeed && (
        <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 border border-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="sticky top-0 bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">{selectedFeed.author_handle || 'Unknown'}</h2>
                <p className="text-sm text-gray-400">{selectedFeed.platform}</p>
              </div>
              <button
                onClick={() => setDetailModalOpen(false)}
                className="text-gray-400 hover:text-gray-300 transition-colors"
              >
                <XIcon className="w-6 h-6" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6">
              {/* Content Section */}
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-gray-100">Content</h3>
                  <button
                    onClick={() => setContentHidden(!contentHidden)}
                    className="flex items-center gap-2 px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                  >
                    {contentHidden ? (
                      <>
                        <EyeIcon className="w-4 h-4" />
                        Reveal
                      </>
                    ) : (
                      <>
                        <EyeOffIcon className="w-4 h-4" />
                        Hide
                      </>
                    )}
                  </button>
                </div>
                {contentHidden ? (
                  <div className="text-gray-500 italic">Content hidden</div>
                ) : (
                  <p className="text-gray-300 text-sm leading-relaxed">{selectedFeed.content_text}</p>
                )}
              </div>

              {/* Harm Dimension Breakdown */}
              {selectedFeed.classifier_output?.harm_scores && (
                <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                  <h3 className="font-semibold text-gray-100 mb-4">Harm Dimension Breakdown</h3>
                  <div className="space-y-3">
                    {HARM_CATEGORIES.map((category) => {
                      const entry = selectedFeed.classifier_output?.harm_scores[category.key];
                      const level = scoreEntryToLevel(entry);
                      const percentage = levelToPercentage(level);
                      const confidence = (typeof entry === 'object' && entry && 'confidence' in entry) ? entry.confidence : null;

                      return (
                        <div key={category.key}>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-sm text-gray-300">{category.label}</label>
                            <span className="text-xs text-gray-500">
                              {level}{confidence ? ` (${confidence} conf.)` : ''}
                            </span>
                          </div>
                          <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${RISK_COLORS[level] || 'bg-gray-600'} rounded-full transition-all`}
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Risk Level Badge */}
              <div className="flex items-center gap-4">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Risk Level</p>
                  <span className={`px-4 py-2 rounded-lg text-sm font-semibold ${RISK_COLORS[selectedFeed.risk_level]}`}>
                    {selectedFeed.risk_level}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Action Taken</p>
                  <span className="px-4 py-2 rounded-lg text-sm font-semibold bg-gray-800 text-gray-300 border border-gray-700">
                    {selectedFeed.final_action || 'No action'}
                  </span>
                </div>
              </div>

              {/* Detection Reason */}
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <label className="block text-sm font-semibold text-gray-100 mb-2">
                  Detection Reason
                </label>
                {(() => {
                  const classifierReasoning = selectedFeed.classifier_output?.reasoning;
                  const actionBasis = selectedFeed.action_agent_output?.action_basis;
                  const hasError = selectedFeed.action_agent_output && 'error' in selectedFeed.action_agent_output;
                  const isErrorRisk = selectedFeed.risk_level === 'error' || selectedFeed.risk_level === 'failed';

                  // Pipeline failed — show error state
                  if (hasError || isErrorRisk) {
                    return (
                      <div className="bg-red-900 bg-opacity-30 border border-red-700 rounded-lg p-3">
                        <p className="text-sm text-red-300 font-medium mb-1">Pipeline Error</p>
                        <p className="text-xs text-red-200">
                          The moderation pipeline failed to classify this content. The risk level shown is a default, not an actual assessment.
                          {selectedFeed.action_agent_output && 'error' in selectedFeed.action_agent_output
                            ? ` Error: ${(selectedFeed.action_agent_output as Record<string, unknown>).error}`
                            : ' No stages completed.'}
                        </p>
                      </div>
                    );
                  }

                  // Build combined reasoning
                  const parts: string[] = [];
                  if (typeof classifierReasoning === 'string' && classifierReasoning.length > 0) {
                    parts.push(`Classification: ${classifierReasoning}`);
                  }
                  if (typeof actionBasis === 'string' && actionBasis.length > 0) {
                    parts.push(`Action: ${actionBasis}`);
                  }
                  const combined = parts.length > 0 ? parts.join('\n\n') : 'No reasoning available';

                  return (
                    <textarea
                      readOnly
                      value={combined}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg p-3 text-sm text-gray-300 focus:outline-none focus:border-blue-500 resize-none h-24"
                    />
                  );
                })()}
              </div>

              {/* Adjust Harm Level */}
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <label className="block text-sm font-semibold text-gray-100 mb-2">
                  Adjust Harm Level
                </label>
                <div className="flex gap-2">
                  <select
                    value={adjustedHarmLevel || selectedFeed.risk_level}
                    onChange={(e) => setAdjustedHarmLevel(e.target.value)}
                    className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-300 focus:outline-none focus:border-blue-500"
                  >
                    <option value="none">None</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="severe">Severe</option>
                  </select>
                  <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium transition-colors">
                    Save
                  </button>
                </div>
              </div>

              {/* Safety Override Badge */}
              {selectedFeed.safety_override_applied && (
                <div className="bg-orange-900 bg-opacity-30 border border-orange-700 rounded-lg p-4">
                  <p className="text-sm font-semibold text-orange-300 mb-1">Safety Override Applied</p>
                  {selectedFeed.irreversible_action_justification && (
                    <p className="text-xs text-orange-200">{selectedFeed.irreversible_action_justification}</p>
                  )}
                </div>
              )}

              {/* Add to Allowlist + Close Buttons */}
              <div className="flex gap-3">
                {selectedFeed.author_handle && (
                  <button
                    onClick={() => {
                      handleAddToAllowlist(selectedFeed.author_handle!, selectedFeed.platform || 'twitter');
                    }}
                    className="flex items-center justify-center gap-2 flex-1 px-4 py-2 bg-teal-600 hover:bg-teal-500 rounded-lg text-sm font-medium transition-colors"
                  >
                    <ShieldCheckIcon className="w-4 h-4" />
                    Add to Allowlist
                  </button>
                )}
                <button
                  onClick={() => setDetailModalOpen(false)}
                  className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-sm font-medium transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
