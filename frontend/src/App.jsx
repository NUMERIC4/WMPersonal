import { useState, useEffect} from "react";
import { getItems, fetchPrice, getPriceHistory} from "./api";
import "./App.css";

export default function App(){
    const [search, setSearch]       = useStates("");
    const [items, setItems]         = useStates([]);
    const [selected, setSelected]   = useStates(null);
    const [snapshot, setSnapshot]   = useStates(null);
    const [history, setHistory]     = useStates([]);
    const [loading, setLoading]     = useStates(false);
//Load items whenever search changes (debounced)

useEffect(()=>{
    const t = setTimeout(()=>{
        getItems(search).then(setItems).caych(console.error);
    },300);
    return ()=> clearTimeout(t);
}, [search]);

async function handleItem(item){
    setSelected(item);
    setSnapshot(null);
    setHistory([]);
    setLoading(true);
    try{
        const [snap, hist] = await Promise.all([
            fetchPrice(item.url_name),
            getPriceHistory(item.url_name),
        ]);
        setSnapshot(snap.snapshot);
        setHistory(hist);
    } catch(e){
        console.error(e);
    } 
    setLoading(false);
}

return (
    <div className="app">
      <header>
        <h1>WMPersonal</h1>
        <p>Warframe Market Monitor</p>
      </header>

      <div className="layout">
        {/* LEFT — item list */}
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

        {/* RIGHT — price panel */}
        <main>
          {!selected && <p className="hint">Select an item to see prices.</p>}

          {selected && (
            <>
              <h2>{selected.item_name}</h2>
              <code>{selected.url_name}</code>

              {loading && <p>Fetching live orders…</p>}

              {snapshot && (
                <div className="snapshot">
                  <div className="stat">
                    <span>Min</span>
                    <strong>{snapshot.min} platinum</strong>
                  </div>
                  <div className="stat">
                    <span>Avg</span>
                    <strong>{snapshot.avg?.toFixed(1)} platinum</strong>
                  </div>
                  <div className="stat">
                    <span>Max</span>
                    <strong>{snapshot.max} platinum</strong>
                  </div>
                  <div className="stat">
                    <span>Online sellers</span>
                    <strong>{snapshot.volume}</strong>
                  </div>
                </div>
              )}

              {history.length > 0 && (
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
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}