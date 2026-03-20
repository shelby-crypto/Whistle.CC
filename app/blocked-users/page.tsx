'use client';

import { useState, useEffect, useCallback } from 'react';

// Inline SVG icons
function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
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

interface BlockedUser {
  id: string;
  platform: string;
  author_id: string | null;
  author_handle: string | null;
  blocked_at: string;
  reason: string;
  risk_level: string;
  triggering_content: string | null;
  reversed: boolean;
  reversed_at: string | null;
  reversed_by: string | null;
}

const RISK_COLORS: Record<string, string> = {
  severe: 'bg-red-500 text-white',
  high: 'bg-orange-500 text-white',
  medium: 'bg-yellow-500 text-gray-950',
  low: 'bg-blue-500 text-white',
  none: 'bg-gray-500 text-white',
};

export default function BlockedUsersPage() {
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [platformFilter, setPlatformFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [unblockConfirmId, setUnblockConfirmId] = useState<string | null>(null);
  const [unblocking, setUnblocking] = useState(false);

  const fetchBlockedUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/blocked-users');
      if (res.ok) {
        const data = await res.json();
        setBlockedUsers(data);
      }
    } catch (err) {
      console.error('Failed to fetch blocked users:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBlockedUsers();
  }, [fetchBlockedUsers]);

  const handleUnblock = async (actionId: string) => {
    setUnblocking(true);
    try {
      const res = await fetch(`/api/blocked-users/${actionId}/unblock`, {
        method: 'POST',
      });

      if (res.ok) {
        setUnblockConfirmId(null);
        fetchBlockedUsers();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to unblock');
      }
    } catch {
      alert('Network error');
    } finally {
      setUnblocking(false);
    }
  };

  // Filter
  const filtered = blockedUsers.filter((user) => {
    const matchesPlatform = platformFilter === 'all' || user.platform === platformFilter;
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && !user.reversed) ||
      (statusFilter === 'reversed' && user.reversed);
    const matchesSearch =
      !searchText ||
      (user.author_handle ?? '').toLowerCase().includes(searchText.toLowerCase()) ||
      (user.reason ?? '').toLowerCase().includes(searchText.toLowerCase());
    return matchesPlatform && matchesStatus && matchesSearch;
  });

  const activeCount = blockedUsers.filter((u) => !u.reversed).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-950">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900 p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 sm:mb-6">
          <div>
            <h1 className="text-xl sm:text-3xl font-bold">Blocked Users</h1>
            <p className="text-sm text-gray-400 mt-1">
              People Whistle has blocked to protect you
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="px-3 py-1 bg-red-500 bg-opacity-20 text-red-400 rounded-full text-sm font-semibold">
              {activeCount} active {activeCount === 1 ? 'block' : 'blocks'}
            </span>
          </div>
        </div>

        {/* Info banner */}
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 mb-6">
          <p className="text-xs text-gray-400">
            This list shows users blocked by Whistle. Users you blocked directly on the platform won&apos;t appear here.
            You can unblock Twitter users from this page. Instagram does not support unblocking via API — please unblock directly in the Instagram app.
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search by username or reason..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={platformFilter}
              onChange={(e) => setPlatformFilter(e.target.value)}
              className="flex-1 sm:flex-none bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            >
              <option value="all">All Platforms</option>
              <option value="twitter">Twitter</option>
              <option value="instagram">Instagram</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="flex-1 sm:flex-none bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="reversed">Reversed</option>
            </select>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 sm:p-6">
        {filtered.length === 0 ? (
          <div className="text-center py-12 sm:py-16">
            <p className="text-gray-400 text-base sm:text-lg mb-2">
              {blockedUsers.length === 0 ? 'No one has been blocked yet — that\'s a good thing' : 'No matches found'}
            </p>
            <p className="text-xs sm:text-sm text-gray-500">
              {blockedUsers.length === 0
                ? 'When Whistle blocks someone to protect you, they\'ll appear here so you can review and reverse if needed.'
                : 'Try adjusting your filters.'}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-800 border-b border-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Username</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Platform</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Blocked Date</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Risk Level</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Status</th>
                    <th className="px-4 py-3 text-right text-sm font-semibold text-gray-300">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((user) => (
                    <>
                      <tr key={user.id} onClick={() => setExpandedId(expandedId === user.id ? null : user.id)} className="border-b border-gray-800 hover:bg-gray-800/50 transition-colors cursor-pointer">
                        <td className="px-4 py-3 text-sm text-white font-medium">{user.author_handle ? `@${user.author_handle}` : user.author_id || 'Unknown'}</td>
                        <td className="px-4 py-3 text-sm"><span className={`px-2 py-1 rounded-full text-xs font-medium ${user.platform === 'twitter' ? 'bg-blue-500 bg-opacity-20 text-blue-400' : 'bg-pink-500 bg-opacity-20 text-pink-400'}`}>{user.platform}</span></td>
                        <td className="px-4 py-3 text-sm text-gray-400">{new Date(user.blocked_at).toLocaleDateString()}</td>
                        <td className="px-4 py-3 text-sm"><span className={`px-3 py-1 rounded-full text-xs font-semibold ${RISK_COLORS[user.risk_level] || RISK_COLORS.none}`}>{user.risk_level}</span></td>
                        <td className="px-4 py-3 text-sm"><span className={`px-2 py-1 rounded-full text-xs font-medium ${user.reversed ? 'bg-gray-500 bg-opacity-20 text-gray-400' : 'bg-red-500 bg-opacity-20 text-red-400'}`}>{user.reversed ? 'Reversed' : 'Active'}</span></td>
                        <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          {!user.reversed && user.platform === 'twitter' && (
                            unblockConfirmId === user.id ? (
                              <div className="flex items-center justify-end gap-2">
                                <span className="text-xs text-gray-400">Unblock?</span>
                                <button onClick={() => handleUnblock(user.id)} disabled={unblocking} className="px-2 py-1 bg-teal-600 text-white text-xs rounded hover:bg-teal-500 disabled:opacity-50">{unblocking ? '...' : 'Yes'}</button>
                                <button onClick={() => setUnblockConfirmId(null)} className="px-2 py-1 bg-gray-700 text-white text-xs rounded hover:bg-gray-600">No</button>
                              </div>
                            ) : (
                              <button onClick={() => setUnblockConfirmId(user.id)} className="px-3 py-1 bg-gray-700 text-white text-xs font-medium rounded hover:bg-gray-600">Unblock</button>
                            )
                          )}
                          {!user.reversed && user.platform === 'instagram' && <span className="text-xs text-gray-500">Unblock in app</span>}
                          {user.reversed && user.reversed_at && <span className="text-xs text-gray-500">{new Date(user.reversed_at).toLocaleDateString()}</span>}
                        </td>
                      </tr>
                      {expandedId === user.id && (
                        <tr key={`${user.id}-detail`} className="bg-gray-800/30">
                          <td colSpan={6} className="px-4 py-4">
                            <div className="space-y-3">
                              <div><label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Reason</label><p className="text-sm text-gray-300 mt-1">{user.reason}</p></div>
                              {user.triggering_content && (<div><label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Triggering Content</label><p className="text-sm text-gray-300 mt-1 bg-gray-800 rounded p-3 border border-gray-700">{user.triggering_content}</p></div>)}
                              {user.reversed && user.reversed_by && (<div><label className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Reversed By</label><p className="text-sm text-gray-300 mt-1">{user.reversed_by} on {user.reversed_at ? new Date(user.reversed_at).toLocaleDateString() : 'N/A'}</p></div>)}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card Layout */}
            <div className="md:hidden space-y-3">
              {filtered.map((user) => (
                <div key={user.id} className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setExpandedId(expandedId === user.id ? null : user.id)}
                    className="w-full text-left p-3"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <span className="text-sm font-medium text-white">{user.author_handle ? `@${user.author_handle}` : 'Unknown'}</span>
                      <div className="flex gap-1.5 flex-shrink-0">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${RISK_COLORS[user.risk_level] || RISK_COLORS.none}`}>{user.risk_level}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${user.reversed ? 'bg-gray-500 bg-opacity-20 text-gray-400' : 'bg-red-500 bg-opacity-20 text-red-400'}`}>{user.reversed ? 'Reversed' : 'Active'}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-gray-500">
                      <span className="capitalize">{user.platform}</span>
                      <span>-</span>
                      <span>{new Date(user.blocked_at).toLocaleDateString()}</span>
                    </div>
                  </button>

                  {expandedId === user.id && (
                    <div className="border-t border-gray-800 p-3 bg-gray-800/30 space-y-2">
                      <div><label className="text-[10px] font-semibold text-gray-400 uppercase">Reason</label><p className="text-xs text-gray-300 mt-0.5">{user.reason}</p></div>
                      {user.triggering_content && (<div><label className="text-[10px] font-semibold text-gray-400 uppercase">Content</label><p className="text-xs text-gray-300 mt-0.5 bg-gray-800 rounded p-2 border border-gray-700">{user.triggering_content}</p></div>)}
                      {!user.reversed && user.platform === 'twitter' && (
                        <div className="pt-1" onClick={(e) => e.stopPropagation()}>
                          {unblockConfirmId === user.id ? (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-400">Unblock?</span>
                              <button onClick={() => handleUnblock(user.id)} disabled={unblocking} className="px-2 py-1 bg-teal-600 text-white text-xs rounded">{unblocking ? '...' : 'Yes'}</button>
                              <button onClick={() => setUnblockConfirmId(null)} className="px-2 py-1 bg-gray-700 text-white text-xs rounded">No</button>
                            </div>
                          ) : (
                            <button onClick={() => setUnblockConfirmId(user.id)} className="px-3 py-1.5 bg-gray-700 text-white text-xs font-medium rounded hover:bg-gray-600 w-full">Unblock on Twitter</button>
                          )}
                        </div>
                      )}
                      {!user.reversed && user.platform === 'instagram' && <p className="text-xs text-gray-500 pt-1">Unblock directly in Instagram app</p>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
