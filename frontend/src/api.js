import axios from "axios";

const BASE = "http://localhost:3001/api";

export const getItem = (search = "") =>
    axios.get(`${BASE}/items`, { params: {search}}).then(r=>r.data);
export const fetchPrice = (url_name) =>
    axios.get(`${BASE}/prices/fetch`,  {url_name}).then(r=>r.data);
export const getPriceHistory = (url_name) =>
    axios.get(`${BASE}/prices/${url_name}`).then(r=>r.data);