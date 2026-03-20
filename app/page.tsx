'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface PipelineRun {
  id: string;
  created_at: string;
  platform: string;
  author_handle: string | null;
  content_text: string;
  risk_level: 'none' | 'low' | 'medium' | 'high' | 'severe';
  final_action: string;
  classifier_output: Record<string, unknown> | null;
  fp_checker_output: Record<string, unknown> | null;
  action_agent_output: Record<string, unknown> | null;
  safety_override_applied: boolean;
  irreversible_action_justification: string | null;
}

interface DailyStats {
  date: string;
  high: number;
  medium: number;
  low: number;
}

interface StatCard {
  label: string;
  value: number;
  icon: React.ReactNode;
  bgColor: string;
  href?: string;
}

export default function Dashboard() {
  const router = useRouter();
  const [data, setData] = useState<PipelineRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalPosts: 0,
    highHarm: 0,
    mediumHarm: 0,
    questionable: 0,
    blockedUsers: 0,
    unreviewed: 0,
  });
  const [timelineData, setTimelineData] = useState<DailyStats[]>([]);
  const [platformData, setPlatformData] = useState<Record<string, number>>({});

  // Fetch data from Supabase
  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: pipelineData, error } = await supabase
        .from('pipeline_runs_feed')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const runs = pipelineData as PipelineRun[];
      setData(runs);

      // Calculate statistics
      const totalPosts = runs.length;
      const highHarm = runs.filter(
        (r) => r.risk_level === 'high' || r.risk_level === 'severe'
      ).length;
      const mediumHarm = runs.filter((r) => r.risk_level === 'medium').length;
      const questionable = runs.filter((r) => r.risk_level === 'low').length;

      // Count blocked users (distinct account_action = 'block_sender')
      // Since we don't have account_action in the view, we'll use final_action containing 'block'
      const blockedUsers = new Set(
        runs
          .filter((r) => r.final_action?.toLowerCase().includes('block'))
          .map((r) => r.author_handle)
      ).size;

      // Count unreviewed (content_action = 'log')
      // We'll interpret this as records where final_action is 'log'
      const unreviewed = runs.filter((r) => r.final_action === 'log').length;

      setStats({
        totalPosts,
        highHarm,
        mediumHarm,
        questionable,
        blockedUsers,
        unreviewed,
      });

      // Build timeline data for last 14 days
      const today = new Date();
      const timeline: Record<string, { high: number; medium: number; low: number }> = {};

      for (let i = 13; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        timeline[dateStr] = { high: 0, medium: 0, low: 0 };
      }

      runs.forEach((run) => {
        const dateStr = run.created_at.split('T')[0];
        if (timeline[dateStr]) {
          if (run.risk_level === 'high' || run.risk_level === 'severe') {
            timeline[dateStr].high += 1;
          } else if (run.risk_level === 'medium') {
            timeline[dateStr].medium += 1;
          } else if (run.risk_level === 'low') {
            timeline[dateStr].low += 1;
          }
        }
      });

      const sortedTimeline = Object.entries(timeline).map(([date, counts]) => ({
        date,
        high: counts.high,
        medium: counts.medium,
        low: counts.low,
      }));

      setTimelineData(sortedTimeline);

      // Build platform breakdown
      const platforms: Record<string, number> = {};
      runs.forEach((run) => {
        platforms[run.platform] = (platforms[run.platform] || 0) + 1;
      });
      setPlatformData(platforms);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Set up realtime subscription
    const subscription = supabase
      .channel('pipeline_runs_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pipeline_runs',
        },
        () => {
          // Refetch on any change
          fetchData();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Stat card component
  const StatCardComponent = ({ label, value, icon, bgColor, href }: StatCard) => (
    <div
      onClick={() => href && router.push(href)}
      className={`bg-gray-900 rounded-2xl border border-gray-800 p-4 sm:p-6 transition-colors ${href ? 'cursor-pointer hover:border-gray-700 hover:bg-gray-800/50' : ''}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] sm:text-xs text-gray-400 uppercase tracking-wider mb-1 sm:mb-2">
            {label}
          </p>
          <p className="text-2xl sm:text-4xl font-bold text-white">{value}</p>
        </div>
        <div className={`${bgColor} p-2 sm:p-3 rounded-lg hidden sm:block`}>{icon}</div>
      </div>
      {href && <p className="text-[10px] text-gray-600 mt-2">Tap to view →</p>}
    </div>
  );

  // Toxicity timeline SVG chart
  const ToxicityTimeline = () => {
    const width = 800;
    const height = 300;
    const padding = { top: 30, right: 40, bottom: 40, left: 60 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    if (timelineData.length === 0) {
      return (
        <div className="w-full h-96 flex items-center justify-center text-gray-400">
          No data available
        </div>
      );
    }

    const maxValue = Math.max(
      ...timelineData.map((d) => Math.max(d.high, d.medium, d.low))
    );
    const yScale = maxValue > 0 ? chartHeight / maxValue : 1;
    const xScale = chartWidth / (timelineData.length - 1 || 1);

    // Generate line paths
    const highPoints = timelineData.map((d, i) => ({
      x: padding.left + i * xScale,
      y: padding.top + chartHeight - d.high * yScale,
    }));

    const mediumPoints = timelineData.map((d, i) => ({
      x: padding.left + i * xScale,
      y: padding.top + chartHeight - d.medium * yScale,
    }));

    const lowPoints = timelineData.map((d, i) => ({
      x: padding.left + i * xScale,
      y: padding.top + chartHeight - d.low * yScale,
    }));

    const createPath = (points: Array<{ x: number; y: number }>) => {
      if (points.length === 0) return '';
      return (
        'M ' +
        points.map((p) => `${p.x},${p.y}`).join(' L ')
      );
    };

    const highPath = createPath(highPoints);
    const mediumPath = createPath(mediumPoints);
    const lowPath = createPath(lowPoints);

    // X-axis labels (every other day)
    const xLabels = timelineData
      .map((d, i) => (i % 2 === 0 ? { date: d.date, index: i } : null))
      .filter((x) => x !== null);

    return (
      <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} className="max-w-full">
        {/* Grid lines */}
        {[0, 1, 2, 3, 4].map((i) => {
          const y = padding.top + (chartHeight / 4) * i;
          return (
            <line
              key={`grid-${i}`}
              x1={padding.left}
              y1={y}
              x2={width - padding.right}
              y2={y}
              stroke="#374151"
              strokeWidth="1"
              opacity="0.5"
            />
          );
        })}

        {/* Y-axis */}
        <line
          x1={padding.left}
          y1={padding.top}
          x2={padding.left}
          y2={padding.top + chartHeight}
          stroke="#6b7280"
          strokeWidth="2"
        />

        {/* X-axis */}
        <line
          x1={padding.left}
          y1={padding.top + chartHeight}
          x2={width - padding.right}
          y2={padding.top + chartHeight}
          stroke="#6b7280"
          strokeWidth="2"
        />

        {/* Y-axis labels */}
        {[0, 1, 2, 3, 4].map((i) => {
          const y = padding.top + (chartHeight / 4) * i;
          const value = Math.round(maxValue - (maxValue / 4) * i);
          return (
            <text
              key={`y-label-${i}`}
              x={padding.left - 15}
              y={y + 5}
              textAnchor="end"
              fontSize="12"
              fill="#9ca3af"
            >
              {value}
            </text>
          );
        })}

        {/* X-axis labels */}
        {xLabels.map((label) => {
          if (!label) return null;
          const x = padding.left + label.index * xScale;
          const [, , day] = label.date.split('-');
          return (
            <text
              key={`x-label-${label.date}`}
              x={x}
              y={height - 20}
              textAnchor="middle"
              fontSize="12"
              fill="#9ca3af"
            >
              {day}
            </text>
          );
        })}

        {/* High risk line */}
        <path
          d={highPath}
          stroke="#ef4444"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Medium risk line */}
        <path
          d={mediumPath}
          stroke="#eab308"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Low risk line */}
        <path
          d={lowPath}
          stroke="#14b8a6"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Data points for high risk */}
        {highPoints.map((p, i) => (
          <circle
            key={`high-point-${i}`}
            cx={p.x}
            cy={p.y}
            r="4"
            fill="#ef4444"
          />
        ))}

        {/* Data points for medium risk */}
        {mediumPoints.map((p, i) => (
          <circle
            key={`medium-point-${i}`}
            cx={p.x}
            cy={p.y}
            r="4"
            fill="#eab308"
          />
        ))}

        {/* Data points for low risk */}
        {lowPoints.map((p, i) => (
          <circle
            key={`low-point-${i}`}
            cx={p.x}
            cy={p.y}
            r="4"
            fill="#14b8a6"
          />
        ))}
      </svg>
    );
  };

  // Platform breakdown component
  const PlatformBreakdown = () => {
    const totalPlatformPosts = Object.values(platformData).reduce((a, b) => a + b, 0);

    if (totalPlatformPosts === 0) {
      return (
        <div className="text-gray-400 text-center py-8">
          No platform data available
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {Object.entries(platformData)
          .sort(([, a], [, b]) => b - a)
          .map(([platform, count]) => {
            const percentage = ((count / totalPlatformPosts) * 100).toFixed(1);
            return (
              <div key={platform}>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-gray-300 capitalize">
                    {platform}
                  </span>
                  <span className="text-sm text-gray-400">
                    {count} ({percentage}%)
                  </span>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-2">
                  <div
                    className="bg-teal-500 h-2 rounded-full"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-950 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
          <div className="flex items-center justify-between">
            <h1 className="text-xl sm:text-3xl font-bold text-white">Your Protection Dashboard</h1>
            <button
              onClick={fetchData}
              disabled={loading}
              className="px-4 py-2 bg-teal-500 hover:bg-teal-600 disabled:bg-teal-500 disabled:opacity-50 text-white font-medium rounded-lg transition-colors"
            >
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-8">
        {/* Stats Cards Row */}
        <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6 mb-6 sm:mb-8">
          <StatCardComponent
            label="Posts Scanned"
            value={stats.totalPosts}
            href="/feed"
            icon={
              <svg className="w-6 h-6 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 5a2 2 0 012-2h12a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V5z" />
              </svg>
            }
            bgColor="bg-blue-500/20"
          />

          <StatCardComponent
            label="Serious Threats"
            value={stats.highHarm}
            href="/feed?filter=high-harm"
            icon={
              <svg className="w-6 h-6 text-red-400" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
            }
            bgColor="bg-red-500/20"
          />

          <StatCardComponent
            label="Concerning"
            value={stats.mediumHarm}
            href="/feed?filter=medium-harm"
            icon={
              <svg className="w-6 h-6 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v2h8v-2zM2 8a2 2 0 11-4 0 2 2 0 014 0zM18 15a4 4 0 00-8 0v2h8v-2z" />
              </svg>
            }
            bgColor="bg-yellow-500/20"
          />

          <StatCardComponent
            label="Worth Watching"
            value={stats.questionable}
            href="/feed?filter=questionable"
            icon={
              <svg className="w-6 h-6 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M18 5v8a2 2 0 01-2 2h-5l-5 4v-4H4a2 2 0 01-2-2V5a2 2 0 012-2h12a2 2 0 012 2zm-11-1a1 1 0 11-2 0 1 1 0 012 0zm6 0a1 1 0 11-2 0 1 1 0 012 0zm-6 3a1 1 0 11-2 0 1 1 0 012 0zm6 0a1 1 0 11-2 0 1 1 0 012 0z"
                  clipRule="evenodd"
                />
              </svg>
            }
            bgColor="bg-blue-500/20"
          />

          <StatCardComponent
            label="Users Blocked"
            value={stats.blockedUsers}
            href="/blocked-users"
            icon={
              <svg className="w-6 h-6 text-purple-400" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M13.477 14.89A6 6 0 015.11 2.697a6 6 0 008.367 8.192.757.757 0 01.5.652v.237a.75.75 0 001.5 0v-.236a2.25 2.25 0 00-1.896-2.153 6 6 0 00-8.368-8.192 6 6 0 008.367 8.192.757.757 0 01.5.652v.236a.75.75 0 01-1.5 0v-.236a2.25 2.25 0 001.896-2.153z"
                  clipRule="evenodd"
                />
              </svg>
            }
            bgColor="bg-purple-500/20"
          />

          <StatCardComponent
            label="Needs Attention"
            value={stats.unreviewed}
            href="/feed?filter=needs-attention"
            icon={
              <svg className="w-6 h-6 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                <path
                  fillRule="evenodd"
                  d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
                  clipRule="evenodd"
                />
              </svg>
            }
            bgColor="bg-gray-700/40"
          />
        </div>

        {/* Toxicity Timeline */}
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4 sm:p-6 mb-6 sm:mb-8">
          <h2 className="text-lg sm:text-xl font-semibold text-white mb-4 sm:mb-6">Threat Activity (14 Days)</h2>
          <div className="flex flex-wrap justify-end gap-3 sm:gap-4 mb-4 sm:mb-6 text-xs sm:text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-500 rounded-full" />
              <span className="text-gray-400">Serious Threats</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-yellow-500 rounded-full" />
              <span className="text-gray-400">Concerning</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-teal-500 rounded-full" />
              <span className="text-gray-400">Worth Watching</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            {timelineData.length > 0 ? (
              <ToxicityTimeline />
            ) : (
              <div className="h-64 flex flex-col items-center justify-center text-gray-400">
                <p>All clear — no threat activity to show yet</p>
                <p className="text-sm text-gray-500 mt-1">We&apos;re watching. Data will appear once monitoring starts.</p>
              </div>
            )}
          </div>
        </div>

        {/* Platform Breakdown */}
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4 sm:p-6">
          <h2 className="text-lg sm:text-xl font-semibold text-white mb-4 sm:mb-6">Platform Breakdown</h2>
          <PlatformBreakdown />
        </div>
      </div>
    </div>
  );
}
