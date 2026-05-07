import { useState, useEffect } from "react";
import {
  getItems, fetchPrice, getPriceHistory, getUserOrders,
  getFavourites, addFavourite, removeFavourite,
  getFavouriteOrders, refreshFavourites
} from "./api";
import "./App.css";

// ── Sortable, colour-coded order table ──────────────────────────────────────
function OrderTable({ orders, onItemClick, showLive = false }) {
  const [sortKey, setSortKey]   = useState("item_name");
  const [sortDir, setSortDir]   = useState("asc");
  const [filter, setFilter]     = useState("all"); // all | good | warn | bad

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  }

  function getStatus(o) {
    if (!o.live) return "neutral";
    if (o.order_type === "sell") {
      // seller is cheapest → bad (losing profit), seller is above market min → good
      if (o.platinum < o.live.min)  return "bad";
      if (o.platinum === o.live.min) return "warn";
      return "good";
    } else {
      // buyer offers more than market min sell → bad (overpaying)
      if (o.platinum > o.live.min)  return "bad";
      if (o.platinum === o.live.min) return "warn";
      return "good";
    }
  }

  function getVal(o, key) {
    switch (key) {
      case "item_name":  return o.item_name?.toLowerCase() ?? "";
      case "platinum":   return o.platinum ?? 0;
      case "quantity":   return o.quantity ?? 0;
      case "live_min":   return o.live?.min ?? -1;
      case "live_avg":   return o.live?.avg ?? -1;
      case "db_min":     return o.history?.[0]?.min_price ?? -1;
      case "db_avg":     return o.history?.[0]?.avg_price ?? -1;
      case "status":     return ["good","warn","neutral","bad"].indexOf(getStatus(o));
      default:           return 0;
    }
  }

  const filtered = orders.filter(o => {
    if (filter === "all") return true;
    return getStatus(o) === filter;
  });

  const sorted = [...filtered].sort((a, b) => {
    const av = getVal(a, sortKey), bv = getVal(b, sortKey);
    return sortDir === "asc"
      ? (av < bv ? -1 : av > bv ? 1 : 0)
      : (av > bv ? -1 : av < bv ? 1 : 0);
  });

  function SortTh({ label, k }) {
    const active = sortKey === k;
    return (
      <th className={`sortable ${active ? "sorted" : ""}`} onClick={() => toggleSort(k)}>
        {label} {active ? (sortDir === "asc" ? "▲" : "▼") : ""}
      </th>
    );
  }

  return (
    <div>
      <div className="table-filters">
        <span className="filter-label">Filter:</span>
        {["all","good","warn","bad","neutral"].map(f => (
          <button key={f} className={`filter-btn ${f} ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>
            {f === "all" ? "All" : f === "good" ? "✓ Good" : f === "warn" ? "~ Even" : f === "bad" ? "✗ Risk" : "— N/A"}
          </button>
        ))}
        <span className="filter-count">{sorted.length} / {orders.length}</span>
      </div>
      <div className="order-section">
        <table>
          <thead>
            <tr>
              <SortTh label="Item"     k="item_name" />
              <SortTh label="Listed"   k="platinum"  />
              <SortTh label="Qty"      k="quantity"  />
              {showLive && <SortTh label="Mkt Min" k="live_min" />}
              {showLive && <SortTh label="Mkt Avg" k="live_avg" />}
              <SortTh label="DB Min"   k="db_min"    />
              <SortTh label="DB Avg"   k="db_avg"    />
              <SortTh label="Status"   k="status"    />
              <th>Last Saved</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(o => {
              const status  = getStatus(o);
              const latest  = o.history?.[0] ?? null;
              const diff    = o.live ? o.platinum - o.live.min : null;
              return (
                <tr key={o.id} className={`row-${status}`}>
                  <td><span className="item-link" onClick={() => onItemClick(o)}>{o.item_name}</span></td>
                  <td>{o.platinum} pt</td>
                  <td>{o.quantity}</td>
                  {showLive && <td>{o.live ? `${o.live.min} pt` : "/"}</td>}
                  {showLive && <td>{o.live ? `${o.live.avg?.toFixed(1)} pt` : "/"}</td>}
                  <td>{latest ? `${latest.min_price} pt` : "/"}</td>
                  <td>{latest ? `${latest.avg_price} pt` : "/"}</td>
                  <td>
                    <span className={`badge badge-${status}`}>
                      {status === "good"    ? "✓ Good"
                       : status === "warn"  ? "~ Even"
                       : status === "bad"   ? `✗ ${diff !== null ? (diff > 0 ? `+${diff}` : diff) + " pt" : "Risk"}`
                       : "—"}
                    </span>
                  </td>
                  <td className="ts-cell">{latest ? new Date(latest.fetched_at).toLocaleString() : "/"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState("market");

  const [search, setSearch]         = useState("");
  const [items, setItems]           = useState([]);
  const [selected, setSelected]     = useState(null);
  const [snapshot, setSnapshot]     = useState(null);
  const [history, setHistory]       = useState([]);
  const [loadingPrice, setLoadingPrice] = useState(false);

  const [userInput, setUserInput]       = useState("");
  const [userSlug, setUserSlug]         = useState("");
  const [userOrders, setUserOrders]     = useState([]);
  const [loadingUser, setLoadingUser]   = useState(false);
  const [userError, setUserError]       = useState("");
  const [activeSection, setActiveSection] = useState(null);
  const [itemHistories, setItemHistories] = useState({});

  const [favs, setFavs]                 = useState([]);
  const [favInput, setFavInput]         = useState("");
  const [activeFav, setActiveFav]       = useState(null);
  const [favOrders, setFavOrders]       = useState([]);
  const [favSection, setFavSection]     = useState(null);
  const [loadingFav, setLoadingFav]     = useState(false);
  const [refreshing, setRefreshing]     = useState(false);
  const [lastRefresh, setLastRefresh]   = useState(null);

  useEffect(() => {
    const t = setTimeout(() => getItems(search).then(setItems).catch(console.error), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { getFavourites().then(setFavs).catch(console.error); }, []);

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

  async function handleUserSearch() {
    if (!userInput.trim()) return;
    setUserSlug(userInput.trim()); setUserOrders([]); setUserError("");
    setLoadingUser(true); setActiveSection(null); setItemHistories({});
    try {
      const orders = await getUserOrders(userInput.trim());
      setUserOrders(orders);
      if (!orders.length) { setUserError("No orders found for this user."); }
      else {
        const slugs = [...new Set(orders.map(o => o.item_slug).filter(Boolean))];
        const results = {};
        await Promise.all(slugs.map(s => getPriceHistory(s).then(h => { results[s] = h; }).catch(() => { results[s] = []; })));
        setItemHistories(results);
      }
    } catch (e) { setUserError("User not found or API error."); }
    setLoadingUser(false);
  }

  // Attach history to user orders for table reuse
  const enrichedUserOrders = userOrders.map(o => ({
    ...o,
    history: itemHistories[o.item_slug] ?? [],
    live: null, // user tab doesn't fetch live prices
  }));

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
    setActiveFav(slug); setFavOrders([]); setFavSection(null); setLoadingFav(true);
    try { setFavOrders(await getFavouriteOrders(slug)); }
    catch (e) { console.error(e); }
    setLoadingFav(false);
  }

  async function handleManualRefresh() {
    setRefreshing(true);
    try {
      await refreshFavourites(); setLastRefresh(new Date());
      if (activeFav) await handleSelectFav(activeFav);
    } catch (e) { console.error(e); }
    setRefreshing(false);
  }

  const favSells  = favOrders.filter(o => o.order_type === "sell");
  const favBuys   = favOrders.filter(o => o.order_type === "buy");
  const userSells = enrichedUserOrders.filter(o => o.order_type === "sell");
  const userBuys  = enrichedUserOrders.filter(o => o.order_type === "buy");

  return (
    <div className="app">
      <header>
        <h1>WMPersonal</h1>
        <p>Warframe Market Monitor</p>
        <div className="tabs">
          <button className={tab === "market" ? "active" : ""} onClick={() => setTab("market")}>Market Monitor</button>
          <button className={tab === "user"   ? "active" : ""} onClick={() => setTab("user")}>User Orders</button>
          <button className={tab === "favs"   ? "active" : ""} onClick={() => setTab("favs")}>Favourites {favs.length > 0 && `(${favs.length})`}</button>
        </div>
      </header>

      {/* MARKET */}
      {tab === "market" && (
        <div className="layout">
          <aside>
            <input placeholder="Search items..." value={search} onChange={e => setSearch(e.target.value)} />
            <ul>
              {items.map(item => (
                <li key={item.id} className={selected?.id === item.id ? "active" : ""} onClick={() => handleSelect(item)}>
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
                {history.length > 0 && (
                  <>
                    <h3 className="section-label">Snapshot history</h3>
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

      {/* USER */}
      {tab === "user" && (
        <div className="user-page">
          <div className="user-search">
            <input placeholder="Enter warframe.market username..." value={userInput}
              onChange={e => setUserInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleUserSearch()} />
            <button onClick={handleUserSearch}>Search</button>
          </div>
          {loadingUser && <p className="hint">Fetching orders for {userInput}…</p>}
          {userError   && <p className="hint">{userError}</p>}
          {userOrders.length > 0 && (
            <>
              <div className="user-header-row">
                <h2 className="user-title">{userSlug}</h2>
                <button className="fav-add-btn" onClick={() => addFavourite(userSlug).then(() => getFavourites().then(setFavs))}>★ Add to Favourites</button>
              </div>
              <div className="section-toggles">
                <button className={`toggle-btn sell ${activeSection === "sell" ? "active" : ""}`} onClick={() => setActiveSection(p => p === "sell" ? null : "sell")}>Selling ({userSells.length})</button>
                <button className={`toggle-btn buy  ${activeSection === "buy"  ? "active" : ""}`} onClick={() => setActiveSection(p => p === "buy"  ? null : "buy" )}>Buying ({userBuys.length})</button>
              </div>
              {activeSection === "sell" && <OrderTable orders={userSells} onItemClick={jumpToItem} showLive={false} />}
              {activeSection === "buy"  && <OrderTable orders={userBuys}  onItemClick={jumpToItem} showLive={false} />}
              {!activeSection && <p className="hint" style={{marginTop:"24px"}}>Click Selling or Buying to expand.</p>}
            </>
          )}
        </div>
      )}

      {/* FAVOURITES */}
      {tab === "favs" && (
        <div className="user-page">
          <div className="fav-toolbar">
            <div className="user-search" style={{flex:1}}>
              <input placeholder="Add username to favourites..." value={favInput}
                onChange={e => setFavInput(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAddFav()} />
              <button onClick={handleAddFav}>Add</button>
            </div>
            <button className="refresh-btn" onClick={handleManualRefresh} disabled={refreshing}>
              {refreshing ? "Refreshing…" : "↻ Refresh All"}
            </button>
          </div>
          {lastRefresh && <p className="hint" style={{marginBottom:"12px"}}>Last refreshed: {lastRefresh.toLocaleTimeString()}</p>}
          {favs.length === 0 && <p className="hint">No favourite users yet. Add one above.</p>}
          <div className="fav-list">
            {favs.map(f => (
              <div key={f.slug} className={`fav-item ${activeFav === f.slug ? "active" : ""}`}>
                <span className="fav-name" onClick={() => handleSelectFav(f.slug)}>{f.slug}</span>
                <button className="fav-remove" onClick={() => handleRemoveFav(f.slug)}>✕</button>
              </div>
            ))}
          </div>
          {loadingFav && <p className="hint" style={{marginTop:"24px"}}>Fetching orders and live prices — this may take a moment…</p>}
          {activeFav && !loadingFav && favOrders.length > 0 && (
            <>
              <h2 className="user-title" style={{marginTop:"24px"}}>{activeFav}</h2>
              <div className="section-toggles">
                <button className={`toggle-btn sell ${favSection === "sell" ? "active" : ""}`} onClick={() => setFavSection(p => p === "sell" ? null : "sell")}>Selling ({favSells.length})</button>
                <button className={`toggle-btn buy  ${favSection === "buy"  ? "active" : ""}`} onClick={() => setFavSection(p => p === "buy"  ? null : "buy" )}>Buying ({favBuys.length})</button>
              </div>
              {favSection === "sell" && <OrderTable orders={favSells} onItemClick={jumpToItem} showLive={true} />}
              {favSection === "buy"  && <OrderTable orders={favBuys}  onItemClick={jumpToItem} showLive={true} />}
              {!favSection && <p className="hint" style={{marginTop:"24px"}}>Click Selling or Buying to expand.</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}