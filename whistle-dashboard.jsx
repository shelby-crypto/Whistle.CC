import { useState, useEffect, useCallback, useMemo } from "react";
import { LineChart, Line, BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, FunnelChart, Funnel, LabelList } from "recharts";
import { Shield, Activity, BarChart3, Search, Users, DollarSign, AlertTriangle, CheckCircle, XCircle, ChevronRight, ChevronDown, Eye, EyeOff, Clock, Globe, TrendingUp, TrendingDown, Download, LogOut, Menu, X, Info, FileText, Lock, Bell, RefreshCw, ArrowLeft } from "lucide-react";

// ─── MOCK DATA ────────────────────────────────────────────────────────────
const ROLES = { OPS: "ops", CLIENT_SUCCESS: "client_success", LEADERSHIP: "leadership", RESEARCH: "research" };

const HARM_CATEGORIES = [
  "Racial abuse", "Sexual harassment", "Homophobia", "Transphobia", "Body shaming",
  "Death threats", "Doxxing", "Gendered slurs", "Religious discrimination",
  "Disability mockery", "Nationalism/xenophobia", "Coordinated pile-on", "Dehumanization"
];

const generateSparkline = (base, variance, points = 7) =>
  Array.from({ length: points }, (_, i) => ({
    day: i, value: Math.max(0, base + (Math.random() - 0.5) * variance * 2)
  }));

const generateTimeSeries = (days = 30, base = 100, growth = 1.02) =>
  Array.from({ length: days }, (_, i) => {
    const date = new Date(2026, 2, 20 - days + i);
    return {
      date: `${date.getMonth() + 1}/${date.getDate()}`,
      value: Math.round(base * Math.pow(growth, i) + (Math.random() - 0.5) * base * 0.3)
    };
  });

const PIPELINE_METRICS = [
  { id: "posts_ingested", label: "Posts Ingested", value: "24,891", status: "healthy", sparkline: generateSparkline(24000, 3000), tooltip: "Total social media posts pulled from connected platform APIs in the last 24 hours.", healthy: "Within ±20% of 7-day avg", warning: ">30% drop", critical: "Zero from any platform >2hrs" },
  { id: "classifier_success", label: "Classifier", value: "99.2%", status: "healthy", sparkline: generateSparkline(99, 1.5), tooltip: "Percentage of ingested posts that successfully completed classification.", healthy: "≥ 98%", warning: "95–97%", critical: "< 95%" },
  { id: "fp_checker", label: "FP Checker", value: "98.7%", status: "healthy", sparkline: generateSparkline(98.5, 1.2), tooltip: "Percentage of classifier-flagged posts that successfully passed the false positive check.", healthy: "≥ 98%", warning: "95–97%", critical: "< 95%" },
  { id: "action_agent", label: "Action Agent", value: "97.8%", status: "warning", sparkline: generateSparkline(98.2, 1.5), tooltip: "Percentage of confirmed incidents that triggered an action output.", healthy: "≥ 99%", warning: "97–98%", critical: "< 97%" },
  { id: "latency_p50", label: "Latency P50", value: "18s", status: "healthy", sparkline: generateSparkline(18, 8), tooltip: "Median time from post ingestion to action agent output.", healthy: "< 30s", warning: "> 60s", critical: "> 5 min" },
  { id: "queue_depth", label: "Queue Depth", value: "127", status: "healthy", sparkline: generateSparkline(130, 80), tooltip: "Posts currently waiting to be classified.", healthy: "< 500", warning: "500–2,000", critical: "> 2,000" },
];

const DETECTION_METRICS = [
  { id: "detection_rate", label: "Detection Rate", value: "+12%", subtitle: "vs 7-day avg", status: "healthy", sparkline: generateSparkline(50, 15), tooltip: "Harmful posts flagged today vs. rolling average, normalized by volume." },
  { id: "fpr", label: "False Positive Rate", value: "7.2%", subtitle: "rolling 7 days", status: "healthy", sparkline: generateSparkline(7, 3), tooltip: "Percentage of alerts clients marked as incorrect. Lower is better." },
];

const PLATFORM_STATUS = [
  { platform: "X", lastIngestion: "12 min ago", status: "healthy", apiErrors: "0.8%", credExpiry: "45 days" },
  { platform: "YouTube", lastIngestion: "8 min ago", status: "healthy", apiErrors: "0.3%", credExpiry: "62 days" },
  { platform: "Instagram", lastIngestion: "22 min ago", status: "healthy", apiErrors: "1.1%", credExpiry: "28 days" },
];

const COST_DATA = { dailySpend: "$142", status: "healthy", costPerAccount: "$2.18", trend: "down" };

const CLIENT_HEALTH = [
  { name: "Pacific Athletic Conference", athletes: 48, lastLogin: "2 hours ago", fpr: "5.1%", ackRate: "82%", status: "healthy", plan: "Shield" },
  { name: "Midwest University Athletic", athletes: 32, lastLogin: "16 days ago", fpr: "8.3%", ackRate: "45%", status: "warning", plan: "Pro" },
  { name: "Coastal Talent Agency", athletes: 15, lastLogin: "1 day ago", fpr: "11.2%", ackRate: "71%", status: "healthy", plan: "Pro" },
  { name: "National Women's League", athletes: 64, lastLogin: "4 hours ago", fpr: "4.8%", ackRate: "88%", status: "healthy", plan: "Shield" },
  { name: "Summit Sports Group", athletes: 22, lastLogin: "32 days ago", fpr: "18.5%", ackRate: "28%", status: "critical", plan: "Base" },
];

const NORTH_STAR_DATA = generateTimeSeries(30, 85, 1.015);

const HARM_DISTRIBUTION = HARM_CATEGORIES.map((cat, i) => ({
  name: cat, value: Math.round(100 * Math.pow(0.78, i) + Math.random() * 20),
})).sort((a, b) => b.value - a.value);

