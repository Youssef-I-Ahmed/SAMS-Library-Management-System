import { useEffect, useState } from 'react';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api/v1';
export default function App(){
 const [status,setStatus]=useState('Checking API...');
 useEffect(()=>{fetch(`${API_URL}/health`).then(r=>r.json()).then(d=>setStatus(`API: ${d.status}`)).catch(()=>setStatus('API: unavailable'));},[]);
 return <main className="page"><section className="card"><p className="eyebrow">SAMS Library System</p><h1>Sprint 0 Foundation</h1><p>React → Express → PostgreSQL + Prisma</p><div className="status">{status}</div></section></main>;
}
