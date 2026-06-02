import React, { useState } from "react";


const BEACH_ITEMS = [
  { id: 1, name: "Coca-Cola", price: 8, emoji: "🥤", category: "Bebida" },
  { id: 2, name: "Água", price: 3, emoji: "💧", category: "Bebida" },
  { id: 3, name: "Guaraná", price: 6, emoji: "🥤", category: "Bebida" },
  { id: 4, name: "Cerveja", price: 7, emoji: "🍺", category: "Bebida" },
  { id: 5, name: "Suco", price: 8, emoji: "🧃", category: "Bebida" },
  { id: 6, name: "Porção de Fritas", price: 18, emoji: "🍟", category: "Porção" },
  { id: 7, name: "Porção de Batata Frita", price: 70, emoji: "🥔", category: "Porção" },
  { id: 8, name: "Espetinho", price: 10, emoji: "🍢", category: "Porção" },
  { id: 9, name: "Milho", price: 8, emoji: "🌽", category: "Porção" },
  { id: 10, name: "Queijo Coalho", price: 8, emoji: "🧀", category: "Porção" },
  { id: 11, name: "Picolé", price: 5, emoji: "🍦", category: "Sobremesa" },
  { id: 12, name: "Açaí P", price: 12, emoji: "🫐", category: "Sobremesa" },
  { id: 13, name: "Açaí G", price: 18, emoji: "🫐", category: "Sobremesa" },
];

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

const ESC = 0x1b, GS = 0x1d;
function esc(...b) { return new Uint8Array([ESC, ...b]); }
function gs(...b)  { return new Uint8Array([GS,  ...b]); }
function txt(s)    { return new TextEncoder().encode(s); }
function concat(...arrays) {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) { out.set(a, off); off += a.length; }
  return out;
}

async function printViaBluetooth(content) {
  if (!navigator.bluetooth) throw new Error("Web Bluetooth não suportado neste navegador.");
  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: ["000018f0-0000-1000-8000-00805f9b34fb", "e7810a71-73ae-499d-8c15-faa9aef0c3f2", "49535343-fe7d-4ae5-8fa9-9fafd205e455"],
  });
  const server = await device.gatt.connect();
  let char = null;
  for (const svcUUID of ["000018f0-0000-1000-8000-00805f9b34fb","e7810a71-73ae-499d-8c15-faa9aef0c3f2","49535343-fe7d-4ae5-8fa9-9fafd205e455"]) {
    try {
      const svc = await server.getPrimaryService(svcUUID);
      const chars = await svc.getCharacteristics();
      char = chars.find(c => c.properties.write || c.properties.writeWithoutResponse);
      if (char) break;
    } catch {}
  }
  if (!char) throw new Error("Característica de escrita não encontrada na impressora.");
  const CHUNK = 512;
  for (let i = 0; i < content.length; i += CHUNK) {
    const slice = content.slice(i, i + CHUNK);
    if (char.properties.writeWithoutResponse) await char.writeValueWithoutResponse(slice);
    else await char.writeValue(slice);
    await new Promise(r => setTimeout(r, 60));
  }
  await device.gatt.disconnect();
}

function buildOrderReceipt(tableName, order, orderIndex) {
  const line   = "--------------------------------\n";
  const dline  = "================================\n";
  const pad    = (l, r, w=32) => { const sp = w - l.length - r.length; return l + " ".repeat(Math.max(1,sp)) + r + "\n"; };
  const center = (s, w=32)    => { const sp = Math.max(0, Math.floor((w-s.length)/2)); return " ".repeat(sp)+s+"\n"; };
  const date = new Date(order.createdAt);
  const dateStr = date.toLocaleDateString("pt-BR") + " " + date.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
  let data = concat(
    esc(0x40), esc(0x61,0x01), gs(0x21,0x11),
    txt("Nosso Quintal\n"),
    gs(0x21,0x00),
    txt(center("Pedido #"+(orderIndex+1))),
    txt(line), esc(0x61,0x00),
    txt("Mesa : "+tableName+"\n"),
    txt("Data  : "+dateStr+"\n"),
    txt(dline),
  );
  for (const it of order.items) {
    data = concat(data, txt(it.name+"\n"), txt(pad("  "+it.qty+"x R$"+it.price.toFixed(2), "R$"+(it.qty*it.price).toFixed(2))));
  }
  const subtotal = order.items.reduce((s,i)=>s+i.price*i.qty,0);
  data = concat(data,
    txt(dline), txt(pad("SUBTOTAL","R$"+subtotal.toFixed(2))), txt(line),
    esc(0x61,0x01), txt("Obrigado pela preferencia!\n"), txt("Bom apetite! 🌴\n"),
    txt("\n\n\n"), gs(0x56,0x41,0x10),
  );
  return data;
}

