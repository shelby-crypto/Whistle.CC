'use client';

import { useState } from 'react';
// Inline SVG — no external dependency
function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
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
    <div className="min-h-screen bg-gray-950 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold text-white mb-2">Settings</h1>
          <p className="text-gray-400">Configure your NetRef Safety moderation preferences</p>
        </div>

        {/* 1. Social Listening Section */}
        <div className="mb-12">
          <h2 className="text-2xl font-semibold text-white mb-4">Social Listening</h2>
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
        <div className="mb-12">
          <h2 className="text-2xl font-semibold text-white mb-4">Auto-Moderation</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* High Harm Card */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 border-l-4 border-l-red-500">
              <h3 className="text-lg font-semibold text-white mb-1">High Harm</h3>
              <p className="text-sm text-gray-400 mb-5">Severe threats, doxxing, explicit harassment</p>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm text-gray-300">Block</label>
                  <button
                    onClick={() => toggleHarmAction('highHarm', 'block')}
                    className={`relative w-12 h-6 rounded-full transition-colors ${
                      highHarm.block ? 'bg-teal-500' : 'bg-gray-700'
                    }`}
                  >
                    <div
                      className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                        highHarm.block ? 'translate-x-6' : ''
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-sm text-gray-300">Delete</label>
                  <button
                    onClick={() => toggleHarmAction('highHarm', 'delete')}
                    className={`relative w-12 h-6 rounded-full transition-colors ${
                      highHarm.delete ? 'bg-teal-500' : 'bg-gray-700'
                    }`}
                  >
                    <div
                      className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                        highHarm.delete ? 'translate-x-6' : ''
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-sm text-gray-300">Mute</label>
                  <button
                    onClick={() => toggleHarmAction('highHarm', 'mute')}
                    className={`relative w-12 h-6 rounded-full transition-colors ${
                      highHarm.mute ? 'bg-teal-500' : 'bg-gray-700'
                    }`}
                  >
                    <div
                      className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                        highHarm.mute ? 'translate-x-6' : ''
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>

            {/* Medium Harm Card */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 border-l-4 border-l-yellow-500">
              <h3 className="text-lg font-semibold text-white mb-1">Medium Harm</h3>
              <p className="text-sm text-gray-400 mb-5">Targeted insults, discriminatory language</p>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm text-gray-300">Block</label>
                  <button
                    onClick={() => toggleHarmAction('mediumHarm', 'block')}
                    className={`relative w-12 h-6 rounded-full transition-colors ${
                      mediumHarm.block ? 'bg-teal-500' : 'bg-gray-700'
                    }`}
                  >
                    <div
                      className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                        mediumHarm.block ? 'translate-x-6' : ''
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-sm text-gray-300">Delete</label>
                  <button
                    onClick={() => toggleHarmAction('mediumHarm', 'delete')}
                    className={`relative w-12 h-6 rounded-full transition-colors ${
                      mediumHarm.delete ? 'bg-teal-500' : 'bg-gray-700'
                    }`}
                  >
                    <div
                      className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                        mediumHarm.delete ? 'translate-x-6' : ''
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-sm text-gray-300">Mute</label>
                  <button
                    onClick={() => toggleHarmAction('mediumHarm', 'mute')}
                    className={`relative w-12 h-6 rounded-full transition-colors ${
                      mediumHarm.mute ? 'bg-teal-500' : 'bg-gray-700'
                    }`}
                  >
                    <div
                      className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                        mediumHarm.mute ? 'translate-x-6' : ''
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>

            {/* Questionable Card */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 border-l-4 border-l-blue-500">
              <h3 className="text-lg font-semibold text-white mb-1">Questionable</h3>
              <p className="text-sm text-gray-400 mb-5">Borderline content, heated criticism</p>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm text-gray-300">Block</label>
                  <button
                    onClick={() => toggleHarmAction('questionable', 'block')}
                    className={`relative w-12 h-6 rounded-full transition-colors ${
                      questionable.block ? 'bg-teal-500' : 'bg-gray-700'
                    }`}
                  >
                    <div
                      className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                        questionable.block ? 'translate-x-6' : ''
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-sm text-gray-300">Delete</label>
                  <button
                    onClick={() => toggleHarmAction('questionable', 'delete')}
                    className={`relative w-12 h-6 rounded-full transition-colors ${
                      questionable.delete ? 'bg-teal-500' : 'bg-gray-700'
                    }`}
                  >
                    <div
                      className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                        questionable.delete ? 'translate-x-6' : ''
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-sm text-gray-300">Mute</label>
                  <button
                    onClick={() => toggleHarmAction('questionable', 'mute')}
                    className={`relative w-12 h-6 rounded-full transition-colors ${
                      questionable.mute ? 'bg-teal-500' : 'bg-gray-700'
                    }`}
                  >
                    <div
                      className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                        questionable.mute ? 'translate-x-6' : ''
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Profile Toxicity Detection */}
        <div className="mb-12">
          <h2 className="text-2xl font-semibold text-white mb-4">Profile Toxicity Detection</h2>
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
        <div className="mb-12">
          <h2 className="text-2xl font-semibold text-white mb-4">Betting Risk Analysis</h2>
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5">
            <div className="flex justify-center">
              <div className="w-full max-w-sm">
                {/* Calendar Header */}
                <div className="text-center mb-6">
                  <h3 className="text-lg font-semibold text-white">
                    {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  </h3>
                </div>

                {/* Weekday Labels */}
                <div className="grid grid-cols-7 gap-2 mb-2">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                    <div key={day} className="text-center text-xs text-gray-500 font-medium py-2">
                      {day}
                    </div>
                  ))}
                </div>

                {/* Calendar Days */}
                <div className="grid grid-cols-7 gap-2">
                  {calendarDays.map((day, idx) => {
                    const isHighlighted =
                      day && (day === 5 || day === 12 || day === 18 || day === 24 || day === 28);
                    const isRiskDay =
                      day && (day === 10 || day === 15 || day === 22 || day === 29);

                    return (
                      <div
                        key={idx}
                        className={`aspect-square flex items-center justify-center rounded text-sm font-medium transition-colors ${
                          !day
                            ? ''
                            : isRiskDay
                              ? 'bg-red-500 bg-opacity-20 text-red-400'
                              : isHighlighted
                                ? 'bg-teal-500 bg-opacity-20 text-teal-400'
                                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                        }`}
                      >
                        {day}
                      </div>
                    );
                  })}
                </div>

                {/* Legend */}
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
                <p className="text-sm text-gray-500">
                  Create one to start monitoring specific periods
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {monitoringWindows.map((window) => (
                  <div
                    key={window.id}
                    className="flex items-center justify-between p-4 bg-gray-800 rounded-lg"
                  >
                    <div className="flex-1">
                      <h4 className="font-semibold text-white">{window.name}</h4>
                      <p className="text-sm text-gray-400">
                        {window.startDate} to {window.endDate}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="px-3 py-1 rounded-full text-xs font-medium bg-teal-500 bg-opacity-20 text-teal-400">
                        {window.alertLevel}
                      </span>
                      <div
                        className={`w-2 h-2 rounded-full ${
                          window.active ? 'bg-teal-500' : 'bg-gray-600'
                        }`}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 w-full max-w-md">
            <h3 className="text-xl font-semibold text-white mb-4">Create Monitoring Window</h3>

            <div className="space-y-4">
              {/* Window Name */}
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

              {/* Start Date */}
              <div>
                <label className="block text-sm font-medium text-white mb-2">Start Date</label>
                <input
                  type="date"
                  value={newWindow.startDate}
                  onChange={(e) =>
                    setNewWindow((prev) => ({ ...prev, startDate: e.target.value }))
                  }
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                />
              </div>

              {/* End Date */}
              <div>
                <label className="block text-sm font-medium text-white mb-2">End Date</label>
                <input
                  type="date"
                  value={newWindow.endDate}
                  onChange={(e) => setNewWindow((prev) => ({ ...prev, endDate: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
                />
              </div>

              {/* Alert Level */}
              <div>
                <label className="block text-sm font-medium text-white mb-2">Alert Level</label>
                <div className="relative">
                  <select
                    value={newWindow.alertLevel}
                    onChange={(e) =>
                      setNewWindow((prev) => ({ ...prev, alertLevel: e.target.value }))
                    }
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

              {/* Auto-actions */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm text-gray-300">Auto-hide</label>
                  <button
                    onClick={() =>
                      setNewWindow((prev) => ({ ...prev, autoHide: !prev.autoHide }))
                    }
                    className={`relative w-10 h-6 rounded-full transition-colors ${
                      newWindow.autoHide ? 'bg-teal-500' : 'bg-gray-700'
                    }`}
                  >
                    <div
                      className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                        newWindow.autoHide ? 'translate-x-4' : ''
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-sm text-gray-300">Auto-mute</label>
                  <button
                    onClick={() =>
                      setNewWindow((prev) => ({ ...prev, autoMute: !prev.autoMute }))
                    }
                    className={`relative w-10 h-6 rounded-full transition-colors ${
                      newWindow.autoMute ? 'bg-teal-500' : 'bg-gray-700'
                    }`}
                  >
                    <div
                      className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                        newWindow.autoMute ? 'translate-x-4' : ''
                      }`}
                    />
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <label className="text-sm text-gray-300">Auto-block</label>
                  <button
                    onClick={() =>
                      setNewWindow((prev) => ({ ...prev, autoBlock: !prev.autoBlock }))
                    }
                    className={`relative w-10 h-6 rounded-full transition-colors ${
                      newWindow.autoBlock ? 'bg-teal-500' : 'bg-gray-700'
                    }`}
                  >
                    <div
                      className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                        newWindow.autoBlock ? 'translate-x-4' : ''
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>

            {/* Modal Buttons */}
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
