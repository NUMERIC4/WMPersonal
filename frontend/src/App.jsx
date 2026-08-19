import { useState, useEffect, useRef } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import {
  getItems, fetchPrice, getPriceHistory, getUserOrders,
  getFavourites, addFavourite, removeFavourite,
  getFavouriteOrders, refreshFavourites, API_BASE,
  getStats, getScannerGroups, cancelScan,
  getScannerItems, cancelProfit, cancelTimeAnalysis,
  syncMarketItems,
  getCustomGroups, createCustomGroup, createCustomGroupFromDefault, deleteCustomGroup,
  renameCustomGroup, addItemToGroup, removeItemFromGroup,
  getMarketOrderStatus, getMarketAnalysis, refreshMarketOrders, recordMarketDemand, getMarketSchedulerStatus,
  getAlecaStatus, getAlecaSummary, getAlecaTrades, getAlecaRelics,
  getRelics, getRelicValuation, syncRelics, recordRelicDemand,
} from "./api";
import "./App.css";

const BASE = API_BASE;

// ── Helpers ──────────────────────────────────────────────────────────────────
function rankLabel(rank, maxRank) {
  if (rank === null || rank === undefined) return null;
  return maxRank != null ? `R${rank}/${maxRank}` : `R${rank}`;
}

function platPerKStanding(value, standingCost) {
  if (value === null || value === undefined || !standingCost) return null;
  return Math.round((value * 1000 / standingCost) * 100) / 100;
}

function fmtNum(value) {
  return value === null || value === undefined ? "/" : value.toLocaleString();
}

