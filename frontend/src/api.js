import axios from "axios";

export const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:3001/api";

export const getItems = (search = "") =>
  axios.get(`${API_BASE}/items`, { params: { search } }).then(r => r.data);

export const syncMarketItems = () =>
  axios.post(`${API_BASE}/items/sync`).then(r => r.data);

export const fetchPrice = (url_name) =>
  axios.post(`${API_BASE}/prices/fetch`, { url_name }).then(r => r.data);

export const getPriceHistory = (url_name) =>
  axios.get(`${API_BASE}/prices/${url_name}`).then(r => r.data);

export const getUserOrders = (slug) =>
  axios.get(`${API_BASE}/users/${slug}/orders`).then(r => r.data);

export const getFavourites = () =>
  axios.get(`${API_BASE}/favourites`).then(r => r.data);

export const addFavourite = (slug) =>
  axios.post(`${API_BASE}/favourites`, { slug }).then(r => r.data);

export const removeFavourite = (slug) =>
  axios.delete(`${API_BASE}/favourites/${slug}`).then(r => r.data);

export const getFavouriteOrders = (slug) =>
  axios.get(`${API_BASE}/favourites/${slug}/orders`).then(r => r.data);

export const refreshFavourites = () =>
  axios.post(`${API_BASE}/favourites/refresh`).then(r => r.data);

export const getStats = (url_name, period = "48h", rank = null) =>
  axios.get(`${API_BASE}/stats/${url_name}`, { params: { period, rank } }).then(r => r.data);

export const getScannerGroups = () =>
  axios.get(`${API_BASE}/scanner/groups`).then(r => r.data);

export const getScannerItems = (group) =>
  axios.get(`${API_BASE}/scanner/items`, { params: { group } }).then(r => r.data);

export const cancelScan = () =>
  axios.post(`${API_BASE}/scanner/cancel`).then(r => r.data);

export const cancelProfit = () =>
  axios.post(`${API_BASE}/profit/cancel`).then(r => r.data);

export const cancelTimeAnalysis = () =>
  axios.post(`${API_BASE}/timeanalysis/cancel`).then(r => r.data);

export const getTimeAnalysis = (url_name, rank = null) =>
  axios.get(`${API_BASE}/timeanalysis/${url_name}`, { params: { rank } }).then(r => r.data);

export const getCustomGroups = () =>
  axios.get(`${API_BASE}/customgroups`).then(r => r.data);

export const createCustomGroup = (name) =>
  axios.post(`${API_BASE}/customgroups`, { name }).then(r => r.data);

export const deleteCustomGroup = (id) =>
  axios.delete(`${API_BASE}/customgroups/${id}`).then(r => r.data);

export const renameCustomGroup = (id, name) =>
  axios.patch(`${API_BASE}/customgroups/${id}`, { name }).then(r => r.data);

export const addItemToGroup = (id, url_name) =>
  axios.post(`${API_BASE}/customgroups/${id}/items`, { url_name }).then(r => r.data);

export const removeItemFromGroup = (id, url_name) =>
  axios.delete(`${API_BASE}/customgroups/${id}/items/${url_name}`).then(r => r.data);

export const getNpcGroups = () =>
  axios.get(`${API_BASE}/customgroups/npc`).then(r => r.data);