function buildTableReceipt(table) {
  const line   = "--------------------------------\n";
  const dline  = "================================\n";
  const pad    = (l, r, w=32) => { const sp = w - l.length - r.length; return l + " ".repeat(Math.max(1,sp)) + r + "\n"; };
  const center = (s, w=32)    => { const sp = Math.max(0, Math.floor((w-s.length)/2)); return " ".repeat(sp)+s+"\n"; };
  const now = new Date();
  const dateStr = now.toLocaleDateString("pt-BR") + " " + now.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
  let data = concat(
    esc(0x40), esc(0x61,0x01), gs(0x21,0x11),
    txt("Nosso Quintal\n"),
    gs(0x21,0x00), txt(center("CONTA DA MESA")), txt(line), esc(0x61,0x00),
    txt("Mesa  : "+table.name+"\n"), txt("Data  : "+dateStr+"\n"), txt(dline),
  );
  table.orders.forEach((order, oi) => {
    data = concat(data, txt("-- Pedido #"+(oi+1)+" --\n"));
    for (const it of order.items) {
      data = concat(data, txt(it.name+"\n"), txt(pad("  "+it.qty+"x R$"+it.price.toFixed(2),"R$"+(it.qty*it.price).toFixed(2))));
    }
  });
  const total = table.orders.reduce((s,o)=>s+o.items.reduce((ss,i)=>ss+i.price*i.qty,0),0);
  data = concat(data,
    txt(dline), txt(pad("TOTAL","R$"+total.toFixed(2))), txt(line),
    esc(0x61,0x01), txt("Obrigado pela preferencia!\n"), txt("Nos vemos na proxima! 🌴\n"),
    txt("\n\n\n"), gs(0x56,0x41,0x10),
  );
  return data;
}

function PrintButton({ label, buildData, small }) {
  const [status, setStatus] = useState("idle");
  const [errMsg, setErrMsg] = useState("");
  const handle = async () => {
    setStatus("printing"); setErrMsg("");
    try {
      await printViaBluetooth(buildData());
      setStatus("ok");
      setTimeout(() => setStatus("idle"), 3000);
    } catch(e) {
      setErrMsg(e.message); setStatus("err");
      setTimeout(() => setStatus("idle"), 4000);
    }
  };
  const colors = { idle:"#1d4ed8", printing:"#475569", ok:"#15803d", err:"#b91c1c" };
  const labels = { idle:label, printing:"⏳ Conectando...", ok:"✓ Impresso!", err:"✗ Erro" };
  return (
    <div>
      <button onClick={handle} disabled={status==="printing"} style={{
        background:colors[status], border:"none", color:"#fff",
        padding:small?"5px 12px":"8px 16px", borderRadius:8, fontWeight:800,
        fontSize:small?12:13, cursor:status==="printing"?"not-allowed":"pointer",
        fontFamily:"inherit", display:"flex", alignItems:"center", gap:5,
      }}>
        🖨️ {labels[status]}
      </button>
      {status==="err" && <div style={{fontSize:11,color:"#fca5a5",marginTop:4,maxWidth:200}}>{errMsg}</div>}
    </div>
  );
}