const DEMOGRAPHIC_DATA = {
  gender: [
    { group: "Women athletes", rate: 14.2, color: "#F472B6" },
    { group: "Men athletes", rate: 6.8, color: "#60A5FA" },
    { group: "Nonbinary athletes", rate: 11.3, color: "#A78BFA" },
  ],
  raceEthnicity: [
    { group: "Black athletes", rate: 18.7, color: "#F59E0B" },
    { group: "Hispanic/Latino", rate: 10.2, color: "#10B981" },
    { group: "White athletes", rate: 5.9, color: "#6B7280" },
    { group: "Asian athletes", rate: 8.4, color: "#EC4899" },
  ],
};

const TEMPORAL_DATA = Array.from({ length: 24 }, (_, h) => ({
  hour: `${h}:00`, incidents: Math.round(12 + 30 * Math.sin((h - 20) * Math.PI / 12) ** 2 + Math.random() * 8)
}));

const SAMPLE_INCIDENTS = [
  { id: "INC-4821", date: "2026-03-20 07:42", platform: "X", category: "Racial abuse", severity: 87, athlete: "Athlete #A7F2", client: "Pacific Athletic Conference", status: "Confirmed", confidence: 0.94 },
  { id: "INC-4820", date: "2026-03-20 06:18", platform: "Instagram", category: "Sexual harassment", severity: 72, athlete: "Athlete #B3D1", client: "National Women's League", status: "Confirmed", confidence: 0.88 },
  { id: "INC-4819", date: "2026-03-20 05:55", platform: "YouTube", category: "Homophobia", severity: 65, athlete: "Athlete #C9E4", client: "Coastal Talent Agency", status: "Dismissed", confidence: 0.71 },
  { id: "INC-4818", date: "2026-03-19 23:12", platform: "X", category: "Death threats", severity: 95, athlete: "Athlete #D2A8", client: "Pacific Athletic Conference", status: "Confirmed", confidence: 0.97 },
  { id: "INC-4817", date: "2026-03-19 21:44", platform: "X", category: "Coordinated pile-on", severity: 78, athlete: "Athlete #A7F2", client: "Pacific Athletic Conference", status: "Confirmed", confidence: 0.82 },
];

// ─── THEME ────────────────────────────────────────────────────────────────
const COLORS = {
  bg: "#0B0F1A", bgCard: "#111827", bgCardHover: "#1A2234",
  bgSidebar: "#0D1220", bgInput: "#1E293B",
  border: "#1E293B", borderLight: "#374151",
  text: "#F1F5F9", textMuted: "#94A3B8", textDim: "#64748B",
  green: "#22C55E", greenDim: "#166534",
  amber: "#F59E0B", amberDim: "#78350F",
  red: "#EF4444", redDim: "#7F1D1D",
  blue: "#3B82F6", blueDim: "#1E3A5F",
  purple: "#8B5CF6",
  accent: "#06B6D4",
};

const STATUS_CONFIG = {
  healthy: { color: COLORS.green, bg: COLORS.greenDim, label: "Healthy", icon: CheckCircle },
  warning: { color: COLORS.amber, bg: COLORS.amberDim, label: "Needs attention", icon: AlertTriangle },
  critical: { color: COLORS.red, bg: COLORS.redDim, label: "Critical", icon: XCircle },
};

// ─── UTILITY COMPONENTS ───────────────────────────────────────────────────
const StatusBadge = ({ status }) => {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600, background: cfg.bg + "40", color: cfg.color, border: `1px solid ${cfg.color}30` }}>
      <Icon size={12} /> {cfg.label}
    </span>
  );
};

const MiniSparkline = ({ data, color, height = 32 }) => (
  <ResponsiveContainer width="100%" height={height}>
    <AreaChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
      <defs>
        <linearGradient id={`spark-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <Area type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} fill={`url(#spark-${color})`} dot={false} />
    </AreaChart>
  </ResponsiveContainer>
);

const InfoTooltip = ({ text }) => {
  const [show, setShow] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-flex", cursor: "help" }} onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <Info size={13} color={COLORS.textDim} />
      {show && (
        <div style={{ position: "absolute", bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)", background: COLORS.bgCard, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: "10px 14px", fontSize: 12, color: COLORS.textMuted, width: 260, zIndex: 100, lineHeight: 1.5, boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
          {text}
        </div>
      )}
    </span>
  );
};

const ContentWarning = ({ onReveal, onSkip }) => (
  <div style={{ background: COLORS.redDim + "30", border: `1px solid ${COLORS.red}30`, borderRadius: 8, padding: 20, textAlign: "center" }}>
    <AlertTriangle size={24} color={COLORS.amber} style={{ marginBottom: 8 }} />
    <p style={{ color: COLORS.text, fontSize: 14, marginBottom: 4 }}>This incident contains abusive content.</p>
    <p style={{ color: COLORS.textDim, fontSize: 12, marginBottom: 16 }}>Viewing is logged for audit purposes.</p>
    <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
      <button onClick={onReveal} style={{ padding: "8px 16px", borderRadius: 6, background: COLORS.bgInput, border: `1px solid ${COLORS.border}`, color: COLORS.text, fontSize: 13, cursor: "pointer" }}>
        <Eye size={14} style={{ marginRight: 6, verticalAlign: -2 }} />Reveal content
      </button>
      <button onClick={onSkip} style={{ padding: "8px 16px", borderRadius: 6, background: "transparent", border: `1px solid ${COLORS.border}`, color: COLORS.textMuted, fontSize: 13, cursor: "pointer" }}>Skip</button>
    </div>
  </div>
);

// ─── HEALTH METRIC CARD ──────────────────────────────────────────────────
const HealthCard = ({ metric, onClick }) => {
  const cfg = STATUS_CONFIG[metric.status];
  return (
    <div
      onClick={() => onClick(metric)}
      style={{
        background: COLORS.bgCard, borderRadius: 12, padding: 16, cursor: "pointer",
        borderLeft: `3px solid ${cfg.color}`, transition: "all 0.2s",
        border: `1px solid ${COLORS.border}`, borderLeftWidth: 3, borderLeftColor: cfg.color,
        position: "relative", overflow: "hidden",
      }}
      onMouseEnter={e => { e.currentTarget.style.background = COLORS.bgCardHover; e.currentTarget.style.transform = "translateY(-1px)"; }}
      onMouseLeave={e => { e.currentTarget.style.background = COLORS.bgCard; e.currentTarget.style.transform = "translateY(0)"; }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: cfg.color, boxShadow: `0 0 8px ${cfg.color}60` }} />
          <span style={{ fontSize: 12, color: COLORS.textMuted, fontWeight: 500, letterSpacing: "0.02em", textTransform: "uppercase" }}>{metric.label}</span>
        </div>
        {metric.tooltip && <InfoTooltip text={metric.tooltip} />}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: COLORS.text, fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace", letterSpacing: "-0.02em", marginBottom: 4 }}>
        {metric.value}
      </div>
      {metric.subtitle && <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: 8 }}>{metric.subtitle}</div>}
      <MiniSparkline data={metric.sparkline} color={cfg.color} />
    </div>
  );
};

