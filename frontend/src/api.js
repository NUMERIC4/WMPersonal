import axios from "axios";

const BASE = "http://localhost:3001/api";

export const getItems = (search = "") =>
  axios.get(`${BASE}/items`, { params: { search } }).then(r => r.data);

export const fetchPrice = (url_name) =>
  axios.post(`${BASE}/prices/fetch`, { url_name }).then(r => r.data);

export const getPriceHistory = (url_name) =>
  axios.get(`${BASE}/prices/${url_name}`).then(r => r.data);

export const getUserOrders = (slug) =>
  axios.get(`${BASE}/users/${slug}/orders`).then(r => r.data);

export const getFavourites = () =>
  axios.get(`${BASE}/favourites`).then(r => r.data);

export const addFavourite = (slug) =>
  axios.post(`${BASE}/favourites`, { slug }).then(r => r.data);

export const removeFavourite = (slug) =>
  axios.delete(`${BASE}/favourites/${slug}`).then(r => r.data);

export const getFavouriteOrders = (slug) =>
  axios.get(`${BASE}/favourites/${slug}/orders`).then(r => r.data);

export const refreshFavourites = () =>
  axios.post(`${BASE}/favourites/refresh`).then(r => r.data);

export const getStats = (url_name, period = "48h", rank = null) =>
  axios.get(`${BASE}/stats/${url_name}`, { params: { period, rank } }).then(r => r.data);
/*
export const getStatsSummary = (url_name) =>
  axios.get(`${BASE}/stats/${url_name}/summary`).then(r => r.data);

export const getScannerGroups = () =>
  axios.get(`${BASE}/scanner/groups`).then(r => r.data);

export const cancelScan = () =>
  axios.post(`${BASE}/scanner/cancel`).then(r => r.data);

import axios from "axios";

const BASE = "http://localhost:3001/api";

// ── Existing (unchanged) ──────────────────────────────────────────────────────
export const getItems = (search = "") =>
  axios.get(`${BASE}/items`, { params: { search } }).then(r => r.data);

export const fetchPrice = (url_name) =>
  axios.post(`${BASE}/prices/fetch`, { url_name }).then(r => r.data);

export const getPriceHistory = (url_name) =>
  axios.get(`${BASE}/prices/${url_name}`).then(r => r.data);

export const getUserOrders = (slug) =>
  axios.get(`${BASE}/users/${slug}/orders`).then(r => r.data);

export const getFavourites = () =>
  axios.get(`${BASE}/favourites`).then(r => r.data);

export const addFavourite = (slug) =>
  axios.post(`${BASE}/favourites`, { slug }).then(r => r.data);

export const removeFavourite = (slug) =>
  axios.delete(`${BASE}/favourites/${slug}`).then(r => r.data);

export const getFavouriteOrders = (slug) =>
  axios.get(`${BASE}/favourites/${slug}/orders`).then(r => r.data);

export const refreshFavourites = () =>
  axios.post(`${BASE}/favourites/refresh`).then(r => r.data);
*/
// ── Statistics ────────────────────────────────────────────────────────────────

// Full per-rank summary + online/offline orders
// GET /api/stats/:url_name/summary
export const getStatsSummary = (url_name) =>
  axios.get(`${BASE}/stats/${url_name}/summary`).then(r => r.data);

// Raw time-series rows for charting
// GET /api/stats/:url_name?period=48h&rank=5
export const getStatsRows = (url_name, period = "48h", rank = null) =>
  axios.get(`${BASE}/stats/${url_name}`, {
    params: { period, ...(rank !== null ? { rank } : {}) },
  }).then(r => r.data);

// ── Scanner ───────────────────────────────────────────────────────────────────

// GET /api/scanner/groups → { auto: { "Arcanes": 42, … }, manual: [{id,name,item_count}] }
export const getScannerGroups = () =>
  axios.get(`${BASE}/scanner/groups`).then(r => r.data);

// POST /api/scanner/cancel?group=X
export const cancelScan = (groupName) =>
  axios.post(`${BASE}/scanner/cancel`, null, { params: { group: groupName } }).then(r => r.data);

// ── Profit analyzer ───────────────────────────────────────────────────────────

// GET /api/profit?mode=all&min_margin=15&min_volume=0
export const getProfit = (params = {}) =>
  axios.get(`${BASE}/profit`, { params }).then(r => r.data);

// ── Timing analyzer ───────────────────────────────────────────────────────────

// GET /api/timing/:url_name?period=90d&minPlat=0&maxPlat=9999
// Returns { rows: [...item_statistics rows...] }
export const getTimingStats = (url_name, params = {}) =>
  axios.get(`${BASE}/timing/${url_name}`, { params }).then(r => r.data);