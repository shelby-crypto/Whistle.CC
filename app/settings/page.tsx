'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// Inline SVG icons
function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </svg>
  );
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17,8 12,3 7,8" /><line x1="12" x2="12" y1="3" y2="15" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
    </svg>
  );
}

interface AllowlistEntry {
  id: string;
  platform: string;
  platform_username: string;
  platform_user_id: string | null;
  note: string | null;
  added_by: string | null;
  created_at: string;
}

export default function SettingsPage() {
  // Social Listening State
  const [searchQuery, setSearchQuery] = useState('');
  const [platforms, setPlatforms] = useState({
    twitter: true,
    instagram: false,
    reddit: false,
  });

  // Auto-Moderation State
  const [highHarm, setHighHarm] = useState({
    block: true,
    delete: true,
    mute: false,
  });

  const [mediumHarm, setMediumHarm] = useState({
    block: false,
    delete: false,
    mute: true,
  });

  const [questionable, setQuestionable] = useState({
    block: false,
    delete: false,
    mute: false,
  });

  // Profile Toxicity Detection State
  const [toxicitySensitivity, setToxicitySensitivity] = useState(50);

  // Monitoring Windows State
  const [monitoringWindows, setMonitoringWindows] = useState<
    Array<{
      id: string;
      name: string;
      startDate: string;
      endDate: string;
      alertLevel: string;
      active: boolean;
    }>
  >([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [newWindow, setNewWindow] = useState({
    name: '',
    startDate: '',
    endDate: '',
    alertLevel: 'Medium',
    autoHide: false,
    autoMute: false,
    autoBlock: false,
  });

  // ── Allowlist State ──────────────────────────────────────────────────────
  const [allowlistEntries, setAllowlistEntries] = useState<AllowlistEntry[]>([]);
  const [allowlistCount, setAllowlistCount] = useState(0);
  const [allowlistLimit] = useState(500);
  const [allowlistLoading, setAllowlistLoading] = useState(true);
  const [allowlistSearch, setAllowlistSearch] = useState('');
  const [allowlistPlatformFilter, setAllowlistPlatformFilter] = useState<string>('all');
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [csvPreview, setCsvPreview] = useState<Array<{ platform: string; username: string; note: string }>>([]);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvImporting, setCsvImporting] = useState(false);
  const [newEntry, setNewEntry] = useState({ platform: 'twitter', username: '', note: '' });
  const [addError, setAddError] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch allowlist
  const fetchAllowlist = useCallback(async () => {
    try {
      const res = await fetch('/api/allowlist');
      if (res.ok) {
        const data = await res.json();
        setAllowlistEntries(data.entries);
        setAllowlistCount(data.count);
      }
    } catch (err) {
      console.error('Failed to fetch allowlist:', err);
    } finally {
      setAllowlistLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllowlist();
  }, [fetchAllowlist]);

  // Filtered allowlist
  const filteredAllowlist = allowlistEntries.filter((entry) => {
    const matchesPlatform = allowlistPlatformFilter === 'all' || entry.platform === allowlistPlatformFilter;
    const matchesSearch =
      !allowlistSearch ||
      entry.platform_username.toLowerCase().includes(allowlistSearch.toLowerCase()) ||
      (entry.note ?? '').toLowerCase().includes(allowlistSearch.toLowerCase());
    return matchesPlatform && matchesSearch;
  });

  // Add to allowlist
  const handleAddToAllowlist = async () => {
    setAddError('');
    if (!newEntry.username.trim()) {
      setAddError('Username is required');
      return;
    }

    try {
      const res = await fetch('/api/allowlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: newEntry.platform,
          platform_username: newEntry.username,
          note: newEntry.note || null,
        }),
      });

      if (res.ok) {
        setAddModalOpen(false);
        setNewEntry({ platform: 'twitter', username: '', note: '' });
        fetchAllowlist();
      } else {
        const data = await res.json();
        setAddError(data.error || 'Failed to add');
      }
    } catch {
      setAddError('Network error');
    }
  };

  // Remove from allowlist
  const handleRemoveFromAllowlist = async (id: string) => {
    try {
      const res = await fetch(`/api/allowlist/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setDeleteConfirmId(null);
        fetchAllowlist();
      }
    } catch (err) {
      console.error('Failed to remove from allowlist:', err);
    }
  };

  // CSV file handling
  const handleCsvFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFile(file);

    const text = await file.text();
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) return;

    const header = lines[0].toLowerCase().split(',').map((h) => h.trim());
    const platformIdx = header.indexOf('platform');
    const usernameIdx = header.indexOf('username');
    const noteIdx = header.indexOf('note');

    if (platformIdx === -1 || usernameIdx === -1) return;

    const preview = [];
    for (let i = 1; i < Math.min(lines.length, 11); i++) {
      const cols = lines[i].split(',').map((c) => c.trim());
      preview.push({
        platform: cols[platformIdx] || '',
        username: cols[usernameIdx] || '',
        note: noteIdx !== -1 ? cols[noteIdx] || '' : '',
      });
    }
    setCsvPreview(preview);
    setCsvModalOpen(true);
  };

  const handleCsvImport = async () => {
    if (!csvFile) return;
    setCsvImporting(true);

    try {
      const formData = new FormData();
      formData.append('file', csvFile);

      const res = await fetch('/api/allowlist/import', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        setCsvModalOpen(false);
        setCsvFile(null);
        setCsvPreview([]);
        fetchAllowlist();
      } else {
        const data = await res.json();
        alert(data.error || 'Import failed');
      }
    } catch {
      alert('Network error during import');
    } finally {
      setCsvImporting(false);
    }
  };

  // Handlers
  const togglePlatform = (platform: keyof typeof platforms) => {
    setPlatforms((prev) => ({
      ...prev,
      [platform]: !prev[platform],
    }));
  };

  const toggleHarmAction = (
    level: 'highHarm' | 'mediumHarm' | 'questionable',
    action: 'block' | 'delete' | 'mute'
  ) => {
    if (level === 'highHarm') {
      setHighHarm((prev) => ({ ...prev, [action]: !prev[action] }));
    } else if (level === 'mediumHarm') {
      setMediumHarm((prev) => ({ ...prev, [action]: !prev[action] }));
    } else {
      setQuestionable((prev) => ({ ...prev, [action]: !prev[action] }));
    }
  };

  const createMonitoringWindow = () => {
    if (newWindow.name && newWindow.startDate && newWindow.endDate) {
      const window = {
        id: Date.now().toString(),
        name: newWindow.name,
        startDate: newWindow.startDate,
        endDate: newWindow.endDate,
        alertLevel: newWindow.alertLevel,
        active: true,
      };
      setMonitoringWindows((prev) => [...prev, window]);
      setNewWindow({
        name: '',
        startDate: '',
        endDate: '',
        alertLevel: 'Medium',
        autoHide: false,
        autoMute: false,
        autoBlock: false,
      });
      setModalOpen(false);
    }
  };

  // Calendar helper
  const getCurrentMonth = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days = [];
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }
    return days;
  };

  const calendarDays = getCurrentMonth();

  return (
    <div className="min-h-screen bg-gray-950 p-4 sm:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8 sm:mb-12">
          <h1 className="text-2xl sm:text-4xl font-bold text-white mb-2">Settings</h1>
          <p className="text-sm sm:text-base text-gray-400">Configure your NetRef Safety moderation preferences</p>
        </div>

        {/* ── Allowlist Section ─────────────────────────────────────────────── */}
        <div className="mb-8 sm:mb-12">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-xl sm:text-2xl font-semibold text-white">Allowlist</h2>
              <p className="text-xs sm:text-sm text-gray-400 mt-1">
                Content from allowlisted accounts skips AI moderation entirely
              </p>
            </div>
            <div className="flex gap-2 sm:gap-3">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-gray-800 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
              >
                <UploadIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Import</span> CSV
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleCsvFileSelect}
                className="hidden"
              />
              <button
                onClick={() => setAddModalOpen(true)}
                className="px-4 py-2 bg-teal-500 text-gray-950 font-semibold rounded-lg hover:bg-teal-400 transition-colors"
              >
                Add Account
              </button>
            </div>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            {/* Capacity bar */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-400">
                  {allowlistCount} of {allowlistLimit} entries used
                </span>
                <span className="text-sm text-gray-500">
                  {allowlistLimit - allowlistCount} remaining
                </span>
              </div>
              <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-teal-500 rounded-full transition-all"
                  style={{ width: `${(allowlistCount / allowlistLimit) * 100}%` }}
                />
              </div>
            </div>

            {/* Info banner */}
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 mb-4">
              <p className="text-xs text-gray-400">
                Accounts you follow on Twitter are automatically protected from moderation — you don&apos;t need to add them here.
                This list is for additional accounts you want to protect.
                <span className="text-yellow-400"> Note: Instagram does not support automatic follow detection — add Instagram accounts here manually.</span>
              </p>
            </div>

            {/* Search and filter */}
            <div className="flex gap-3 mb-4">
              <div className="relative flex-1">
                <SearchIcon className="absolute left-3 top-2.5 w-4 h-4 text-gray-500" />
                <input
                  type="text"
                  placeholder="Search by username or note..."
                  value={allowlistSearch}
                  onChange={(e) => setAllowlistSearch(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-teal-500"
                />
              </div>
              <select
                value={allowlistPlatformFilter}
                onChange={(e) => setAllowlistPlatformFilter(e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-teal-500"
              >
                <option value="all">All Platforms</option>
                <option value="twitter">Twitter</option>
                <option value="instagram">Instagram</option>
              </select>
            </div>

            {/* Table */}
            {allowlistLoading ? (
              <div className="text-center py-8 text-gray-500">Loading...</div>
            ) : filteredAllowlist.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-400 mb-2">
                  {allowlistEntries.length === 0
                    ? 'No accounts on your allowlist yet'
                    : 'No matches found'}
                </p>
                <p className="text-sm text-gray-500">
                  {allowlistEntries.length === 0
                    ? 'Add trusted accounts so their content is never moderated by Whistle.'
                    : 'Try a different search term or filter.'}
                </p>
              </div>
            ) : (
              <>
              {/* Desktop Table */}
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-800 border-b border-gray-700">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Username</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Platform</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Note</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Added</th>
                      <th className="px-4 py-3 text-right text-sm font-semibold text-gray-300">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAllowlist.map((entry) => (
                      <tr key={entry.id} className="border-b border-gray-800 hover:bg-gray-800/50 transition-colors">
                        <td className="px-4 py-3 text-sm text-white font-medium">@{entry.platform_username}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${entry.platform === 'twitter' ? 'bg-blue-500 bg-opacity-20 text-blue-400' : 'bg-pink-500 bg-opacity-20 text-pink-400'}`}>{entry.platform}</span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-400">{entry.note || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{new Date(entry.created_at).toLocaleDateString()}</td>
                        <td className="px-4 py-3 text-right">
                          {deleteConfirmId === entry.id ? (
                            <div className="flex items-center justify-end gap-2">
                              <span className="text-xs text-gray-400">Remove?</span>
                              <button onClick={() => handleRemoveFromAllowlist(entry.id)} className="px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-500 transition-colors">Yes</button>
                              <button onClick={() => setDeleteConfirmId(null)} className="px-2 py-1 bg-gray-700 text-white text-xs rounded hover:bg-gray-600 transition-colors">No</button>
                            </div>
                          ) : (
                            <button onClick={() => setDeleteConfirmId(entry.id)} className="text-gray-500 hover:text-red-400 transition-colors"><TrashIcon className="w-4 h-4" /></button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card Layout */}
              <div className="sm:hidden divide-y divide-gray-800">
                {filteredAllowlist.map((entry) => (
                  <div key={entry.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-medium text-white truncate">@{entry.platform_username}</span>
                        <span className={`flex-shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${entry.platform === 'twitter' ? 'bg-blue-500 bg-opacity-20 text-blue-400' : 'bg-pink-500 bg-opacity-20 text-pink-400'}`}>{entry.platform}</span>
                      </div>
                      <p className="text-xs text-gray-500">{entry.note || 'No note'} - {new Date(entry.created_at).toLocaleDateString()}</p>
                    </div>
                    {deleteConfirmId === entry.id ? (
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button onClick={() => handleRemoveFromAllowlist(entry.id)} className="px-2 py-1 bg-red-600 text-white text-xs rounded">Yes</button>
                        <button onClick={() => setDeleteConfirmId(null)} className="px-2 py-1 bg-gray-700 text-white text-xs rounded">No</button>
                      </div>
                    ) : (
                      <button onClick={() => setDeleteConfirmId(entry.id)} className="flex-shrink-0 text-gray-500 hover:text-red-400 transition-colors p-1"><TrashIcon className="w-4 h-4" /></button>
                    )}
                  </div>
                ))}
              </div>
              </>
            )}
          </div>
        </div>

        {/* 1. Social Listening Section */}
        <div className="mb-8 sm:mb-12">
          <h2 className="text-xl sm:text-2xl font-semibold text-white mb-4">Social Listening</h2>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <div className="mb-6">
              <label className="block text-sm font-medium text-white mb-2">Search Query</label>
              <input
                type="text"
                placeholder="Enter search query or keyword"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 transition-colors"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-3">Platforms</label>
              <div className="flex gap-3">
                {(['twitter', 'instagram', 'reddit'] as const).map((platform) => (
                  <button
                    key={platform}
                    onClick={() => togglePlatform(platform)}
                    className={`px-4 py-2 rounded-full font-medium transition-colors capitalize ${
                      platforms[platform]
                        ? 'bg-teal-500 text-gray-950'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    {platform}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 2. Auto-Moderation Section */}
        <div className="mb-8 sm:mb-12">
          <h2 className="text-xl sm:text-2xl font-semibold text-white mb-4">Auto-Moderation</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* High Harm Card */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 border-l-4 border-l-red-500">
              <h3 className="text-lg font-semibold text-white mb-1">High Harm</h3>
              <p className="text-sm text-gray-400 mb-5">Severe threats, doxxing, explicit harassment</p>
              <div className="space-y-3">
                {(['block', 'delete', 'mute'] as const).map((action) => (
                  <div key={action} className="flex items-center justify-between">
                    <label className="text-sm text-gray-300 capitalize">{action}</label>
                    <button
                      onClick={() => toggleHarmAction('highHarm', action)}
                      className={`relative w-12 h-6 rounded-full transition-colors ${
                        highHarm[action] ? 'bg-teal-500' : 'bg-gray-700'
                      }`}
                    >
                      <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                        highHarm[action] ? 'translate-x-6' : ''
                      }`} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Medium Harm Card */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 border-l-4 border-l-yellow-500">
              <h3 className="text-lg font-semibold text-white mb-1">Medium Harm</h3>
              <p className="text-sm text-gray-400 mb-5">Targeted insults, discriminatory language</p>
              <div className="space-y-3">
                {(['block', 'delete', 'mute'] as const).map((action) => (
                  <div key={action} className="flex items-center justify-between">
                    <label className="text-sm text-gray-300 capitalize">{action}</label>
                    <button
                      onClick={() => toggleHarmAction('mediumHarm', action)}
                      className={`relative w-12 h-6 rounded-full transition-colors ${
                        mediumHarm[action] ? 'bg-teal-500' : 'bg-gray-700'
                      }`}
                    >
                      <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                        mediumHarm[action] ? 'translate-x-6' : ''
                      }`} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Questionable Card */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 border-l-4 border-l-blue-500">
              <h3 className="text-lg font-semibold text-white mb-1">Questionable</h3>
              <p className="text-sm text-gray-400 mb-5">Borderline content, heated criticism</p>
              <div className="space-y-3">
                {(['block', 'delete', 'mute'] as const).map((action) => (
                  <div key={action} className="flex items-center justify-between">
                    <label className="text-sm text-gray-300 capitalize">{action}</label>
                    <button
                      onClick={() => toggleHarmAction('questionable', action)}
                      className={`relative w-12 h-6 rounded-full transition-colors ${
                        questionable[action] ? 'bg-teal-500' : 'bg-gray-700'
                      }`}
                    >
                      <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                        questionable[action] ? 'translate-x-6' : ''
                      }`} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 3. Profile Toxicity Detection */}
        <div className="mb-8 sm:mb-12">
          <h2 className="text-xl sm:text-2xl font-semibold text-white mb-4">Profile Toxicity Detection</h2>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <p className="text-gray-400 text-sm mb-6">
              Automatically screen user profiles for patterns of toxic behavior
            </p>
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-white">Sensitivity</label>
                <span className="text-sm font-semibold text-teal-500">{toxicitySensitivity}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={toxicitySensitivity}
                onChange={(e) => setToxicitySensitivity(Number(e.target.value))}
                className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-teal-500"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-3">
                <span>Low Sensitivity</span>
                <span>High Sensitivity</span>
              </div>
            </div>
          </div>
        </div>

        {/* 4. Betting Risk Analysis */}
        <div className="mb-8 sm:mb-12">
          <h2 className="text-xl sm:text-2xl font-semibold text-white mb-4">Betting Risk Analysis</h2>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <div className="flex justify-center">
              <div className="w-full max-w-sm">
                <div className="text-center mb-6">
                  <h3 className="text-lg font-semibold text-white">
                    {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  </h3>
                </div>
                <div className="grid grid-cols-7 gap-2 mb-2">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                    <div key={day} className="text-center text-xs text-gray-500 font-medium py-2">
                      {day}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-2">
                  {calendarDays.map((day, idx) => {
                    const isHighlighted = day && (day === 5 || day === 12 || day === 18 || day === 24 || day === 28);
                    const isRiskDay = day && (day === 10 || day === 15 || day === 22 || day === 29);
                    return (
                      <div
                        key={idx}
                        className={`aspect-square flex items-center justify-center rounded text-sm font-medium transition-colors ${
                          !day ? '' : isRiskDay ? 'bg-red-500 bg-opacity-20 text-red-400' : isHighlighted ? 'bg-teal-500 bg-opacity-20 text-teal-400' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                        }`}
                      >
                        {day}
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-4 mt-6 text-xs justify-center">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-teal-500 bg-opacity-40 rounded"></div>
                    <span className="text-gray-400">Low Risk</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-red-500 bg-opacity-40 rounded"></div>
                    <span className="text-gray-400">High Risk</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 5. Monitoring Windows Section */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold text-white">Monitoring Windows</h2>
            <button
              onClick={() => setModalOpen(true)}
              className="px-4 py-2 bg-teal-500 text-gray-950 font-semibold rounded-lg hover:bg-teal-400 transition-colors"
            >
              Create Monitoring Window
            </button>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            {monitoringWindows.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-400 mb-2">No monitoring windows created yet</p>
                <p className="text-sm text-gray-500">Create one to start monitoring specific periods</p>
              </div>
            ) : (
              <div className="space-y-3">
                {monitoringWindows.map((window) => (
                  <div key={window.id} className="flex items-center justify-between p-4 bg-gray-800 rounded-lg">
                    <div className="flex-1">
                      <h4 className="font-semibold text-white">{window.name}</h4>
                      <p className="text-sm text-gray-400">{window.startDate} to {window.endDate}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="px-3 py-1 rounded-full text-xs font-medium bg-teal-500 bg-opacity-20 text-teal-400">
                        {window.alertLevel}
                      </span>
                      <div className={`w-2 h-2 rounded-full ${window.active ? 'bg-teal-500' : 'bg-gray-600'}`}></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Add to Allowlist Modal ──────────────────────────────────────────── */}
      {addModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-xl font-semibold text-white mb-4">Add to Allowlist</h3>
            <p className="text-sm text-gray-400 mb-4">
              Future content from this account won&apos;t be moderated. Past actions are not affected.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white mb-2">Platform</label>
                <select
                  value={newEntry.platform}
                  onChange={(e) => setNewEntry((prev) => ({ ...prev, platform: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-teal-500"
                >
                  <option value="twitter">Twitter</option>
                  <option value="instagram">Instagram</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-2">Username</label>
                <input
                  type="text"
                  value={newEntry.username}
                  onChange={(e) => setNewEntry((prev) => ({ ...prev, username: e.target.value }))}
                  placeholder="@username"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-2">Note (optional)</label>
                <input
                  type="text"
                  value={newEntry.note}
                  onChange={(e) => setNewEntry((prev) => ({ ...prev, note: e.target.value }))}
                  placeholder="e.g., Teammate, Agent, Family"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-teal-500"
                />
              </div>

              {addError && (
                <p className="text-sm text-red-400">{addError}</p>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setAddModalOpen(false); setAddError(''); }}
                className="flex-1 px-4 py-2 bg-gray-800 text-white font-semibold rounded-lg hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddToAllowlist}
                className="flex-1 px-4 py-2 bg-teal-500 text-gray-950 font-semibold rounded-lg hover:bg-teal-400 transition-colors"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CSV Import Preview Modal ────────────────────────────────────────── */}
      {csvModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-lg">
            <h3 className="text-xl font-semibold text-white mb-4">CSV Import Preview</h3>
            <p className="text-sm text-gray-400 mb-4">
              Showing first {csvPreview.length} rows. {csvFile && `File: ${csvFile.name}`}
            </p>

            <div className="bg-gray-800 rounded-lg overflow-hidden mb-4 max-h-64 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-700">
                  <tr>
                    <th className="px-3 py-2 text-left text-gray-300">Platform</th>
                    <th className="px-3 py-2 text-left text-gray-300">Username</th>
                    <th className="px-3 py-2 text-left text-gray-300">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {csvPreview.map((row, i) => (
                    <tr key={i} className="border-t border-gray-700">
                      <td className="px-3 py-2 text-gray-400">{row.platform}</td>
                      <td className="px-3 py-2 text-white">{row.username}</td>
                      <td className="px-3 py-2 text-gray-400">{row.note || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setCsvModalOpen(false); setCsvFile(null); setCsvPreview([]); }}
                className="flex-1 px-4 py-2 bg-gray-800 text-white font-semibold rounded-lg hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCsvImport}
                disabled={csvImporting}
                className="flex-1 px-4 py-2 bg-teal-500 text-gray-950 font-semibold rounded-lg hover:bg-teal-400 transition-colors disabled:opacity-50"
              >
                {csvImporting ? 'Importing...' : 'Import All'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Monitoring Window Modal ─────────────────────────────────────────── */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-xl font-semibold text-white mb-4">Create Monitoring Window</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white mb-2">Window Name</label>
                <input
                  type="text"
                  value={newWindow.name}
                  onChange={(e) => setNewWindow((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Election Week Monitoring"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-2">Start Date</label>
                <input
                  type="date"
                  value={newWindow.startDate}
                  onChange={(e) => setNewWindow((prev) => ({ ...prev, startDate: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-2">End Date</label>
                <input
                  type="date"
                  value={newWindow.endDate}
                  onChange={(e) => setNewWindow((prev) => ({ ...prev, endDate: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-2">Alert Level</label>
                <div className="relative">
                  <select
                    value={newWindow.alertLevel}
                    onChange={(e) => setNewWindow((prev) => ({ ...prev, alertLevel: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 appearance-none"
                  >
                    <option>Low</option>
                    <option>Medium</option>
                    <option>High</option>
                    <option>Critical</option>
                  </select>
                  <ChevronDownIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                </div>
              </div>

              <div className="space-y-3 pt-2">
                {(['autoHide', 'autoMute', 'autoBlock'] as const).map((key) => (
                  <div key={key} className="flex items-center justify-between">
                    <label className="text-sm text-gray-300">
                      {key === 'autoHide' ? 'Auto-hide' : key === 'autoMute' ? 'Auto-mute' : 'Auto-block'}
                    </label>
                    <button
                      onClick={() => setNewWindow((prev) => ({ ...prev, [key]: !prev[key] }))}
                      className={`relative w-10 h-6 rounded-full transition-colors ${
                        newWindow[key] ? 'bg-teal-500' : 'bg-gray-700'
                      }`}
                    >
                      <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                        newWindow[key] ? 'translate-x-4' : ''
                      }`} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setModalOpen(false)}
                className="flex-1 px-4 py-2 bg-gray-800 text-white font-semibold rounded-lg hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={createMonitoringWindow}
                className="flex-1 px-4 py-2 bg-teal-500 text-gray-950 font-semibold rounded-lg hover:bg-teal-400 transition-colors"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