export default function App() {
  const [tables, setTables] = useState([]);
  const [activeTab, setActiveTab] = useState("tables");
  const [selectedTable, setSelectedTable] = useState(null);
  const [cart, setCart] = useState([]);
  const [newTableName, setNewTableName] = useState("");
  const [showNewTable, setShowNewTable] = useState(false);
  const [filterCategory, setFilterCategory] = useState("Todos");
  const [confirmClose, setConfirmClose] = useState(null);

  const categories = ["Todos", ...new Set(BEACH_ITEMS.map(i => i.category))];
  const openTable = (table) => { setSelectedTable(table); setCart([]); setActiveTab("order"); };

  const createTable = () => {
    const name = newTableName.trim() || `Mesa ${tables.length+1}`;
    const t = { id:generateId(), name, openedAt:new Date(), orders:[], status:"open" };
    setTables(p=>[...p,t]); setNewTableName(""); setShowNewTable(false); openTable(t);
  };

  const addToCart = (item) => setCart(p => {
    const ex = p.find(c=>c.itemId===item.id);
    if (ex) return p.map(c=>c.itemId===item.id?{...c,qty:c.qty+1}:c);
    return [...p,{id:generateId(),itemId:item.id,name:item.name,emoji:item.emoji,price:item.price,qty:1,delivered:0}];
  });

  const removeFromCart = (itemId) => setCart(p =>
    p.map(c=>c.itemId===itemId?{...c,qty:Math.max(0,c.qty-1)}:c).filter(c=>c.qty>0)
  );

  const sendOrder = () => {
    if (!cart.length) return;
    const newOrder = { id:generateId(), items:cart.map(c=>({...c,delivered:0})), createdAt:new Date() };
    const upd = t => t.id===selectedTable.id?{...t,orders:[...t.orders,newOrder]}:t;
    setTables(p=>p.map(upd));
    setSelectedTable(p=>({...p,orders:[...(p.orders||[]),newOrder]}));
    setCart([]);
  };

  const markDelivered = (tableId, orderId, itemId) => {
    const upd = t => {
      if (t.id!==tableId) return t;
      return {...t, orders:t.orders.map(o=>o.id!==orderId?o:{...o,items:o.items.map(it=>it.id===itemId?{...it,delivered:Math.min(it.delivered+1,it.qty)}:it)})};
    };
    setTables(p=>p.map(upd));
    if (selectedTable?.id===tableId) setSelectedTable(p=>upd(p));
  };

  const closeTable = (tableId) => {
    setTables(p=>p.map(t=>t.id===tableId?{...t,status:"closed",closedAt:new Date()}:t));
    setConfirmClose(null);
    if (selectedTable?.id===tableId) { setSelectedTable(null); setActiveTab("tables"); }
  };

  const allPendingItems = tables.filter(t=>t.status==="open").flatMap(t=>
    t.orders.flatMap(o=>o.items.filter(it=>it.delivered<it.qty).map(it=>({...it,tableName:t.name,tableId:t.id,orderId:o.id,pending:it.qty-it.delivered})))
  );

  const openTables = tables.filter(t=>t.status==="open");
  const closedTables = tables.filter(t=>t.status==="closed");
  const tableTotal = t => t.orders.reduce((s,o)=>s+o.items.reduce((ss,i)=>ss+i.price*i.qty,0),0);
  const tablePendingCount = t => t.orders.reduce((s,o)=>s+o.items.reduce((ss,i)=>ss+Math.max(0,i.qty-i.delivered),0),0);
  const filteredItems = filterCategory==="Todos"?BEACH_ITEMS:BEACH_ITEMS.filter(i=>i.category===filterCategory);
  const cartTotal = cart.reduce((s,c)=>s+c.price*c.qty,0);
  const cartCount = cart.reduce((s,c)=>s+c.qty,0);
  const fmt = d => new Date(d).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});

  const S = {
    app:  { fontFamily:"'Nunito',sans-serif", minHeight:"100vh", background:"#0f172a", color:"#f1f5f9" },
    hdr:  { background:"linear-gradient(135deg,#1e3a5f,#0f2744)", padding:"16px 20px", display:"flex", alignItems:"center", justifyContent:"space-between", boxShadow:"0 4px 20px rgba(30,58,95,.6)", position:"sticky", top:0, zIndex:100 },
    nav:  { position:"fixed", bottom:0, left:0, right:0, background:"#1e293b", display:"flex", borderTop:"1px solid #334155", zIndex:100 },
    page: { padding:"20px 16px", paddingBottom:80 },
    card: (border) => ({ background:"#1e293b", borderRadius:16, padding:16, border:`2px solid ${border}`, cursor:"pointer" }),
    btn:  (bg) => ({ background:bg, border:"none", color:"#fff", padding:"10px 18px", borderRadius:12, fontWeight:800, fontSize:14, cursor:"pointer", fontFamily:"inherit" }),
    modal:{ position:"fixed", inset:0, background:"rgba(0,0,0,.7)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200 },
    mbox: { background:"#1e293b", borderRadius:20, padding:28, width:"85%", maxWidth:360 },
  };

  return (
    <div style={S.app}>
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&display=swap" rel="stylesheet"/>

      <header style={S.hdr}>
        <div>
          <div style={{fontSize:22,fontWeight:900}}>🌴 Nosso Quintal</div>
          <div style={{fontSize:12,opacity:.85,fontWeight:600}}>{openTables.length} mesa{openTables.length!==1?"s":""} abertas • {allPendingItems.length} itens pendentes</div>
        </div>
        {activeTab==="order" && selectedTable && (
          <button onClick={()=>{setActiveTab("tables");setSelectedTable(null);setCart([]);}} style={{background:"rgba(0,0,0,.2)",border:"none",color:"#fff",padding:"8px 14px",borderRadius:10,fontWeight:800,fontSize:14,cursor:"pointer"}}>← Voltar</button>
        )}
      </header>

      {activeTab!=="order" && (
        <nav style={S.nav}>
          {[{key:"tables",label:"Mesas",emoji:"🪑"},{key:"pending",label:`Pendentes${allPendingItems.length>0?` (${allPendingItems.length})`:""}`,emoji:"⏳"}].map(tab=>(
            <button key={tab.key} onClick={()=>setActiveTab(tab.key)} style={{flex:1,padding:"12px 8px",background:"transparent",border:"none",color:activeTab===tab.key?"#3b82f6":"#64748b",fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit",borderTop:activeTab===tab.key?"3px solid #3b82f6":"3px solid transparent",display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
              <span style={{fontSize:20}}>{tab.emoji}</span>{tab.label}
            </button>
          ))}
        </nav>
      )}

      {/* MESAS */}
      {activeTab==="tables" && (
        <div style={S.page}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
            <h2 style={{margin:0,fontSize:20,fontWeight:900}}>Mesas Abertas</h2>
            <button onClick={()=>setShowNewTable(true)} style={{...S.btn("linear-gradient(135deg,#3b82f6,#1e3a5f)"),boxShadow:"0 4px 12px rgba(59,130,246,.4)"}}>+ Nova Mesa</button>
          </div>

          {showNewTable && (
            <div style={S.modal}>
              <div style={S.mbox}>
                <div style={{fontSize:18,fontWeight:900,marginBottom:16}}>🆕 Abrir Nova Mesa</div>
                <input autoFocus value={newTableName} onChange={e=>setNewTableName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&createTable()} placeholder={`Mesa ${tables.length+1}`}
                  style={{width:"100%",padding:"12px 14px",borderRadius:10,background:"#0f172a",border:"2px solid #334155",color:"#f1f5f9",fontSize:16,fontFamily:"inherit",fontWeight:700,boxSizing:"border-box",marginBottom:16}}/>
                <div style={{display:"flex",gap:10}}>
                  <button onClick={()=>setShowNewTable(false)} style={{flex:1,padding:12,borderRadius:10,background:"#334155",border:"none",color:"#94a3b8",fontWeight:800,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>Cancelar</button>
                  <button onClick={createTable} style={{flex:2,padding:12,borderRadius:10,background:"linear-gradient(135deg,#3b82f6,#1e3a5f)",border:"none",color:"#fff",fontWeight:800,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>Abrir Mesa ✓</button>
                </div>
              </div>
            </div>
          )}

          {openTables.length===0 && (
            <div style={{textAlign:"center",padding:"60px 20px",color:"#475569"}}>
              <div style={{fontSize:56,marginBottom:12}}>🏝️</div>
              <div style={{fontWeight:800,fontSize:18}}>Nenhuma mesa aberta</div>
              <div style={{fontSize:14,marginTop:6}}>Toque em "+ Nova Mesa" para começar</div>
            </div>
          )}

          <div style={{display:"grid",gap:12}}>
            {openTables.map(table=>{
              const pending=tablePendingCount(table), total=tableTotal(table);
              return (
                <div key={table.id} style={S.card(pending>0?"#3b82f6":"#22c55e")} onClick={()=>openTable(table)}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                    <div>
                      <div style={{fontWeight:900,fontSize:18}}>{table.name}</div>
                      <div style={{fontSize:12,color:"#64748b",marginTop:2}}>Aberta às {fmt(table.openedAt)}</div>
                    </div>
                    <div style={{textAlign:"right"}}>
                      <div style={{fontWeight:900,fontSize:18,color:"#3b82f6"}}>R$ {total.toFixed(2)}</div>
                      {pending>0
                        ?<div style={{background:"#3b82f6",color:"#000",borderRadius:20,padding:"2px 10px",fontSize:12,fontWeight:800,marginTop:4}}>⏳ {pending} pendente{pending!==1?"s":""}</div>
                        :table.orders.length>0?<div style={{background:"#22c55e",color:"#fff",borderRadius:20,padding:"2px 10px",fontSize:12,fontWeight:800,marginTop:4}}>✓ Tudo entregue</div>:null}
                    </div>
                  </div>
                  <div style={{marginTop:10,display:"flex",gap:8}}>
                    <span style={{fontSize:12,color:"#94a3b8"}}>📋 {table.orders.length} pedido{table.orders.length!==1?"s":""}</span>
                    <span style={{fontSize:12,color:"#94a3b8"}}>🛍️ {table.orders.reduce((s,o)=>s+o.items.reduce((ss,i)=>ss+i.qty,0),0)} itens</span>
                  </div>
                </div>
              );
            })}
          </div>

          {closedTables.length>0&&(
            <>
              <h3 style={{margin:"28px 0 12px",color:"#475569",fontSize:15,fontWeight:800}}>Mesas Fechadas Hoje</h3>
              <div style={{display:"grid",gap:8}}>
                {closedTables.map(t=>(
                  <div key={t.id} style={{background:"#1e293b",borderRadius:12,padding:"12px 16px",border:"2px solid #334155",opacity:.6,display:"flex",justifyContent:"space-between"}}>
                    <div><div style={{fontWeight:800}}>{t.name}</div><div style={{fontSize:12,color:"#64748b"}}>Fechada às {fmt(t.closedAt)}</div></div>
                    <div style={{fontWeight:800,color:"#64748b"}}>R$ {tableTotal(t).toFixed(2)}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* PENDENTES */}
      {activeTab==="pending" && (
        <div style={S.page}>
          <h2 style={{margin:"0 0 20px",fontSize:20,fontWeight:900}}>⏳ Itens Pendentes</h2>
          {allPendingItems.length===0&&(
            <div style={{textAlign:"center",padding:"60px 20px",color:"#475569"}}>
              <div style={{fontSize:56,marginBottom:12}}>✅</div>
              <div style={{fontWeight:800,fontSize:18}}>Tudo entregue!</div>
            </div>
          )}
          <div style={{display:"grid",gap:10}}>
            {allPendingItems.map(item=>(
              <div key={`${item.orderId}-${item.id}`} style={{background:"#1e293b",borderRadius:14,padding:"14px 16px",border:"2px solid #3b82f6",display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
                <div style={{display:"flex",alignItems:"center",gap:12,flex:1}}>
                  <span style={{fontSize:28}}>{item.emoji}</span>
                  <div>
                    <div style={{fontWeight:800,fontSize:15}}>{item.name}</div>
                    <div style={{fontSize:12,color:"#3b82f6",fontWeight:700}}>{item.tableName}</div>
                    <div style={{fontSize:12,color:"#64748b"}}>{item.delivered}/{item.qty} entregue{item.delivered!==1?"s":""}</div>
                  </div>
                </div>
                <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
                  <div style={{background:"#3b82f6",color:"#000",borderRadius:20,padding:"2px 12px",fontWeight:900,fontSize:14}}>{item.pending}x</div>
                  <button onClick={()=>markDelivered(item.tableId,item.orderId,item.id)} style={{background:"#22c55e",border:"none",color:"#fff",borderRadius:8,padding:"6px 12px",fontWeight:800,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>✓ Entregar</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ORDER */}
      {activeTab==="order" && selectedTable && (
        <div style={{paddingBottom:140}}>
          <div style={{background:"#1e293b",padding:"16px 20px",borderBottom:"1px solid #334155",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontWeight:900,fontSize:20}}>{selectedTable.name}</div>
              <div style={{fontSize:12,color:"#64748b"}}>Aberta às {fmt(selectedTable.openedAt)}</div>
            </div>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              {selectedTable.orders.length>0&&<PrintButton label="Conta" buildData={()=>buildTableReceipt(selectedTable)}/>}
              <button onClick={()=>setConfirmClose(selectedTable.id)} style={{background:"#dc2626",border:"none",color:"#fff",padding:"8px 14px",borderRadius:10,fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>Fechar Mesa</button>
            </div>
          </div>

          {selectedTable.orders.length>0&&(
            <div style={{padding:"16px 16px 0"}}>
              <h3 style={{margin:"0 0 12px",fontSize:15,fontWeight:900,color:"#94a3b8"}}>PEDIDOS DA MESA</h3>
              {selectedTable.orders.map((order,oi)=>(
                <div key={order.id} style={{background:"#1e293b",borderRadius:14,padding:14,marginBottom:12,border:"1px solid #334155"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                    <div style={{fontSize:12,color:"#64748b",fontWeight:700}}>Pedido #{oi+1} • {fmt(order.createdAt)}</div>
                    <PrintButton small label={`Pedido #${oi+1}`} buildData={()=>buildOrderReceipt(selectedTable.name,order,oi)}/>
                  </div>
                  {order.items.map(item=>{
                    const ok=item.delivered>=item.qty;
                    return (
                      <div key={item.id} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #0f172a"}}>
                        <div style={{display:"flex",alignItems:"center",gap:10}}>
                          <span style={{fontSize:22}}>{item.emoji}</span>
                          <div>
                            <div style={{fontWeight:700,fontSize:14,textDecoration:ok?"line-through":"none",color:ok?"#475569":"#f1f5f9"}}>{item.qty}x {item.name}</div>
                            <div style={{fontSize:12}}>{ok?<span style={{color:"#22c55e",fontWeight:700}}>✓ Entregue</span>:<span style={{color:"#3b82f6",fontWeight:700}}>⏳ {item.delivered}/{item.qty}</span>}</div>
                          </div>
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <span style={{fontSize:13,color:"#64748b"}}>R$ {(item.price*item.qty).toFixed(2)}</span>
                          {!ok&&<button onClick={()=>markDelivered(selectedTable.id,order.id,item.id)} style={{background:"#22c55e",border:"none",color:"#fff",borderRadius:8,padding:"4px 10px",fontWeight:800,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>✓</button>}
                        </div>
                      </div>
                    );
                  })}
                  <div style={{marginTop:8,textAlign:"right",fontWeight:900,color:"#3b82f6"}}>R$ {order.items.reduce((s,i)=>s+i.price*i.qty,0).toFixed(2)}</div>
                </div>
              ))}
              <div style={{background:"#0f172a",borderRadius:12,padding:"12px 16px",marginBottom:16}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontWeight:900,fontSize:16}}>TOTAL DA MESA</span>
                  <span style={{fontWeight:900,fontSize:20,color:"#3b82f6"}}>R$ {tableTotal(selectedTable).toFixed(2)}</span>
                </div>
                <div style={{marginTop:10}}><PrintButton label="Imprimir Conta Completa" buildData={()=>buildTableReceipt(selectedTable)}/></div>
              </div>
            </div>
          )}

          <div style={{padding:"0 16px"}}>
            <h3 style={{margin:"0 0 12px",fontSize:15,fontWeight:900,color:"#94a3b8"}}>ADICIONAR PEDIDO</h3>
            <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:8,marginBottom:12}}>
              {categories.map(cat=>(
                <button key={cat} onClick={()=>setFilterCategory(cat)} style={{padding:"6px 14px",borderRadius:20,border:"none",background:filterCategory===cat?"#3b82f6":"#1e293b",color:filterCategory===cat?"#000":"#94a3b8",fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",flexShrink:0}}>{cat}</button>
              ))}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:20}}>
              {filteredItems.map(item=>{
                const inCart=cart.find(c=>c.itemId===item.id);
                return (
                  <div key={item.id} style={{background:"#1e293b",borderRadius:14,padding:14,border:`2px solid ${inCart?"#3b82f6":"#334155"}`,cursor:"pointer"}} onClick={()=>addToCart(item)}>
                    <div style={{fontSize:30,marginBottom:6}}>{item.emoji}</div>
                    <div style={{fontWeight:800,fontSize:13,marginBottom:2}}>{item.name}</div>
                    <div style={{color:"#3b82f6",fontWeight:900,fontSize:15}}>R$ {item.price},00</div>
                    {inCart&&(
                      <div style={{marginTop:6,background:"#3b82f6",color:"#000",borderRadius:20,padding:"2px 0",textAlign:"center",fontWeight:900,fontSize:13,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                        <span style={{padding:"0 8px",cursor:"pointer"}} onClick={e=>{e.stopPropagation();removeFromCart(item.id);}}>−</span>
                        <span>{inCart.qty}</span>
                        <span style={{padding:"0 8px",cursor:"pointer"}} onClick={e=>{e.stopPropagation();addToCart(item);}}>+</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {cart.length>0&&(
            <div style={{position:"fixed",bottom:0,left:0,right:0,background:"#1e293b",borderTop:"2px solid #3b82f6",padding:"12px 16px",zIndex:100}}>
              <div style={{marginBottom:10}}>
                {cart.map(c=>(
                  <div key={c.itemId} style={{display:"flex",justifyContent:"space-between",fontSize:13,color:"#94a3b8",marginBottom:4}}>
                    <span>{c.emoji} {c.qty}x {c.name}</span><span>R$ {(c.price*c.qty).toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <button onClick={sendOrder} style={{width:"100%",padding:"14px",background:"linear-gradient(135deg,#3b82f6,#1e3a5f)",border:"none",color:"#fff",borderRadius:14,fontWeight:900,fontSize:16,cursor:"pointer",fontFamily:"inherit",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span>🛍️ Enviar Pedido ({cartCount} itens)</span><span>R$ {cartTotal.toFixed(2)}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {confirmClose&&(
        <div style={S.modal}>
          <div style={S.mbox}>
            <div style={{fontSize:18,fontWeight:900,marginBottom:8}}>Fechar Mesa?</div>
            {tablePendingCount(tables.find(t=>t.id===confirmClose)||{orders:[]})>0&&(
              <div style={{background:"#7c2d12",borderRadius:10,padding:"10px 14px",marginBottom:16,fontSize:14,color:"#fca5a5",fontWeight:700}}>⚠️ Ainda há itens não entregues!</div>
            )}
            <div style={{fontSize:14,color:"#94a3b8",marginBottom:20}}>Total: R$ {tableTotal(tables.find(t=>t.id===confirmClose)||{orders:[]}).toFixed(2)}</div>
            <div style={{display:"flex",gap:10}}>
              <button onClick={()=>setConfirmClose(null)} style={{flex:1,padding:12,borderRadius:10,background:"#334155",border:"none",color:"#94a3b8",fontWeight:800,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>Cancelar</button>
              <button onClick={()=>closeTable(confirmClose)} style={{flex:2,padding:12,borderRadius:10,background:"#1e3a5f",border:"none",color:"#fff",fontWeight:800,fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>Fechar Mesa ✓</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
