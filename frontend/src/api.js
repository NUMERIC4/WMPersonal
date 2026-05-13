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

export const getScannerGroups = () =>
  axios.get(`${BASE}/scanner/groups`).then(r => r.data);

export const cancelScan = () =>
  axios.post(`${BASE}/scanner/cancel`).then(r => r.data);

export const getTimeAnalysis = (url_name, rank = null) =>
  axios.get(`${BASE}/timeanalysis/${url_name}`, { params: { rank } }).then(r => r.data);

export const getCustomGroups = () =>
  axios.get(`${BASE}/customgroups`).then(r => r.data);

export const createCustomGroup = (name) =>
  axios.post(`${BASE}/customgroups`, { name }).then(r => r.data);

export const deleteCustomGroup = (id) =>
  axios.delete(`${BASE}/customgroups/${id}`).then(r => r.data);

export const renameCustomGroup = (id, name) =>
  axios.patch(`${BASE}/customgroups/${id}`, { name }).then(r => r.data);

export const addItemToGroup = (id, url_name) =>
  axios.post(`${BASE}/customgroups/${id}/items`, { url_name }).then(r => r.data);

export const removeItemFromGroup = (id, url_name) =>
  axios.delete(`${BASE}/customgroups/${id}/items/${url_name}`).then(r => r.data);

export const getNpcGroups = () =>
  axios.get(`${BASE}/customgroups/npc`).then(r => r.data);