function formatAge(seconds) {
  if (seconds === null || seconds === undefined) return null;
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function configLabel(key) {
  if (!key) return "Default";
  const parts = [];
  if (key.rank !== null && key.rank !== undefined) parts.push(`Rank ${key.rank}`);
  if (key.subtype) parts.push(key.subtype);
  if (key.charges !== null && key.charges !== undefined) parts.push(`${key.charges} charges`);
  if (key.amberStars !== null && key.amberStars !== undefined) parts.push(`${key.amberStars} amber`);
  if (key.cyanStars !== null && key.cyanStars !== undefined) parts.push(`${key.cyanStars} cyan`);
  return parts.length ? parts.join(" / ") : "Default";
}

function plat(value, fallback = "—") {
  return value === null || value === undefined ? fallback : `${value}p`;
}

function rangePlat(range) {
  if (!range || range.low === null || range.low === undefined || range.high === null || range.high === undefined) return "—";
  return range.low === range.high ? `${range.low}p` : `${range.low}–${range.high}p`;
}

const SPECIAL_GROUP_NOTES = {
  "Vendor: Baro / Kiteer": "This is a rotating relay vendor. Add current Baro items manually in Group Manager, or note the next visit if no market data is available.",
  "Event: Warframe": "This is a scheduled event group. Populate it for the current event, or record the next event arrival time when no event is active.",
};

function tradeTypeLabel(type) {
  return type === 0 ? "Sale" : type === 1 ? "Purchase" : "Trade";
}

function formatTradeItems(items) {
  if (!items || items.length === 0) return "/";
  return items.map(item => `${item.displayName ?? item.name} ×${item.cnt}`).join("\n");
}

function formatTradeDate(ts, type) {
  const date = new Date(ts);
  if (type === 1) { // Purchase
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }
  return date.toLocaleString();
}

function evaluateMatch(order, compareOrders) {
  if (!compareOrders || compareOrders.length === 0) return null;
  
  const key = order.item_slug || order.item_name;
  if (!key) return null;

  if (order.order_type === "sell") {
    const baseBuy = compareOrders.find(o => o.order_type === "buy" && (o.item_slug === key || o.item_name === key));
    if (!baseBuy) return null;
    
    if (order.platinum < baseBuy.platinum) return { type: "good", label: "Good", diff: baseBuy.platinum - order.platinum };
    if (order.platinum === baseBuy.platinum) return { type: "acceptable", label: "Acceptable", diff: 0 };
    return { type: "negotiable", label: "Negotiable", diff: order.platinum - baseBuy.platinum };
  } else {
    const baseSell = compareOrders.find(o => o.order_type === "sell" && (o.item_slug === key || o.item_name === key));
    if (!baseSell) return null;
    
    if (order.platinum > baseSell.platinum) return { type: "good", label: "Good", diff: order.platinum - baseSell.platinum };
    if (order.platinum === baseSell.platinum) return { type: "acceptable", label: "Acceptable", diff: 0 };
    return { type: "negotiable", label: "Negotiable", diff: baseSell.platinum - order.platinum };
  }
}

// ── Info Popup ────────────────────────────────────────────────────────────────
function InfoPopup({ title, children, onClose }) {
  return (
    <div className="popup-overlay" onClick={onClose}>
      <div className="popup-box" onClick={e => e.stopPropagation()}>
        <div className="popup-header">
          <h3>{title}</h3>
          <button className="popup-close" onClick={onClose}>x</button>
        </div>
        <div className="popup-body">{children}</div>
      </div>
    </div>
  );
}

function ConfirmPopup({ title, children, confirmLabel = "Yes", cancelLabel = "Cancel", busy = false, onConfirm, onCancel }) {
  return (
    <div className="popup-overlay" onClick={busy ? undefined : onCancel}>
      <div className="popup-box confirm-popup" onClick={e => e.stopPropagation()}>
        <div className="popup-header">
          <h3>{title}</h3>
          <button className="popup-close" onClick={onCancel} disabled={busy}>x</button>
        </div>
        <div className="popup-body">{children}</div>
        <div className="popup-actions">
          <button className="refresh-btn" onClick={onCancel} disabled={busy}>{cancelLabel}</button>
          <button className="confirm-delete-btn" onClick={onConfirm} disabled={busy}>
            {busy ? "Deleting..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
// ── Order Table ───────────────────────────────────────────────────────────────
function OrderTable({ orders, onItemClick, showLive = false, compareOrders = [] }) {
  const [sortKey, setSortKey]     = useState("item_name");
  const [sortDir, setSortDir]     = useState("asc");
  const [filter,  setFilter]      = useState("all");
  const [rankFilter, setRankFilter] = useState("all");

  const compareSells = new Set(compareOrders.filter(o => o.order_type === "sell").map(o => o.item_slug || o.item_name || ""));
  const compareBuys  = new Set(compareOrders.filter(o => o.order_type === "buy").map(o => o.item_slug || o.item_name || ""));

  function isMatch(o) {
    const key = o.item_slug || o.item_name;
    if (!key) return false;
    return o.order_type === "sell" ? compareBuys.has(key) : compareSells.has(key);
  }

  function toggleSort(k) {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("asc"); }
  }

  function getStatus(o) {
    const marketMin = o.live?.min ?? (o.history && o.history.length ? o.history[0].min_price : null);
    if (marketMin === null || marketMin === undefined) return "neutral";
    if (o.order_type === "sell") {
      if (o.platinum < marketMin)   return "bad";
      if (o.platinum === marketMin) return "warn";
      return "good";
    } else {
      if (o.platinum > marketMin)   return "bad";
      if (o.platinum === marketMin) return "warn";
      return "good";
    }
  }

  function getRankCat(o) {
    if (o.rank === null || o.rank === undefined) return "unranked";
    if (o.max_rank != null && o.rank === o.max_rank) return "maxrank";
    return "partial";
  }

  function getVal(o, k) {
    switch (k) {
      case "item_name": return o.item_name?.toLowerCase() ?? "";
      case "platinum":  return o.platinum ?? 0;
      case "quantity":  return o.quantity ?? 0;
      case "rank":      return o.rank ?? -1;
      case "live_min":  return o.live?.min ?? -1;
      case "live_avg":  return o.live?.avg ?? -1;
      case "db_min":    return o.history?.[0]?.min_price ?? -1;
      case "db_avg":    return o.history?.[0]?.avg_price ?? -1;
      case "status":    return ["good","warn","neutral","bad"].indexOf(getStatus(o));
      default:          return 0;
    }
  }

  const filtered = orders.filter(o => {
    const sOk = filter === "all" || getStatus(o) === filter;
    const rOk = rankFilter === "all" || getRankCat(o) === rankFilter;
    return sOk && rOk;
  });

  const sorted = [...filtered].sort((a, b) => {
    const av = getVal(a, sortKey), bv = getVal(b, sortKey);
    return sortDir === "asc" ? (av < bv ? -1 : av > bv ? 1 : 0)
                             : (av > bv ? -1 : av < bv ? 1 : 0);
  });

  function renderSortTh(label, k) {
    const active = sortKey === k;
    return (
      <th className={`sortable ${active?"sorted":""}`} onClick={() => toggleSort(k)}>
        {label}{active?(sortDir==="asc"?" ▲":" ▼"):""}
      </th>
    );
  }

  return (
    <div>
      <div className="table-filters">
        <span className="filter-label">Status:</span>
        {["all","good","warn","bad","neutral"].map(f => (
          <button key={f} className={`filter-btn ${f} ${filter===f?"active":""}`} onClick={() => setFilter(f)}>
            {f==="all"?"All":f==="good"?"✓ Good":f==="warn"?"~ Even":f==="bad"?"✗ Risk":"— N/A"}
          </button>
        ))}
        <span className="filter-sep">|</span>
        <span className="filter-label">Rank:</span>
        {["all","unranked","partial","maxrank"].map(r => (
          <button key={r} className={`filter-btn rank-${r} ${rankFilter===r?"active":""}`} onClick={() => setRankFilter(r)}>
            {r==="all"?"All":r==="unranked"?"— Unranked":r==="partial"?"↑ Partial":"★ Max"}
          </button>
        ))}
        <span className="filter-count">{sorted.length}/{orders.length}</span>
      </div>
      <div className="order-section">
        <table>
          <thead>
            <tr>
              {renderSortTh("Item", "item_name")}
              {renderSortTh("Rank", "rank")}
              {renderSortTh("Listed", "platinum")}
              {renderSortTh("Qty", "quantity")}
              {showLive && renderSortTh("Mkt Min", "live_min")}
              {showLive && renderSortTh("Mkt Avg", "live_avg")}
              {renderSortTh("DB Min", "db_min")}
              {renderSortTh("DB Avg", "db_avg")}
              <th>Match</th>
              {renderSortTh("Status", "status")}
              <th>Last Saved</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(o => {
              const status = getStatus(o);
              const latest = o.history?.[0] ?? null;
              const diff   = o.live ? o.platinum - o.live.min : null;
              const rLabel = rankLabel(o.rank, o.max_rank);
              const rCat   = getRankCat(o);
              return (
                <tr key={o.id} className={`row-${status}`}>
                  <td><span className="item-link" onClick={() => onItemClick(o)}>{o.item_name}</span></td>
                  <td>{rLabel?<span className={`rank-badge rank-${rCat}`}>{rLabel}</span>:<span className="rank-none">—</span>}</td>
                  <td>{o.platinum} pt</td>
                  <td>{o.quantity}</td>
                  {showLive&&<td>{o.live?`${o.live.min} pt`:"/"}</td>}
                  {showLive&&<td>{o.live?`${o.live.avg?.toFixed(1)} pt`:"/"}</td>}
                  <td>{latest?`${latest.min_price} pt`:"/"}</td>
                  <td>{latest?`${latest.avg_price} pt`:"/"}</td>
                  <td>{compareOrders.length > 0 
                    ? (() => {
                        const m = evaluateMatch(o, compareOrders);
                        if (!m) return "/";
                        return <span className={`badge badge-${m.type}`}>
                          {m.label} {m.diff > 0 && `(+${m.diff}pt)`}
                        </span>;
                      })()
                    : "/"
                  }</td>
                      <td>
                        {(() => {
                          const marketMin = o.live?.min ?? (o.history && o.history.length ? o.history[0].min_price : null);
                          const diff = marketMin !== null && marketMin !== undefined ? (o.platinum - marketMin) : null;
                          return (
                            <span className={`badge badge-${status}`}>
                              {status === "good" ? "✓ Good" : status === "warn" ? "~ Even" : status === "bad" ? `✗ ${diff!==null?(diff>0?`+${diff}`:diff)+" pt":"Risk"}` : "—"}
                            </span>
                          );
                        })()}
                      </td>
                  <td className="ts-cell">{latest?new Date(latest.fetched_at).toLocaleString():"/"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Stats Panel ───────────────────────────────────────────────────────────────
function StatsPanel({ urlName }) {
  const [period, setPeriod] = useState("48h");
  const [data,   setData]   = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!urlName) return;
    let active = true;
    async function loadStats() {
      setLoading(true);
      try {
        const rows = await getStats(urlName, period);
        if (!active) return;
        setData(rows.map(r => ({
          t:          period==="48h"
                        ? new Date(r.datetime).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})
                        : new Date(r.datetime).toLocaleDateString(),
          avg:        r.avg_price,
          median:     r.median,
          moving_avg: r.moving_avg,
          volume:     r.volume,
          rank:       r.rank,
        })));
      } catch (error) {
        console.error(error);
      } finally {
        if (active) setLoading(false);
      }
    }
    loadStats();
    return () => { active = false; };
  }, [urlName, period]);

  if (!urlName) return null;
  const ranks  = [...new Set(data.map(d => d.rank))];
  const d0     = data.filter(d => d.rank === ranks[0]);

  return (
    <div className="stats-panel">
      <div className="stats-header">
        <h3 className="section-label">Market Statistics</h3>
        <div className="period-toggle">
          {["48h","90d"].map(p=>(
            <button key={p} className={`filter-btn ${period===p?"active":""}`} onClick={()=>setPeriod(p)}>{p}</button>
          ))}
        </div>
      </div>
      {loading && <p className="hint">Loading statistics…</p>}
      {!loading && d0.length > 0 && (
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={d0}>
              <XAxis dataKey="t" tick={{fontSize:10,fill:"#666"}} interval="preserveStartEnd"/>
              <YAxis tick={{fontSize:10,fill:"#666"}} width={40}/>
              <Tooltip contentStyle={{background:"#1c1f2b",border:"1px solid #2a2d3a",fontSize:"0.78rem"}}/>
              <Legend wrapperStyle={{fontSize:"0.75rem"}}/>
              <Line type="monotone" dataKey="avg"        stroke="#c8a96e" dot={false} name="Avg"/>
              <Line type="monotone" dataKey="median"     stroke="#70b870" dot={false} name="Median"/>
              <Line type="monotone" dataKey="moving_avg" stroke="#7090e0" dot={false} name="Moving Avg"/>
            </LineChart>
          </ResponsiveContainer>
          <ResponsiveContainer width="100%" height={70}>
            <BarChart data={d0}>
              <XAxis dataKey="t" hide/>
              <YAxis tick={{fontSize:10,fill:"#666"}} width={40}/>
              <Tooltip contentStyle={{background:"#1c1f2b",border:"1px solid #2a2d3a",fontSize:"0.78rem"}}/>
              <Bar dataKey="volume" fill="#e07070" name="Volume"/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ── Group Selector (btn86 style) ──────────────────────────────────────────────
function GroupSelector({ groups, selected, onSelect, groupStats = {}, filter = "" }) {
  const normalizedFilter = filter.trim().toLowerCase();
  const matchesFilter = (g) => !normalizedFilter || g.toLowerCase().includes(normalizedFilter);
  const builtin = Object.entries(groups).filter(([k]) => matchesFilter(k) && !k.startsWith("Custom: ") && !k.startsWith("NPC: "));
  const npc     = Object.entries(groups).filter(([k]) => matchesFilter(k) && k.startsWith("NPC: "));
  const custom  = Object.entries(groups).filter(([k]) => matchesFilter(k) && k.startsWith("Custom: "));

  function Btn({ g, count }) {
    const s    = groupStats[g];
    const isAct  = selected === g;
    const isLast = s?.isLast;
    return (
      <button className={`btn86 ${isAct?"active":""} ${isLast?"last-updated":""}`} onClick={() => onSelect(g)}>
        <span>{g}</span>
        <span className="btn86-count">
          {s ? `${s.done}/${s.total}` : count}
        </span>
      </button>
    );
  }

  return (
    <div>
      <div className="group-section-label">Built-in Groups</div>
      <div className="group-section-wrap">
        {builtin.map(([g,c]) => <Btn key={g} g={g} count={c}/>)}
      </div>
      {npc.length > 0 && (
        <>
          <div className="group-section-label">Syndicate / NPC</div>
          <div className="group-section-wrap">
            {npc.map(([g,c]) => <Btn key={g} g={g} count={c}/>)}
          </div>
        </>
      )}
      {custom.length > 0 && (
        <>
          <div className="group-section-label">My Groups</div>
          <div className="group-section-wrap">
            {custom.map(([g,c]) => <Btn key={g} g={g} count={c}/>)}
          </div>
        </>
      )}
      {builtin.length === 0 && npc.length === 0 && custom.length === 0 && (
        <div style={{color: "#999", padding: "12px 0", fontSize: "0.95rem"}}>
          No matching groups found.
        </div>
      )}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("market");

  // Market
  const [search,       setSearch]       = useState("");
  const [items,        setItems]        = useState([]);
  const [selected,     setSelected]     = useState(null);
  const [selectedRank, setSelectedRank] = useState(null);
  const [snapshot,     setSnapshot]     = useState(null);
  const [history,      setHistory]      = useState([]);
  const [loadingPrice, setLoadingPrice] = useState(false);
  const [loadingRank,  setLoadingRank]  = useState(false);
  const [orderStatus,  setOrderStatus]  = useState(null);
  const [refreshingOrders, setRefreshingOrders] = useState(false);
  const [orderRefreshError, setOrderRefreshError] = useState("");
  const [schedulerStatus, setSchedulerStatus] = useState(null);
  const [marketAnalysis, setMarketAnalysis] = useState(null);
  const [selectedMarketKey, setSelectedMarketKey] = useState(null);

  // User
  const [userInput,      setUserInput]      = useState("");
  const [userSlug,       setUserSlug]       = useState("");
  const [userOrders,     setUserOrders]     = useState([]);
  const [loadingUser,    setLoadingUser]    = useState(false);
  const [userError,      setUserError]      = useState("");
  const [activeSection,  setActiveSection]  = useState(null);
  const [itemHistories,  setItemHistories]  = useState({});
  const [itemLives,      setItemLives]      = useState({});

  // View user (for comparison, not saved)
  const [viewInput,     setViewInput]     = useState("");
  const [viewSlug,      setViewSlug]      = useState("");
  const [viewOrders,    setViewOrders]    = useState([]);
  const [loadingView,   setLoadingView]   = useState(false);
  const [viewError,     setViewError]     = useState("");
  const [viewSection,   setViewSection]   = useState(null);
  const [viewCards,     setViewCards]     = useState([]);
  const [activeViewSlug, setActiveViewSlug] = useState(null);
  const [viewAbortRef, setViewAbortRef] = useState(null);

  // Favourites
  const [favs,        setFavs]        = useState([]);
  const [favInput,    setFavInput]    = useState("");
  const [activeFav,   setActiveFav]   = useState(null);
  const [favOrders,   setFavOrders]   = useState([]);
  const [favSection,  setFavSection]  = useState(null);
  const [loadingFav,  setLoadingFav]  = useState(false);
  const [refreshing,  setRefreshing]  = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [baseFav,     setBaseFav]     = useState(null);
  const [baseFavOrders, setBaseFavOrders] = useState([]);
  const [favDeleteSlug, setFavDeleteSlug] = useState(null);
  const [deletingFav, setDeletingFav] = useState(false);

  // Trade Chat Builder
  const [tradeSelected,    setTradeSelected]    = useState(new Set());
  const [tradeCharLimit,   setTradeCharLimit]   = useState(500);
  const [tradeFormat,      setTradeFormat]      = useState("WTS");
  const [tradeChatOutput,  setTradeChatOutput]  = useState("");

  // Scanner
  const [scanGroups,   setScanGroups]   = useState({});
  const [scanGroup,    setScanGroup]    = useState("Arcanes");
  const [scanGroupFilter, setScanGroupFilter] = useState("");
  const [scanRunning,  setScanRunning]  = useState(false);
  const [scanProgress, setScanProgress] = useState(null);
  const [scanLog,      setScanLog]      = useState("");
  const [groupStats,   setGroupStats]   = useState({});
  const [groupResults, setGroupResults] = useState({});
  const [viewGroup,    setViewGroup]    = useState(null);
  const scanEsRef = useRef(null);
  const [syncingGroups, setSyncingGroups] = useState(false);
  const [scanSort, setScanSort] = useState("item");
  const [scanDir, setScanDir] = useState("asc");

  // Profit
  const [profitGroup,    setProfitGroup]    = useState("Arcanes");
  const [profitRunning,  setProfitRunning]  = useState(false);
  const [profitProgress, setProfitProgress] = useState(null);
  const [profitResults,  setProfitResults]  = useState([]);
  const [profitSort,     setProfitSort]     = useState("score");
  const [profitDir,      setProfitDir]      = useState("desc");
  const [showProfitInfo, setShowProfitInfo] = useState(false);
  const profitEsRef = useRef(null);

  // Relics
  const [relics, setRelics] = useState([]);
  const [relicEras, setRelicEras] = useState([]);
  const [relicSearch, setRelicSearch] = useState("");
  const [relicEra, setRelicEra] = useState("");
  const [selectedRelic, setSelectedRelic] = useState(null);
  const [relicValuation, setRelicValuation] = useState(null);
  const [relicLoading, setRelicLoading] = useState(false);
  const [relicSyncing, setRelicSyncing] = useState(false);
  const [relicSyncResult, setRelicSyncResult] = useState(null);

  // Time Analysis
  const [taGroup,      setTaGroup]      = useState("Arcanes");
  const [taFilters,    setTaFilters]    = useState({ minVolume: 5, maxPrice: 500 });
  const [taRunning,    setTaRunning]    = useState(false);
  const [taProgress,   setTaProgress]  = useState(null);
  const [taResults,    setTaResults]   = useState([]);
  const [taSelected,   setTaSelected]  = useState(null);
  const [showTaInfo,   setShowTaInfo]  = useState(false);
  const taEsRef = useRef(null);

  // Alecaframe
  const [alecaStatus,  setAlecaStatus]  = useState(null);
  const [alecaSummary, setAlecaSummary] = useState(null);
  const [alecaTrades,  setAlecaTrades]  = useState([]);
  const [alecaRelics,  setAlecaRelics]  = useState([]);
  const [alecaLoading, setAlecaLoading] = useState(false);
  const [alecaError,   setAlecaError]   = useState("");

  // Group Manager
  const [customGroups,    setCustomGroups]    = useState([]);
  const [newGroupName,    setNewGroupName]    = useState("");
  const [activeGMGroup,   setActiveGMGroup]   = useState(null);
  const [gmSearch,        setGmSearch]        = useState("");
  const [gmItems,         setGmItems]         = useState([]);
  const [gmLimit,         setGmLimit]         = useState(50);
  const [gmOffset,        setGmOffset]        = useState(0);
  const [gmMore,          setGmMore]          = useState(false);
  const [gmCategory,      setGmCategory]      = useState("all");
  const [renamingGroup,   setRenamingGroup]   = useState(null);
  const [renameVal,       setRenameVal]       = useState("");

  useEffect(() => {
    const t = setTimeout(() => getItems(search).then(setItems).catch(console.error), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { getFavourites().then(setFavs).catch(console.error); }, []);
  useEffect(() => { getMarketSchedulerStatus().then(setSchedulerStatus).catch(() => setSchedulerStatus(null)); }, []);
  useEffect(() => { getScannerGroups().then(setScanGroups).catch(console.error); }, []);
  useEffect(() => { getCustomGroups().then(setCustomGroups).catch(console.error); }, []);

  useEffect(() => {
    if (tab !== "relics") return;
    loadRelics();
  }, [tab, relicSearch, relicEra]);

  useEffect(() => {
    if (tab !== "alecaframe" || alecaStatus) return;
    loadAlecaFrame();
  }, [tab, alecaStatus]);

  async function loadRelics() {
    try {
      const data = await getRelics({ search: relicSearch, era: relicEra || undefined });
      setRelics(data.relics ?? []);
      setRelicEras(data.eras ?? []);
    } catch (error) {
      console.error(error);
    }
  }

  async function handleSyncRelics() {
    setRelicSyncing(true);
    try {
      const result = await syncRelics();
      setRelicSyncResult(result);
      await loadRelics();
    } catch (error) {
      console.error(error);
      setRelicSyncResult({ error: error.message });
    }
    setRelicSyncing(false);
  }

  async function handleSelectRelic(relic) {
    setSelectedRelic(relic);
    setRelicLoading(true);
    try {
      const data = await getRelicValuation(relic.id);
      setRelicValuation(data);
      recordRelicDemand(relic.id).catch(() => {});
    } catch (error) {
      console.error(error);
      setRelicValuation(null);
    }
    setRelicLoading(false);
  }

  // GM item search with pagination and optional category
  useEffect(() => {
    let active = true;
    setGmOffset(0);
    setGmItems([]);
    setGmMore(false);
    if (!gmSearch.trim()) return;
    const t = setTimeout(async () => {
      try {
        const res = await getItems(gmSearch, { limit: gmLimit, offset: 0, category: gmCategory === 'all' ? null : gmCategory });
        if (!active) return;
        const items = res.items ?? res;
        setGmItems(items);
        setGmMore(!!res.more);
        setGmOffset(items.length);
      } catch (e) { console.error(e); }
    }, 300);
    return () => { active = false; clearTimeout(t); };
  }, [gmSearch, gmLimit, gmCategory]);

  async function loadMoreGmItems() {
    try {
      const res = await getItems(gmSearch, { limit: gmLimit, offset: gmOffset, category: gmCategory === 'all' ? null : gmCategory });
      const items = res.items ?? res;
      setGmItems(prev => [...prev, ...items]);
      setGmMore(!!res.more);
      setGmOffset(prev => prev + items.length);
    } catch (e) { console.error(e); }
  }

  // ── Market ────────────────────────────────────────────────────────────────
  async function handleSelect(item, rank = null) {
    setSearch(item.item_name ?? "");
    setSelected(item);
    setSelectedRank(rank);
    setSnapshot(null);
    setHistory([]);
    setOrderStatus(null);
    setMarketAnalysis(null);
    setSelectedMarketKey(null);
    setOrderRefreshError("");
    setLoadingPrice(true);
    try {
      recordMarketDemand(item.url_name, "market_view").catch(() => {});
      const [snap, hist, status, analysis] = await Promise.all([
        fetchPrice(item.url_name, rank),
        getPriceHistory(item.url_name),
        getMarketOrderStatus(item.url_name).catch(() => null),
        getMarketAnalysis(item.url_name).catch(() => null),
      ]);
      setSnapshot({ ...snap.snapshot, rankSnapshots: snap.rankSnapshots ?? [] });
      setHistory(hist);
      setOrderStatus(status);
      setMarketAnalysis(analysis);
      setSelectedMarketKey(analysis?.configurations?.[0]?.marketKeyId ?? null);
    } catch (e) {
      console.error(e);
    }
    setLoadingPrice(false);
  }

  async function handleRefreshStoredOrders() {
    if (!selected || refreshingOrders) return;
    setRefreshingOrders(true);
    setOrderRefreshError("");
    try {
      const refreshed = await refreshMarketOrders(selected.url_name);
      const analysis = await getMarketAnalysis(selected.url_name).catch(() => refreshed);
      setOrderStatus({
        url_name: selected.url_name,
        synced: true,
        lastSuccessfulSyncAt: refreshed.freshness?.lastSuccessfulSyncAt ?? refreshed.sync?.syncedAt ?? null,
        ageSeconds: refreshed.freshness?.ageSeconds ?? 0,
        freshness: refreshed.freshness?.state ?? "fresh",
        freshnessDetails: refreshed.freshness ?? null,
        storedActiveOrderCount: refreshed.storedActiveOrderCount ?? refreshed.sync?.fetched ?? 0,
        configurationCount: refreshed.configurationCount ?? 0,
        lastFetchedOrderCount: refreshed.sync?.fetched ?? 0,
      });
      setMarketAnalysis(analysis);
      setSelectedMarketKey(analysis?.configurations?.[0]?.marketKeyId ?? refreshed?.configurations?.[0]?.marketKeyId ?? null);
    } catch (e) {
      console.error(e);
      setOrderRefreshError("Refresh failed. Showing previous stored data.");
    }
    setRefreshingOrders(false);
  }

  async function handleFetchMaxRank() {
    if (!selected) return;
    setLoadingRank(true);
    try {
      const snap = await fetchPrice(selected.url_name, selectedRank);
      setSelected(prev => prev ? { ...prev, max_rank: snap.snapshot?.max_rank ?? prev.max_rank } : prev);
      setSnapshot({ ...snap.snapshot, rankSnapshots: snap.rankSnapshots ?? [] });
    } catch (e) {
      console.error(e);
    }
    setLoadingRank(false);
  }

  function jumpToItem(order) {
    if (!order.item_slug) return;
    setTab("market"); setSearch(order.item_name);
    setSelected({id:order.item_slug, url_name:order.item_slug, item_name:order.item_name});
    setSnapshot(null); setHistory([]);
    fetchPrice(order.item_slug).then(s=>setSnapshot({ ...s.snapshot, rankSnapshots: s.rankSnapshots ?? [] })).catch(console.error);
    getPriceHistory(order.item_slug).then(setHistory).catch(console.error);
  }

  // ── User ──────────────────────────────────────────────────────────────────
  async function handleUserSearch() {
    if (!userInput.trim()) return;
    setUserSlug(userInput.trim()); setUserOrders([]); setUserError("");
    setLoadingUser(true); setActiveSection(null); setItemHistories({});
    try {
      const orders = await getUserOrders(userInput.trim());
      setUserOrders(orders);
      if (!orders.length) { setUserError("No orders found."); }
      else {
          const slugs = [...new Set(orders.map(o=>o.item_slug).filter(Boolean))];
          const res = {};
          await Promise.all(slugs.map(s=>getPriceHistory(s).then(h=>{res[s]=h;}).catch(()=>{res[s]=[];})));
          setItemHistories(res);
          const liveRes = {};
          await Promise.all(slugs.map(s=>fetchPrice(s).then(r=>{ liveRes[s] = (r && r.snapshot) ? r.snapshot : r; }).catch(()=>{ liveRes[s] = null; })));
          setItemLives(liveRes);
      }
    } catch { setUserError("User not found or API error."); }
    setLoadingUser(false);
  }

  function buildViewCard(orders, slug) {
    const slugs = [...new Set(orders.map(o => o.item_slug).filter(Boolean))];
    const res = {};
    const liveRes = {};
    return Promise.all([
      ...slugs.map(s => getPriceHistory(s).then(h => { res[s] = h; }).catch(() => { res[s] = []; })),
      ...slugs.map(s => fetchPrice(s).then(r => { liveRes[s] = (r && r.snapshot) ? r.snapshot : r; }).catch(() => { liveRes[s] = null; }))
    ]).then(() => orders.map(o => ({ ...o, history: res[o.item_slug] ?? [], live: liveRes[o.item_slug] ?? null })))
      .catch((err) => { throw err; });
  }

  async function handleViewUserSearch() {
    const slug = viewInput.trim();
    if (!slug) return;

    if (viewAbortRef) viewAbortRef.abort();
    const controller = new AbortController();
    setViewAbortRef(controller);
    setViewError("");
    setViewSlug(slug);
    setLoadingView(true);
    setViewSection(null);
    setActiveViewSlug(slug);

    const existing = viewCards.find(card => card.slug.toLowerCase() === slug.toLowerCase());
    if (existing) {
      setViewOrders(existing.orders);
      setLoadingView(false);
      setViewAbortRef(null);
      return;
    }

    try {
      const orders = await getUserOrders(slug, { signal: controller.signal });
      const enriched = await buildViewCard(orders, slug);
      const nextCard = { slug, orders: enriched, fetchedAt: Date.now() };
      setViewCards(prev => {
        const filtered = prev.filter(card => card.slug.toLowerCase() !== slug.toLowerCase());
        return [...filtered, nextCard];
      });
      setViewOrders(enriched);
      if (!orders.length) {
        setViewError("No orders found.");
      }
    } catch (err) {
      if (err?.name === "CanceledError" || err?.message?.includes("canceled") || err?.code === "ERR_CANCELED") {
        setViewError("Fetch cancelled.");
      } else {
        setViewError("User not found or API error.");
      }
    }
    setLoadingView(false);
    setViewAbortRef(null);
  }

  function cancelViewFetch() {
    if (viewAbortRef) {
      viewAbortRef.abort();
      setViewAbortRef(null);
    }
    setLoadingView(false);
    setViewError("Fetch cancelled.");
  }

  function selectViewCard(slug) {
    const card = viewCards.find(c => c.slug.toLowerCase() === slug.toLowerCase());
    if (card) {
      setViewOrders(card.orders);
      setViewSlug(card.slug);
      setActiveViewSlug(card.slug);
      setViewError("");
      setViewSection(null);
    }
  }

  function generateTradeChat() {
    const selectedOrders = baseFavOrders.filter(o => o.order_type === "sell" && tradeSelected.has(o.id));
    if (selectedOrders.length === 0) {
      setTradeChatOutput("");
      return;
    }

    let message = `${tradeFormat}`;
    let charCount = message.length;
    const items = [];

    for (const order of selectedOrders) {
      const itemStr = ` [${order.item_name}] ${order.platinum}p`;
      if (charCount + itemStr.length > tradeCharLimit) break;
      items.push(itemStr);
      charCount += itemStr.length;
    }

    message += items.join(",");
    setTradeChatOutput(message);
  }

  function copyTradeChat() {
    if (!tradeChatOutput) return;
    navigator.clipboard.writeText(tradeChatOutput).then(() => {
      alert("Trade chat message copied to clipboard!");
    }).catch(e => console.error("Copy failed:", e));
  }

  function toggleTradeItem(orderId) {
    const newSelected = new Set(tradeSelected);
    if (newSelected.has(orderId)) newSelected.delete(orderId);
    else newSelected.add(orderId);
    setTradeSelected(newSelected);
  }

  const enrichedUserOrders = userOrders.map(o=>({...o, history:itemHistories[o.item_slug]??[], live: itemLives[o.item_slug] ?? null}));

  // ── Favourites ────────────────────────────────────────────────────────────
  async function handleAddFav() {
    if (!favInput.trim()) return;
    await addFavourite(favInput.trim()); setFavInput("");
    getFavourites().then(setFavs);
  }

  function requestRemoveFav(slug) {
    setFavDeleteSlug(slug);
  }

  async function confirmRemoveFav() {
    if (!favDeleteSlug) return;
    setDeletingFav(true);
    try {
      await removeFavourite(favDeleteSlug);
      if (activeFav===favDeleteSlug) { setActiveFav(null); setFavOrders([]); }
      if (baseFav===favDeleteSlug) { setBaseFav(null); setBaseFavOrders([]); }
      setFavDeleteSlug(null);
      getFavourites().then(setFavs);
    } finally {
      setDeletingFav(false);
    }
  }

  async function handleSetBaseFav(username) {
    setBaseFav(username);
    setLoadingFav(true);
    try { setBaseFavOrders(await getFavouriteOrders(username)); }
    catch (e) { console.error(e); setBaseFavOrders([]); }
    setLoadingFav(false);
  }

  async function handleSelectFav(slug) {
    setActiveFav(slug); setFavOrders([]); setFavSection(null); setLoadingFav(true);
    try { setFavOrders(await getFavouriteOrders(slug)); }
    catch (e) { console.error(e); }
    setLoadingFav(false);
  }

  async function handleOpenFavUser(slug) {
    setTab("user");
    setUserInput(slug); setUserSlug(slug); setUserOrders([]); setUserError("");
    setLoadingUser(true); setActiveSection(null); setItemHistories({});
    try {
      const orders = await getUserOrders(slug);
      setUserOrders(orders);
      if (!orders.length) {
        setUserError("No orders found.");
      } else {
          const slugs = [...new Set(orders.map(o => o.item_slug).filter(Boolean))];
          const res = {};
          await Promise.all(slugs.map(s => getPriceHistory(s).then(h => { res[s] = h; }).catch(() => { res[s] = []; })));
          setItemHistories(res);
          const liveRes = {};
          await Promise.all(slugs.map(s => fetchPrice(s).then(r => { liveRes[s] = (r && r.snapshot) ? r.snapshot : r; }).catch(() => { liveRes[s] = null; })));
          setItemLives(liveRes);
      }
    } catch {
      setUserError("User not found or API error.");
    }
    setLoadingUser(false);
  }

  async function handleManualRefresh() {
    setRefreshing(true);
    try { await refreshFavourites(); setLastRefresh(new Date()); if (activeFav) await handleSelectFav(activeFav); }
    catch (e) { console.error(e); }
    setRefreshing(false);
  }

  // ── Scanner SSE ───────────────────────────────────────────────────────────
  function startScan() {
    if (scanRunning) return;
    setScanRunning(true); setScanProgress(null); setScanLog("");

    const es = new EventSource(`${BASE}/scanner/run?group=${encodeURIComponent(scanGroup)}`);
    scanEsRef.current = es;

    es.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "start") {
        setScanProgress({ done:0, total:msg.total });
        setGroupStats(prev => ({
          ...prev,
          [scanGroup]: { done:0, total:msg.total, isLast:false }
        }));
      }
      if (msg.type === "progress") {
        setScanProgress({ done:msg.done, total:msg.total });
        setScanLog(`${msg.done}/${msg.total}  ${msg.item}${msg.error?" ✗":" ✓"}`);
        setGroupStats(prev => ({
          ...prev,
          [scanGroup]: { done:msg.done, total:msg.total, isLast:false }
        }));
        const standingCost = msg.standing_cost ?? null;
        const snap = msg.snap ?? { url_name: msg.url_name ?? null, min: null, avg: null, max: null, volume: null };
        const minPlatPerKStanding = platPerKStanding(snap.min, standingCost);
        const avgPlatPerKStanding = platPerKStanding(snap.avg, standingCost);
        setGroupResults(prev => ({
          ...prev,
          [scanGroup]: [...(prev[scanGroup]??[]), {
            item: msg.item,
            url_name: snap.url_name ?? msg.url_name,
            standingSource: msg.standing_source ?? null,
            standingCost,
            minPlatPerKStanding,
            avgPlatPerKStanding,
            fair: msg.marketValuation?.fair ?? null,
            buyNow: msg.marketValuation?.buyNow ?? null,
            confidence: msg.marketValuation?.confidence ?? null,
            ...snap,
          }]
        }));
      }
      if (msg.type === "done" || msg.type === "cancelled") {
        setScanRunning(false); es.close();
        setGroupStats(prev => ({
          ...prev,
          [scanGroup]: { ...prev[scanGroup], isLast:true }
        }));
      }
    };
    es.onerror = () => { setScanRunning(false); es.close(); };
  }

  function stopScan() {
    cancelScan();
    if (scanEsRef.current) scanEsRef.current.close();
    setScanRunning(false);
  }

  function toggleScanSort(k) {
    if (scanSort === k) setScanDir(d => d === "asc" ? "desc" : "asc");
    else {
      setScanSort(k);
      setScanDir(k === "item" ? "asc" : "desc");
    }
  }

  async function handleSyncGroups() {
    if (syncingGroups || scanRunning || profitRunning || taRunning) return;
    setSyncingGroups(true);
    try {
      await syncMarketItems();
      const groups = await getScannerGroups();
      setScanGroups(groups);
    } catch (e) {
      console.error(e);
    } finally {
      setSyncingGroups(false);
    }
  }

  // ── Profit SSE ────────────────────────────────────────────────────────────
  function startProfit() {
    if (profitRunning) return;
    setProfitRunning(true); setProfitProgress(null); setProfitResults([]);

    const es = new EventSource(`${BASE}/profit/scan?group=${encodeURIComponent(profitGroup)}&limit=50`);
    profitEsRef.current = es;

    es.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type==="start")    { setProfitProgress({done:0,total:msg.total}); }
      if (msg.type==="progress") { setProfitProgress({done:msg.done,total:msg.total}); }
      if (msg.type==="done" || msg.type==="cancelled") {
        setProfitResults(msg.profiles??[]);
        setProfitRunning(false);
        es.close();
      }
    };
    es.onerror = () => { setProfitRunning(false); es.close(); };
  }

  function stopProfit() {
    cancelProfit();
    if (profitEsRef.current) profitEsRef.current.close();
    setProfitRunning(false);
  }

  function toggleProfitSort(k) {
    if (profitSort===k) setProfitDir(d=>d==="asc"?"desc":"asc");
    else { setProfitSort(k); setProfitDir("desc"); }
  }

  const sortedProfit = [...profitResults].sort((a,b)=>{
    const av=a[profitSort]??-9999, bv=b[profitSort]??-9999;
    return profitDir==="asc"?av-bv:bv-av;
  });

  // ── Time Analysis SSE ─────────────────────────────────────────────────────
  async function startTimeAnalysis() {
    if (taRunning) return;
    setTaRunning(true); setTaProgress(null); setTaResults([]); setTaSelected(null);

    try {
      const items = await getScannerItems(taGroup);
      const controller = new AbortController();
      taEsRef.current = controller;
      const res = await fetch(`${BASE}/timeanalysis/batch`, {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          url_names:  items.map(item => item.url_name),
          minVolume:  taFilters.minVolume,
          maxPrice:   taFilters.maxPrice,
        })
      });
      const reader = res.body.getReader();
      const dec    = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value);
        const lines = buf.split("\n\n");
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const m = JSON.parse(line.slice(5).trim());
          if (m.type==="start") setTaProgress({done:0,total:m.total});
          if (m.type==="progress") setTaProgress({done:m.done,total:m.total});
          if (m.type==="done" || m.type==="cancelled") {
            setTaResults(m.results??[]);
            setTaRunning(false);
          }
        }
      }
    } catch (e) {
      if (e.name !== "AbortError") console.error(e);
      setTaRunning(false);
    }
  }

  function stopTimeAnalysis() {
    cancelTimeAnalysis();
    if (taEsRef.current?.abort) taEsRef.current.abort();
    setTaRunning(false);
  }

  async function loadAlecaFrame() {
    setAlecaLoading(true);
    setAlecaError("");
    try {
      const status = await getAlecaStatus();
      setAlecaStatus(status);
      if (!status.configured) {
        setAlecaSummary(null);
        setAlecaTrades([]);
        setAlecaRelics([]);
        setAlecaError("Configure ALECA_PUBLIC_TOKEN or ALECA_USER_HASH in backend/.env.");
        return;
      }

      const [summary, trades, relics] = await Promise.all([
        getAlecaSummary(),
        getAlecaTrades(),
        status.relicsConfigured ? getAlecaRelics().catch(() => []) : Promise.resolve([]),
      ]);
      setAlecaSummary(summary);
      setAlecaTrades(trades);
      setAlecaRelics(relics);
    } catch (error) {
      setAlecaError(error.response?.data?.error ?? error.message);
    } finally {
      setAlecaLoading(false);
    }
  }

  // ── Group Manager ─────────────────────────────────────────────────────────
  async function handleCreateGroup() {
    if (!newGroupName.trim()) return;
    await createCustomGroup(newGroupName.trim());
    setNewGroupName("");
    const [cg, sg] = await Promise.all([getCustomGroups(), getScannerGroups()]);
    setCustomGroups(cg); setScanGroups(sg);
  }

  async function handleDeleteGroup(id) {
    await deleteCustomGroup(id);
    if (activeGMGroup?.id === id) setActiveGMGroup(null);
    const [cg, sg] = await Promise.all([getCustomGroups(), getScannerGroups()]);
    setCustomGroups(cg); setScanGroups(sg);
  }

  async function handleRenameGroup(id) {
    if (!renameVal.trim()) return;
    await renameCustomGroup(id, renameVal.trim());
    setRenamingGroup(null); setRenameVal("");
    const [cg, sg] = await Promise.all([getCustomGroups(), getScannerGroups()]);
    setCustomGroups(cg); setScanGroups(sg);
    if (activeGMGroup?.id === id) setActiveGMGroup(cg.find(g => g.id === id));
  }

  async function handleAddToGroup(url_name) {
    if (!activeGMGroup) return;
    await addItemToGroup(activeGMGroup.id, url_name);
    const cg = await getCustomGroups();
    setCustomGroups(cg);
    setActiveGMGroup(cg.find(g => g.id === activeGMGroup.id));
    getScannerGroups().then(setScanGroups);
  }

  async function handleEditDefaultGroup(sourceGroup) {
    const cloneName = `${sourceGroup} (edited)`;
    const existing = customGroups.find(g => g.name === cloneName);
    if (existing) {
      setActiveGMGroup(existing);
      setGmSearch("");
      return;
    }

    try {
      const group = await createCustomGroupFromDefault(cloneName, sourceGroup);
      const [cg, sg] = await Promise.all([getCustomGroups(), getScannerGroups()]);
      setCustomGroups(cg);
      setScanGroups(sg);
      setActiveGMGroup(group);
      setGmSearch("");
    } catch (error) {
      console.error(error);
      alert(error.response?.data?.error || error.message || "Unable to clone the default group.");
    }
  }

  async function handleAddAllListed() {
    if (!activeGMGroup) return;
    const toAdd = gmItems.filter(item => !activeGMGroup.items.some(i => i.url_name === item.url_name));
    if (!toAdd.length) {
      alert("No new items to add from the current list.");
      return;
    }
    const namesPreview = toAdd.slice(0, 10).map(i => i.item_name).join(', ');
    const confirmMsg = `Add ${toAdd.length} items to group \"${activeGMGroup.name}\"?` + (toAdd.length > 10 ? `\nPreview: ${namesPreview}, ...` : `\nPreview: ${namesPreview}`);
    if (!window.confirm(confirmMsg)) return;

    const results = { added: [], failed: [] };
    for (const item of toAdd) {
      try {
        await addItemToGroup(activeGMGroup.id, item.url_name);
        results.added.push(item.item_name);
      } catch (e) {
        results.failed.push(item.item_name);
      }
    }

    const cg = await getCustomGroups();
    setCustomGroups(cg);
    setActiveGMGroup(cg.find(g => g.id === activeGMGroup.id));
    getScannerGroups().then(setScanGroups);

    alert(`Added ${results.added.length} items. ${results.failed.length ? `${results.failed.length} failed.` : ""}`);
  }

  async function handleRemoveFromGroup(url_name) {
    if (!activeGMGroup) return;
    await removeItemFromGroup(activeGMGroup.id, url_name);
    const cg = await getCustomGroups();
    setCustomGroups(cg);
    setActiveGMGroup(cg.find(g => g.id === activeGMGroup.id));
    getScannerGroups().then(setScanGroups);
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const favSells  = favOrders.filter(o=>o.order_type==="sell");
  const favBuys   = favOrders.filter(o=>o.order_type==="buy");
  const userSells = enrichedUserOrders.filter(o=>o.order_type==="sell");
  const userBuys  = enrichedUserOrders.filter(o=>o.order_type==="buy");

  function renderProfitSortTh(label, k) {
    const a=profitSort===k;
    return <th className={`sortable ${a?"sorted":""}`} onClick={()=>toggleProfitSort(k)}>{label}{a?(profitDir==="asc"?" ▲":" ▼"):""}</th>;
  }

  const viewResults = viewGroup ? [...(groupResults[viewGroup]??[])].sort((a,b) => {
    const av = scanSort === "item" ? (a.item ?? "").toLowerCase() : (a[scanSort] ?? -1);
    const bv = scanSort === "item" ? (b.item ?? "").toLowerCase() : (b[scanSort] ?? -1);
    if (av < bv) return scanDir === "asc" ? -1 : 1;
    if (av > bv) return scanDir === "asc" ? 1 : -1;
    return 0;
  }) : [];
  const selectedConfig = marketAnalysis?.configurations?.find(c => c.marketKeyId === selectedMarketKey) ?? marketAnalysis?.configurations?.[0] ?? null;
  const selectedValuation = selectedConfig?.valuation ?? null;

  function renderScanSortTh(label, k) {
    const active = scanSort === k;
    return <th className={`sortable ${active?"sorted":""}`} onClick={()=>toggleScanSort(k)}>{label}{active?(scanDir==="asc"?" ▲":" ▼"):""}</th>;
  }

  function openWarframeMarketItem(urlName) {
    if (!urlName) return;
    window.open(`https://warframe.market/items/${encodeURIComponent(urlName)}?type=sell`, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="app">
      <header>
        <h1>WMPersonal</h1>
        <p>Warframe Market Monitor</p>
        <div className={`scheduler-pill ${schedulerStatus?.running ? "on" : "off"}`}>
          Auto market refresh: {schedulerStatus?.running ? "ON" : "OFF"}
        </div>
        <div className="tabs">
          {[["market","Market"],["user","User Orders"],["view","View User"],["favs",`Favs${favs.length?` (${favs.length})`:""}`],["scanner","Scanner"],["profit","Profit"],["relics","Relics"],["timeanalysis","Time Analysis"],["alecaframe","Alecaframe"],["groups","Group Manager"]].map(([t,l])=>(
            <button key={t} className={tab===t?"active":""} onClick={()=>setTab(t)}>{l}</button>
          ))}
        </div>
      </header>

      {/* ── MARKET ── */}
      {tab==="market"&&(
        <div className="layout">
          <aside>
            <input placeholder="Search items..." value={search} onChange={e=>setSearch(e.target.value)}/>
            <ul>
              {items.map(item=>(
                <li key={item.id} className={selected?.id===item.id?"active":""} onClick={()=>handleSelect(item)}>
                  {item.item_name}
                </li>
              ))}
            </ul>
          </aside>
          <main>
            {!selected&&<p className="hint">Select an item to see prices.</p>}
            {selected&&(
              <>
                <h2>{selected.item_name}</h2>
                <code>{selected.url_name}</code>
                {selectedRank !== null && <p className="hint">Showing market snapshot for rank {selectedRank} only.</p>}
                {selected.max_rank == null && !loadingRank && (
                  <button className="action-btn" onClick={handleFetchMaxRank}>
                    Fetch max rank metadata
                  </button>
                )}
                {loadingRank && <p className="hint">Fetching item rank metadata…</p>}
                {loadingPrice&&<p className="hint">Fetching live orders…</p>}
                {snapshot&&(
                  <>
                    <div className="snapshot">
                      <div className="stat"><span>Min</span><strong>{snapshot.min} pt</strong></div>
                      <div className="stat"><span>Avg</span><strong>{snapshot.avg?.toFixed(1)} pt</strong></div>
                      <div className="stat"><span>Max</span><strong>{snapshot.max} pt</strong></div>
                      <div className="stat"><span>Online sellers</span><strong>{snapshot.volume}</strong></div>
                    </div>
                    <div className={`market-freshness ${orderStatus?.freshness || "never_synced"}`}>
                      <div>
                        <span className="market-freshness-title">Stored order book</span>
                        {orderStatus?.synced ? (
                          <span>
                            Updated {formatAge(orderStatus.ageSeconds)}
                            {orderStatus.freshness === "stale" ? " - STALE" : ""}
                            {" - "}
                            {fmtNum(orderStatus.storedActiveOrderCount)} orders
                            {" - "}
                            {fmtNum(orderStatus.configurationCount)} configs
                          </span>
                        ) : (
                          <span>Not synced yet</span>
                        )}
                        {orderRefreshError && <span className="market-refresh-error">{orderRefreshError}</span>}
                      </div>
                      <button className="refresh-btn" onClick={handleRefreshStoredOrders} disabled={refreshingOrders}>
                        {refreshingOrders ? "Refreshing..." : "Refresh"}
                      </button>
                    </div>
                    {marketAnalysis?.configurations?.length > 0 && selectedConfig && (
                      <div className="market-analysis-panel">
                        <div className="market-analysis-head">
                          <div>
                            <h3 className="section-label">Stored Order Analysis</h3>
                            <p className="market-analysis-sub">Configuration: {configLabel(selectedConfig.marketKey)}</p>
                          </div>
                          <div className="config-tabs">
                            {marketAnalysis.configurations.map(config => (
                              <button
                                key={config.marketKeyId}
                                className={config.marketKeyId === selectedConfig.marketKeyId ? "active" : ""}
                                onClick={() => setSelectedMarketKey(config.marketKeyId)}
                              >
                                {configLabel(config.marketKey)}
                              </button>
                            ))}
                          </div>
                        </div>
                        {selectedValuation && (
                          <div className="current-market-card">
                            <h3>CURRENT MARKET</h3>
                            <div className="current-market-grid">
                              <div className="current-market-primary">
                                <span>Buy now</span>
                                <strong>{plat(selectedValuation.executableAsk)}</strong>
                              </div>
                              <div className="current-market-primary">
                                <span>Fair market</span>
                                <strong>{selectedValuation.competitiveEstimate != null ? `~${selectedValuation.competitiveEstimate}p` : "—"}</strong>
                                <small>Competitive range: {rangePlat(selectedValuation.competitiveRange)}</small>
                              </div>
                              <div>
                                <span>Highest buyer</span>
                                <strong>{plat(selectedValuation.highestActiveBid)}</strong>
                                <small>Spread: {plat(selectedValuation.spread)}</small>
                              </div>
                              <div>
                                <span>Recent sales</span>
                                <strong>{plat(selectedValuation.historical?.median)}</strong>
                                <small>Volume: {selectedValuation.historical?.volume ?? 0} / {selectedValuation.historical?.period ?? "48h"}</small>
                              </div>
                              <div>
                                <span>Confidence</span>
                                <strong>{selectedValuation.confidence?.level ?? "—"}</strong>
                              </div>
                            </div>
                            <details className="price-explain">
                              <summary>Why this price?</summary>
                              <p>
                                Fair market is estimated from the cheapest group of currently active sellers rather than averaging every listing.
                              </p>
                              <ul>
                                <li>{selectedValuation.competitiveSet?.length ?? 0} competitive sellers: {rangePlat(selectedValuation.competitiveRange)}</li>
                                <li>Median competitive listing: {plat(selectedValuation.competitiveEstimate)}</li>
                                {selectedValuation.suspiciousLow?.suspicious ? (
                                  <li>Cheapest listing {plat(selectedValuation.suspiciousLow.excludedPrice)} appears isolated, so it stays as Buy now but is not used for Fair market.</li>
                                ) : (
                                  <li>No isolated low-price listing detected.</li>
                                )}
                                {(selectedValuation.confidence?.reasons ?? []).slice(0, 5).map(reason => <li key={reason}>{reason}</li>)}
                              </ul>
                            </details>
                          </div>
                        )}
                        <div className="market-metrics-grid">
                          <div className="metric"><span>Legacy snapshot</span><strong>{selectedConfig.legacySnapshot?.min_price ?? snapshot?.min ?? "/"} pt</strong></div>
                          <div className="metric"><span>Executable ask</span><strong>{selectedConfig.executableAsk ?? selectedConfig.lowestActiveSell ?? "/"} pt</strong></div>
                          <div className="metric"><span>Lowest in-game sell</span><strong>{selectedConfig.lowestIngameSell ?? "/"} pt</strong></div>
                          <div className="metric"><span>Competitive estimate</span><strong>{selectedConfig.competitiveEstimate ?? selectedConfig.best5SellMedian ?? "/"} pt</strong></div>
                          <div className="metric"><span>Seller median</span><strong>{selectedConfig.sellerMedian ?? selectedConfig.medianActiveSell ?? "/"} pt</strong></div>
                          <div className="metric"><span>Trimmed estimate</span><strong>{selectedConfig.trimmedActiveSellMedian ?? "/"} pt</strong></div>
                          <div className="metric"><span>Highest active bid</span><strong>{selectedConfig.highestActiveBid ?? selectedConfig.highestActiveBuy ?? "/"} pt</strong></div>
                          <div className="metric"><span>Spread</span><strong>{selectedConfig.spread ?? "/"} pt</strong></div>
                          <div className="metric"><span>Confidence</span><strong>{selectedConfig.confidence?.level ?? selectedConfig.confidence?.label ?? "/"}</strong></div>
                        </div>
                        <p className="market-analysis-sub">
                          Recent sales: median {selectedConfig.historical?.median ?? "/"} pt,
                          avg {selectedConfig.historical?.average ?? "/"} pt,
                          volume {selectedConfig.historical?.volume ?? 0} ({selectedConfig.historical?.period ?? "48h"}).
                          Trimmed estimate removes IQR outliers before taking the active sell median.
                        </p>
                        <div className="market-order-books">
                          <div>
                            <h4>SELL</h4>
                            <table>
                              <thead><tr><th>Price</th><th>Qty</th><th>Status</th><th>Updated</th></tr></thead>
                              <tbody>{(selectedConfig.orders?.sells ?? []).slice(0, 15).map(order => (
                                <tr key={order.id} className={order.status === "offline" ? "dimmed" : ""}>
                                  <td>{order.price}</td><td>{order.quantity ?? "/"}</td><td>{order.status}</td><td>{order.updatedAt ? new Date(order.updatedAt).toLocaleDateString() : "/"}</td>
                                </tr>
                              ))}</tbody>
                            </table>
                          </div>
                          <div>
                            <h4>BUY</h4>
                            <table>
                              <thead><tr><th>Price</th><th>Qty</th><th>Status</th><th>Updated</th></tr></thead>
                              <tbody>{(selectedConfig.orders?.buys ?? []).slice(0, 15).map(order => (
                                <tr key={order.id} className={order.status === "offline" ? "dimmed" : ""}>
                                  <td>{order.price}</td><td>{order.quantity ?? "/"}</td><td>{order.status}</td><td>{order.updatedAt ? new Date(order.updatedAt).toLocaleDateString() : "/"}</td>
                                </tr>
                              ))}</tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    )}
                    {snapshot.rankSnapshots?.length > 0 && (
                      <div style={{marginTop:16}}>
                        <h3 className="section-label">Rank-specific snapshots</h3>
                        {(() => {
                          const rank0 = snapshot.rankSnapshots.find(rs => rs.rank === 0);
                          const rankMax = snapshot.rankSnapshots.find(rs => rs.rank !== 0);
                          if (!rank0 && !rankMax) return null;
                          return (
                            <div className="rank-snapshots-table-wrap">
                              <table className="rank-snapshots-table">
                                <thead>
                                  <tr>
                                    <th>Arcane</th>
                                    <th>R0 Min</th>
                                    <th>R0 Avg</th>
                                    <th>Rmax Min</th>
                                    <th>Rmax Avg</th>
                                    <th>Online sellers</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  <tr>
                                    <td>{selected?.item_name}</td>
                                    <td>
                                      {rank0 ? (
                                        <button className="rank-link" onClick={() => handleSelect(selected, 0)}>
                                          {rank0.snapshot.min} pt
                                        </button>
                                      ) : "/"}
                                    </td>
                                    <td>
                                      {rank0 ? (
                                        <button className="rank-link" onClick={() => handleSelect(selected, 0)}>
                                          {rank0.snapshot.avg?.toFixed(1)} pt
                                        </button>
                                      ) : "/"}
                                    </td>
                                    <td>
                                      {rankMax ? (
                                        <button className="rank-link" onClick={() => handleSelect(selected, rankMax.rank)}>
                                          {rankMax.snapshot.min} pt
                                        </button>
                                      ) : "/"}
                                    </td>
                                    <td>
                                      {rankMax ? (
                                        <button className="rank-link" onClick={() => handleSelect(selected, rankMax.rank)}>
                                          {rankMax.snapshot.avg?.toFixed(1)} pt
                                        </button>
                                      ) : "/"}
                                    </td>
                                    <td>{rank0?.snapshot.volume ?? rankMax?.snapshot.volume ?? "-"}</td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </>
                )}
                <StatsPanel urlName={selected.url_name}/>
                {history.length>0&&(
                  <>
                    <h3 className="section-label" style={{marginTop:16}}>Snapshot history</h3>
                    <table>
                      <thead><tr><th>Time</th><th>Rank</th><th>Min</th><th>Avg</th><th>Max</th><th>Vol</th></tr></thead>
                      <tbody>{history.map(h=>(
                        <tr key={h.id}>
                          <td>{new Date(h.fetched_at).toLocaleTimeString()}</td>
                          <td>{h.rank !== null ? h.rank : "—"}</td>
                          <td>{h.min_price}</td><td>{h.avg_price}</td><td>{h.max_price}</td><td>{h.volume}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </>
                )}
              </>
            )}
          </main>
        </div>
      )}

      {/* ── USER ── */}
      {tab==="user"&&(
        <div className="user-page">
          <div className="user-search">
            <input placeholder="Enter warframe.market username..." value={userInput}
              onChange={e=>setUserInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleUserSearch()}/>
            <button onClick={handleUserSearch}>Search</button>
          </div>
          {loadingUser&&<p className="hint">Fetching orders…</p>}
          {userError&&<p className="hint">{userError}</p>}
          {userOrders.length>0&&(
            <>
              <div className="user-header-row">
                <h2 className="user-title">{userSlug}</h2>
                <button className="fav-add-btn" onClick={()=>addFavourite(userSlug).then(()=>getFavourites().then(setFavs))}>★ Add to Favourites</button>
              </div>
              <div className="section-toggles">
                <button className={`toggle-btn sell ${activeSection==="sell"?"active":""}`} onClick={()=>setActiveSection(p=>p==="sell"?null:"sell")}>Selling ({userSells.length})</button>
                <button className={`toggle-btn buy  ${activeSection==="buy" ?"active":""}`} onClick={()=>setActiveSection(p=>p==="buy" ?null:"buy" )}>Buying ({userBuys.length})</button>
              </div>
              {baseFav && userSlug && userSlug !== baseFav && <p className="hint">Comparing {userSlug} against base user {baseFav}.</p>}
              {activeSection==="sell"&&<OrderTable orders={userSells} onItemClick={jumpToItem} showLive={false} compareOrders={baseFav && baseFavOrders.length > 0 ? baseFavOrders : []}/>}
              {activeSection==="buy" &&<OrderTable orders={userBuys}  onItemClick={jumpToItem} showLive={false} compareOrders={baseFav && baseFavOrders.length > 0 ? baseFavOrders : []}/>}
              {!activeSection&&<p className="hint" style={{marginTop:24}}>Click Selling or Buying to expand.</p>}
            </>
          )}
        </div>
      )}

      {/* ── VIEW USER ── */}
      {tab==="view"&&(
        <div className="user-page">
          <div className="user-search">
            <input placeholder="Enter username to view..." value={viewInput}
              onChange={e=>setViewInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleViewUserSearch()}/>
            <button onClick={handleViewUserSearch}>View</button>
            {loadingView&&<button onClick={cancelViewFetch} className="fav-remove" title="Cancel fetch" style={{marginLeft:8}}>×</button>}
          </div>
          {viewCards.length > 0 && (
            <div className="fav-list" style={{marginBottom:16}}>
              {viewCards.map(card => (
                <div key={card.slug} className={`fav-item ${activeViewSlug === card.slug ? "active" : ""}`} onClick={() => selectViewCard(card.slug)}>
                  <span className="fav-name">{card.slug}</span>
                  <button className="fav-remove" onClick={(e) => { e.stopPropagation(); setViewCards(prev => prev.filter(c => c.slug !== card.slug)); if (activeViewSlug === card.slug) { setViewOrders([]); setViewSlug(""); setViewError(""); } }} title="Remove viewed user">×</button>
                </div>
              ))}
            </div>
          )}
          {loadingView&&<p className="hint">Fetching orders…</p>}
          {viewError&&<p className="hint">{viewError}</p>}
          {viewOrders.length>0&&(
            <>
              <div className="user-header-row">
                <h2 className="user-title">{viewSlug}</h2>
                <button className="fav-add-btn" onClick={()=>addFavourite(viewSlug).then(()=>getFavourites().then(setFavs))}>★ Add to Favourites</button>
              </div>
              {baseFav && viewSlug !== baseFav && <p className="hint">Comparing {viewSlug} against base user {baseFav}.</p>}
              <div className="section-toggles">
                <button className={`toggle-btn sell ${viewSection==="sell"?"active":""}`} onClick={()=>setViewSection(p=>p==="sell"?null:"sell")}>Selling ({viewOrders.filter(o=>o.order_type==="sell").length})</button>
                <button className={`toggle-btn buy  ${viewSection==="buy" ?"active":""}`} onClick={()=>setViewSection(p=>p==="buy" ?null:"buy" )}>Buying ({viewOrders.filter(o=>o.order_type==="buy").length})</button>
              </div>
              <div className="hint" style={{marginTop:8, marginBottom:12}}>
                {(() => {
                  const sellMatches = viewOrders.filter(o => o.order_type === "sell" && baseFavOrders.some(b => b.order_type === "buy" && (b.item_slug === o.item_slug || b.item_name === o.item_name))).length;
                  const buyMatches = viewOrders.filter(o => o.order_type === "buy" && baseFavOrders.some(b => b.order_type === "sell" && (b.item_slug === o.item_slug || b.item_name === o.item_name))).length;
                  if (sellMatches || buyMatches) {
                    return `Trade hints: ${sellMatches} of their sells match your base user buys, and ${buyMatches} of their buys match your base user sells.`;
                  }
                  return "No direct trade matches against the current base user yet.";
                })()}
              </div>
              {viewSection==="sell"&&<OrderTable orders={viewOrders.filter(o=>o.order_type==="sell")} onItemClick={jumpToItem} showLive={false} compareOrders={baseFav && baseFavOrders.length > 0 ? baseFavOrders : []}/>}
              {viewSection==="buy" &&<OrderTable orders={viewOrders.filter(o=>o.order_type==="buy")}  onItemClick={jumpToItem} showLive={false} compareOrders={baseFav && baseFavOrders.length > 0 ? baseFavOrders : []}/>}
              {!viewSection&&<p className="hint" style={{marginTop:24}}>Click Selling or Buying to expand.</p>}
            </>
          )}
        </div>
      )}

      {/* ── FAVOURITES ── */}
      {tab==="favs"&&(
        <div className="user-page">
          <div className="fav-toolbar">
            <div className="user-search" style={{flex:1}}>
              <input placeholder="Add username..." value={favInput}
                onChange={e=>setFavInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleAddFav()}/>
              <button onClick={handleAddFav}>Add</button>
            </div>
            <button className="refresh-btn" onClick={handleManualRefresh} disabled={refreshing}>
              {refreshing?"Refreshing…":"↻ Refresh All"}
            </button>
          </div>
          {favs.length > 0 && (
            <div className="fav-list">
              {favs.map(fav => (
                <div
                  key={fav.slug}
                  className={`fav-item ${activeFav === fav.slug ? "active" : ""}`}
                  onClick={() => handleOpenFavUser(fav.slug)}
                >
                  <span className="fav-name">{fav.slug}</span>
                  <button
                    className="fav-remove"
                    onClick={(e) => { e.stopPropagation(); requestRemoveFav(fav.slug); }}
                    title="Remove favourite"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          {baseFav && <p className="hint" style={{marginBottom:12}}>Base user: <strong>{baseFav}</strong></p>}
          {loadingFav&&<p className="hint" style={{marginTop:24}}>Fetching orders and live prices…</p>}
          {activeFav&&!loadingFav&&favOrders.length>0&&(
            <>
              <h2 className="user-title" style={{marginTop:24}}>{activeFav}</h2>
              <div style={{marginBottom: 12}}>
                <button className="refresh-btn" onClick={()=>handleSetBaseFav(activeFav)} disabled={baseFav === activeFav}>
                  {baseFav === activeFav ? "✓ Base User" : "Set as Base"}
                </button>
              </div>
              <div className="section-toggles">
                <button className={`toggle-btn sell ${favSection==="sell"?"active":""}`} onClick={()=>setFavSection(p=>p==="sell"?null:"sell")}>Selling ({favSells.length})</button>
                <button className={`toggle-btn buy  ${favSection==="buy" ?"active":""}`} onClick={()=>setFavSection(p=>p==="buy" ?null:"buy" )}>Buying ({favBuys.length})</button>
                <button className={`toggle-btn chat ${favSection==="chat"?"active":""}`} onClick={()=>{setFavSection(p=>p==="chat"?null:"chat"); setTradeSelected(new Set()); generateTradeChat();}}>Build Trade Chat</button>
              </div>
              {favSection==="sell"&&<OrderTable orders={favSells} onItemClick={jumpToItem} showLive={true} compareOrders={[]}/>}
              {favSection==="buy" &&<OrderTable orders={favBuys}  onItemClick={jumpToItem} showLive={true} compareOrders={[]}/>}
              {favSection==="chat" && (
                <div className="trade-builder">
                  <div style={{marginBottom: 16}}>
                    <label style={{display: "block", marginBottom: 8, color: "#888"}}>Format Type:</label>
                    <select value={tradeFormat} onChange={e => setTradeFormat(e.target.value)} style={{padding: "6px 12px", background: "#1c1f2b", border: "1px solid #2a2d3a", borderRadius: "4px", color: "#c8a96e", cursor: "pointer"}}>
                      <option value="WTS">WTS (Want To Sell)</option>
                      <option value="WTB">WTB (Want To Buy)</option>
                      <option value="PC">PC (Price Check)</option>
                    </select>
                  </div>
                  <div style={{marginBottom: 16}}>
                    <label style={{display: "block", marginBottom: 8, color: "#888"}}>Character Limit:</label>
                    <input type="number" min="100" max="2000" value={tradeCharLimit} onChange={e => setTradeCharLimit(parseInt(e.target.value))} 
                      style={{padding: "6px 12px", background: "#1c1f2b", border: "1px solid #2a2d3a", borderRadius: "4px", color: "#c8a96e", width: "100%"}}/>
                  </div>
                  <div style={{marginBottom: 16}}>
                    <h3 style={{color: "#c8a96e", marginBottom: 12}}>Select Items from Base User ({baseFav}):</h3>
                    <div className="trade-items-list">
                      {baseFavOrders.filter(o => o.order_type === "sell").map(order => (
                        <div key={order.id} className="trade-item-row">
                          <input type="checkbox" id={`trade-${order.id}`} checked={tradeSelected.has(order.id)} 
                            onChange={() => { toggleTradeItem(order.id); generateTradeChat(); }} />
                          <label htmlFor={`trade-${order.id}`} style={{flex: 1, display: "flex", alignItems: "center", gap: 12, cursor: "pointer"}}>
                            <span>{order.item_name}</span>
                            <span style={{color: "#888", fontSize: "0.85rem"}}>{order.platinum}p</span>
                            <span style={{color: "#666", fontSize: "0.8rem"}}>×{order.quantity}</span>
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                  {tradeChatOutput && (
                    <div style={{marginBottom: 16}}>
                      <h3 style={{color: "#c8a96e", marginBottom: 8}}>Preview:</h3>
                      <div style={{background: "#1c1f2b", border: "1px solid #2a2d3a", borderRadius: "6px", padding: "12px", fontFamily: "monospace", color: "#70b870", wordBreak: "break-word"}}>
                        {tradeChatOutput}
                      </div>
                      <p style={{color: "#666", fontSize: "0.8rem", marginTop: 6}}>Length: {tradeChatOutput.length}/{tradeCharLimit}</p>
                    </div>
                  )}
                  <button onClick={copyTradeChat} disabled={!tradeChatOutput} style={{padding: "8px 16px", background: "#1c1f2b", border: "1px solid #2a2d3a", borderRadius: "6px", color: "#c8a96e", cursor: tradeChatOutput ? "pointer" : "default", opacity: tradeChatOutput ? 1 : 0.5}}>
                    📋 Copy to Clipboard
                  </button>
                </div>
              )}
              {!favSection&&<p className="hint" style={{marginTop:24}}>Click Selling, Buying, or Build Trade Chat to expand.</p>}
            </>
          )}
          {baseFav && !activeFav && (
            <div className="trade-builder-standalone">
              <h2 style={{color: "#c8a96e", marginBottom: 16}}>Trade Chat Builder - Base User: {baseFav}</h2>
              <div style={{marginBottom: 16}}>
                <label style={{display: "block", marginBottom: 8, color: "#888"}}>Format Type:</label>
                <select value={tradeFormat} onChange={e => setTradeFormat(e.target.value)} style={{padding: "6px 12px", background: "#1c1f2b", border: "1px solid #2a2d3a", borderRadius: "4px", color: "#c8a96e", cursor: "pointer"}}>
                  <option value="WTS">WTS (Want To Sell)</option>
                  <option value="WTB">WTB (Want To Buy)</option>
                  <option value="PC">PC (Price Check)</option>
                </select>
              </div>
              <div style={{marginBottom: 16}}>
                <label style={{display: "block", marginBottom: 8, color: "#888"}}>Character Limit:</label>
                <input type="number" min="100" max="2000" value={tradeCharLimit} onChange={e => setTradeCharLimit(parseInt(e.target.value))} 
                  style={{padding: "6px 12px", background: "#1c1f2b", border: "1px solid #2a2d3a", borderRadius: "4px", color: "#c8a96e", width: "100%"}}/>
              </div>
              <div style={{marginBottom: 16}}>
                <h3 style={{color: "#c8a96e", marginBottom: 12}}>Select Items to List:</h3>
                <div className="trade-items-list">
                  {baseFavOrders.filter(o => o.order_type === "sell").map(order => (
                    <div key={order.id} className="trade-item-row">
                      <input type="checkbox" id={`trade-${order.id}`} checked={tradeSelected.has(order.id)} 
                        onChange={() => { toggleTradeItem(order.id); generateTradeChat(); }} />
                      <label htmlFor={`trade-${order.id}`} style={{flex: 1, display: "flex", alignItems: "center", gap: 12, cursor: "pointer"}}>
                        <span>{order.item_name}</span>
                        <span style={{color: "#888", fontSize: "0.85rem"}}>{order.platinum}p</span>
                        <span style={{color: "#666", fontSize: "0.8rem"}}>×{order.quantity}</span>
                      </label>
                    </div>
                  ))}
                </div>
              </div>
              {tradeChatOutput && (
                <div style={{marginBottom: 16}}>
                  <h3 style={{color: "#c8a96e", marginBottom: 8}}>Preview:</h3>
                  <div style={{background: "#1c1f2b", border: "1px solid #2a2d3a", borderRadius: "6px", padding: "12px", fontFamily: "monospace", color: "#70b870", wordBreak: "break-word"}}>
                    {tradeChatOutput}
                  </div>
                  <p style={{color: "#666", fontSize: "0.8rem", marginTop: 6}}>Length: {tradeChatOutput.length}/{tradeCharLimit}</p>
                </div>
              )}
              <button onClick={copyTradeChat} disabled={!tradeChatOutput} style={{padding: "8px 16px", background: "#1c1f2b", border: "1px solid #2a2d3a", borderRadius: "6px", color: "#c8a96e", cursor: tradeChatOutput ? "pointer" : "default", opacity: tradeChatOutput ? 1 : 0.5}}>
                📋 Copy to Clipboard
              </button>
            </div>
          )}
        </div>
      )}


      {/* ── SCANNER ── */}
      {tab==="scanner"&&(
        <div className="scanner-layout">
          <div className="scanner-sidebar">
            <h3 className="section-label" style={{marginBottom:10}}>Groups</h3>
            <input
              type="text"
              value={scanGroupFilter}
              onChange={e => setScanGroupFilter(e.target.value)}
              placeholder="Filter group names..."
              style={{
                width: "100%",
                marginBottom: 12,
                padding: "8px 10px",
                borderRadius: 6,
                border: "1px solid #2a2d3a",
                background: "#121523",
                color: "#eee",
              }}
            />
            <GroupSelector
              groups={scanGroups}
              selected={scanGroup}
              onSelect={g=>{setScanGroup(g);setViewGroup(g);}}
              groupStats={groupStats}
              filter={scanGroupFilter}
            />
          </div>
          <div className="scanner-main">
            <div className="scan-header">
              <h2 className="user-title">{scanGroup}</h2>
              <div className="scan-controls">
                <button className="refresh-btn" onClick={handleSyncGroups} disabled={syncingGroups || scanRunning || profitRunning || taRunning}>
                  {syncingGroups?"Updating...":"Update Items / Groups"}
                </button>
                <button className="refresh-btn" onClick={startScan} disabled={scanRunning}>
                  {scanRunning?"Scanning…":"▶ Start Scan"}
                </button>
                {scanRunning&&<button className="cancel-btn" onClick={stopScan}>■ Cancel</button>}
              </div>
            </div>
            {SPECIAL_GROUP_NOTES[scanGroup] && (
              <div className="hint" style={{marginBottom: 12}}>{SPECIAL_GROUP_NOTES[scanGroup]}</div>
            )}
            {scanRunning&&(
              <>
                <div className="progress-wrap">
                  <div className="progress-bar" style={{width:`${scanProgress?((scanProgress.done/scanProgress.total)*100):0}%`}}/>
                  <span className="progress-label">{scanLog||"Starting…"}</span>
                </div>
              </>
            )}
            {/* Group result tabs */}
            {Object.keys(groupResults).length>0&&(
              <div className="result-group-tabs">
                {Object.keys(groupResults).map(g=>(
                  <button key={g} className={`filter-btn ${viewGroup===g?"active":""}`} onClick={()=>setViewGroup(g)}>
                    {g} ({groupResults[g].length})
                  </button>
                ))}
              </div>
            )}
            {viewResults.length>0&&(
              <>
                <h3 className="section-label" style={{marginTop:12}}>
                  {viewGroup} — {viewResults.length} items
                </h3>
                <div className="order-section">
                  <table>
                    <thead>
                      <tr>
                        {renderScanSortTh("Item", "item")}
                        {renderScanSortTh("Min", "min")}
                        {renderScanSortTh("Avg", "avg")}
                        {renderScanSortTh("Fair", "fair")}
                        {renderScanSortTh("Buy Now", "buyNow")}
                        {renderScanSortTh("Conf", "confidence")}
                        {renderScanSortTh("Max", "max")}
                        {renderScanSortTh("Vol", "volume")}
                        {renderScanSortTh("Source", "standingSource")}
                        {renderScanSortTh("Standing", "standingCost")}
                        {renderScanSortTh("Min / 1k", "minPlatPerKStanding")}
                        {renderScanSortTh("Avg / 1k", "avgPlatPerKStanding")}
                        <th>WM</th>
                      </tr>
                    </thead>
                    <tbody>
                      {viewResults.map((r,i)=>(
                        <tr key={i}>
                          <td><span className="item-link" onClick={()=>{setTab("market");setSearch(r.item);setSelected({id:r.url_name,url_name:r.url_name,item_name:r.item});}}>{r.item}</span></td>
                          <td>{r.min != null ? `${r.min} pt` : "/"}</td>
                          <td>{r.avg != null ? `${r.avg} pt` : "/"}</td>
                          <td>{r.fair != null ? `${r.fair} pt` : "—"}</td>
                          <td>{r.buyNow != null ? `${r.buyNow} pt` : "—"}</td>
                          <td>{r.confidence ?? "—"}</td>
                          <td>{r.max != null ? `${r.max} pt` : "/"}</td>
                          <td>{r.volume != null ? r.volume : "/"}</td>
                          <td>{r.standingSource || "/"}</td>
                          <td>{r.standingCost ? r.standingCost.toLocaleString() : "/"}</td>
                          <td>{r.minPlatPerKStanding != null ? `${r.minPlatPerKStanding} pt` : "/"}</td>
                          <td>{r.avgPlatPerKStanding != null ? `${r.avgPlatPerKStanding} pt` : "/"}</td>
                          <td>
                            <button className="wm-link-btn" onClick={()=>openWarframeMarketItem(r.url_name)} title="Open Warframe.market sell orders">
                              Open
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            {!viewGroup&&<p className="hint" style={{marginTop:24}}>Select a group and run a scan.</p>}
          </div>
        </div>
      )}

      {/* ── PROFIT ── */}
      {tab==="profit"&&(
        <div className="user-page">
          <div className="scan-header">
            <h2 className="user-title">Profit Analyzer</h2>
            <button className="info-btn" onClick={()=>setShowProfitInfo(true)}>? How it works</button>
          </div>
          <GroupSelector groups={scanGroups} selected={profitGroup} onSelect={setProfitGroup}/>
          <div className="scan-controls" style={{marginTop:12}}>
            <button className="refresh-btn" onClick={startProfit} disabled={profitRunning}>
              {profitRunning?"Analyzing…":"▶ Analyze"}
            </button>
            {profitRunning&&<button className="cancel-btn" onClick={stopProfit}>Cancel</button>}
          </div>
          {profitProgress&&(
            <div className="progress-wrap">
              <div className="progress-bar" style={{width:`${(profitProgress.done/profitProgress.total)*100}%`}}/>
              <span className="progress-label">{profitProgress.done}/{profitProgress.total}</span>
            </div>
          )}
          {sortedProfit.length>0&&(
            <div className="order-section" style={{marginTop:16}}>
              <table>
                <thead>
                  <tr>
                    {renderProfitSortTh("Item", "item_name")}
                    {renderProfitSortTh("Rank", "rank")}
                    {renderProfitSortTh("Buy Now", "acquisitionValue")}
                    {renderProfitSortTh("Best Bid", "liquidationValue")}
                    {renderProfitSortTh("Expected Sale", "expectedResaleValue")}
                    {renderProfitSortTh("Spread", "margin")}
                    {renderProfitSortTh("Standing", "standingCost")}
                    {renderProfitSortTh("Sell / 1k", "minSellPerKStanding")}
                    {renderProfitSortTh("Avg / 1k", "avgMedianPerKStanding")}
                    {renderProfitSortTh("Margin / 1k", "marginPerKStanding")}
                    {renderProfitSortTh("Off. Min", "offlineMinSell")}
                    {renderProfitSortTh("Vol 48h", "vol48h")}
                    {renderProfitSortTh("Vol 90d", "vol90d")}
                    {renderProfitSortTh("Avg/Day", "avgDaily90d")}
                    {renderProfitSortTh("Med. Avg", "avgMedian90d")}
                    {renderProfitSortTh("Score ↓", "score")}
                  </tr>
                </thead>
                <tbody>
                  {sortedProfit.map((p,i)=>{
                    const mc=p.margin>50?"good":p.margin>10?"warn":p.margin<=0?"bad":"";
                    return(
                      <tr key={i} className={`row-${mc}`}>
                        <td><span className="item-link" onClick={()=>{setTab("market");setSearch(p.item_name);setSelected({id:p.url_name,url_name:p.url_name,item_name:p.item_name});}}>{p.item_name}</span></td>
                        <td>{rankLabel(p.rank,p.maxRank)??"—"}</td>
                        <td title={p.valuationSources?.acquisition?.source ?? p.valuationSources?.acquisition?.reason ?? ""}>{p.acquisitionValue??p.minSell??"/"}pt</td>
                        <td title={p.valuationSources?.liquidation?.source ?? p.valuationSources?.liquidation?.reason ?? ""}>{p.liquidationValue??p.maxBuy??"/"}pt</td>
                        <td title={p.valuationSources?.resale?.source ?? p.valuationSources?.resale?.reason ?? ""}>{p.expectedResaleValue??"/"}pt</td>
                        <td><span className={`badge badge-${mc}`}>{p.margin!=null?`${p.margin>0?"+":""}${p.margin}pt`:"/"}</span></td>
                        <td>{p.standingCost?p.standingCost.toLocaleString():"/"}</td>
                        <td>{p.minSellPerKStanding!=null?`${p.minSellPerKStanding}pt`:"/"}</td>
                        <td>{p.avgMedianPerKStanding!=null?`${p.avgMedianPerKStanding}pt`:"/"}</td>
                        <td>{p.marginPerKStanding!=null?`${p.marginPerKStanding}pt`:"/"}</td>
                        <td>{p.offlineMinSell??"/"}pt</td>
                        <td>{p.vol48h}</td>
                        <td>{p.vol90d}</td>
                        <td>{p.avgDaily90d}/day</td>
                        <td>{p.avgMedian90d??"/"}pt</td>
                        <td><strong style={{color:"#c8a96e"}}>{p.score}</strong></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {showProfitInfo&&(
            <InfoPopup title="How Profit Analyzer Works" onClose={()=>setShowProfitInfo(false)}>
              <p><strong>What it scans:</strong> Fetches live orders and 90-day statistics for every item in the selected group.</p>
              <p style={{marginTop:8}}><strong>Buy Now</strong> = acquisition price from the current executable ask when available.</p>
              <p style={{marginTop:8}}><strong>Expected Sale</strong> = fair market resale estimate from the current competitive seller cluster.</p>
              <p style={{marginTop:8}}><strong>Spread</strong> = Buy Now − Best Bid. It is a market gap, not guaranteed profit.</p>
              <p style={{marginTop:8}}><strong>Score</strong> = Margin × Avg daily volume. High score = good margin AND sells frequently. This is the most useful column to sort by.</p>
              <p style={{marginTop:8}}><strong>Off. Min</strong> = Cheapest offline seller. Often lower than online — worth watching as a buy target.</p>
              <p style={{marginTop:8}}><strong>Avg/Day</strong> = Average trades per day over 90 days. Low number = slow market, hard to flip.</p>
              <p style={{marginTop:8}}><strong>Med. Avg</strong> = Average of daily medians over 90 days — more stable than avg price, less affected by outliers.</p>
              <p style={{marginTop:8}}><strong>Row colors:</strong> Green = margin &gt; 50pt, Yellow = 10–50pt, Red = 0 or negative.</p>
              <p style={{marginTop:8}}><strong>Limit:</strong> Analyzes up to 50 items per run to stay within rate limits.</p>
            </InfoPopup>
          )}
        </div>
      )}

      {/* ── RELICS ── */}
      {tab==="relics"&&(
        <div className="relic-page">
          <aside className="relic-sidebar">
            <div className="scan-header">
              <h2 className="user-title">Relics</h2>
              <button className="refresh-btn" onClick={handleSyncRelics} disabled={relicSyncing}>
                {relicSyncing ? "Syncing..." : "Sync Relics"}
              </button>
            </div>
            {relicSyncResult&&(
              <p className="hint-inline">
                {relicSyncResult.error ? relicSyncResult.error : `${relicSyncResult.relics} relics, ${relicSyncResult.matched}/${relicSyncResult.rewards} rewards matched`}
              </p>
            )}
            <input
              className="search"
              placeholder="Search relic..."
              value={relicSearch}
              onChange={e=>setRelicSearch(e.target.value)}
            />
            <div className="era-tabs">
              <button className={!relicEra ? "active" : ""} onClick={()=>setRelicEra("")}>All</button>
              {relicEras.map(era => (
                <button key={era.era} className={relicEra===era.era ? "active" : ""} onClick={()=>setRelicEra(era.era)}>
                  {era.era} ({era.count})
                </button>
              ))}
            </div>
            <div className="relic-list">
              {relics.map(relic => (
                <button key={relic.id} className={selectedRelic?.id===relic.id ? "active" : ""} onClick={()=>handleSelectRelic(relic)}>
                  <span>{relic.name}</span>
                  <small>{relic.probability_model}{relic.is_supported ? "" : " / unsupported"}</small>
                </button>
              ))}
            </div>
          </aside>
          <main className="relic-detail">
            {!selectedRelic&&<p className="hint">Select a relic to calculate opening EV.</p>}
            {relicLoading&&<p className="hint">Calculating relic value...</p>}
            {relicValuation&&!relicLoading&&(
              <>
                <div className="relic-title-row">
                  <div>
                    <h2>{relicValuation.relic.name.toUpperCase()}</h2>
                    <p className="market-analysis-sub">
                      Source model: {relicValuation.relic.probability_model}
                      {relicValuation.relic.probability_model_reason ? ` - ${relicValuation.relic.probability_model_reason}` : ""}
                    </p>
                  </div>
                  <div className="metric">
                    <span>Confidence</span>
                    <strong>{relicValuation.confidence.level}</strong>
                  </div>
                </div>
                <div className="relic-ev-grid">
                  {["Intact","Exceptional","Flawless","Radiant"].map(refinement => {
                    const ev = relicValuation.expectedValues[refinement]?.expectedValue;
                    const trace = relicValuation.traceEfficiency[refinement];
                    const diff = trace?.gain ?? 0;
                    return (
                      <div key={refinement} className={`metric ${relicValuation.best.highestEV?.refinement===refinement ? "best" : ""}`}>
                        <span>{refinement}</span>
                        <strong>{ev ?? "—"}p</strong>
                        {refinement !== "Intact" && <small>{diff >= 0 ? "+" : ""}{diff}p / {trace.traceCost} traces ({trace.platinumPerTrace}p/trace)</small>}
                        {relicValuation.best.highestEV?.refinement===refinement && <small>Highest EV</small>}
                        {relicValuation.best.bestTraceEfficiency?.refinement===refinement && <small>Best trace efficiency</small>}
                      </div>
                    );
                  })}
                </div>
                <p className="market-analysis-sub">
                  Price coverage: {relicValuation.priceCoverage.priced}/{relicValuation.priceCoverage.tradable} tradable rewards.
                  {" "}Sources: {Object.entries(relicValuation.priceCoverage.sources).map(([k,v])=>`${k} ${v}`).join(", ")}.
                </p>
                <table className="relic-reward-table">
                  <thead>
                    <tr>
                      <th>Reward</th><th>Rarity</th><th>Value</th><th>Source</th>
                      {["Intact","Exceptional","Flawless","Radiant"].map(r=><th key={r}>{r}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {relicValuation.rewards.map(reward => (
                      <tr key={reward.rewardName}>
                        <td>{reward.rewardName}{!reward.isTradable && <small> non-tradable</small>}</td>
                        <td>{reward.rarity}</td>
                        <td>{reward.value?.value ?? "—"}{reward.value?.value != null ? "p" : ""}</td>
                        <td>{reward.value?.source ?? reward.value?.reason ?? reward.matchStatus}</td>
                        {["Intact","Exceptional","Flawless","Radiant"].map(refinement => {
                          const c = relicValuation.expectedValues[refinement]?.rewardContributions?.find(row => row.rewardName === reward.rewardName);
                          return <td key={refinement}><span>{reward.chances[refinement] ?? "—"}%</span><small>{c?.contribution ?? 0}p EV</small></td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <details className="price-explain">
                  <summary>Relic confidence details</summary>
                  <ul>{relicValuation.confidence.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
                </details>
              </>
            )}
          </main>
        </div>
      )}

      {/* ── ALECAFRAME ── */}
      {tab==="alecaframe"&&(
        <div className="user-page aleca-page">
          <div className="scan-header">
            <div>
              <h2 className="user-title">Alecaframe</h2>
              {alecaSummary?.lastUpdate&&(
                <p className="hint-inline">Last update: {new Date(alecaSummary.lastUpdate).toLocaleString()}</p>
              )}
            </div>
            <button className="refresh-btn" onClick={loadAlecaFrame} disabled={alecaLoading}>
              {alecaLoading ? "Loading..." : "Refresh"}
            </button>
          </div>

          {alecaError&&(
            <div className="aleca-warning">
              {alecaError}
              <code>ALECA_PUBLIC_TOKEN</code>, <code>ALECA_USER_HASH</code>, or <code>ALECA_RELIC_TOKEN</code>
            </div>
          )}

          {alecaSummary&&(
            <>
              <div className="snapshot aleca-summary">
                <div className="stat"><span>Platinum</span><strong>{fmtNum(alecaSummary.latest?.plat)}</strong></div>
                <div className="stat"><span>Credits</span><strong>{fmtNum(alecaSummary.latest?.credits)}</strong></div>
                <div className="stat"><span>Endo</span><strong>{fmtNum(alecaSummary.latest?.endo)}</strong></div>
                <div className="stat"><span>Ducats</span><strong>{fmtNum(alecaSummary.latest?.ducats)}</strong></div>
                <div className="stat"><span>MR</span><strong>{fmtNum(alecaSummary.latest?.mr)}</strong></div>
                <div className="stat"><span>Completion</span><strong>{alecaSummary.latest?.percentageCompletion ?? "/"}%</strong></div>
              </div>

              <div className="snapshot aleca-summary">
                <div className="stat"><span>Trades</span><strong>{fmtNum(alecaSummary.tradeSummary.count)}</strong></div>
                <div className="stat"><span>Sales</span><strong>{fmtNum(alecaSummary.tradeSummary.sales)}</strong></div>
                <div className="stat"><span>Purchases</span><strong>{fmtNum(alecaSummary.tradeSummary.purchases)}</strong></div>
                <div className="stat"><span>Sale Plat</span><strong>{fmtNum(alecaSummary.tradeSummary.salePlat)}</strong></div>
                <div className="stat"><span>Purchase Plat</span><strong>{fmtNum(alecaSummary.tradeSummary.purchasePlat)}</strong></div>
                <div className="stat"><span>Net Plat</span><strong>{fmtNum(alecaSummary.tradeSummary.netPlat)}</strong></div>
              </div>
            </>
          )}

          {alecaTrades.length>0&&(
            <>
              <h3 className="section-label">Recent Trades</h3>
              <div className="order-section aleca-table">
                <table>
                  <thead>
                    <tr><th>Time</th><th>Type</th><th>Partner</th><th>Received</th><th>Given</th><th>Plat</th></tr>
                  </thead>
                  <tbody>
                    {alecaTrades.slice(0, 40).map((trade,i)=>(
                      <tr key={`${trade.ts}-${i}`}>
                        <td className="ts-cell">{formatTradeDate(trade.ts, trade.type)}</td>
                        <td>{tradeTypeLabel(trade.type)}</td>
                        <td>{trade.user ?? "/"}</td>
                        <td style={{whiteSpace: "pre-line"}}>{formatTradeItems(trade.rx)}</td>
                        <td style={{whiteSpace: "pre-line"}}>{formatTradeItems(trade.tx)}</td>
                        <td>{trade.totalPlat ?? "/"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {alecaRelics.length>0&&(
            <>
              <h3 className="section-label">Relic Inventory</h3>
              <div className="order-section aleca-table">
                <table>
                  <thead>
                    <tr><th>Relic</th><th>Refinement</th><th>Quantity</th></tr>
                  </thead>
                  <tbody>
                    {alecaRelics.slice(0, 80).map((relic,i)=>(
                      <tr key={`${relic.relic}-${relic.refinement}-${i}`}>
                        <td>{relic.relic}</td>
                        <td>{relic.refinement}</td>
                        <td>{relic.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {!alecaLoading&&!alecaSummary&&!alecaError&&(
            <p className="hint">Refresh Alecaframe to load your stats.</p>
          )}
        </div>
      )}

      {/* Group Manager */}
      {tab==="groups"&&(
        <div className="gm-layout">
          <div className="gm-sidebar">
            <h3 className="section-label" style={{marginBottom:10}}>Built-in Groups</h3>
            <div style={{marginBottom:12}}>
              {Object.entries(scanGroups).filter(([k]) => !k.startsWith("Custom: ") && k !== "All Items").sort(([a],[b]) => a.localeCompare(b)).map(([label,count]) => {
                const hasEditableCopy = customGroups.some(g => g.name === label);
                const isOpen = activeGMGroup?.name === label;
                return (
                  <div key={label} style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
                    <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginRight:8}}>{label}</span>
                    <div style={{display:"flex",gap:6,alignItems:"center"}}>
                      <span style={{color:"#999",fontSize:"0.85rem"}}>{count}</span>
                      <button className="refresh-btn" style={{padding:"4px 8px",fontSize:"0.8rem"}} onClick={() => handleEditDefaultGroup(label)}>
                        {isOpen ? "Lock" : hasEditableCopy ? "Open" : "Edit"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <h3 className="section-label" style={{marginBottom:10}}>My Groups</h3>
            <div className="gm-new-group">
              <input placeholder="New group name..." value={newGroupName}
                onChange={e=>setNewGroupName(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&handleCreateGroup()}/>
              <button className="refresh-btn" style={{whiteSpace:"nowrap"}} onClick={handleCreateGroup}>+ Create</button>
            </div>
            {customGroups.length===0&&<p className="hint">No custom groups yet.</p>}
            {customGroups.map(g=>(
              <div key={g.id} className={`gm-group-item ${activeGMGroup?.id===g.id?"active":""}`}
                onClick={()=>{ setActiveGMGroup(g); setGmSearch(""); }}>
                {renamingGroup===g.id ? (
                  <input className="gm-new-group" style={{flex:1,margin:0}}
                    value={renameVal} autoFocus
                    onChange={e=>setRenameVal(e.target.value)}
                    onKeyDown={e=>{ if(e.key==="Enter") handleRenameGroup(g.id); if(e.key==="Escape") setRenamingGroup(null); }}
                    onClick={e=>e.stopPropagation()}/>
                ) : (
                  <>
                    <span className="gm-group-name">{g.name}</span>
                    <span className="gm-group-count">{g.items.length} items</span>
                  </>
                )}
                <div className="gm-group-actions" onClick={e=>e.stopPropagation()}>
                  <button className="gm-btn-sm rename" onClick={()=>{ setRenamingGroup(g.id); setRenameVal(g.name); }}>Edit</button>
                  <button className="gm-btn-sm" onClick={()=>handleDeleteGroup(g.id)}>x</button>
                </div>
              </div>
            ))}
          </div>

          <div className="gm-main">
            {!activeGMGroup&&<p className="hint">Select or create a group on the left.</p>}
            {activeGMGroup&&(
              <>
                <h2 className="user-title" style={{marginBottom:12}}>
                  {activeGMGroup.name}
                  <span style={{color:"#555",fontWeight:"normal",fontSize:"0.85rem",marginLeft:10}}>
                    {activeGMGroup.items.length} items
                  </span>
                </h2>
                {SPECIAL_GROUP_NOTES[activeGMGroup.name] && (
                  <p className="hint" style={{marginBottom: 12}}>{SPECIAL_GROUP_NOTES[activeGMGroup.name]}</p>
                )}
                {scanGroups[activeGMGroup.name] != null && customGroups.some(g => g.name === activeGMGroup.name) && (
                  <p className="hint" style={{marginBottom: 12}}>
                    This custom group overrides the built-in "{activeGMGroup.name}" group for Scanner and Profit views.
                  </p>
                )}
                <div className="gm-members" style={{marginBottom:16}}>
                  <h3 className="section-label" style={{marginBottom:6}}>Members</h3>
                  {activeGMGroup.items.length===0&&<p className="hint" style={{fontSize:"0.8rem"}}>No items yet - search below to add.</p>}
                  <div>
                    {activeGMGroup.items.map(item=>(
                      <span key={item.url_name} className="gm-member-chip">
                        {item.item_name}
                        <button onClick={()=>handleRemoveFromGroup(item.url_name)}>x</button>
                      </span>
                    ))}
                  </div>
                </div>
                <h3 className="section-label" style={{marginBottom:6}}>Add Items</h3>
                <input className="gm-item-search user-search"
                  style={{width:"100%",padding:"8px 12px",background:"#1c1f2b",border:"1px solid #2a2d3a",borderRadius:"6px",color:"#e0e0e0",marginBottom:8}}
                  placeholder="Search items to add..." value={gmSearch}
                  onChange={e=>setGmSearch(e.target.value)}/>
                <div style={{display:"flex",gap:8,marginBottom:8,alignItems:"center"}}>
                  <select value={gmCategory} onChange={e=>setGmCategory(e.target.value)} style={{background:"#1c1f2b",border:"1px solid #2a2d3a",color:"#e0e0e0",padding:"6px 8px",borderRadius:6}}>
                    <option value="all">All</option>
                    <option value="Arcanes">Arcanes</option>
                    <option value="Primed Mods">Primed Mods</option>
                    <option value="Primary Sets">Primary Sets</option>
                    <option value="Melee Sets">Melee Sets</option>
                    <option value="Secondary Sets">Secondary Sets</option>
                    <option value="Mods">Mods</option>
                    <option value="Relics">Relics</option>
                  </select>
                  <button className="refresh-btn" onClick={handleAddAllListed} disabled={!activeGMGroup || gmItems.length===0}>
                    Add All Listed
                  </button>
                </div>
                <div className="gm-item-list">
                  {gmItems.map(item=>{
                    const already = activeGMGroup.items.some(i=>i.url_name===item.url_name);
                    return(
                      <div key={item.url_name} className="gm-item-row">
                        <span>{item.item_name}</span>
                        {already
                          ? <button className="gm-item-remove" onClick={()=>handleRemoveFromGroup(item.url_name)}>Remove</button>
                          : <button className="gm-item-add" onClick={()=>handleAddToGroup(item.url_name)}>+ Add</button>
                        }
                      </div>
                    );
                  })}
                  {gmSearch&&gmItems.length===0&&<p className="hint" style={{fontSize:"0.8rem"}}>No items found.</p>}
                </div>
                {gmMore && (
                  <div style={{marginTop:8}}>
                    <button className="refresh-btn" onClick={loadMoreGmItems}>Load more</button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
      {/* ── TIME ANALYSIS ── */}
      {tab==="timeanalysis"&&(
        <div className="user-page">
          <div className="scan-header">
            <h2 className="user-title">Time Analysis</h2>
            <button className="info-btn" onClick={()=>setShowTaInfo(true)}>? How it works</button>
          </div>
          <GroupSelector groups={scanGroups} selected={taGroup} onSelect={setTaGroup}/>

          {/* Filters */}
          <div className="ta-filters">
            <div className="ta-filter-item">
              <label>Min 48h Volume</label>
              <input type="number" value={taFilters.minVolume} min={0}
                onChange={e=>setTaFilters(f=>({...f,minVolume:+e.target.value}))}/>
            </div>
            <div className="ta-filter-item">
              <label>Max Price (pt)</label>
              <input type="number" value={taFilters.maxPrice} min={0}
                onChange={e=>setTaFilters(f=>({...f,maxPrice:+e.target.value}))}/>
            </div>
          </div>

          <div className="scan-controls" style={{marginTop:12}}>
            <button className="refresh-btn" onClick={startTimeAnalysis} disabled={taRunning}>
              {taRunning?"Analyzing…":"▶ Run Analysis"}
            </button>
            {taRunning&&<button className="cancel-btn" onClick={stopTimeAnalysis}>Cancel</button>}
          </div>

          {taProgress&&(
            <div className="progress-wrap">
              <div className="progress-bar" style={{width:`${(taProgress.done/taProgress.total)*100}%`}}/>
              <span className="progress-label">{taProgress.done}/{taProgress.total}</span>
            </div>
          )}

          {taResults.length>0&&(
            <div className="ta-layout">
              {/* Item list */}
              <div className="ta-list">
                <h3 className="section-label" style={{marginBottom:8}}>
                  {taResults.length} items matched
                </h3>
                {taResults.map((r,i)=>(
                  <div key={i} className={`ta-item ${taSelected?.url_name===r.url_name?"active":""}`}
                    onClick={()=>setTaSelected(r)}>
                    <span className="ta-item-name">{r.item_name}</span>
                    <span className="ta-item-meta">
                      Vol: {r.totalVol48h} · Best: {r.bestDay} {r.bestHour}
                    </span>
                  </div>
                ))}
              </div>

              {/* Detail panel */}
              {taSelected&&(
                <div className="ta-detail">
                  <h3 className="user-title" style={{marginBottom:12}}>{taSelected.item_name}</h3>
                  <div className="snapshot" style={{marginBottom:16}}>
                    <div className="stat"><span>48h Vol</span><strong>{taSelected.totalVol48h}</strong></div>
                    <div className="stat"><span>Avg Price</span><strong>{taSelected.avgPrice??"/"}pt</strong></div>
                    <div className="stat"><span>Best Hour</span><strong>{taSelected.bestHour}</strong></div>
                    <div className="stat"><span>Best Day</span><strong>{taSelected.bestDay}</strong></div>
                  </div>
                  <h4 className="section-label" style={{marginBottom:6}}>Volume by Hour (UTC)</h4>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={taSelected.byHour}>
                      <XAxis dataKey="label" tick={{fontSize:9,fill:"#666"}} interval={2}/>
                      <YAxis tick={{fontSize:10,fill:"#666"}} width={35}/>
                      <Tooltip contentStyle={{background:"#1c1f2b",border:"1px solid #2a2d3a",fontSize:"0.78rem"}}/>
                      <Bar dataKey="avgVolume" fill="#c8a96e" name="Avg Vol"/>
                    </BarChart>
                  </ResponsiveContainer>
                  <h4 className="section-label" style={{margin:"12px 0 6px"}}>Volume by Day</h4>
                  <ResponsiveContainer width="100%" height={120}>
                    <BarChart data={taSelected.byDay}>
                      <XAxis dataKey="label" tick={{fontSize:10,fill:"#666"}}/>
                      <YAxis tick={{fontSize:10,fill:"#666"}} width={35}/>
                      <Tooltip contentStyle={{background:"#1c1f2b",border:"1px solid #2a2d3a",fontSize:"0.78rem"}}/>
                      <Bar dataKey="avgVolume" fill="#70b870" name="Avg Vol"/>
                    </BarChart>
                  </ResponsiveContainer>
                  <h4 className="section-label" style={{margin:"12px 0 6px"}}>Median Price by Hour</h4>
                  <ResponsiveContainer width="100%" height={140}>
                    <LineChart data={taSelected.byHour}>
                      <XAxis dataKey="label" tick={{fontSize:9,fill:"#666"}} interval={2}/>
                      <YAxis tick={{fontSize:10,fill:"#666"}} width={40}/>
                      <Tooltip contentStyle={{background:"#1c1f2b",border:"1px solid #2a2d3a",fontSize:"0.78rem"}}/>
                      <Line type="monotone" dataKey="avgMedian" stroke="#c8a96e" dot={false} name="Median Price"/>
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {showTaInfo&&(
            <InfoPopup title="How Time Analysis Works" onClose={()=>setShowTaInfo(false)}>
              <p><strong>What it does:</strong> Analyzes 48-hour trading statistics for all items in a group and breaks them down by hour-of-day and day-of-week.</p>
              <p style={{marginTop:8}}><strong>Best Hour / Best Day</strong> = when average trading volume is highest for that item. Listing during this window maximizes visibility.</p>
              <p style={{marginTop:8}}><strong>Min 48h Volume filter</strong> — excludes slow-moving items with too few trades to be meaningful. Recommended: 5+.</p>
              <p style={{marginTop:8}}><strong>Max Price filter</strong> — limits results to items within your platinum budget so you can actually act on findings.</p>
              <p style={{marginTop:8}}><strong>Median Price by Hour</strong> chart shows whether prices drift up or down at different times — useful for timing your listings.</p>
              <p style={{marginTop:8}}><strong>Note:</strong> All times are UTC. Add your timezone offset to get local time.</p>
            </InfoPopup>
          )}
        </div>
      )}
      {favDeleteSlug&&(
        <ConfirmPopup
          title="Delete favourite user?"
          confirmLabel="Yes"
          cancelLabel="Cancel"
          busy={deletingFav}
          onConfirm={confirmRemoveFav}
          onCancel={()=>setFavDeleteSlug(null)}
        >
          <p>Wanna delete <strong>{favDeleteSlug}</strong> user from fav space?</p>
        </ConfirmPopup>
      )}
    </div>
  );
}



