import { useState, useEffect, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import {
  getItems, fetchPrice, getPriceHistory, getUserOrders,
  getFavourites, addFavourite, removeFavourite,
  getFavouriteOrders, refreshFavourites,
  getStats, getStatsSummary, getScannerGroups, cancelScan,
} from "./api";
import "./App.css";

const BASE = "http://localhost:3001/api";

// ── Rank helpers ─────────────────────────────────────────────────────────────
function rankLabel(rank, maxRank) {
  if (rank === null || rank === undefined) return null;
  return maxRank != null ? `R${rank}/${maxRank}` : `R${rank}`;
}

// ── Order table (shared) ─────────────────────────────────────────────────────
function OrderTable({ orders, onItemClick, showLive = false }) {
  const [sortKey, setSortKey] = useState("item_name");
  const [sortDir, setSortDir] = useState("asc");
  const [filter,  setFilter]  = useState("all");
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

  function SortTh({ label, k }) {
    const active = sortKey === k;
    return (
      <th className={`sortable ${active ? "sorted" : ""}`} onClick={() => toggleSort(k)}>
        {label}{active ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
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
              <SortTh label="Item"   k="item_name"/>
              <SortTh label="Rank"   k="rank"/>
              <SortTh label="Listed" k="platinum"/>
              <SortTh label="Qty"    k="quantity"/>
              {showLive && <SortTh label="Mkt Min" k="live_min"/>}
              {showLive && <SortTh label="Mkt Avg" k="live_avg"/>}
              <SortTh label="DB Min" k="db_min"/>
              <SortTh label="DB Avg" k="db_avg"/>
              <SortTh label="Status" k="status"/>
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
                  <td>{rLabel ? <span className={`rank-badge rank-${rCat}`}>{rLabel}</span> : <span className="rank-none">—</span>}</td>
                  <td>{o.platinum} pt</td>
                  <td>{o.quantity}</td>
                  {showLive && <td>{o.live?`${o.live.min} pt`:"/"}</td>}
                  {showLive && <td>{o.live?`${o.live.avg?.toFixed(1)} pt`:"/"}</td>}
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

// ── Stats chart panel ────────────────────────────────────────────────────────
function StatsPanel({ urlName }) {
  const [period, setPeriod] = useState("48h");
  const [data, setData]     = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!urlName) return;
    setLoading(true);
    getStats(urlName, period)
      .then(rows => setData(rows.map(r => ({
        t:          period === "48h" ? new Date(r.datetime).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}) : new Date(r.datetime).toLocaleDateString(),
        avg:        r.avg_price,
        median:     r.median,
        moving_avg: r.moving_avg,
        volume:     r.volume,
        rank:       r.rank,
      }))))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [urlName, period]);

  if (!urlName) return null;

  const ranks = [...new Set(data.map(d => d.rank))];
  const rankColors = ["#c8a96e","#70b870","#7090e0","#e07070","#b070e0"];

  return (
    <div className="stats-panel">
      <div className="stats-header">
        <h3 className="section-label">Market Statistics</h3>
        <div className="period-toggle">
          {["48h","90d"].map(p => (
            <button key={p} className={`filter-btn ${period===p?"active":""}`} onClick={() => setPeriod(p)}>{p}</button>
          ))}
        </div>
      </div>
      {loading && <p className="hint">Loading statistics…</p>}
      {!loading && data.length > 0 && (
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={data.filter(d => d.rank === ranks[0])}>
              <XAxis dataKey="t" tick={{fontSize:10, fill:"#666"}} interval="preserveStartEnd"/>
              <YAxis tick={{fontSize:10, fill:"#666"}} width={40}/>
              <Tooltip contentStyle={{background:"#1c1f2b",border:"1px solid #2a2d3a",fontSize:"0.78rem"}}/>
              <Legend wrapperStyle={{fontSize:"0.75rem"}}/>
              <Line type="monotone" dataKey="avg"        stroke="#c8a96e" dot={false} name="Avg Price"/>
              <Line type="monotone" dataKey="median"     stroke="#70b870" dot={false} name="Median"/>
              <Line type="monotone" dataKey="moving_avg" stroke="#7090e0" dot={false} name="Moving Avg"/>
            </LineChart>
          </ResponsiveContainer>
          <ResponsiveContainer width="100%" height={80}>
            <LineChart data={data.filter(d => d.rank === ranks[0])}>
              <XAxis dataKey="t" hide/>
              <YAxis tick={{fontSize:10,fill:"#666"}} width={40}/>
              <Tooltip contentStyle={{background:"#1c1f2b",border:"1px solid #2a2d3a",fontSize:"0.78rem"}}/>
              <Line type="monotone" dataKey="volume" stroke="#e07070" dot={false} name="Volume"/>
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("market");

  // Market
  const [search, setSearch]       = useState("");
  const [items, setItems]         = useState([]);
  const [selected, setSelected]   = useState(null);
  const [snapshot, setSnapshot]   = useState(null);
  const [history, setHistory]     = useState([]);
  const [loadingPrice, setLoadingPrice] = useState(false);

  // User
  const [userInput, setUserInput]     = useState("");
  const [userSlug, setUserSlug]       = useState("");
  const [userOrders, setUserOrders]   = useState([]);
  const [loadingUser, setLoadingUser] = useState(false);
  const [userError, setUserError]     = useState("");
  const [activeSection, setActiveSection] = useState(null);
  const [itemHistories, setItemHistories] = useState({});

  // Favourites
  const [favs, setFavs]             = useState([]);
  const [favInput, setFavInput]     = useState("");
  const [activeFav, setActiveFav]   = useState(null);
  const [favOrders, setFavOrders]   = useState([]);
  const [favSection, setFavSection] = useState(null);
  const [loadingFav, setLoadingFav] = useState(false);
  const [favProgress, setFavProgress] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);

  // Scanner
  const [scanGroups, setScanGroups]   = useState({});
  const [scanGroup, setScanGroup]     = useState("Arcanes");
  const [scanRunning, setScanRunning] = useState(false);
  const [scanProgress, setScanProgress] = useState(null);
  const [scanResults, setScanResults]   = useState([]);
  const [scanLog, setScanLog]           = useState([]);
  const scanEsRef = useRef(null);

  // Profit
  const [profitGroup, setProfitGroup]     = useState("Arcanes");
  const [profitRunning, setProfitRunning] = useState(false);
  const [profitProgress, setProfitProgress] = useState(null);
  const [profitResults, setProfitResults]   = useState([]);
  const [profitSort, setProfitSort]         = useState("score");
  const [profitDir, setProfitDir]           = useState("desc");
  const profitEsRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => getItems(search).then(setItems).catch(console.error), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { getFavourites().then(setFavs).catch(console.error); }, []);
  useEffect(() => { getScannerGroups().then(setScanGroups).catch(console.error); }, []);

  // ── Market ──
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
    setSelected({ id: order.item_slug, url_name: order.item_slug, item_name: order.item_name });
    setSnapshot(null); setHistory([]);
    fetchPrice(order.item_slug).then(s => setSnapshot(s.snapshot)).catch(console.error);
    getPriceHistory(order.item_slug).then(setHistory).catch(console.error);
  }

  // ── User ──
  async function handleUserSearch() {
    if (!userInput.trim()) return;
    setUserSlug(userInput.trim()); setUserOrders([]); setUserError("");
    setLoadingUser(true); setActiveSection(null); setItemHistories({});
    try {
      const orders = await getUserOrders(userInput.trim());
      setUserOrders(orders);
      if (!orders.length) { setUserError("No orders found."); }
      else {
        const slugs = [...new Set(orders.map(o => o.item_slug).filter(Boolean))];
        const results = {};
        await Promise.all(slugs.map(s => getPriceHistory(s).then(h => { results[s]=h; }).catch(()=>{ results[s]=[]; })));
        setItemHistories(results);
      }
    } catch (e) { setUserError("User not found or API error."); }
    setLoadingUser(false);
  }

  const enrichedUserOrders = userOrders.map(o => ({ ...o, history: itemHistories[o.item_slug] ?? [], live: null }));

  // ── Favourites ──
  async function handleAddFav() {
    if (!favInput.trim()) return;
    await addFavourite(favInput.trim()); setFavInput("");
    getFavourites().then(setFavs);
  }

  async function handleRemoveFav(slug) {
    await removeFavourite(slug);
    if (activeFav === slug) { setActiveFav(null); setFavOrders([]); }
    getFavourites().then(setFavs);
  }

  async function handleSelectFav(slug) {
    setActiveFav(slug); setFavOrders([]); setFavSection(null);
    setLoadingFav(true); setFavProgress(null);
    try {
      // Use SSE-style polling via regular fetch with ReadableStream
      const res = await fetch(`${BASE}/favourites/${slug}/orders`);
      const orders = await res.json();
      setFavOrders(orders);
    } catch (e) { console.error(e); }
    setLoadingFav(false); setFavProgress(null);
  }

  async function handleManualRefresh() {
    setRefreshing(true);
    try { await refreshFavourites(); setLastRefresh(new Date()); if (activeFav) await handleSelectFav(activeFav); }
    catch (e) { console.error(e); }
    setRefreshing(false);
  }

  // ── Scanner SSE ──
  function startScan() {
    if (scanRunning) return;
    setScanRunning(true); setScanProgress(null); setScanResults([]); setScanLog([]);

    const es = new EventSource(`${BASE}/scanner/run?group=${encodeURIComponent(scanGroup)}`);
    scanEsRef.current = es;

    es.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "start")    { setScanProgress({ done: 0, total: msg.total }); }
      if (msg.type === "progress") {
        setScanProgress({ done: msg.done, total: msg.total });
        setScanLog(l => [...l.slice(-49), `${msg.done}/${msg.total} — ${msg.item}${msg.error ? " ✗" : " ✓"}`]);
        if (msg.snap) setScanResults(r => [...r, { item: msg.item, ...msg.snap }]);
      }
      if (msg.type === "done" || msg.type === "cancelled") {
        setScanRunning(false); es.close();
      }
    };
    es.onerror = () => { setScanRunning(false); es.close(); };
  }

  function stopScan() { cancelScan(); if (scanEsRef.current) scanEsRef.current.close(); setScanRunning(false); }

  // ── Profit SSE ──
  function startProfit() {
    if (profitRunning) return;
    setProfitRunning(true); setProfitProgress(null); setProfitResults([]);

    const es = new EventSource(`${BASE}/profit/scan?group=${encodeURIComponent(profitGroup)}&limit=50`);
    profitEsRef.current = es;

    es.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "start")    { setProfitProgress({ done: 0, total: msg.total }); }
      if (msg.type === "progress") { setProfitProgress({ done: msg.done, total: msg.total }); }
      if (msg.type === "done")     { setProfitResults(msg.profiles ?? []); setProfitRunning(false); es.close(); }
    };
    es.onerror = () => { setProfitRunning(false); es.close(); };
  }

  function toggleProfitSort(k) {
    if (profitSort === k) setProfitDir(d => d === "asc" ? "desc" : "asc");
    else { setProfitSort(k); setProfitDir("desc"); }
  }

  const sortedProfit = [...profitResults].sort((a, b) => {
    const av = a[profitSort] ?? -9999, bv = b[profitSort] ?? -9999;
    return profitDir === "asc" ? av - bv : bv - av;
  });

  const favSells = favOrders.filter(o => o.order_type === "sell");
  const favBuys  = favOrders.filter(o => o.order_type === "buy");
  const userSells = enrichedUserOrders.filter(o => o.order_type === "sell");
  const userBuys  = enrichedUserOrders.filter(o => o.order_type === "buy");

  function PSortTh({ label, k }) {
    const a = profitSort === k;
    return <th className={`sortable ${a?"sorted":""}`} onClick={() => toggleProfitSort(k)}>{label}{a?(profitDir==="asc"?" ▲":" ▼"):""}</th>;
  }

  const groupList = Object.keys(scanGroups).sort();

  return (
    <div className="app">
      <header>
        <h1>WMPersonal</h1>
        <p>Warframe Market Monitor</p>
        <div className="tabs">
          {["market","user","favs","scanner","profit"].map(t => (
            <button key={t} className={tab===t?"active":""} onClick={() => setTab(t)}>
              {t==="market"?"Market":t==="user"?"User Orders":t==="favs"?`Favs${favs.length?` (${favs.length})`:""}`:t==="scanner"?"Scanner":"Profit"}
            </button>
          ))}
        </div>
      </header>

      {/* ── MARKET ── */}
      {tab === "market" && (
        <div className="layout">
          <aside>
            <input placeholder="Search items..." value={search} onChange={e => setSearch(e.target.value)}/>
            <ul>
              {items.map(item => (
                <li key={item.id} className={selected?.id===item.id?"active":""} onClick={() => handleSelect(item)}>
                  {item.item_name}
                </li>
              ))}
            </ul>
          </aside>
          <main>
            {!selected && <p className="hint">Select an item to see prices.</p>}
            {selected && (
              <>
                <h2>{selected.item_name}</h2>
                <code>{selected.url_name}</code>
                {loadingPrice && <p className="hint">Fetching live orders…</p>}
                {snapshot && (
                  <div className="snapshot">
                    <div className="stat"><span>Min</span><strong>{snapshot.min} pt</strong></div>
                    <div className="stat"><span>Avg</span><strong>{snapshot.avg?.toFixed(1)} pt</strong></div>
                    <div className="stat"><span>Max</span><strong>{snapshot.max} pt</strong></div>
                    <div className="stat"><span>Online sellers</span><strong>{snapshot.volume}</strong></div>
                  </div>
                )}
                <StatsPanel urlName={selected.url_name}/>
                {history.length > 0 && (
                  <>
                    <h3 className="section-label" style={{marginTop:16}}>Snapshot history</h3>
                    <table>
                      <thead><tr><th>Time</th><th>Min</th><th>Avg</th><th>Max</th><th>Vol</th></tr></thead>
                      <tbody>
                        {history.map(h => (
                          <tr key={h.id}>
                            <td>{new Date(h.fetched_at).toLocaleTimeString()}</td>
                            <td>{h.min_price}</td><td>{h.avg_price}</td><td>{h.max_price}</td><td>{h.volume}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
              </>
            )}
          </main>
        </div>
      )}

      {/* ── USER ── */}
      {tab === "user" && (
        <div className="user-page">
          <div className="user-search">
            <input placeholder="Enter warframe.market username..." value={userInput}
              onChange={e => setUserInput(e.target.value)} onKeyDown={e => e.key==="Enter"&&handleUserSearch()}/>
            <button onClick={handleUserSearch}>Search</button>
          </div>
          {loadingUser && <p className="hint">Fetching orders…</p>}
          {userError   && <p className="hint">{userError}</p>}
          {userOrders.length > 0 && (
            <>
              <div className="user-header-row">
                <h2 className="user-title">{userSlug}</h2>
                <button className="fav-add-btn" onClick={() => addFavourite(userSlug).then(()=>getFavourites().then(setFavs))}>★ Add to Favourites</button>
              </div>
              <div className="section-toggles">
                <button className={`toggle-btn sell ${activeSection==="sell"?"active":""}`} onClick={() => setActiveSection(p=>p==="sell"?null:"sell")}>Selling ({userSells.length})</button>
                <button className={`toggle-btn buy  ${activeSection==="buy" ?"active":""}`} onClick={() => setActiveSection(p=>p==="buy" ?null:"buy" )}>Buying ({userBuys.length})</button>
              </div>
              {activeSection==="sell" && <OrderTable orders={userSells} onItemClick={jumpToItem} showLive={false}/>}
              {activeSection==="buy"  && <OrderTable orders={userBuys}  onItemClick={jumpToItem} showLive={false}/>}
              {!activeSection && <p className="hint" style={{marginTop:24}}>Click Selling or Buying to expand.</p>}
            </>
          )}
        </div>
      )}

      {/* ── FAVOURITES ── */}
      {tab === "favs" && (
        <div className="user-page">
          <div className="fav-toolbar">
            <div className="user-search" style={{flex:1}}>
              <input placeholder="Add username..." value={favInput}
                onChange={e => setFavInput(e.target.value)} onKeyDown={e => e.key==="Enter"&&handleAddFav()}/>
              <button onClick={handleAddFav}>Add</button>
            </div>
            <button className="refresh-btn" onClick={handleManualRefresh} disabled={refreshing}>
              {refreshing?"Refreshing…":"↻ Refresh All"}
            </button>
          </div>
          {lastRefresh && <p className="hint" style={{marginBottom:12}}>Last refreshed: {lastRefresh.toLocaleTimeString()}</p>}
          {favs.length===0 && <p className="hint">No favourites yet.</p>}
          <div className="fav-list">
            {favs.map(f => (
              <div key={f.slug} className={`fav-item ${activeFav===f.slug?"active":""}`}>
                <span className="fav-name" onClick={() => handleSelectFav(f.slug)}>{f.slug}</span>
                <button className="fav-remove" onClick={() => handleRemoveFav(f.slug)}>✕</button>
              </div>
            ))}
          </div>
          {loadingFav && <p className="hint" style={{marginTop:24}}>Fetching orders and live prices…</p>}
          {activeFav && !loadingFav && favOrders.length > 0 && (
            <>
              <h2 className="user-title" style={{marginTop:24}}>{activeFav}</h2>
              <div className="section-toggles">
                <button className={`toggle-btn sell ${favSection==="sell"?"active":""}`} onClick={() => setFavSection(p=>p==="sell"?null:"sell")}>Selling ({favSells.length})</button>
                <button className={`toggle-btn buy  ${favSection==="buy" ?"active":""}`} onClick={() => setFavSection(p=>p==="buy" ?null:"buy" )}>Buying ({favBuys.length})</button>
              </div>
              {favSection==="sell" && <OrderTable orders={favSells} onItemClick={jumpToItem} showLive={true}/>}
              {favSection==="buy"  && <OrderTable orders={favBuys}  onItemClick={jumpToItem} showLive={true}/>}
              {!favSection && <p className="hint" style={{marginTop:24}}>Click Selling or Buying to expand.</p>}
            </>
          )}
        </div>
      )}

      {/* ── SCANNER ── */}
      {tab === "scanner" && (
        <div className="user-page">
          <h2 className="user-title" style={{marginBottom:16}}>Item Scanner</h2>
          <div className="group-grid">
            {groupList.map(g => (
              <button key={g} className={`group-btn ${scanGroup===g?"active":""}`} onClick={() => setScanGroup(g)}>
                {g} {scanGroups[g] ? <span className="group-count">({scanGroups[g]})</span> : ""}
              </button>
            ))}
          </div>
          <div className="scan-controls">
            <button className="refresh-btn" onClick={startScan} disabled={scanRunning}>
              {scanRunning ? "Scanning…" : "▶ Start Scan"}
            </button>
            {scanRunning && <button className="cancel-btn" onClick={stopScan}>■ Cancel</button>}
          </div>
          {scanProgress && (
            <div className="progress-wrap">
              <div className="progress-bar" style={{width:`${(scanProgress.done/scanProgress.total)*100}%`}}/>
              <span className="progress-label">{scanProgress.done} / {scanProgress.total}</span>
            </div>
          )}
          {scanLog.length > 0 && (
            <div className="scan-log">
              {scanLog.map((l,i) => <div key={i} className="log-line">{l}</div>)}
            </div>
          )}
          {scanResults.length > 0 && (
            <>
              <h3 className="section-label" style={{marginTop:16}}>Results ({scanResults.length} items)</h3>
              <div className="order-section">
                <table>
                  <thead><tr><th>Item</th><th>Min</th><th>Avg</th><th>Max</th><th>Vol</th></tr></thead>
                  <tbody>
                    {scanResults.map((r,i) => (
                      <tr key={i}>
                        <td><span className="item-link" onClick={() => { setTab("market"); setSearch(r.item); setSelected({id:r.url_name,url_name:r.url_name,item_name:r.item}); }}>{r.item}</span></td>
                        <td>{r.min} pt</td>
                        <td>{r.avg} pt</td>
                        <td>{r.max} pt</td>
                        <td>{r.volume}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── PROFIT ── */}
      {tab === "profit" && (
        <div className="user-page">
          <h2 className="user-title" style={{marginBottom:16}}>Profit Analyzer</h2>
          <div className="group-grid">
            {groupList.filter(g => g !== "All Items").map(g => (
              <button key={g} className={`group-btn ${profitGroup===g?"active":""}`} onClick={() => setProfitGroup(g)}>{g}</button>
            ))}
          </div>
          <div className="scan-controls">
            <button className="refresh-btn" onClick={startProfit} disabled={profitRunning}>
              {profitRunning?"Analyzing…":"▶ Analyze"}
            </button>
          </div>
          {profitProgress && (
            <div className="progress-wrap">
              <div className="progress-bar" style={{width:`${(profitProgress.done/profitProgress.total)*100}%`}}/>
              <span className="progress-label">{profitProgress.done} / {profitProgress.total}</span>
            </div>
          )}
          {sortedProfit.length > 0 && (
            <>
              <h3 className="section-label" style={{marginTop:16}}>Results — sorted by score</h3>
              <div className="order-section">
                <table>
                  <thead>
                    <tr>
                      <PSortTh label="Item"         k="item_name"/>
                      <PSortTh label="Rank"         k="rank"/>
                      <PSortTh label="Min Sell"     k="minSell"/>
                      <PSortTh label="Max Buy"      k="maxBuy"/>
                      <PSortTh label="Margin"       k="margin"/>
                      <PSortTh label="Off. Min"     k="offlineMinSell"/>
                      <PSortTh label="Vol 48h"      k="vol48h"/>
                      <PSortTh label="Vol 90d"      k="vol90d"/>
                      <PSortTh label="Avg/Day"      k="avgDaily90d"/>
                      <PSortTh label="Avg Median"   k="avgMedian90d"/>
                      <PSortTh label="Score"        k="score"/>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedProfit.map((p,i) => {
                      const marginClass = p.margin > 50 ? "good" : p.margin > 10 ? "warn" : p.margin <= 0 ? "bad" : "";
                      return (
                        <tr key={i} className={`row-${marginClass}`}>
                          <td><span className="item-link" onClick={() => { setTab("market"); setSearch(p.item_name); setSelected({id:p.url_name,url_name:p.url_name,item_name:p.item_name}); }}>{p.item_name}</span></td>
                          <td>{rankLabel(p.rank, p.maxRank) ?? "—"}</td>
                          <td>{p.minSell ?? "/"} pt</td>
                          <td>{p.maxBuy  ?? "/"} pt</td>
                          <td><span className={`badge badge-${marginClass}`}>{p.margin!=null?`${p.margin>0?"+":""}${p.margin} pt`:"/"}</span></td>
                          <td>{p.offlineMinSell ?? "/"} pt</td>
                          <td>{p.vol48h}</td>
                          <td>{p.vol90d}</td>
                          <td>{p.avgDaily90d}/day</td>
                          <td>{p.avgMedian90d ?? "/"} pt</td>
                          <td><strong style={{color:"#c8a96e"}}>{p.score}</strong></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}