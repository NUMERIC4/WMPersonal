import { useState, useEffect } from "react";
import { getItems, fetchPrice, getPriceHistory, getUserOrders } from "./api";
import "./App.css";

export default function App() {
  const [tab, setTab]               = useState("market");   // "market" | "user"

  // Market tab state
  const [search, setSearch]         = useState("");
  const [items, setItems]           = useState([]);
  const [selected, setSelected]     = useState(null);
  const [snapshot, setSnapshot]     = useState(null);
  const [history, setHistory]       = useState([]);
  const [loadingPrice, setLoadingPrice] = useState(false);

  // User tab state
  const [userSlug, setUserSlug]     = useState("");
  const [userInput, setUserInput]   = useState("");
  const [userOrders, setUserOrders] = useState([]);
  const [loadingUser, setLoadingUser] = useState(false);
  const [userError, setUserError]   = useState("");

  // Load items on search
  useEffect(() => {
    const t = setTimeout(() => {
      getItems(search).then(setItems).catch(console.error);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  async function handleSelect(item) {
    setSelected(item);
    setSnapshot(null);
    setHistory([]);
    setLoadingPrice(true);
    try {
      const [snap, hist] = await Promise.all([
        fetchPrice(item.url_name),
        getPriceHistory(item.url_name),
      ]);
      setSnapshot(snap.snapshot);
      setHistory(hist);
    } catch (e) {
      console.error(e);
    }
    setLoadingPrice(false);
  }

  async function handleUserSearch() {
    if (!userInput.trim()) return;
    setUserSlug(userInput.trim());
    setUserOrders([]);
    setUserError("");
    setLoadingUser(true);
    try {
      const orders = await getUserOrders(userInput.trim());
      setUserOrders(orders);
      if (orders.length === 0) setUserError("No orders found for this user.");
    } catch (e) {
      setUserError("User not found or API error.");
    }
    setLoadingUser(false);
  }

  const sells = userOrders.filter(o => o.order_type === "sell");
  const buys  = userOrders.filter(o => o.order_type === "buy");

  return (
    <div className="app">
      <header>
        <h1>WMPersonal</h1>
        <p>Warframe Market Monitor</p>
        <div className="tabs">
          <button className={tab === "market" ? "active" : ""} onClick={() => setTab("market")}>Market Monitor</button>
          <button className={tab === "user"   ? "active" : ""} onClick={() => setTab("user")}>User Orders</button>
        </div>
      </header>

      {/* ── MARKET TAB ── */}
      {tab === "market" && (
        <div className="layout">
          <aside>
            <input
              placeholder="Search items..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <ul>
              {items.map(item => (
                <li
                  key={item.id}
                  className={selected?.id === item.id ? "active" : ""}
                  onClick={() => handleSelect(item)}
                >
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
                    <h3 style={{margin:"16px 0 8px", color:"#888", fontSize:"0.85rem"}}>Snapshot history</h3>
                    <table>
                      <thead>
                        <tr><th>Time</th><th>Min</th><th>Avg</th><th>Max</th><th>Vol</th></tr>
                      </thead>
                      <tbody>
                        {history.map(h => (
                          <tr key={h.id}>
                            <td>{new Date(h.fetched_at).toLocaleTimeString()}</td>
                            <td>{h.min_price}</td>
                            <td>{h.avg_price}</td>
                            <td>{h.max_price}</td>
                            <td>{h.volume}</td>
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

      {/* ── USER TAB ── */}
      {tab === "user" && (
        <div className="user-page">
          <div className="user-search">
            <input
              placeholder="Enter warframe.market username..."
              value={userInput}
              onChange={e => setUserInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleUserSearch()}
            />
            <button onClick={handleUserSearch}>Search</button>
          </div>

          {loadingUser && <p className="hint">Fetching orders for {userInput}…</p>}
          {userError  && <p className="hint">{userError}</p>}

          {userOrders.length > 0 && (
            <>
              <h2 style={{color:"#c8a96e", marginBottom:"16px"}}>{userSlug}</h2>
              <div className="order-columns">
                <div>
                  <h3 className="col-title sell">Selling ({sells.length})</h3>
                  <table>
                    <thead><tr><th>Item</th><th>Price</th><th>Qty</th></tr></thead>
                    <tbody>
                      {sells.map(o => (
                        <tr key={o.id}>
                          <td>{o.item_name}</td>
                          <td>{o.platinum} pt</td>
                          <td>{o.quantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div>
                  <h3 className="col-title buy">Buying ({buys.length})</h3>
                  <table>
                    <thead><tr><th>Item</th><th>Price</th><th>Qty</th></tr></thead>
                    <tbody>
                      {buys.map(o => (
                        <tr key={o.id}>
                          <td>{o.item_name}</td>
                          <td>{o.platinum} pt</td>
                          <td>{o.quantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}