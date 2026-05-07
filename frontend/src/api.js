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