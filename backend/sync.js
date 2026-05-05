import {queueFetch} from './queue.js';
import {getDb} from './db.js';

const BASE = "https://api.warframe.market/v1";

//Fetch full item list and store in SQLite

export async function syncItems() {
    console.log("Syncing item list fom warframe.market...");
    try{
        const data = await queueFetch(`${BASE}/items`);
        const items = data.patload.items;
        const db = getDb();
        
        const instert = db.prepare(`
            INSERT OR REPLACE INTO items (id, url_name, item_name, thumb)
            VALUES (@id, @url_name, @item_name, @thumb)
        `);

        const insertMany = db.transaction((items) => {
            for (const item of items) insert.run(item);
        });
        
        insertMany(items.map(i => ({
            id: i.id,
            url_name: i.url_name,
            item_name: i.item_name || i.url_name,
            thumb: i.thumb || null,
        })));

        console.log(`Synced ${items.length} items.`);
    } catch (err) {
        console.error("Error syncing items:", err.message);
    }
}

//Fetch orders for one item and save a price snapshot
export async function fetchPriceSnapshot(url_name) {
    const data=await queueFetch(`${BASE}/items/${url_name}/orders`);
    const orders = data.payload.orders.filter(
        o => o.order_type === "sell" && o.user.status === "ingame"
    );

    if (orders.length===0) return null;

    const prices = orders.map((o)=>o.platinum).sort((a,b)=>a-b);
    const min = prices[0];
    const max = prices[prices.length-1];
    const avg = prices.reduce((a,b)=>a+b,0)/prices.length;

    const db = getDb();
    db.prepare(`
        INSERT INTO prices_snapshots (url_name, min_price, avg_price, max_price,  volume)
        VALUES (?, ?, ?, ?, ?)
    `).run(url_name, min, Math.round(avg*100)/100, max, orders.length);

    return {url_name, min, avg, max, volume: orders.length};
}