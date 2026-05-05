import express from 'express';
import cors from 'cors';
import { initDb } from './db.js';
import { syncItems } from './sync.js';
import itemsRouter from './routes/items.js';
import pricesRouter from './routes/prices.js';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

//Routes
app.use('/api/items', itemsRouter);
app.use('/api/prices', pricesRouter);

//Health check
app.get("/api/health", (req,res)=>res.json({status:"ok"}));

//Start
initDb();
syncItems(); //fetch store full item list from WF.market on startup

app.listen(PORT, ()=>{
    console.log(`WMPersonal backend running on http://localhost:${PORT}`);
});