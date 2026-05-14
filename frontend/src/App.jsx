import { useState, useEffect, useRef } from "react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import {
  getItems, fetchPrice, getPriceHistory, getUserOrders,
  getFavourites, addFavourite, removeFavourite,
  getFavouriteOrders, refreshFavourites, API_BASE,
  getStats, getScannerGroups, cancelScan,
  getScannerItems, cancelProfit, cancelTimeAnalysis,
  syncMarketItems,
  getCustomGroups, createCustomGroup, deleteCustomGroup,
  renameCustomGroup, addItemToGroup, removeItemFromGroup,
  getAlecaStatus, getAlecaSummary, getAlecaTrades, getAlecaRelics,
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

function tradeTypeLabel(type) {
  return type === 0 ? "Sale" : type === 1 ? "Purchase" : "Trade";
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
// ── Order Table ───────────────────────────────────────────────────────────────
function OrderTable({ orders, onItemClick, showLive = false }) {
  const [sortKey, setSortKey]     = useState("item_name");
  const [sortDir, setSortDir]     = useState("asc");
  const [filter,  setFilter]      = useState("all");
  const [rankFilter, setRankFilter] = useState("all");

  function toggleSort(k) {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("asc"); }
  }

  function getStatus(o) {
    if (!o.live) return "neutral";
    if (o.order_type === "sell") {
      if (o.platinum < o.live.min)   return "bad";
      if (o.platinum === o.live.min) return "warn";
      return "good";
    } else {
      if (o.platinum > o.live.min)   return "bad";
      if (o.platinum === o.live.min) return "warn";
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
                  <td><span className={`badge badge-${status}`}>
                    {status==="good"?"✓ Good":status==="warn"?"~ Even":status==="bad"?`✗ ${diff!==null?(diff>0?`+${diff}`:diff)+" pt":"Risk"}`:"—"}
                  </span></td>
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
function GroupSelector({ groups, selected, onSelect, groupStats = {} }) {
  const builtin = Object.entries(groups).filter(([k]) => !k.startsWith("Custom: ") && !k.startsWith("NPC: "));
  const npc     = Object.entries(groups).filter(([k]) =>  k.startsWith("NPC: "));
  const custom  = Object.entries(groups).filter(([k]) =>  k.startsWith("Custom: "));

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
  const [snapshot,     setSnapshot]     = useState(null);
  const [history,      setHistory]      = useState([]);
  const [loadingPrice, setLoadingPrice] = useState(false);

  // User
  const [userInput,      setUserInput]      = useState("");
  const [userSlug,       setUserSlug]       = useState("");
  const [userOrders,     setUserOrders]     = useState([]);
  const [loadingUser,    setLoadingUser]    = useState(false);
  const [userError,      setUserError]      = useState("");
  const [activeSection,  setActiveSection]  = useState(null);
  const [itemHistories,  setItemHistories]  = useState({});

  // Favourites
  const [favs,        setFavs]        = useState([]);
  const [favInput,    setFavInput]    = useState("");
  const [activeFav,   setActiveFav]   = useState(null);
  const [favOrders,   setFavOrders]   = useState([]);
  const [favSection,  setFavSection]  = useState(null);
  const [loadingFav,  setLoadingFav]  = useState(false);
  const [refreshing,  setRefreshing]  = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);

  // Scanner
  const [scanGroups,   setScanGroups]   = useState({});
  const [scanGroup,    setScanGroup]    = useState("Arcanes");
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
  const [renamingGroup,   setRenamingGroup]   = useState(null);
  const [renameVal,       setRenameVal]       = useState("");

  useEffect(() => {
    const t = setTimeout(() => getItems(search).then(setItems).catch(console.error), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { getFavourites().then(setFavs).catch(console.error); }, []);
  useEffect(() => { getScannerGroups().then(setScanGroups).catch(console.error); }, []);
  useEffect(() => { getCustomGroups().then(setCustomGroups).catch(console.error); }, []);

  useEffect(() => {
    if (tab !== "alecaframe" || alecaStatus) return;
    loadAlecaFrame();
  }, [tab, alecaStatus]);

  // GM item search
  useEffect(() => {
    if (!gmSearch.trim()) {
      const t = setTimeout(() => setGmItems([]), 0);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => getItems(gmSearch).then(setGmItems).catch(console.error), 300);
    return () => clearTimeout(t);
  }, [gmSearch]);

  // ── Market ────────────────────────────────────────────────────────────────
  async function handleSelect(item) {
    setSelected(item); setSnapshot(null); setHistory([]); setLoadingPrice(true);
    try {
      const [snap, hist] = await Promise.all([fetchPrice(item.url_name), getPriceHistory(item.url_name)]);
      setSnapshot(snap.snapshot); setHistory(hist);
    } catch (e) { console.error(e); }
    setLoadingPrice(false);
  }

  function jumpToItem(order) {
    if (!order.item_slug) return;
    setTab("market"); setSearch(order.item_name);
    setSelected({id:order.item_slug, url_name:order.item_slug, item_name:order.item_name});
    setSnapshot(null); setHistory([]);
    fetchPrice(order.item_slug).then(s=>setSnapshot(s.snapshot)).catch(console.error);
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
      }
    } catch { setUserError("User not found or API error."); }
    setLoadingUser(false);
  }

  const enrichedUserOrders = userOrders.map(o=>({...o, history:itemHistories[o.item_slug]??[], live:null}));

  // ── Favourites ────────────────────────────────────────────────────────────
  async function handleAddFav() {
    if (!favInput.trim()) return;
    await addFavourite(favInput.trim()); setFavInput("");
    getFavourites().then(setFavs);
  }

  async function handleRemoveFav(slug) {
    await removeFavourite(slug);
    if (activeFav===slug) { setActiveFav(null); setFavOrders([]); }
    getFavourites().then(setFavs);
  }

  async function handleSelectFav(slug) {
    setActiveFav(slug); setFavOrders([]); setFavSection(null); setLoadingFav(true);
    try { setFavOrders(await getFavouriteOrders(slug)); }
    catch (e) { console.error(e); }
    setLoadingFav(false);
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
        if (msg.snap) {
          const standingCost = msg.standing_cost ?? null;
          const minPlatPerKStanding = platPerKStanding(msg.snap.min, standingCost);
          const avgPlatPerKStanding = platPerKStanding(msg.snap.avg, standingCost);
          setGroupResults(prev => ({
            ...prev,
            [scanGroup]: [...(prev[scanGroup]??[]), {
              item: msg.item,
              url_name: msg.snap?.url_name,
              standingCost,
              minPlatPerKStanding,
              avgPlatPerKStanding,
              ...msg.snap,
            }]
          }));
        }
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

  function renderScanSortTh(label, k) {
    const active = scanSort === k;
    return <th className={`sortable ${active?"sorted":""}`} onClick={()=>toggleScanSort(k)}>{label}{active?(scanDir==="asc"?" ▲":" ▼"):""}</th>;
  }

  return (
    <div className="app">
      <header>
        <h1>WMPersonal</h1>
        <p>Warframe Market Monitor</p>
        <div className="tabs">
          {[["market","Market"],["user","User Orders"],["favs",`Favs${favs.length?` (${favs.length})`:""}`],["scanner","Scanner"],["profit","Profit"],["timeanalysis","Time Analysis"],["alecaframe","Alecaframe"],["groups","Group Manager"]].map(([t,l])=>(
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
                {loadingPrice&&<p className="hint">Fetching live orders…</p>}
                {snapshot&&(
                  <div className="snapshot">
                    <div className="stat"><span>Min</span><strong>{snapshot.min} pt</strong></div>
                    <div className="stat"><span>Avg</span><strong>{snapshot.avg?.toFixed(1)} pt</strong></div>
                    <div className="stat"><span>Max</span><strong>{snapshot.max} pt</strong></div>
                    <div className="stat"><span>Online sellers</span><strong>{snapshot.volume}</strong></div>
                  </div>
                )}
                <StatsPanel urlName={selected.url_name}/>
                {history.length>0&&(
                  <>
                    <h3 className="section-label" style={{marginTop:16}}>Snapshot history</h3>
                    <table>
                      <thead><tr><th>Time</th><th>Min</th><th>Avg</th><th>Max</th><th>Vol</th></tr></thead>
                      <tbody>{history.map(h=>(
                        <tr key={h.id}>
                          <td>{new Date(h.fetched_at).toLocaleTimeString()}</td>
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
              {activeSection==="sell"&&<OrderTable orders={userSells} onItemClick={jumpToItem} showLive={false}/>}
              {activeSection==="buy" &&<OrderTable orders={userBuys}  onItemClick={jumpToItem} showLive={false}/>}
              {!activeSection&&<p className="hint" style={{marginTop:24}}>Click Selling or Buying to expand.</p>}
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
          {lastRefresh&&<p className="hint" style={{marginBottom:12}}>Last refreshed: {lastRefresh.toLocaleTimeString()}</p>}
          {favs.length===0&&<p className="hint">No favourites yet.</p>}
          <div className="fav-list">
            {favs.map(f=>(
              <div key={f.slug} className={`fav-item ${activeFav===f.slug?"active":""}`}>
                <span className="fav-name" onClick={()=>handleSelectFav(f.slug)}>{f.slug}</span>
                <button className="fav-remove" onClick={()=>handleRemoveFav(f.slug)}>✕</button>
              </div>
            ))}
          </div>
          {loadingFav&&<p className="hint" style={{marginTop:24}}>Fetching orders and live prices…</p>}
          {activeFav&&!loadingFav&&favOrders.length>0&&(
            <>
              <h2 className="user-title" style={{marginTop:24}}>{activeFav}</h2>
              <div className="section-toggles">
                <button className={`toggle-btn sell ${favSection==="sell"?"active":""}`} onClick={()=>setFavSection(p=>p==="sell"?null:"sell")}>Selling ({favSells.length})</button>
                <button className={`toggle-btn buy  ${favSection==="buy" ?"active":""}`} onClick={()=>setFavSection(p=>p==="buy" ?null:"buy" )}>Buying ({favBuys.length})</button>
              </div>
              {favSection==="sell"&&<OrderTable orders={favSells} onItemClick={jumpToItem} showLive={true}/>}
              {favSection==="buy" &&<OrderTable orders={favBuys}  onItemClick={jumpToItem} showLive={true}/>}
              {!favSection&&<p className="hint" style={{marginTop:24}}>Click Selling or Buying to expand.</p>}
            </>
          )}
        </div>
      )}

      {/* ── SCANNER ── */}
      {tab==="scanner"&&(
        <div className="scanner-layout">
          <div className="scanner-sidebar">
            <h3 className="section-label" style={{marginBottom:10}}>Groups</h3>
            <GroupSelector
              groups={scanGroups}
              selected={scanGroup}
              onSelect={g=>{setScanGroup(g);setViewGroup(g);}}
              groupStats={groupStats}
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
                        {renderScanSortTh("Max", "max")}
                        {renderScanSortTh("Vol", "volume")}
                        {renderScanSortTh("Standing", "standingCost")}
                        {renderScanSortTh("Min / 1k", "minPlatPerKStanding")}
                        {renderScanSortTh("Avg / 1k", "avgPlatPerKStanding")}
                      </tr>
                    </thead>
                    <tbody>
                      {viewResults.map((r,i)=>(
                        <tr key={i}>
                          <td><span className="item-link" onClick={()=>{setTab("market");setSearch(r.item);setSelected({id:r.url_name,url_name:r.url_name,item_name:r.item});}}>{r.item}</span></td>
                          <td>{r.min} pt</td>
                          <td>{r.avg} pt</td>
                          <td>{r.max} pt</td>
                          <td>{r.volume}</td>
                          <td>{r.standingCost?r.standingCost.toLocaleString():"/"}</td>
                          <td>{r.minPlatPerKStanding!=null?`${r.minPlatPerKStanding} pt`:"/"}</td>
                          <td>{r.avgPlatPerKStanding!=null?`${r.avgPlatPerKStanding} pt`:"/"}</td>
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
                    {renderProfitSortTh("Min Sell", "minSell")}
                    {renderProfitSortTh("Max Buy", "maxBuy")}
                    {renderProfitSortTh("Margin", "margin")}
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
                        <td>{p.minSell??"/"}pt</td>
                        <td>{p.maxBuy??"/"}pt</td>
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
              <p style={{marginTop:8}}><strong>Margin</strong> = Min online sell price − Max online buy price. Positive margin means a buyer exists below the cheapest seller — a tradeable gap.</p>
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
                        <td className="ts-cell">{new Date(trade.ts).toLocaleString()}</td>
                        <td>{tradeTypeLabel(trade.type)}</td>
                        <td>{trade.user ?? "/"}</td>
                        <td>{(trade.rx??[]).map(item=>`${item.displayName??item.name} x${item.cnt}`).join(", ") || "/"}</td>
                        <td>{(trade.tx??[]).map(item=>`${item.displayName??item.name} x${item.cnt}`).join(", ") || "/"}</td>
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
    </div>
  );
}



