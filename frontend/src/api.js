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