// ─── METRIC DETAIL VIEW ──────────────────────────────────────────────────
const MetricDetail = ({ metric, onBack }) => {
  const cfg = STATUS_CONFIG[metric.status];
  const detailedData = generateTimeSeries(7, parseFloat(metric.value) || 98, 1.0);
  const causes = {
    action_agent: ["Supabase write failure (database connection or quota)", "Client notification webhook failing", "Action Agent receiving confirmed positive but missing required fields"],
    classifier_success: ["OpenAI API outage or rate limit exceeded", "Malformed post content causing parsing errors", "Prompt template broken by recent code change"],
    posts_ingested: ["Platform API rate limit hit or credentials expired", "Apify scraper job failed or quota exhausted", "Network timeout between ingestion layer and Supabase"],
  };
  const responses = {
    action_agent: ["Check Supabase logs for write errors", "Check webhook delivery logs", "Verify alert schema hasn't changed"],
    classifier_success: ["Check OpenAI API status page", "Review error logs for recurring error type", "Check if errors cluster on specific platform"],
    posts_ingested: ["Check platform API status pages", "Check Apify job logs", "Verify API keys have not expired"],
  };
  const metricCauses = causes[metric.id] || causes.action_agent;
  const metricResponses = responses[metric.id] || responses.action_agent;

  return (
    <div>
      <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: COLORS.accent, cursor: "pointer", fontSize: 13, marginBottom: 20, padding: 0 }}>
        <ArrowLeft size={16} /> Back to Health Summary
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: COLORS.text, margin: 0 }}>{metric.label}</h2>
        <StatusBadge status={metric.status} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
        <div style={{ background: COLORS.bgCard, borderRadius: 10, padding: 16, border: `1px solid ${COLORS.border}` }}>
          <div style={{ fontSize: 11, color: COLORS.textDim, textTransform: "uppercase", marginBottom: 6 }}>Current</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: cfg.color, fontFamily: "monospace" }}>{metric.value}</div>
        </div>
        <div style={{ background: COLORS.bgCard, borderRadius: 10, padding: 16, border: `1px solid ${COLORS.border}` }}>
          <div style={{ fontSize: 11, color: COLORS.textDim, textTransform: "uppercase", marginBottom: 6 }}>Healthy Range</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: COLORS.green }}>{metric.healthy}</div>
        </div>
        <div style={{ background: COLORS.bgCard, borderRadius: 10, padding: 16, border: `1px solid ${COLORS.border}` }}>
          <div style={{ fontSize: 11, color: COLORS.textDim, textTransform: "uppercase", marginBottom: 6 }}>Status</div>
          <div style={{ fontSize: 18, fontWeight: 600, color: cfg.color }}>{cfg.label}</div>
        </div>
      </div>
      <div style={{ background: COLORS.bgCard, borderRadius: 12, padding: 20, border: `1px solid ${COLORS.border}`, marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, color: COLORS.textMuted, marginBottom: 16, fontWeight: 600 }}>7-DAY TREND</h3>
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={detailedData}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
            <XAxis dataKey="date" stroke={COLORS.textDim} fontSize={11} />
            <YAxis stroke={COLORS.textDim} fontSize={11} />
            <Tooltip contentStyle={{ background: COLORS.bgCard, border: `1px solid ${COLORS.border}`, borderRadius: 8, color: COLORS.text, fontSize: 12 }} />
            <Area type="monotone" dataKey="value" stroke={cfg.color} fill={cfg.color + "20"} strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ background: COLORS.bgCard, borderRadius: 12, padding: 20, border: `1px solid ${COLORS.border}` }}>
          <h3 style={{ fontSize: 14, color: COLORS.textMuted, marginBottom: 12, fontWeight: 600 }}>LIKELY CAUSES</h3>
          {metricCauses.map((c, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 10, fontSize: 13, color: COLORS.text, lineHeight: 1.5 }}>
              <span style={{ color: COLORS.amber, flexShrink: 0 }}>•</span> {c}
            </div>
          ))}
        </div>
        <div style={{ background: COLORS.bgCard, borderRadius: 12, padding: 20, border: `1px solid ${COLORS.border}` }}>
          <h3 style={{ fontSize: 14, color: COLORS.textMuted, marginBottom: 12, fontWeight: 600 }}>FIRST RESPONSE</h3>
          {metricResponses.map((r, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 10, fontSize: 13, color: COLORS.text, lineHeight: 1.5 }}>
              <span style={{ color: COLORS.accent, fontWeight: 700 }}>{i + 1}.</span> {r}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── SIDEBAR NAVIGATION ──────────────────────────────────────────────────
const NAV_SECTIONS = [
  { id: "ops", label: "Operations", icon: Activity, sub: [
    { id: "ops-health", label: "Health Summary" },
    { id: "ops-pipeline", label: "Pipeline" },
    { id: "ops-detection", label: "Detection" },
    { id: "ops-platforms", label: "Platforms" },
    { id: "ops-costs", label: "Costs" },
    { id: "ops-clients", label: "Clients" },
  ]},
  { id: "metrics", label: "Metrics", icon: BarChart3, sub: [
    { id: "metrics-northstar", label: "North Star" },
    { id: "metrics-usage", label: "Usage" },
    { id: "metrics-customers", label: "Customers" },
    { id: "metrics-business", label: "Business" },
    { id: "metrics-investor", label: "Investor View" },
  ]},
  { id: "research", label: "Research", icon: FileText, sub: [
    { id: "research-demographics", label: "Demographics" },
    { id: "research-temporal", label: "Temporal" },
    { id: "research-typology", label: "Typology" },
    { id: "research-campaigns", label: "Campaigns" },
    { id: "research-exports", label: "Exports" },
  ]},
  { id: "cases", label: "Cases", icon: Search, sub: [] },
];

const Sidebar = ({ currentView, onNavigate, collapsed, onToggle, role }) => {
  const [expanded, setExpanded] = useState({ ops: true, metrics: false, research: false });
  const isAllowed = (sectionId) => {
    if (role === ROLES.LEADERSHIP) return true;
    if (role === ROLES.OPS) return ["ops", "cases"].includes(sectionId);
    if (role === ROLES.CLIENT_SUCCESS) return ["ops", "metrics", "cases"].includes(sectionId);
    if (role === ROLES.RESEARCH) return ["research", "cases"].includes(sectionId);
    return false;
  };

  return (
    <div style={{
      width: collapsed ? 56 : 220, background: COLORS.bgSidebar, borderRight: `1px solid ${COLORS.border}`,
      height: "100vh", position: "fixed", left: 0, top: 0, zIndex: 50, transition: "width 0.2s",
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      <div style={{ padding: collapsed ? "16px 12px" : "16px 16px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={onToggle} style={{ background: "none", border: "none", color: COLORS.textMuted, cursor: "pointer", padding: 4, flexShrink: 0 }}>
          {collapsed ? <Menu size={20} /> : <X size={18} />}
        </button>
        {!collapsed && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Shield size={18} color={COLORS.accent} />
            <span style={{ fontSize: 15, fontWeight: 700, color: COLORS.text, letterSpacing: "0.04em" }}>WHISTLE</span>
            <span style={{ fontSize: 10, color: COLORS.textDim, background: COLORS.bgInput, padding: "2px 6px", borderRadius: 4 }}>OPS</span>
          </div>
        )}
      </div>
      <nav style={{ flex: 1, padding: "8px 0", overflowY: "auto" }}>
        {NAV_SECTIONS.filter(s => isAllowed(s.id)).map(section => {
          const Icon = section.icon;
          const isActive = currentView.startsWith(section.id);
          const isExp = expanded[section.id];
          return (
            <div key={section.id}>
              <button
                onClick={() => {
                  if (section.sub.length > 0) {
                    setExpanded(p => ({ ...p, [section.id]: !p[section.id] }));
                    onNavigate(section.sub[0].id);
                  } else {
                    onNavigate(section.id);
                  }
                }}
                style={{
                  display: "flex", alignItems: "center", gap: 10, width: "100%",
                  padding: collapsed ? "10px 18px" : "10px 16px", background: isActive ? COLORS.bgInput : "transparent",
                  border: "none", color: isActive ? COLORS.text : COLORS.textMuted, cursor: "pointer",
                  fontSize: 13, fontWeight: isActive ? 600 : 400, borderLeft: `2px solid ${isActive ? COLORS.accent : "transparent"}`,
                  transition: "all 0.15s",
                }}
              >
                <Icon size={18} />
                {!collapsed && <span style={{ flex: 1, textAlign: "left" }}>{section.label}</span>}
                {!collapsed && section.sub.length > 0 && (isExp ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
              </button>
              {!collapsed && isExp && section.sub.map(sub => (
                <button
                  key={sub.id}
                  onClick={() => onNavigate(sub.id)}
                  style={{
                    display: "block", width: "100%", padding: "7px 16px 7px 46px",
                    background: currentView === sub.id ? COLORS.bgCardHover : "transparent",
                    border: "none", color: currentView === sub.id ? COLORS.text : COLORS.textDim,
                    cursor: "pointer", fontSize: 12, textAlign: "left", fontWeight: currentView === sub.id ? 600 : 400,
                    transition: "all 0.15s",
                  }}
                >
                  {sub.label}
                </button>
              ))}
            </div>
          );
        })}
      </nav>
      {!collapsed && (
        <div style={{ padding: 16, borderTop: `1px solid ${COLORS.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: COLORS.blueDim, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: COLORS.blue }}>SP</div>
            <div>
              <div style={{ fontSize: 12, color: COLORS.text, fontWeight: 500 }}>Shelby P.</div>
              <div style={{ fontSize: 10, color: COLORS.textDim }}>Leadership</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── PAGE VIEWS ──────────────────────────────────────────────────────────

const OpsHealthSummary = ({ onDrill }) => {
  const critCount = [...PIPELINE_METRICS, ...DETECTION_METRICS].filter(m => m.status === "critical").length;
  const warnCount = [...PIPELINE_METRICS, ...DETECTION_METRICS].filter(m => m.status === "warning").length;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: COLORS.text, margin: 0 }}>Health Summary</h1>
          <p style={{ fontSize: 13, color: COLORS.textDim, margin: "4px 0 0" }}>
            {critCount === 0 && warnCount === 0 ? "All systems healthy" :
             `${critCount > 0 ? `${critCount} critical` : ""}${critCount > 0 && warnCount > 0 ? ", " : ""}${warnCount > 0 ? `${warnCount} needs attention` : ""}`}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: COLORS.textDim }}>
          <Clock size={14} /> Last updated: just now
          <button style={{ background: COLORS.bgInput, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: "5px 8px", color: COLORS.textMuted, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}>
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
      </div>

      <div style={{ fontSize: 11, color: COLORS.textDim, textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.06em", marginBottom: 10 }}>Pipeline Health</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginBottom: 28 }}>
        {PIPELINE_METRICS.map(m => <HealthCard key={m.id} metric={m} onClick={onDrill} />)}
      </div>

      <div style={{ fontSize: 11, color: COLORS.textDim, textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.06em", marginBottom: 10 }}>Detection Quality</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginBottom: 28 }}>
        {DETECTION_METRICS.map(m => <HealthCard key={m.id} metric={m} onClick={onDrill} />)}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ background: COLORS.bgCard, borderRadius: 12, padding: 16, border: `1px solid ${COLORS.border}` }}>
          <div style={{ fontSize: 11, color: COLORS.textDim, textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.06em", marginBottom: 12 }}>Platform Status</div>
          {PLATFORM_STATUS.map(p => (
            <div key={p.platform} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${COLORS.border}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: STATUS_CONFIG[p.status].color }} />
                <span style={{ fontSize: 13, color: COLORS.text, fontWeight: 500 }}>{p.platform}</span>
              </div>
              <span style={{ fontSize: 12, color: COLORS.textDim }}>{p.lastIngestion}</span>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={{ background: COLORS.bgCard, borderRadius: 12, padding: 16, border: `1px solid ${COLORS.border}` }}>
            <div style={{ fontSize: 11, color: COLORS.textDim, textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.06em", marginBottom: 8 }}>Daily API Cost</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: COLORS.green, fontFamily: "monospace" }}>{COST_DATA.dailySpend}</div>
            <StatusBadge status="healthy" />
          </div>
          <div style={{ background: COLORS.bgCard, borderRadius: 12, padding: 16, border: `1px solid ${COLORS.border}`, borderLeftWidth: 3, borderLeftColor: COLORS.amber }}>
            <div style={{ fontSize: 11, color: COLORS.textDim, textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.06em", marginBottom: 8 }}>Client Activity</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: COLORS.amber, fontFamily: "monospace" }}>2</div>
            <div style={{ fontSize: 12, color: COLORS.textDim }}>idle clients ({">"}14 days)</div>
          </div>
        </div>
      </div>
    </div>
  );
};

const NorthStarView = () => (
  <div>
    <h1 style={{ fontSize: 22, fontWeight: 700, color: COLORS.text, margin: "0 0 4px" }}>North Star Metric</h1>
    <p style={{ fontSize: 13, color: COLORS.textDim, margin: "0 0 24px" }}>Incidents detected & actioned per month — the single number that captures Whistle's core value.</p>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
      {[
        { label: "This Month", value: "2,847", change: "+18%", positive: true },
        { label: "Active Athletes", value: "181", change: "+12", positive: true },
        { label: "Avg Detection Time", value: "22s", change: "-3s", positive: true },
        { label: "False Positive Rate", value: "7.2%", change: "-1.1%", positive: true },
      ].map((s, i) => (
        <div key={i} style={{ background: COLORS.bgCard, borderRadius: 10, padding: 16, border: `1px solid ${COLORS.border}` }}>
          <div style={{ fontSize: 11, color: COLORS.textDim, textTransform: "uppercase", marginBottom: 6, fontWeight: 600 }}>{s.label}</div>
          <div style={{ fontSize: 26, fontWeight: 700, color: COLORS.text, fontFamily: "monospace" }}>{s.value}</div>
          <div style={{ fontSize: 12, color: s.positive ? COLORS.green : COLORS.red, display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
            {s.positive ? <TrendingUp size={13} /> : <TrendingDown size={13} />} {s.change} vs last month
          </div>
        </div>
      ))}
    </div>
    <div style={{ background: COLORS.bgCard, borderRadius: 12, padding: 20, border: `1px solid ${COLORS.border}`, marginBottom: 24 }}>
      <h3 style={{ fontSize: 14, color: COLORS.textMuted, marginBottom: 16, fontWeight: 600 }}>INCIDENTS DETECTED & ACTIONED (30 DAYS)</h3>
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={NORTH_STAR_DATA}>
          <defs>
            <linearGradient id="northStarGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLORS.accent} stopOpacity={0.3} />
              <stop offset="100%" stopColor={COLORS.accent} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
          <XAxis dataKey="date" stroke={COLORS.textDim} fontSize={11} />
          <YAxis stroke={COLORS.textDim} fontSize={11} />
          <Tooltip contentStyle={{ background: COLORS.bgCard, border: `1px solid ${COLORS.border}`, borderRadius: 8, color: COLORS.text, fontSize: 12 }} />
          <Area type="monotone" dataKey="value" stroke={COLORS.accent} fill="url(#northStarGrad)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
    <div style={{ background: COLORS.bgCard, borderRadius: 12, padding: 20, border: `1px solid ${COLORS.border}` }}>
      <h3 style={{ fontSize: 14, color: COLORS.textMuted, marginBottom: 16, fontWeight: 600 }}>HARM CATEGORY DISTRIBUTION (30 DAYS)</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={HARM_DISTRIBUTION.slice(0, 8)} layout="vertical" margin={{ left: 120 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} horizontal={false} />
          <XAxis type="number" stroke={COLORS.textDim} fontSize={11} />
          <YAxis type="category" dataKey="name" stroke={COLORS.textDim} fontSize={11} width={115} />
          <Tooltip contentStyle={{ background: COLORS.bgCard, border: `1px solid ${COLORS.border}`, borderRadius: 8, color: COLORS.text, fontSize: 12 }} />
          <Bar dataKey="value" fill={COLORS.accent} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  </div>
);

const CustomersView = () => (
  <div>
    <h1 style={{ fontSize: 22, fontWeight: 700, color: COLORS.text, margin: "0 0 4px" }}>Customer Health</h1>
    <p style={{ fontSize: 13, color: COLORS.textDim, margin: "0 0 24px" }}>Per-client health cards showing activity, detection quality, and engagement.</p>
    <div style={{ display: "grid", gap: 12 }}>
      {CLIENT_HEALTH.map((client, i) => (
        <div key={i} style={{ background: COLORS.bgCard, borderRadius: 12, padding: 20, border: `1px solid ${COLORS.border}`, borderLeftWidth: 3, borderLeftColor: STATUS_CONFIG[client.status].color, display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr", alignItems: "center", gap: 16 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.text, marginBottom: 4 }}>{client.name}</div>
            <div style={{ fontSize: 12, color: COLORS.textDim }}>{client.athletes} athletes · {client.plan} plan</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: COLORS.textDim, textTransform: "uppercase", marginBottom: 4 }}>Last Login</div>
            <div style={{ fontSize: 13, color: client.status === "healthy" ? COLORS.text : COLORS.amber }}>{client.lastLogin}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: COLORS.textDim, textTransform: "uppercase", marginBottom: 4 }}>FPR</div>
            <div style={{ fontSize: 13, color: parseFloat(client.fpr) > 15 ? COLORS.red : parseFloat(client.fpr) > 10 ? COLORS.amber : COLORS.text }}>{client.fpr}</div>
          </div>
          <div>
            <div style={{ fontSize: 10, color: COLORS.textDim, textTransform: "uppercase", marginBottom: 4 }}>Ack Rate</div>
            <div style={{ fontSize: 13, color: parseFloat(client.ackRate) < 50 ? COLORS.amber : COLORS.text }}>{client.ackRate}</div>
          </div>
          <div><StatusBadge status={client.status} /></div>
          <div style={{ textAlign: "right" }}>
            <button style={{ background: COLORS.bgInput, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: "6px 12px", color: COLORS.textMuted, cursor: "pointer", fontSize: 12 }}>
              View <ChevronRight size={12} style={{ verticalAlign: -2 }} />
            </button>
          </div>
        </div>
      ))}
    </div>
  </div>
);

const CHART_COLORS = ["#F472B6", "#60A5FA", "#A78BFA", "#F59E0B", "#10B981", "#6B7280", "#EC4899"];

const ResearchDemographics = () => (
  <div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: COLORS.text, margin: "0 0 4px" }}>Demographic Disparity Analysis</h1>
        <p style={{ fontSize: 13, color: COLORS.textDim, margin: 0 }}>Anonymized abuse rates normalized per 1,000 posts scanned. All data is de-identified.</p>
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, background: COLORS.bgInput, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: "6px 12px", fontSize: 12, color: COLORS.textMuted }}>
          <Lock size={12} /> Anonymized view
        </div>
        <button style={{ background: COLORS.bgInput, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: "6px 12px", color: COLORS.textMuted, cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
          <Download size={12} /> Export
        </button>
      </div>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
      <div style={{ background: COLORS.bgCard, borderRadius: 12, padding: 20, border: `1px solid ${COLORS.border}` }}>
        <h3 style={{ fontSize: 14, color: COLORS.textMuted, marginBottom: 16, fontWeight: 600 }}>ABUSE RATE BY GENDER</h3>
        <p style={{ fontSize: 12, color: COLORS.textDim, marginBottom: 16 }}>Incidents per 1,000 posts scanned</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={DEMOGRAPHIC_DATA.gender}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
            <XAxis dataKey="group" stroke={COLORS.textDim} fontSize={11} />
            <YAxis stroke={COLORS.textDim} fontSize={11} />
            <Tooltip contentStyle={{ background: COLORS.bgCard, border: `1px solid ${COLORS.border}`, borderRadius: 8, color: COLORS.text, fontSize: 12 }} />
            <Bar dataKey="rate" radius={[4, 4, 0, 0]}>
              {DEMOGRAPHIC_DATA.gender.map((entry, i) => <Cell key={i} fill={entry.color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div style={{ marginTop: 12, padding: 12, background: COLORS.bgInput, borderRadius: 8, fontSize: 12, color: COLORS.textMuted, lineHeight: 1.5 }}>
          Women athletes receive <strong style={{ color: COLORS.text }}>2.1×</strong> the abuse rate of men athletes when normalized by post volume.
        </div>
      </div>
      <div style={{ background: COLORS.bgCard, borderRadius: 12, padding: 20, border: `1px solid ${COLORS.border}` }}>
        <h3 style={{ fontSize: 14, color: COLORS.textMuted, marginBottom: 16, fontWeight: 600 }}>ABUSE RATE BY RACE/ETHNICITY</h3>
        <p style={{ fontSize: 12, color: COLORS.textDim, marginBottom: 16 }}>Incidents per 1,000 posts scanned (opt-in data only)</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={DEMOGRAPHIC_DATA.raceEthnicity}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
            <XAxis dataKey="group" stroke={COLORS.textDim} fontSize={11} />
            <YAxis stroke={COLORS.textDim} fontSize={11} />
            <Tooltip contentStyle={{ background: COLORS.bgCard, border: `1px solid ${COLORS.border}`, borderRadius: 8, color: COLORS.text, fontSize: 12 }} />
            <Bar dataKey="rate" radius={[4, 4, 0, 0]}>
              {DEMOGRAPHIC_DATA.raceEthnicity.map((entry, i) => <Cell key={i} fill={entry.color} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div style={{ marginTop: 12, padding: 12, background: COLORS.bgInput, borderRadius: 8, fontSize: 12, color: COLORS.textMuted, lineHeight: 1.5 }}>
          Black athletes experience <strong style={{ color: COLORS.text }}>3.2×</strong> the abuse rate of white athletes.
        </div>
      </div>
    </div>
    <div style={{ background: COLORS.bgCard, borderRadius: 12, padding: 20, border: `1px solid ${COLORS.border}` }}>
      <h3 style={{ fontSize: 14, color: COLORS.textMuted, marginBottom: 16, fontWeight: 600 }}>ABUSE VOLUME BY HOUR (UTC)</h3>
      <p style={{ fontSize: 12, color: COLORS.textDim, marginBottom: 16 }}>When does abuse peak? All times UTC.</p>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={TEMPORAL_DATA}>
          <CartesianGrid strokeDasharray="3 3" stroke={COLORS.border} />
          <XAxis dataKey="hour" stroke={COLORS.textDim} fontSize={10} interval={2} />
          <YAxis stroke={COLORS.textDim} fontSize={11} />
          <Tooltip contentStyle={{ background: COLORS.bgCard, border: `1px solid ${COLORS.border}`, borderRadius: 8, color: COLORS.text, fontSize: 12 }} />
          <Bar dataKey="incidents" fill={COLORS.purple} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  </div>
);

const CaseLookup = () => {
  const [search, setSearch] = useState("");
  const [selectedCase, setSelectedCase] = useState(null);
  const [contentRevealed, setContentRevealed] = useState(false);
  const filtered = SAMPLE_INCIDENTS.filter(inc =>
    inc.id.toLowerCase().includes(search.toLowerCase()) ||
    inc.category.toLowerCase().includes(search.toLowerCase()) ||
    inc.athlete.toLowerCase().includes(search.toLowerCase()) ||
    inc.client.toLowerCase().includes(search.toLowerCase())
  );

  if (selectedCase) {
    return (
      <div>
        <button onClick={() => { setSelectedCase(null); setContentRevealed(false); }} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: COLORS.accent, cursor: "pointer", fontSize: 13, marginBottom: 20, padding: 0 }}>
          <ArrowLeft size={16} /> Back to search
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: COLORS.text, margin: 0 }}>{selectedCase.id}</h2>
          <StatusBadge status={selectedCase.status === "Confirmed" ? "critical" : "warning"} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
          {[
            { label: "Platform", value: selectedCase.platform },
            { label: "Harm Category", value: selectedCase.category },
            { label: "Severity", value: `${selectedCase.severity}/100` },
            { label: "Confidence", value: `${(selectedCase.confidence * 100).toFixed(0)}%` },
          ].map((f, i) => (
            <div key={i} style={{ background: COLORS.bgCard, borderRadius: 10, padding: 14, border: `1px solid ${COLORS.border}` }}>
              <div style={{ fontSize: 10, color: COLORS.textDim, textTransform: "uppercase", marginBottom: 4 }}>{f.label}</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.text }}>{f.value}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
          <div style={{ background: COLORS.bgCard, borderRadius: 10, padding: 14, border: `1px solid ${COLORS.border}` }}>
            <div style={{ fontSize: 10, color: COLORS.textDim, textTransform: "uppercase", marginBottom: 4 }}>Targeted Athlete</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.text }}>{selectedCase.athlete}</div>
            <div style={{ fontSize: 11, color: COLORS.textDim }}>Anonymized ID</div>
          </div>
          <div style={{ background: COLORS.bgCard, borderRadius: 10, padding: 14, border: `1px solid ${COLORS.border}` }}>
            <div style={{ fontSize: 10, color: COLORS.textDim, textTransform: "uppercase", marginBottom: 4 }}>Client</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.text }}>{selectedCase.client}</div>
          </div>
        </div>
        <div style={{ background: COLORS.bgCard, borderRadius: 12, padding: 20, border: `1px solid ${COLORS.border}` }}>
          <h3 style={{ fontSize: 14, color: COLORS.textMuted, marginBottom: 16, fontWeight: 600 }}>INCIDENT CONTENT</h3>
          {!contentRevealed ? (
            <ContentWarning onReveal={() => setContentRevealed(true)} onSkip={() => setSelectedCase(null)} />
          ) : (
            <div>
              <div style={{ background: COLORS.redDim + "20", border: `1px solid ${COLORS.red}20`, borderRadius: 8, padding: 16, fontSize: 13, color: COLORS.textMuted, fontStyle: "italic", lineHeight: 1.6 }}>
                [Abusive content hidden in demo — in production, the actual post text would appear here after audit-logged reveal]
              </div>
              <p style={{ fontSize: 11, color: COLORS.textDim, marginTop: 12, textAlign: "center" }}>
                If viewing this content is affecting you, step away. Your wellbeing matters.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: COLORS.text, margin: "0 0 4px" }}>Case Lookup</h1>
      <p style={{ fontSize: 13, color: COLORS.textDim, margin: "0 0 24px" }}>Search for individual incidents by ID, athlete, client, or harm category.</p>
      <div style={{ position: "relative", marginBottom: 24 }}>
        <Search size={16} style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: COLORS.textDim }} />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search incidents..."
          style={{ width: "100%", padding: "12px 12px 12px 40px", background: COLORS.bgInput, border: `1px solid ${COLORS.border}`, borderRadius: 8, color: COLORS.text, fontSize: 14, outline: "none", boxSizing: "border-box" }}
        />
      </div>
      <div style={{ background: COLORS.bgCard, borderRadius: 12, border: `1px solid ${COLORS.border}`, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: "100px 140px 100px 160px 80px 100px 150px 80px", padding: "12px 16px", borderBottom: `1px solid ${COLORS.border}`, fontSize: 10, color: COLORS.textDim, textTransform: "uppercase", fontWeight: 600, letterSpacing: "0.04em" }}>
          <span>ID</span><span>Date</span><span>Platform</span><span>Category</span><span>Severity</span><span>Athlete</span><span>Client</span><span>Status</span>
        </div>
        {filtered.map(inc => (
          <div
            key={inc.id}
            onClick={() => setSelectedCase(inc)}
            style={{ display: "grid", gridTemplateColumns: "100px 140px 100px 160px 80px 100px 150px 80px", padding: "12px 16px", borderBottom: `1px solid ${COLORS.border}`, fontSize: 13, color: COLORS.text, cursor: "pointer", transition: "background 0.15s" }}
            onMouseEnter={e => e.currentTarget.style.background = COLORS.bgCardHover}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          >
            <span style={{ color: COLORS.accent, fontFamily: "monospace", fontSize: 12 }}>{inc.id}</span>
            <span style={{ color: COLORS.textMuted, fontSize: 12 }}>{inc.date}</span>
            <span>{inc.platform}</span>
            <span>{inc.category}</span>
            <span style={{ color: inc.severity > 85 ? COLORS.red : inc.severity > 60 ? COLORS.amber : COLORS.text, fontFamily: "monospace" }}>{inc.severity}</span>
            <span style={{ fontSize: 12, color: COLORS.textDim }}>{inc.athlete}</span>
            <span style={{ fontSize: 12 }}>{inc.client}</span>
            <span><StatusBadge status={inc.status === "Confirmed" ? "critical" : "warning"} /></span>
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ padding: 40, textAlign: "center" }}>
            <Search size={32} color={COLORS.textDim} style={{ marginBottom: 12 }} />
            <p style={{ fontSize: 14, color: COLORS.textMuted, marginBottom: 4 }}>No matching incidents</p>
            <p style={{ fontSize: 12, color: COLORS.textDim }}>Try adjusting your search or broadening the date range.</p>
          </div>
        )}
      </div>
    </div>
  );
};

const InvestorView = () => (
  <div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: COLORS.text, margin: "0 0 4px" }}>Investor Snapshot</h1>
        <p style={{ fontSize: 13, color: COLORS.textDim, margin: 0 }}>Key metrics for slide 7 of the pitch deck. Designed to screenshot.</p>
      </div>
      <button style={{ background: COLORS.accent + "20", border: `1px solid ${COLORS.accent}40`, borderRadius: 6, padding: "8px 16px", color: COLORS.accent, cursor: "pointer", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
        <Download size={14} /> Export as PDF
      </button>
    </div>
    <div style={{ background: COLORS.bgCard, borderRadius: 16, padding: 32, border: `1px solid ${COLORS.border}` }}>
      <div style={{ textAlign: "center", marginBottom: 32 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 8 }}>
          <Shield size={24} color={COLORS.accent} />
          <span style={{ fontSize: 24, fontWeight: 800, color: COLORS.text, letterSpacing: "0.04em" }}>WHISTLE</span>
        </div>
        <div style={{ fontSize: 13, color: COLORS.textDim }}>by NetRef Safety · March 2026</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 16, marginBottom: 32 }}>
        {[
          { value: "847", label: "Incidents platforms missed", sub: "Detected only by Whistle" },
          { value: "76.4", label: "Avg severity score", sub: "On a 0-100 scale" },
          { value: "22s", label: "Avg time-to-detection", sub: "Post → Alert in seconds" },
          { value: "80%", label: "Pilot expansion rate", sub: "Clients upgraded after pilot" },
          { value: "181", label: "Athletes protected", sub: "Across 5 organizations" },
        ].map((stat, i) => (
          <div key={i} style={{ textAlign: "center", padding: 16 }}>
            <div style={{ fontSize: 36, fontWeight: 800, color: COLORS.accent, fontFamily: "'JetBrains Mono', monospace", lineHeight: 1 }}>{stat.value}</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.text, marginTop: 8, lineHeight: 1.3 }}>{stat.label}</div>
            <div style={{ fontSize: 11, color: COLORS.textDim, marginTop: 4 }}>{stat.sub}</div>
          </div>
        ))}
      </div>
      <div style={{ padding: 20, background: COLORS.bgInput, borderRadius: 10, textAlign: "center", fontSize: 14, color: COLORS.textMuted, lineHeight: 1.7, fontStyle: "italic" }}>
        "We protected 181 athletes across 5 organizations, caught 847 incidents that would have gone undetected, clients are expanding, and our false positive rate is 45% below industry baseline."
      </div>
    </div>
  </div>
);

// ─── MAIN APPLICATION ────────────────────────────────────────────────────
export default function WhistleDashboard() {
  const [currentView, setCurrentView] = useState("ops-health");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [role, setRole] = useState(ROLES.LEADERSHIP);
  const [drillMetric, setDrillMetric] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  const sidebarWidth = sidebarCollapsed ? 56 : 220;

  const renderView = () => {
    if (drillMetric) return <MetricDetail metric={drillMetric} onBack={() => setDrillMetric(null)} />;
    switch (currentView) {
      case "ops-health": case "ops-pipeline": case "ops-detection": case "ops-platforms": case "ops-costs": case "ops-clients":
        return <OpsHealthSummary onDrill={setDrillMetric} />;
      case "metrics-northstar": case "metrics-usage":
        return <NorthStarView />;
      case "metrics-customers":
        return <CustomersView />;
      case "metrics-business": case "metrics-investor":
        return <InvestorView />;
      case "research-demographics": case "research-temporal": case "research-typology": case "research-campaigns": case "research-exports":
        return <ResearchDemographics />;
      case "cases":
        return <CaseLookup />;
      default:
        return <OpsHealthSummary onDrill={setDrillMetric} />;
    }
  };

  return (
    <div style={{ background: COLORS.bg, minHeight: "100vh", color: COLORS.text, fontFamily: "'DM Sans', 'Segoe UI', -apple-system, sans-serif" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet" />
      <Sidebar
        currentView={currentView}
        onNavigate={(id) => { setCurrentView(id); setDrillMetric(null); }}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        role={role}
      />
      <main style={{ marginLeft: sidebarWidth, padding: "24px 32px", transition: "margin-left 0.2s", maxWidth: 1200 }}>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16, gap: 8 }}>
          <select
            value={role}
            onChange={e => setRole(e.target.value)}
            style={{ background: COLORS.bgInput, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: "6px 10px", color: COLORS.textMuted, fontSize: 11, cursor: "pointer" }}
          >
            <option value={ROLES.LEADERSHIP}>Role: Leadership</option>
            <option value={ROLES.OPS}>Role: Ops</option>
            <option value={ROLES.CLIENT_SUCCESS}>Role: Client Success</option>
            <option value={ROLES.RESEARCH}>Role: Research</option>
          </select>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: COLORS.textDim, background: COLORS.bgInput, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: "6px 10px" }}>
            <Bell size={12} /> <span>0 alerts</span>
          </div>
        </div>
        {renderView()}
      </main>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: ${COLORS.bg}; }
        ::-webkit-scrollbar-thumb { background: ${COLORS.border}; border-radius: 3px; }
        ::selection { background: ${COLORS.accent}40; }
        input::placeholder { color: ${COLORS.textDim}; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }
      `}</style>
    </div>
  );
}
