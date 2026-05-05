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


}