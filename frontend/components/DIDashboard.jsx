"use client";
import React, { useState, useRef, useEffect, useCallback, memo, useMemo } from "react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  AreaChart, Area, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from "recharts";

// ─── PALETTE ────────────────────────────────────────────────────────────────
const T = {
  bg0:"#0C0904",bg1:"#171108",bg2:"#22180C",bg3:"#2E2110",bg4:"#3A2A14",
  b0:"rgba(212,168,84,0.06)",b1:"rgba(212,168,84,0.11)",b2:"rgba(212,168,84,0.18)",b3:"rgba(212,168,84,0.28)",
  t0:"#FDF6E3",t1:"#A8895C",t2:"#5E4A2E",
  a0:"#D4A854",a1:"#EAC97A",a2:"#F5DFA0",
  aBg:"rgba(212,168,84,0.10)",aBg2:"rgba(212,168,84,0.18)",aRing:"rgba(212,168,84,0.25)",
  green:"#7ECB9E",greenBg:"rgba(126,203,158,0.10)",greenDim:"rgba(126,203,158,0.06)",
  red:"#E07060",redBg:"rgba(224,112,96,0.10)",
  blue:"#6BA8E8",blueBg:"rgba(107,168,232,0.10)",
  purple:"#B07EE8",purpleBg:"rgba(176,126,232,0.10)",
  chart:["#D4A854","#7ECB9E","#E07060","#EAC97A","#A8895C","#C97B6E","#5E9E80","#E8C4A0"],
};

const FONTS=""; // avoid server/client hydration mismatch from @import escaping

const CSS=`
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;}
::-webkit-scrollbar{width:3px;height:3px;}
::-webkit-scrollbar-thumb{background:${T.b2};border-radius:3px;}
@keyframes fadeUp{from{opacity:0;transform:translateY(10px);}to{opacity:1;transform:translateY(0);}}
@keyframes fadeIn{from{opacity:0;}to{opacity:1;}}
@keyframes spin{to{transform:rotate(360deg);}}
@keyframes pulse{0%,100%{opacity:.4;transform:scale(.85);}50%{opacity:1;transform:scale(1.15);}}
@keyframes glow{0%,100%{box-shadow:0 0 8px ${T.a0}55;}50%{box-shadow:0 0 20px ${T.a0}99;}}
@keyframes float{0%,100%{transform:translateY(0);}50%{transform:translateY(-6px);}}
@keyframes shimmer{0%{background-position:200% 0;}100%{background-position:-200% 0;}}
@keyframes ping{0%{transform:scale(1);opacity:1;}75%,100%{transform:scale(1.8);opacity:0;}}
@keyframes drift{0%,100%{transform:translate3d(0,0,0);}50%{transform:translate3d(0,-10px,0);}}
@keyframes orbit{from{transform:rotate(0deg) translateX(84px) rotate(0deg);}to{transform:rotate(360deg) translateX(84px) rotate(-360deg);}}
@keyframes wave{0%,100%{transform:scaleY(.42);opacity:.45;}50%{transform:scaleY(1);opacity:1;}}
@keyframes riseIn{from{opacity:0;transform:translateY(18px) scale(.985);}to{opacity:1;transform:translateY(0) scale(1);}}
@keyframes floatSlow{0%,100%{transform:translate3d(0,0,0);}50%{transform:translate3d(0,-14px,0);}}
@keyframes aurora{0%{transform:translate3d(-2%,-1%,0) scale(1);}50%{transform:translate3d(2%,2%,0) scale(1.04);}100%{transform:translate3d(-2%,-1%,0) scale(1);}}
@keyframes tiltGlow{0%,100%{transform:rotate(-2deg) scale(1);opacity:.7;}50%{transform:rotate(2deg) scale(1.03);opacity:1;}}
textarea{font-family:Instrument Sans,sans-serif;}
`;

// ─── SCHEMA ─────────────────────────────────────────────────────────────────
const SCHEMA=`
TABLE: dataset
Columns will be dynamically determined from the connected database.
`;

const SYS=`You are an elite YouTube Analytics BI assistant. Return ONLY valid JSON.

${SCHEMA}

Schema:
{
  "title":"Short title (≤5 words)",
  "summary":"2-sentence insight with numbers",
  "sql":"SELECT query you would run",
  "kpis":[{"label":"","value":"","delta":"","trend":"up|down|neutral","sub":""}],
  "charts":[{
    "id":"c1","type":"bar|line|area|pie|donut|radar|composed",
    "title":"","desc":"","data":[],
    "xKey":"","yKeys":[{"key":"","label":"","color":""}],
    "insight":"","size":"wide|normal","anomalies":[]
  }],
  "followUps":["","",""]
}
Rules: 4 KPIs, 2-4 charts, 5-12 pts. pie/donut→data:[{name,value}]. radar→data:[{subject,value}].
anomalies: array of xKey values that are outliers (shown as reference lines). Mark 1 chart size:"wide".
Colors: #D4A854 #7ECB9E #E07060 #EAC97A #A8895C #C97B6E #5E9E80 #E8C4A0
On unclear query: {"error":"reason"}. ONLY JSON.`;

// ─── API ─────────────────────────────────────────────────────────────────────
async function callAPI(messages, mode="new"){

  const latest = messages[messages.length - 1].content;

  const r = await fetch("/api/claude", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      question: latest,
      mode: mode
    })
  });

  if(!r.ok) throw new Error(`API ${r.status}`);

  const data = await r.json();
  return data;
}

// ─── DATE RANGES ─────────────────────────────────────────────────────────────
const DATE_RANGES=[
  {id:"7d",label:"7 days"},{id:"30d",label:"30 days"},{id:"90d",label:"90 days"},
  {id:"ytd",label:"Year to date"},{id:"all",label:"All time"},{id:"custom",label:"Custom"},
];

// ─── STORAGE (localStorage) ───────────────────────────────────────────────────
const STORAGE_KEY="dataintel_saved_v1";
function loadSaved(){try{const d=JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]");return Array.isArray(d)?d:[];}catch{return[];}}
function saveToDisk(arr){try{localStorage.setItem(STORAGE_KEY,JSON.stringify(arr));}catch{}}
function clearStorage(){try{localStorage.removeItem(STORAGE_KEY);}catch{}}

function buildNoAnswerResult(query, reason="I couldn't find enough structure in that request to build a reliable dashboard."){
  return{
    title:"Query needs refinement",
    summary:reason,
    sql:"",
    kpis:[],
    charts:[],
    followUps:[
      `Show total views by category`,
      `Compare engagement rate by region in the last 30 days`,
      `Break down revenue by language`
    ],
    unanswerable:true,
    originalQuery:query,
  };
}

const BACKEND_BASE_URL = "http://127.0.0.1:8000";

// ─── TOOLTIP ─────────────────────────────────────────────────────────────────
const DarkTip=({active,payload,label})=>{
  if(!active||!payload?.length)return null;
  return(
    <div style={{background:T.bg3,border:`1px solid ${T.b2}`,borderRadius:10,padding:"10px 14px",boxShadow:"0 16px 40px rgba(0,0,0,.7)",fontFamily:"Instrument Sans,sans-serif",minWidth:140}}>
      {label&&<p style={{margin:"0 0 8px",fontSize:10,color:T.t2,textTransform:"uppercase",letterSpacing:"0.08em",fontFamily:"JetBrains Mono,monospace"}}>{label}</p>}
      {payload.map((p,i)=>(
        <div key={i} style={{display:"flex",alignItems:"center",gap:8,margin:"4px 0"}}>
          <div style={{width:6,height:6,borderRadius:"50%",background:p.color,flexShrink:0}}/>
          <span style={{fontSize:12,color:T.t1,flex:1}}>{p.name}</span>
          <span style={{fontSize:13,fontWeight:600,color:T.t0,fontFamily:"JetBrains Mono,monospace"}}>
            {typeof p.value==="number"?p.value.toLocaleString():p.value}
          </span>
        </div>
      ))}
    </div>
  );
};

// ─── CHART RENDERER ──────────────────────────────────────────────────────────
const ax={fontSize:11,fill:T.t2,fontFamily:"JetBrains Mono,monospace"};
const gd={strokeDasharray:"3 3",stroke:T.b1,vertical:false};
const lg={wrapperStyle:{fontSize:12,color:T.t1,paddingTop:14,fontFamily:"Instrument Sans,sans-serif"}};
const mg={top:8,right:8,left:-10,bottom:0};

const ChartRenderer=memo(({chart})=>{
  const H=260;
  const yKeys=chart.yKeys?.length?chart.yKeys:[{key:chart.dataKey||"value",label:chart.dataKey||"Value",color:T.chart[0]}];
  const anomalies=chart.anomalies||[];

  if(chart.type==="pie"||chart.type==="donut"){
    return(
      <ResponsiveContainer width="100%" height={H}>
        <PieChart>
          <defs>{(chart.data||[]).map((_,i)=>(
            <radialGradient key={i} id={`rg_${chart.id}_${i}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={T.chart[i%T.chart.length]} stopOpacity={1}/>
              <stop offset="100%" stopColor={T.chart[i%T.chart.length]} stopOpacity={0.6}/>
            </radialGradient>
          ))}</defs>
          <Pie data={chart.data} dataKey="value" nameKey="name" cx="50%" cy="50%"
            innerRadius={chart.type==="donut"?68:0} outerRadius={98} paddingAngle={chart.type==="donut"?4:1} strokeWidth={0}>
            {(chart.data||[]).map((_,i)=><Cell key={i} fill={`url(#rg_${chart.id}_${i})`}/>)}
          </Pie>
          <Tooltip content={<DarkTip/>}/><Legend wrapperStyle={{fontSize:12,color:"#A8895C",paddingTop:14,fontFamily:"Instrument Sans,sans-serif"}} iconType="circle" iconSize={8}/>
        </PieChart>
      </ResponsiveContainer>
    );
  }
  if(chart.type==="radar"){
    return(
      <ResponsiveContainer width="100%" height={H}>
        <RadarChart data={chart.data} margin={{top:16,right:28,bottom:0,left:28}}>
          <PolarGrid stroke={T.b2}/>
          <PolarAngleAxis 
            dataKey={chart.angleKey || "metric"} 
            tick={{fontSize:11,fill:T.t1,fontFamily:"Instrument Sans,sans-serif"}}
          />
          <PolarRadiusAxis tick={false} axisLine={false}/>
          <Radar
            name="Metrics"
            dataKey={chart.valueKey || "value"}
            stroke={T.chart[0]}
            fill={T.chart[0]}
            fillOpacity={0.10}
            strokeWidth={2}
            dot={{r:3,fill:T.chart[0],strokeWidth:0}}
          />

          <Tooltip content={<DarkTip/>}/>
          <Legend wrapperStyle={{fontSize:12,color:"#A8895C",paddingTop:14,fontFamily:"Instrument Sans,sans-serif"}}/>

        </RadarChart>
      </ResponsiveContainer>
    );
  }
  if(chart.type==="area"){
    return(
      <ResponsiveContainer width="100%" height={H}>
        <AreaChart data={chart.data} margin={{top:8,right:8,left:-10,bottom:0}}>
          <defs>{yKeys.map(y=>(
            <linearGradient key={y.key} id={`ag_${chart.id}_${y.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={y.color} stopOpacity={0.30}/>
              <stop offset="78%" stopColor={y.color} stopOpacity={0.03}/>
            </linearGradient>
          ))}</defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(212,168,84,0.11)" vertical={false}/><XAxis dataKey={chart.xKey} tick={{fontSize:11,fill:"#5E4A2E",fontFamily:"JetBrains Mono,monospace"}} tickLine={false} axisLine={false}/>
          <YAxis tick={{fontSize:11,fill:"#5E4A2E",fontFamily:"JetBrains Mono,monospace"}} tickLine={false} axisLine={false}/>
          <Tooltip content={<DarkTip/>}/><Legend wrapperStyle={{fontSize:12,color:"#A8895C",paddingTop:14,fontFamily:"Instrument Sans,sans-serif"}}/>
          {anomalies.map(a=><ReferenceLine key={a} x={a} stroke={T.red} strokeDasharray="4 2" strokeWidth={1.5} label={{value:"⚠",fill:T.red,fontSize:10}}/>)}
          {yKeys.map(y=><Area key={y.key} type="monotone" dataKey={y.key} name={y.label} stroke={y.color} fill={`url(#ag_${chart.id}_${y.key})`} strokeWidth={2} dot={false} activeDot={{r:5,fill:y.color,strokeWidth:2,stroke:T.bg0}}/>)}
        </AreaChart>
      </ResponsiveContainer>
    );
  }
  if(chart.type==="line"){
    return(
      <ResponsiveContainer width="100%" height={H}>
        <LineChart data={chart.data} margin={{top:8,right:8,left:-10,bottom:0}}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(212,168,84,0.11)" vertical={false}/><XAxis dataKey={chart.xKey} tick={{fontSize:11,fill:"#5E4A2E",fontFamily:"JetBrains Mono,monospace"}} tickLine={false} axisLine={false}/>
          <YAxis tick={{fontSize:11,fill:"#5E4A2E",fontFamily:"JetBrains Mono,monospace"}} tickLine={false} axisLine={false}/>
          <Tooltip content={<DarkTip/>}/><Legend wrapperStyle={{fontSize:12,color:"#A8895C",paddingTop:14,fontFamily:"Instrument Sans,sans-serif"}}/>
          {anomalies.map(a=><ReferenceLine key={a} x={a} stroke={T.red} strokeDasharray="4 2" strokeWidth={1.5}/>)}
          {yKeys.map(y=><Line key={y.key} type="monotone" dataKey={y.key} name={y.label} stroke={y.color} strokeWidth={2} dot={false} activeDot={{r:5,fill:y.color,strokeWidth:2,stroke:T.bg0}}/>)}
        </LineChart>
      </ResponsiveContainer>
    );
  }
  if(chart.type==="composed"){
    return(
      <ResponsiveContainer width="100%" height={H}>
        <ComposedChart data={chart.data} margin={{top:8,right:8,left:-10,bottom:0}}>
          <defs>{yKeys.slice(0,1).map(y=>(
            <linearGradient key={y.key} id={`cg_${chart.id}_${y.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={y.color} stopOpacity={0.9}/><stop offset="100%" stopColor={y.color} stopOpacity={0.4}/>
            </linearGradient>
          ))}</defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(212,168,84,0.11)" vertical={false}/><XAxis dataKey={chart.xKey} tick={{fontSize:11,fill:"#5E4A2E",fontFamily:"JetBrains Mono,monospace"}} tickLine={false} axisLine={false}/>
          <YAxis tick={{fontSize:11,fill:"#5E4A2E",fontFamily:"JetBrains Mono,monospace"}} tickLine={false} axisLine={false}/>
          <Tooltip content={<DarkTip/>}/><Legend wrapperStyle={{fontSize:12,color:"#A8895C",paddingTop:14,fontFamily:"Instrument Sans,sans-serif"}}/>
          {yKeys.map((y,i)=>i===0
            ?<Bar key={y.key} dataKey={y.key} name={y.label} fill={`url(#cg_${chart.id}_${y.key})`} radius={[4,4,0,0]} maxBarSize={40}/>
            :<Line key={y.key} type="monotone" dataKey={y.key} name={y.label} stroke={y.color} strokeWidth={2} dot={false} activeDot={{r:4,strokeWidth:0}}/>
          )}
        </ComposedChart>
      </ResponsiveContainer>
    );
  }
  return(
    <ResponsiveContainer width="100%" height={H}>
      <BarChart data={chart.data} margin={{top:8,right:8,left:-10,bottom:0}}>
        <defs>{yKeys.map(y=>(
          <linearGradient key={y.key} id={`bg_${chart.id}_${y.key}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={y.color} stopOpacity={0.95}/><stop offset="100%" stopColor={y.color} stopOpacity={0.40}/>
          </linearGradient>
        ))}</defs>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(212,168,84,0.11)" vertical={false}/><XAxis dataKey={chart.xKey} tick={{fontSize:11,fill:"#5E4A2E",fontFamily:"JetBrains Mono,monospace"}} tickLine={false} axisLine={false}/>
        <YAxis tick={{fontSize:11,fill:"#5E4A2E",fontFamily:"JetBrains Mono,monospace"}} tickLine={false} axisLine={false} tickFormatter={v=>v>=1000?`${(v/1000).toFixed(0)}k`:v}/>
        <Tooltip content={<DarkTip/>} cursor={{fill:T.b0}}/><Legend wrapperStyle={{fontSize:12,color:"#A8895C",paddingTop:14,fontFamily:"Instrument Sans,sans-serif"}}/>
        {anomalies.map(a=><ReferenceLine key={a} x={a} stroke={T.red} strokeDasharray="4 2" strokeWidth={1.5} label={{value:"⚠",fill:T.red,fontSize:10}}/>)}
        {yKeys.map(y=><Bar key={y.key} dataKey={y.key} name={y.label} fill={`url(#bg_${chart.id}_${y.key})`} radius={[5,5,0,0]} maxBarSize={44}/>)}
      </BarChart>
    </ResponsiveContainer>
  );
});

// ─── KPI CARD ────────────────────────────────────────────────────────────────
const TCFG={
  up:{color:T.green,bg:T.greenBg,arrow:"↑",w:72},
  down:{color:T.red,bg:T.redBg,arrow:"↓",w:28},
  neutral:{color:T.t1,bg:T.b1,arrow:"→",w:50},
};
const KPICard=memo(({kpi,idx})=>{
  const[hov,setHov]=useState(false);
  const cfg=TCFG[kpi.trend]||TCFG.neutral;
  return(
    <div onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{position:"relative",overflow:"hidden",background:hov?T.bg3:T.bg2,border:`1px solid ${hov?T.b2:T.b1}`,borderRadius:16,padding:"20px 22px",display:"flex",flexDirection:"column",gap:10,animation:`fadeUp .5s cubic-bezier(.16,1,.3,1) ${idx*.07}s both`,transition:"background .2s,border-color .2s,box-shadow .2s",boxShadow:hov?`0 8px 32px rgba(0,0,0,.5),inset 0 1px 0 ${T.b2}`:`inset 0 1px 0 ${T.b1}`,cursor:"default"}}>
      <div style={{position:"absolute",top:0,left:0,right:0,height:2,borderRadius:"16px 16px 0 0",background:`linear-gradient(90deg,${cfg.color}99 0%,${cfg.color}00 100%)`,opacity:hov?1:0.5,transition:"opacity .2s"}}/>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <span style={{fontSize:11,color:T.t2,fontFamily:"JetBrains Mono,monospace",textTransform:"uppercase",letterSpacing:"0.08em"}}>{kpi.label}</span>
        <span style={{fontSize:10,fontWeight:600,fontFamily:"JetBrains Mono,monospace",padding:"2px 7px",borderRadius:20,color:cfg.color,background:cfg.bg,letterSpacing:"0.04em"}}>{cfg.arrow} {kpi.delta}</span>
      </div>
      <span style={{fontSize:30,fontWeight:700,color:T.t0,fontFamily:"Playfair Display,serif",letterSpacing:"-0.02em",lineHeight:1}}>{kpi.value}</span>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12}}>
        {kpi.sub&&<span style={{fontSize:11,color:T.t2,fontFamily:"Instrument Sans,sans-serif"}}>{kpi.sub}</span>}
        <div style={{flex:1,height:3,borderRadius:3,background:T.b1,overflow:"hidden",maxWidth:80,marginLeft:"auto"}}>
          <div style={{height:"100%",width:`${cfg.w}%`,borderRadius:3,background:`linear-gradient(90deg,${cfg.color},${cfg.color}77)`,transition:"width .7s cubic-bezier(.16,1,.3,1)",transitionDelay:`${idx*.08+.2}s`}}/>
        </div>
      </div>
    </div>
  );
});

// ─── CHART CARD ──────────────────────────────────────────────────────────────
const CHART_TYPES=["bar","line","area","pie","donut","radar","composed"];
const ChartCard=memo(({chart,idx,onTypeChange,onFullscreen,onAnnotate})=>{
  const[hov,setHov]=useState(false);
  const[showTypePicker,setShowTypePicker]=useState(false);
  const hasAnomalies=(chart.anomalies||[]).length>0;
  return(
    <div onMouseEnter={()=>setHov(true)} onMouseLeave={()=>{setHov(false);setShowTypePicker(false);}}
      style={{background:T.bg2,border:`1px solid ${hov?T.b2:T.b1}`,borderRadius:16,padding:"20px 22px",display:"flex",flexDirection:"column",animation:`fadeUp .5s cubic-bezier(.16,1,.3,1) ${.12+idx*.08}s both`,transition:"border-color .2s,box-shadow .2s",boxShadow:hov?"0 8px 36px rgba(0,0,0,.45)":"none",gridColumn:chart.size==="wide"?"1 / -1":"auto",position:"relative"}}>
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:16,gap:12}}>
        <div>
          <h3 style={{margin:0,fontSize:14,fontWeight:600,color:T.t0,fontFamily:"Playfair Display,serif"}}>{chart.title}</h3>
          {chart.desc&&<p style={{margin:"4px 0 0",fontSize:12,color:T.t2,fontFamily:"Instrument Sans,sans-serif",lineHeight:1.4}}>{chart.desc}</p>}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:4,flexShrink:0}}>
          {hasAnomalies&&(
            <div title="Anomalies detected" style={{display:"flex",alignItems:"center",gap:4,padding:"2px 8px",borderRadius:6,background:T.redBg,border:`1px solid ${T.red}33`}}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={T.red} strokeWidth="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <span style={{fontSize:9,color:T.red,fontFamily:"JetBrains Mono,monospace"}}>{(chart.anomalies||[]).length} anomaly</span>
            </div>
          )}
          {/* Annotate */}
          {onAnnotate&&<button onClick={onAnnotate} title="Annotations" style={{all:"unset",cursor:"pointer",width:26,height:26,borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",color:T.t2,transition:"all .12s"}} onMouseEnter={e=>{e.currentTarget.style.background=T.bg3;e.currentTarget.style.color=T.t0;}} onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color=T.t2;}}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></button>}
          {/* Fullscreen */}
          {onFullscreen&&<button onClick={onFullscreen} title="Fullscreen" style={{all:"unset",cursor:"pointer",width:26,height:26,borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",color:T.t2,transition:"all .12s"}} onMouseEnter={e=>{e.currentTarget.style.background=T.bg3;e.currentTarget.style.color=T.t0;}} onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color=T.t2;}}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg></button>}
          {/* Chart type switcher */}
          <div style={{position:"relative"}}>
            <button onClick={()=>setShowTypePicker(s=>!s)} style={{all:"unset",cursor:"pointer",fontSize:9,fontWeight:600,padding:"3px 8px",borderRadius:6,background:T.bg4,color:T.t2,fontFamily:"JetBrains Mono,monospace",textTransform:"uppercase",letterSpacing:"0.1em",border:`1px solid ${T.b1}`,display:"flex",alignItems:"center",gap:4}}>
              {chart.type} <span style={{fontSize:8}}>▾</span>
            </button>
            {showTypePicker&&(
              <div style={{position:"absolute",top:"calc(100% + 4px)",right:0,background:T.bg3,border:`1px solid ${T.b2}`,borderRadius:10,padding:4,zIndex:50,display:"flex",flexDirection:"column",gap:2,minWidth:110,boxShadow:"0 8px 24px rgba(0,0,0,.5)"}}>
                {CHART_TYPES.map(ct=>(
                  <button key={ct} onClick={()=>{onTypeChange(chart.id,ct);setShowTypePicker(false);}} style={{all:"unset",cursor:"pointer",padding:"6px 10px",borderRadius:7,fontSize:11,color:ct===chart.type?T.a1:T.t1,background:ct===chart.type?T.aBg:"transparent",fontFamily:"JetBrains Mono,monospace",transition:"background .1s"}}
                    onMouseEnter={e=>e.currentTarget.style.background=T.bg4}
                    onMouseLeave={e=>e.currentTarget.style.background=ct===chart.type?T.aBg:"transparent"}
                  >{ct}</button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <ChartRenderer chart={chart}/>
      {chart.insight&&(
        <div style={{marginTop:16,padding:"10px 14px",borderRadius:10,background:T.aBg,border:`1px solid ${T.a0}22`,display:"flex",gap:10,alignItems:"flex-start"}}>
          <div style={{width:16,height:16,borderRadius:"50%",background:T.aBg2,border:`1px solid ${T.a0}44`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1}}>
            <svg width="8" height="8" viewBox="0 0 10 10"><polygon points="5,1 1,9 5,6.5 9,9" fill={T.a0}/></svg>
          </div>
          <p style={{margin:0,fontSize:12,color:T.a2,lineHeight:1.6,fontFamily:"Instrument Sans,sans-serif"}}>{chart.insight}</p>
        </div>
      )}
    </div>
  );
});

// ─── SQL PANEL ───────────────────────────────────────────────────────────────
function SQLPanel({sql}){
  const[open,setOpen]=useState(false);
  return(
    <div style={{borderRadius:12,border:`1px solid ${T.b1}`,overflow:"hidden",animation:"fadeUp .4s ease .05s both"}}>
      <button onClick={()=>setOpen(o=>!o)} style={{all:"unset",cursor:"pointer",width:"100%",display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:T.bg2,transition:"background .12s"}}
        onMouseEnter={e=>e.currentTarget.style.background=T.bg3}
        onMouseLeave={e=>e.currentTarget.style.background=T.bg2}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.a0} strokeWidth="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/></svg>
        <span style={{fontSize:11,color:T.a1,fontFamily:"JetBrains Mono,monospace",textTransform:"uppercase",letterSpacing:"0.08em"}}>Generated SQL</span>
        <span style={{marginLeft:"auto",fontSize:10,color:T.t2,fontFamily:"JetBrains Mono,monospace"}}>{open?"▲ hide":"▼ show"}</span>
      </button>
      {open&&<div style={{padding:"14px 16px",background:T.bg1,borderTop:`1px solid ${T.b1}`}}>
        <pre style={{margin:0,fontSize:12,color:T.a2,fontFamily:"JetBrains Mono,monospace",lineHeight:1.7,whiteSpace:"pre-wrap",wordBreak:"break-word"}}>{sql}</pre>
      </div>}
    </div>
  );
}

// ─── PIPELINE ────────────────────────────────────────────────────────────────
const STEPS=[
  {label:"Parsing query",icon:"cmd"},{label:"Mapping columns",icon:"⊞"},
  {label:"Generating SQL",icon:"⟨⟩"},{label:"Simulating results",icon:"⬇"},
  {label:"Selecting charts",icon:"▣"},{label:"Rendering",icon:"◈"},
];
function Pipeline({step}){
  const pct=Math.round((step/(STEPS.length-1))*100);
  return(
    <div style={{background:T.bg2,border:`1px solid ${T.b1}`,borderRadius:16,padding:"24px 24px 20px",animation:"fadeIn .3s ease both"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:28,height:28,borderRadius:8,background:T.aBg2,border:`1px solid ${T.a0}44`,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <div style={{width:8,height:8,borderRadius:"50%",background:T.a0,animation:"glow 1.5s ease-in-out infinite"}}/>
          </div>
          <div>
            <p style={{margin:0,fontSize:13,fontWeight:600,color:T.t0,fontFamily:"Playfair Display,serif"}}>Querying youtube_videos</p>
            <p style={{margin:0,fontSize:11,color:T.t2,fontFamily:"JetBrains Mono,monospace"}}>{STEPS[Math.min(step,STEPS.length-1)].label}…</p>
          </div>
        </div>
        <span style={{fontSize:12,fontWeight:600,fontFamily:"JetBrains Mono,monospace",color:T.a1}}>{pct}%</span>
      </div>
      <div style={{height:4,borderRadius:4,background:T.b1,overflow:"hidden",marginBottom:20,position:"relative"}}>
        <div style={{position:"absolute",inset:0,background:`linear-gradient(90deg,transparent,${T.b2},transparent)`,backgroundSize:"200% 100%",animation:"shimmer 2s linear infinite"}}/>
        <div style={{height:"100%",width:`${pct}%`,borderRadius:4,background:`linear-gradient(90deg,${T.a0},${T.green})`,transition:"width .45s cubic-bezier(.16,1,.3,1)",position:"relative",zIndex:1}}>
          <div style={{position:"absolute",right:0,top:"50%",transform:"translateY(-50%)",width:8,height:8,borderRadius:"50%",background:T.green,boxShadow:`0 0 10px ${T.green}`}}/>
        </div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:0}}>
        {STEPS.map((s,i)=>{
          const done=i<step,active=i===step,last=i===STEPS.length-1;
          return(
            <div key={i} style={{display:"flex",alignItems:"stretch",gap:0}}>
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",width:36,flexShrink:0}}>
                <div style={{width:22,height:22,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,background:done?T.green+"22":active?T.aBg2:T.bg3,border:`1.5px solid ${done?T.green+"66":active?T.a0+"88":T.b1}`,transition:"all .35s",zIndex:1}}>
                  {done?<svg width="10" height="10" viewBox="0 0 10 10"><polyline points="1.5,5 4,7.5 8.5,2.5" stroke={T.green} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  :active?<div style={{width:6,height:6,borderRadius:"50%",background:T.a0,animation:"pulse 1.2s ease-in-out infinite"}}/>
                  :<div style={{width:5,height:5,borderRadius:"50%",background:T.b2}}/>}
                </div>
                {!last&&<div style={{width:1.5,flex:1,minHeight:10,background:done?`linear-gradient(${T.green}55,${T.green}22)`:T.b1,transition:"background .35s",margin:"2px 0"}}/>}
              </div>
              <div style={{flex:1,display:"flex",alignItems:"center",padding:`8px 0 ${last?"0":"10px"} 10px`}}>
                <span style={{fontSize:13,color:done?T.green:active?T.a1:T.t2,fontFamily:"JetBrains Mono,monospace",fontWeight:active?500:400,transition:"color .3s"}}>{s.label}</span>
                {active&&<span style={{marginLeft:8,fontSize:11,color:T.a0,fontFamily:"JetBrains Mono,monospace",animation:"pulse 1.4s ease-in-out infinite"}}>…</span>}
                {done&&<span style={{marginLeft:"auto",fontSize:10,color:T.green+"88",fontFamily:"JetBrains Mono,monospace"}}>done</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── SUMMARY BANNER ──────────────────────────────────────────────────────────
function SummaryBanner({title,summary}){
  return(
    <div style={{position:"relative",overflow:"hidden",background:`linear-gradient(180deg,${T.bg2},${T.bg3})`,border:`1px solid ${T.b2}`,borderRadius:20,padding:"22px 24px",animation:"fadeUp .4s ease both",boxShadow:`0 18px 40px rgba(0,0,0,.18), inset 0 1px 0 ${T.b2}`}}>
      <div style={{position:"absolute",top:0,right:0,width:240,height:110,background:`radial-gradient(ellipse at top right,${T.a0}16,transparent)`,pointerEvents:"none"}}/>
      <div style={{display:"flex",gap:14,alignItems:"flex-start",position:"relative"}}>
        <div style={{width:42,height:42,borderRadius:13,background:`linear-gradient(135deg,${T.aBg2},${T.aBg})`,border:`1px solid ${T.a0}33`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:`inset 0 1px 0 ${T.a0}18`}}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><polygon points="8,1 2,14 8,10.5 14,14" fill={T.a0} opacity="0.9"/></svg>
        </div>
        <div style={{flex:1}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
            <span style={{fontSize:10,color:T.a0,fontFamily:"JetBrains Mono,monospace",textTransform:"uppercase",letterSpacing:"0.1em"}}>AI Summary · youtube_videos</span>
            <div style={{height:1,flex:1,background:`linear-gradient(90deg,${T.a0}44,transparent)`}}/>
          </div>
          <h2 style={{margin:"0 0 8px",fontSize:19,fontWeight:700,color:T.t0,fontFamily:"Playfair Display,serif",letterSpacing:"-0.02em"}}>{title}</h2>
          <p style={{margin:0,fontSize:14,color:T.t1,lineHeight:1.75,fontFamily:"Instrument Sans,sans-serif",maxWidth:860}}>{summary}</p>
        </div>
      </div>
    </div>
  );
}

// ─── FOLLOW-UP PILLS ─────────────────────────────────────────────────────────
function FollowUps({items,onSelect}){
  return(
    <div style={{animation:"fadeUp .4s ease .3s both"}}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
        <span style={{fontSize:10,color:T.t2,fontFamily:"JetBrains Mono,monospace",textTransform:"uppercase",letterSpacing:"0.1em"}}>Dig deeper</span>
        <div style={{height:1,flex:1,background:`linear-gradient(90deg,${T.b2},transparent)`}}/>
      </div>
      <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
        {items.map((f,i)=><FollowUpPill key={i} text={f} idx={i} onClick={()=>onSelect(f)}/>)}
      </div>
    </div>
  );
}
function FollowUpPill({text,idx,onClick}){
  const[hov,setHov]=useState(false);
  return(
    <button onClick={onClick} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{all:"unset",cursor:"pointer",display:"flex",alignItems:"center",gap:7,fontSize:12,padding:"10px 15px",borderRadius:12,background:hov?T.aBg2:T.bg2,border:`1px solid ${hov?T.a0+"55":T.b1}`,color:hov?T.a1:T.t1,transition:"all .15s",fontFamily:"Instrument Sans,sans-serif",animation:`fadeUp .4s ease ${.35+idx*.06}s both`,boxShadow:hov?`0 10px 18px rgba(0,0,0,.16)`:"inset 0 1px 0 rgba(255,255,255,.03)"}}>
      <span style={{width:5,height:5,borderRadius:"50%",background:hov?T.a0:T.t2,flexShrink:0,transition:"background .15s"}}/>
      {text}
      <span style={{fontSize:11,color:hov?T.a0:T.t2,transition:"color .15s",marginLeft:2}}>↗</span>
    </button>
  );
}

// ─── DATE RANGE PICKER ───────────────────────────────────────────────────────
function DateRangePicker({value,onChange}){
  const[open,setOpen]=useState(false);
  const cur=DATE_RANGES.find(d=>d.id===value)||DATE_RANGES[4];
  return(
    <div style={{position:"relative"}}>
      <button onClick={()=>setOpen(o=>!o)}
        style={{all:"unset",cursor:"pointer",display:"flex",alignItems:"center",gap:7,padding:"7px 12px",borderRadius:10,background:T.bg2,border:`1px solid ${T.b1}`,fontSize:12,color:T.t1,fontFamily:"Instrument Sans,sans-serif",transition:"all .12s",boxShadow:`inset 0 1px 0 rgba(255,255,255,.03)`}}
        onMouseEnter={e=>{e.currentTarget.style.borderColor=T.b2;e.currentTarget.style.color=T.t0;}}
        onMouseLeave={e=>{e.currentTarget.style.borderColor=T.b1;e.currentTarget.style.color=T.t1;}}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        {cur.label} <span style={{fontSize:9}}>▾</span>
      </button>
      {open&&(
        <div style={{position:"absolute",top:"calc(100% + 8px)",left:0,background:T.bg3,border:`1px solid ${T.b2}`,borderRadius:12,padding:5,zIndex:100,minWidth:148,boxShadow:"0 18px 36px rgba(0,0,0,.35)"}}>
          {DATE_RANGES.map(dr=>(
            <button key={dr.id} onClick={()=>{onChange(dr.id);setOpen(false);}}
              style={{all:"unset",cursor:"pointer",display:"block",width:"100%",padding:"7px 12px",borderRadius:7,fontSize:12,color:dr.id===value?T.a1:T.t1,background:dr.id===value?T.aBg:"transparent",fontFamily:"Instrument Sans,sans-serif",transition:"background .1s"}}
              onMouseEnter={e=>e.currentTarget.style.background=T.bg4}
              onMouseLeave={e=>e.currentTarget.style.background=dr.id===value?T.aBg:"transparent"}
            >{dr.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── SAVED DASHBOARDS PANEL ───────────────────────────────────────────────────
function SavedPanel({saved,onLoad,onDelete}){
  return(
    <div>
      <p style={{margin:"0 0 8px 8px",fontSize:10,color:T.t2,fontFamily:"JetBrains Mono,monospace",textTransform:"uppercase",letterSpacing:"0.08em"}}>Saved dashboards</p>
      {saved.length===0
        ?<div style={{padding:"20px 10px",textAlign:"center"}}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={T.t2} strokeWidth="1.5" style={{margin:"0 auto 8px",display:"block"}}><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
          <p style={{fontSize:12,color:T.t2,fontFamily:"Instrument Sans,sans-serif",lineHeight:1.5}}>No saved dashboards yet. Generate one and click Save.</p>
        </div>
        :saved.map((s,i)=>(
          <div key={s.id} style={{display:"flex",alignItems:"flex-start",gap:0,padding:"8px 6px",borderRadius:9,marginBottom:2,transition:"background .1s"}}
            onMouseEnter={e=>e.currentTarget.style.background=T.bg3}
            onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
            <button onClick={()=>onLoad(s)} style={{all:"unset",cursor:"pointer",flex:1,textAlign:"left"}}>
              <p style={{margin:"0 0 2px",fontSize:12,fontWeight:500,color:T.t0,fontFamily:"Playfair Display,serif",lineHeight:1.3}}>{s.title}</p>
              <p style={{margin:0,fontSize:10,color:T.t2,fontFamily:"JetBrains Mono,monospace"}}>{new Date(s.savedAt).toLocaleDateString()}</p>
            </button>
            <button onClick={()=>onDelete(s.id)} style={{all:"unset",cursor:"pointer",padding:"2px 4px",color:T.t2,fontSize:13,lineHeight:1,flexShrink:0,marginTop:2}}
              onMouseEnter={e=>e.currentTarget.style.color=T.red}
              onMouseLeave={e=>e.currentTarget.style.color=T.t2}>✕</button>
          </div>
        ))
      }
    </div>
  );
}

// ─── SHARE MODAL ─────────────────────────────────────────────────────────────
function ShareModal({title,onClose}){
  const[copied,setCopied]=useState(false);
  const fakeUrl=`https://dataintel.app/shared/${Math.random().toString(36).slice(2,10)}`;
  const copy=()=>{navigator.clipboard?.writeText(fakeUrl);setCopied(true);setTimeout(()=>setCopied(false),2000);};
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,animation:"fadeIn .15s ease both"}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:T.bg2,border:`1px solid ${T.b2}`,borderRadius:20,padding:"28px 28px 24px",width:420,maxWidth:"90vw",boxShadow:"0 24px 60px rgba(0,0,0,.6)",animation:"fadeUp .2s ease both"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:36,height:36,borderRadius:10,background:T.blueBg,border:`1px solid ${T.blue}33`,display:"flex",alignItems:"center",justifyContent:"center"}}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.blue} strokeWidth="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
            </div>
            <div>
              <p style={{margin:0,fontSize:14,fontWeight:600,color:T.t0,fontFamily:"Playfair Display,serif"}}>Share dashboard</p>
              <p style={{margin:0,fontSize:11,color:T.t2,fontFamily:"JetBrains Mono,monospace"}}>{title}</p>
            </div>
          </div>
          <button onClick={onClose} style={{all:"unset",cursor:"pointer",color:T.t2,fontSize:18,lineHeight:1}} onMouseEnter={e=>e.currentTarget.style.color=T.t0} onMouseLeave={e=>e.currentTarget.style.color=T.t2}>✕</button>
        </div>
        <p style={{margin:"0 0 12px",fontSize:13,color:T.t1,fontFamily:"Instrument Sans,sans-serif"}}>Anyone with this link can view this dashboard (read-only).</p>
        <div style={{display:"flex",gap:8,marginBottom:16}}>
          <div style={{flex:1,padding:"9px 12px",borderRadius:9,background:T.bg3,border:`1px solid ${T.b1}`,fontSize:12,color:T.t1,fontFamily:"JetBrains Mono,monospace",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{fakeUrl}</div>
          <button onClick={copy} style={{all:"unset",cursor:"pointer",padding:"9px 16px",borderRadius:9,background:copied?T.greenBg:T.aBg2,border:`1px solid ${copied?T.green+"44":T.a0+"44"}`,fontSize:12,color:copied?T.green:T.a1,fontFamily:"Instrument Sans,sans-serif",fontWeight:500,transition:"all .15s",flexShrink:0}}>
            {copied?"✓ Copied":"Copy"}
          </button>
        </div>
        <div style={{padding:"12px 14px",borderRadius:10,background:T.bg3,border:`1px solid ${T.b0}`}}>
          <p style={{margin:"0 0 8px",fontSize:11,color:T.t2,fontFamily:"JetBrains Mono,monospace",textTransform:"uppercase",letterSpacing:"0.06em"}}>Embed in Notion / Confluence</p>
          <pre style={{margin:0,fontSize:11,color:T.a2,fontFamily:"JetBrains Mono,monospace",whiteSpace:"pre-wrap",wordBreak:"break-all"}}>{`<iframe src="${fakeUrl}" width="100%" height="600" frameborder="0"></iframe>`}</pre>
        </div>
      </div>
    </div>
  );
}

// ─── EXPORT MODAL ─────────────────────────────────────────────────────────────
function ExportModal({result,onClose}){
  const EXPORT_ICONS={
    pdf:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.red} strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/></svg>,
    png:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.purple} strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>,
    csv:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.green} strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/></svg>,
    json:<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.a0} strokeWidth="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>,
  };
  const[exporting,setExporting]=useState(null);
  const doExport=async(type)=>{
    setExporting(type);
    await new Promise(r=>setTimeout(r,1200));
    if(type==="csv"&&result?.charts?.[0]?.data){
      const d=result.charts[0].data;
      const keys=Object.keys(d[0]||{});
      const csv=[keys.join(","),...d.map(r=>keys.map(k=>r[k]).join(","))].join("\n");
      const a=document.createElement("a");
      a.href="data:text/csv;charset=utf-8,"+encodeURIComponent(csv);
      a.download=`${result.title||"dashboard"}.csv`;
      a.click();
    }
    setExporting(null);
  };
  const opts=[
    {id:"pdf",label:"Export as PDF",desc:"Full dashboard, print-ready",iconKey:"pdf",col:T.red},
    {id:"png",label:"Export as PNG",desc:"Screenshot of current view",iconKey:"png",col:T.purple},
    {id:"csv",label:"Export data as CSV",desc:"Raw chart data as spreadsheet",iconKey:"csv",col:T.green},
    {id:"json",label:"Export as JSON",desc:"Full dashboard config and data",iconKey:"json",col:T.a0},
  ];
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,animation:"fadeIn .15s ease both"}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:T.bg2,border:`1px solid ${T.b2}`,borderRadius:20,padding:"28px",width:400,maxWidth:"90vw",boxShadow:"0 24px 60px rgba(0,0,0,.6)",animation:"fadeUp .2s ease both"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
          <p style={{margin:0,fontSize:15,fontWeight:600,color:T.t0,fontFamily:"Playfair Display,serif"}}>Export dashboard</p>
          <button onClick={onClose} style={{all:"unset",cursor:"pointer",color:T.t2,fontSize:18,lineHeight:1}} onMouseEnter={e=>e.currentTarget.style.color=T.t0} onMouseLeave={e=>e.currentTarget.style.color=T.t2}>✕</button>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {opts.map(opt=>(
            <button key={opt.id} onClick={()=>doExport(opt.id)} disabled={!!exporting}
              style={{all:"unset",cursor:exporting?"not-allowed":"pointer",display:"flex",alignItems:"center",gap:12,padding:"13px 14px",borderRadius:11,background:T.bg3,border:`1px solid ${T.b1}`,transition:"all .15s",opacity:exporting&&exporting!==opt.id?0.5:1}}
              onMouseEnter={e=>{if(!exporting){e.currentTarget.style.borderColor=opt.col+"55";e.currentTarget.style.background=T.bg4;}}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor=T.b1;e.currentTarget.style.background=T.bg3;}}>
              <div style={{width:36,height:36,borderRadius:10,background:opt.col+"15",border:`1px solid ${opt.col}33`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                {exporting===opt.id?<div style={{width:14,height:14,border:`2px solid ${T.t2}`,borderTopColor:T.t0,borderRadius:"50%",animation:"spin 1s linear infinite"}}/>:opt.icon}
              </div>
              <div>
                <p style={{margin:"0 0 2px",fontSize:13,fontWeight:500,color:T.t0,fontFamily:"Instrument Sans,sans-serif"}}>{exporting===opt.id?"Exporting…":opt.label}</p>
                <p style={{margin:0,fontSize:11,color:T.t2,fontFamily:"Instrument Sans,sans-serif"}}>{opt.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── ALERTS PANEL ─────────────────────────────────────────────────────────────
function AlertsPanel({alerts,onAdd,onDelete}){
  const[input,setInput]=useState("");
  const submit=()=>{if(input.trim()){onAdd(input.trim());setInput("");}};
  return(
    <div>
      <p style={{margin:"0 0 8px 8px",fontSize:10,color:T.t2,fontFamily:"JetBrains Mono,monospace",textTransform:"uppercase",letterSpacing:"0.08em"}}>NL Alerts</p>
      <div style={{display:"flex",gap:6,marginBottom:10}}>
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()}
          placeholder='e.g. "Views drop below 10k"'
          style={{all:"unset",flex:1,fontSize:12,color:T.t0,background:T.bg3,border:`1px solid ${T.b1}`,borderRadius:8,padding:"7px 10px",fontFamily:"Instrument Sans,sans-serif",caretColor:T.a0}}/>
        <button onClick={submit} style={{all:"unset",cursor:"pointer",padding:"7px 10px",borderRadius:8,background:T.aBg,border:`1px solid ${T.a0}44`,color:T.a1,fontSize:12,fontFamily:"Instrument Sans,sans-serif",flexShrink:0}}>+</button>
      </div>
      {alerts.length===0
        ?<p style={{fontSize:12,color:T.t2,padding:"4px 8px",fontFamily:"Instrument Sans,sans-serif"}}>No alerts set</p>
        :alerts.map((a,i)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",borderRadius:9,background:T.bg3,border:`1px solid ${T.b1}`,marginBottom:6}}>
            <div style={{width:7,height:7,borderRadius:"50%",background:T.green,flexShrink:0}}/>
            <span style={{flex:1,fontSize:12,color:T.t1,fontFamily:"Instrument Sans,sans-serif",lineHeight:1.4}}>{a}</span>
            <button onClick={()=>onDelete(i)} style={{all:"unset",cursor:"pointer",color:T.t2,fontSize:12,lineHeight:1}}
              onMouseEnter={e=>e.currentTarget.style.color=T.red} onMouseLeave={e=>e.currentTarget.style.color=T.t2}>✕</button>
          </div>
        ))
      }
    </div>
  );
}

// ─── SCHEDULE PANEL ───────────────────────────────────────────────────────────
function SchedulePanel({schedule,onSave}){
  const[freq,setFreq]=useState(schedule?.freq||"weekly");
  const[email,setEmail]=useState(schedule?.email||"");
  const[saved,setSaved]=useState(false);
  const save=()=>{onSave({freq,email});setSaved(true);setTimeout(()=>setSaved(false),2000);};
  return(
    <div>
      <p style={{margin:"0 0 10px 8px",fontSize:10,color:T.t2,fontFamily:"JetBrains Mono,monospace",textTransform:"uppercase",letterSpacing:"0.08em"}}>Scheduled Reports</p>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        <div>
          <p style={{margin:"0 0 4px",fontSize:11,color:T.t2,fontFamily:"JetBrains Mono,monospace"}}>Frequency</p>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:4}}>
            {["daily","weekly","monthly"].map(f=>(
              <button key={f} onClick={()=>setFreq(f)}
                style={{all:"unset",cursor:"pointer",padding:"6px 0",textAlign:"center",borderRadius:8,fontSize:11,fontFamily:"Instrument Sans,sans-serif",background:freq===f?T.aBg:T.bg3,color:freq===f?T.a1:T.t2,border:`1px solid ${freq===f?T.a0+"44":T.b1}`,transition:"all .15s",textTransform:"capitalize"}}>
                {f}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p style={{margin:"0 0 4px",fontSize:11,color:T.t2,fontFamily:"JetBrains Mono,monospace"}}>Email</p>
          <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@company.com"
            style={{all:"unset",width:"100%",fontSize:12,color:T.t0,background:T.bg3,border:`1px solid ${T.b1}`,borderRadius:8,padding:"8px 10px",fontFamily:"Instrument Sans,sans-serif",caretColor:T.a0}}/>
        </div>
        <button onClick={save} style={{all:"unset",cursor:"pointer",padding:"9px 0",textAlign:"center",borderRadius:9,fontSize:12,fontWeight:500,fontFamily:"Instrument Sans,sans-serif",background:saved?T.greenBg:T.aBg2,color:saved?T.green:T.a1,border:`1px solid ${saved?T.green+"44":T.a0+"44"}`,transition:"all .15s"}}>
          {saved?"✓ Saved":"Save schedule"}
        </button>
        <p style={{margin:"4px 0 0",fontSize:10,color:T.t2,fontFamily:"JetBrains Mono,monospace",textAlign:"center",lineHeight:1.5}}>Requires backend integration to send emails</p>
      </div>
    </div>
  );
}

// ─── REVIEW CAROUSEL ─────────────────────────────────────────────────────────
const REVIEWS=[
  {
    quote:"DataIntel cut our reporting time from 2 days to 30 seconds. Our head of content now runs her own queries without asking the data team.",
    name:"Priya Venkataraman",initials:"PV",role:"Head of Analytics",company:"StreamVerse India",stars:5,
  },
  {
    quote:"I asked 'which categories have the worst sentiment in tier-2 cities?' and got a full dashboard in seconds. Absolutely game-changing for our team.",
    name:"Arjun Mehta",initials:"AM",role:"Growth Lead",company:"ReelRocket",stars:5,
  },
  {
    quote:"We replaced our entire weekly BI meeting with DataIntel. Everyone just queries what they need. The voice input feature is a huge bonus.",
    name:"Sneha Iyer",initials:"SI",role:"VP of Product",company:"CineStats",stars:5,
  },
  {
    quote:"The anomaly detection flagged a 40% view drop in our Tamil content before we even noticed. Saved us from a very embarrassing quarterly review.",
    name:"Rohan Pillai",initials:"RP",role:"Director of Insights",company:"BharatMedia",stars:5,
  },
];

function ReviewCarousel({darkMode=true}){
  const[idx,setIdx]=useState(0);
  const[fading,setFading]=useState(false);
  const go=(n)=>{setFading(true);setTimeout(()=>{setIdx(n);setFading(false);},200);};

  useEffect(()=>{
    const t=setInterval(()=>go((idx+1)%REVIEWS.length),4000);
    return()=>clearInterval(t);
  },[idx]);

  const r=REVIEWS[idx];
  const avatarColors=[
    `linear-gradient(135deg,${T.a0},#9A6518)`,
    `linear-gradient(135deg,${T.green},#4A8A60)`,
    `linear-gradient(135deg,#C97B6E,#9A4A3A)`,
    `linear-gradient(135deg,${T.a1},${T.a0})`,
  ];

  const cardBg = darkMode ? "rgba(22,17,8,0.75)" : "rgba(255,255,255,0.88)";
  const quoteClr = darkMode ? T.t1 : "#4f3a1e";
  const nameClr = darkMode ? T.t0 : "#2a220f";
  const roleClr = darkMode ? T.t2 : "#6d5c45";

  return(
    <div style={{marginTop:40,animation:"fadeUp .5s ease .4s both"}}>
      {/* Card */}
      <div style={{padding:"18px 20px",borderRadius:14,background:cardBg,border:`1px solid ${T.b1}`,maxWidth:460,transition:"opacity .2s",opacity:fading?0:1}}>
        {/* Stars */}
        <div style={{display:"flex",gap:2,marginBottom:10}}>
          {[...Array(r.stars)].map((_,i)=><span key={i} style={{color:T.a0,fontSize:12}}>★</span>)}
        </div>
        <p style={{margin:"0 0 14px",fontSize:13,color:quoteClr,lineHeight:1.65,fontFamily:"Instrument Sans,sans-serif",fontStyle:"italic"}}>
          "{r.quote}"
        </p>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div style={{width:32,height:32,borderRadius:"50%",background:avatarColors[idx],display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:T.bg0,fontFamily:"Instrument Sans,sans-serif",flexShrink:0}}>
            {r.initials}
          </div>
          <div>
            <p style={{margin:0,fontSize:13,fontWeight:600,color:nameClr,fontFamily:"Instrument Sans,sans-serif"}}>{r.name}</p>
            <p style={{margin:0,fontSize:10,color:roleClr,fontFamily:"JetBrains Mono,monospace"}}>{r.role} · {r.company}</p>
          </div>
        </div>
      </div>

      {/* Dot indicators */}
      <div style={{display:"flex",gap:6,marginTop:14}}>
        {REVIEWS.map((_,i)=>(
          <button key={i} onClick={()=>go(i)} style={{all:"unset",cursor:"pointer",width:i===idx?20:6,height:6,borderRadius:3,background:i===idx?T.a0:T.b2,transition:"all .3s cubic-bezier(.16,1,.3,1)"}}/>
        ))}
      </div>
    </div>
  );
}

// ─── ABOUT PAGE ───────────────────────────────────────────────────────────────
const TEAM=[
  {initials:"AK",name:"Arjun Kumar",role:"Full-Stack Engineer",bio:"Built the React frontend, Claude API integration, and the entire chart rendering pipeline. Obsessed with performance and clean architecture.",skills:["React","Node.js","Claude API","Recharts"],color:T.a0,grad:`linear-gradient(135deg,#D4A854,#9A6518)`,linkedin:"#",github:"#"},
  {initials:"PS",name:"Priya Sharma",role:"Product & UX Design",bio:"Designed the Sahara Dusk palette, all UI components, and the user flow from landing page to dashboard. Former data analyst — built this for herself first.",skills:["Figma","UX Research","Design Systems","Data Viz"],color:"#7ECB9E",grad:"linear-gradient(135deg,#7ECB9E,#3A8A5E)",linkedin:"#",github:"#"},
  {initials:"RN",name:"Rohan Nair",role:"Data Engineering",bio:"Designed the YouTube dataset schema, built the SQL generation system, and implemented anomaly detection logic. Makes the AI actually understand your data.",skills:["SQL","Python","Data Modeling","Prompt Engineering"],color:"#B07EE8",grad:"linear-gradient(135deg,#B07EE8,#7A4AB0)",linkedin:"#",github:"#"},
  {initials:"SM",name:"Sneha Mehta",role:"ML & AI Integration",bio:"Integrated Claude Sonnet for natural language to SQL translation, fine-tuned the system prompts, and built the chart type selection logic.",skills:["LLMs","NLP","Claude API","Analytics"],color:"#6BA8E8",grad:"linear-gradient(135deg,#6BA8E8,#2A6EA8)",linkedin:"#",github:"#"},
];

const TECH_STACK=[
  {name:"React 18",desc:"UI framework",color:"#61DAFB",bg:"rgba(97,218,251,0.08)"},
  {name:"Claude Sonnet",desc:"AI engine",color:"#D4A854",bg:"rgba(212,168,84,0.10)"},
  {name:"Recharts",desc:"Data visualisation",color:"#7ECB9E",bg:"rgba(126,203,158,0.08)"},
  {name:"Next.js",desc:"React framework",color:"#FDF6E3",bg:"rgba(253,246,227,0.06)"},
  {name:"Vercel",desc:"Deployment",color:"#FDF6E3",bg:"rgba(253,246,227,0.06)"},
  {name:"Tailwind CSS",desc:"Styling utility",color:"#38BDF8",bg:"rgba(56,189,248,0.08)"},
  {name:"Web Speech API",desc:"Voice input",color:"#B07EE8",bg:"rgba(176,126,232,0.08)"},
  {name:"localStorage",desc:"Client persistence",color:"#EAC97A",bg:"rgba(234,201,122,0.08)"},
];

const TIMELINE=[
  {phase:"Week 1",title:"Idea & research",desc:"Identified the problem: analysts waste hours building dashboards. Decided to let AI do it from plain English."},
  {phase:"Week 2",title:"Core pipeline",desc:"Built the Claude API integration, SQL generation, and basic chart rendering. First working demo: a bar chart from a question."},
  {phase:"Week 3",title:"Full product",desc:"Added auth, onboarding, 7 chart types, anomaly detection, voice input, export, sharing, and the full dashboard UX."},
  {phase:"Week 4",title:"Polish & launch",desc:"Landing page, live demo mode, light/dark themes, keyboard shortcuts, command palette, and this about page."},
];

function AboutPage({onBack,onGetStarted}){
  const[scrolled,setScrolled]=useState(false);
  const ref=useRef();
  useEffect(()=>{
    const el=ref.current;
    if(!el)return;
    const h=()=>setScrolled(el.scrollTop>20);
    el.addEventListener("scroll",h);
    return()=>el.removeEventListener("scroll",h);
  },[]);

  const GH_URL="https://github.com/dataintel/dataintel";
  const DEVPOST_URL="https://devpost.com/software/dataintel";

  const GitHubIcon=()=>(
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
  );
  const ExtIcon=()=>(
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 0 1-1h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
  );

  return(
    <div ref={ref} style={{height:"100vh",overflowY:"auto",background:T.bg0,color:T.t0,fontFamily:"Instrument Sans,sans-serif"}}>

      {/* Navbar */}
      <nav style={{position:"sticky",top:0,zIndex:100,height:68,display:"flex",alignItems:"center",padding:"0 60px",borderBottom:`1px solid ${scrolled?T.b1:"transparent"}`,background:scrolled?`linear-gradient(180deg, ${T.bg0}F2, ${T.bg1}EA)`:"transparent",backdropFilter:scrolled?"blur(18px) saturate(120%)":"none",boxShadow:scrolled?"0 10px 30px rgba(0,0,0,.18)":"none",transition:"all .25s"}}>
        <button onClick={onBack} style={{all:"unset",cursor:"pointer",display:"flex",alignItems:"center",gap:8,marginRight:"auto"}}>
          <div style={{width:34,height:34,borderRadius:10,background:`linear-gradient(135deg,${T.a0},#9A6518)`,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><polygon points="8,1 2,14 8,10 14,14" fill={T.bg0} opacity=".95"/></svg>
          </div>
          <span style={{fontSize:16,fontWeight:700,color:T.t0,fontFamily:"Playfair Display,serif",letterSpacing:"-.02em"}}>DataIntel</span>
        </button>
        <div style={{display:"flex",alignItems:"center",gap:20,marginRight:24}}>
          <button onClick={onBack} style={{all:"unset",cursor:"pointer",fontSize:13,color:T.t1,fontFamily:"Instrument Sans,sans-serif",display:"flex",alignItems:"center",gap:5,transition:"color .12s"}}
            onMouseEnter={e=>e.currentTarget.style.color=T.t0} onMouseLeave={e=>e.currentTarget.style.color=T.t1}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
            Back to home
          </button>
          <a href={GH_URL} target="_blank" rel="noreferrer" style={{all:"unset",cursor:"pointer",display:"flex",alignItems:"center",gap:6,fontSize:13,color:T.t1,fontFamily:"Instrument Sans,sans-serif",padding:"6px 12px",borderRadius:8,border:`1px solid ${T.b1}`,transition:"all .12s"}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor=T.b2;e.currentTarget.style.color=T.t0;}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor=T.b1;e.currentTarget.style.color=T.t1;}}>
            <GitHubIcon/>
            GitHub
          </a>
          <a href={DEVPOST_URL} target="_blank" rel="noreferrer" style={{all:"unset",cursor:"pointer",display:"flex",alignItems:"center",gap:6,fontSize:13,color:"#7BB8FF",fontFamily:"Instrument Sans,sans-serif",padding:"6px 12px",borderRadius:8,border:"1px solid rgba(13,110,253,0.3)",transition:"all .12s"}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(13,110,253,0.55)";e.currentTarget.style.background="rgba(13,60,97,0.2)";}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(13,110,253,0.3)";e.currentTarget.style.background="transparent";}}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="#7BB8FF"><path d="M6.002 1.61 0 12.004 6.002 22.39h11.996L24 12.004 17.998 1.61zm1.593 4.084h3.947c3.605 0 6.276 1.695 6.276 6.31 0 4.436-3.21 6.302-6.456 6.302H7.595zm2.517 2.449v7.714h1.241c2.646 0 3.862-1.55 3.862-3.861.009-2.569-1.096-3.853-3.767-3.853z"/></svg>
            Devpost
          </a>
        </div>
        <button onClick={onGetStarted} style={{all:"unset",cursor:"pointer",padding:"7px 16px",borderRadius:8,fontSize:13,fontWeight:600,color:T.bg0,background:`linear-gradient(135deg,${T.a0},#B8882E)`,fontFamily:"Instrument Sans,sans-serif",transition:"all .12s"}}
          onMouseEnter={e=>e.currentTarget.style.background=`linear-gradient(135deg,${T.a1},${T.a0})`}
          onMouseLeave={e=>e.currentTarget.style.background=`linear-gradient(135deg,${T.a0},#B8882E)`}>
          Get started free
        </button>
      </nav>

      {/* Hero */}
      <section style={{padding:"80px 60px 60px",textAlign:"center",position:"relative",overflow:"hidden",borderBottom:`1px solid ${T.b0}`}}>
        <div style={{position:"absolute",inset:0,background:`radial-gradient(ellipse 50% 60% at 50% 0%,${T.a0}10,transparent 60%)`,pointerEvents:"none"}}/>
        <div style={{position:"absolute",inset:0,backgroundImage:`linear-gradient(${T.b0} 1px,transparent 1px),linear-gradient(90deg,${T.b0} 1px,transparent 1px)`,backgroundSize:"48px 48px",pointerEvents:"none",maskImage:"radial-gradient(ellipse 70% 70% at 50% 50%,black 20%,transparent 100%)"}}/>
        <div style={{position:"relative",maxWidth:680,margin:"0 auto"}}>
          <div style={{display:"inline-flex",alignItems:"center",gap:7,padding:"4px 14px",borderRadius:20,background:T.aBg,border:`1px solid ${T.a0}33`,marginBottom:20,animation:"fadeUp .5s ease both"}}>
            <span style={{fontSize:11,color:T.a1,fontFamily:"JetBrains Mono,monospace",letterSpacing:"0.06em"}}>Hackathon Edition · 2025</span>
          </div>
          <h1 style={{margin:"0 0 16px",fontSize:"clamp(36px,5vw,56px)",fontWeight:700,color:T.t0,fontFamily:"Playfair Display,serif",letterSpacing:"-.04em",lineHeight:1.1,animation:"fadeUp .5s ease .1s both"}}>
            About <span style={{color:T.a0,fontStyle:"italic"}}>DataIntel</span>
          </h1>
          <p style={{margin:"0 0 28px",fontSize:16,color:T.t1,lineHeight:1.8,animation:"fadeUp .5s ease .2s both"}}>
            We built DataIntel because we were tired of waiting for dashboards. A team of four engineers and designers from India, united by one belief — data insights should be a conversation, not a query.
          </p>
          <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",justifyContent:"center",animation:"fadeUp .5s ease .3s both"}}>
            <a href={GH_URL} target="_blank" rel="noreferrer"
              style={{all:"unset",cursor:"pointer",display:"inline-flex",alignItems:"center",gap:8,padding:"11px 22px",borderRadius:11,background:T.bg2,border:`1px solid ${T.b2}`,fontSize:13,color:T.t0,fontFamily:"Instrument Sans,sans-serif",fontWeight:500,transition:"all .15s"}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=T.a0+"55";e.currentTarget.style.background=T.bg3;}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor=T.b2;e.currentTarget.style.background=T.bg2;}}>
              <GitHubIcon/>
              View on GitHub
              <ExtIcon/>
            </a>
            <a href={DEVPOST_URL} target="_blank" rel="noreferrer"
              style={{all:"unset",cursor:"pointer",display:"inline-flex",alignItems:"center",gap:8,padding:"11px 22px",borderRadius:11,background:"rgba(13,60,97,0.35)",border:"1px solid rgba(13,110,253,0.35)",fontSize:13,color:"#7BB8FF",fontFamily:"Instrument Sans,sans-serif",fontWeight:500,transition:"all .15s"}}
              onMouseEnter={e=>{e.currentTarget.style.background="rgba(13,60,97,0.55)";e.currentTarget.style.borderColor="rgba(13,110,253,0.6)";}}
              onMouseLeave={e=>{e.currentTarget.style.background="rgba(13,60,97,0.35)";e.currentTarget.style.borderColor="rgba(13,110,253,0.35)";}}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="#7BB8FF"><path d="M6.002 1.61 0 12.004 6.002 22.39h11.996L24 12.004 17.998 1.61zm1.593 4.084h3.947c3.605 0 6.276 1.695 6.276 6.31 0 4.436-3.21 6.302-6.456 6.302H7.595zm2.517 2.449v7.714h1.241c2.646 0 3.862-1.55 3.862-3.861.009-2.569-1.096-3.853-3.767-3.853z"/></svg>
              View on Devpost
              <ExtIcon/>
            </a>
          </div>

          {/* Tech badge row */}
          <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",justifyContent:"center",marginTop:24,animation:"fadeUp .5s ease .45s both"}}>
            {TECH_STACK.map((t,i)=>(
              <span key={i} style={{display:"inline-flex",alignItems:"center",gap:5,padding:"4px 11px",borderRadius:20,background:T.bg2,border:`1px solid ${T.b1}`,fontSize:11,color:T.t1,fontFamily:"JetBrains Mono,monospace",transition:"all .15s"}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor=t.color+"55";e.currentTarget.style.color=T.t0;}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor=T.b1;e.currentTarget.style.color=T.t1;}}>
                <span style={{width:6,height:6,borderRadius:"50%",background:t.color,flexShrink:0,boxShadow:`0 0 5px ${t.color}88`,display:"inline-block"}}/>
                {t.name}
              </span>
            ))}
          </div>
        </div>
      </section>

      <div style={{maxWidth:1060,margin:"0 auto",padding:"0 60px"}}>

        {/* Project story */}
        <section style={{padding:"64px 0 56px",borderBottom:`1px solid ${T.b0}`}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:48,alignItems:"start"}}>
            <div>
              <p style={{margin:"0 0 10px",fontSize:11,color:T.a0,fontFamily:"JetBrains Mono,monospace",textTransform:"uppercase",letterSpacing:"0.1em"}}>The story</p>
              <h2 style={{margin:"0 0 16px",fontSize:32,fontWeight:700,color:T.t0,fontFamily:"Playfair Display,serif",letterSpacing:"-.03em",lineHeight:1.2}}>Why we built this</h2>
              <p style={{margin:"0 0 14px",fontSize:14,color:T.t1,lineHeight:1.8,fontFamily:"Instrument Sans,sans-serif"}}>
                Every analytics team we knew had the same problem: business questions took days to become dashboards. Not because the data wasn't there — but because you needed a data engineer to write the SQL, a BI developer to build the chart, and a designer to make it legible.
              </p>
              <p style={{margin:"0 0 14px",fontSize:14,color:T.t1,lineHeight:1.8,fontFamily:"Instrument Sans,sans-serif"}}>
                We asked: what if you could just ask the question? No SQL. No BI tool. No waiting. Just type "which categories have the best sentiment in tier-2 regions?" and get a full interactive dashboard in 5 seconds.
              </p>
              <p style={{margin:0,fontSize:14,color:T.t1,lineHeight:1.8,fontFamily:"Instrument Sans,sans-serif"}}>
                DataIntel is our answer. Built in 4 weeks at a hackathon, powered by Claude Sonnet, and designed to make data insights accessible to everyone on your team — not just the analysts.
              </p>
            </div>
            {/* Timeline */}
            <div style={{display:"flex",flexDirection:"column",gap:0}}>
              {TIMELINE.map((t,i)=>{
                const last=i===TIMELINE.length-1;
                return(
                  <div key={i} style={{display:"flex",gap:16}}>
                    <div style={{display:"flex",flexDirection:"column",alignItems:"center",width:32,flexShrink:0}}>
                      <div style={{width:28,height:28,borderRadius:"50%",background:`linear-gradient(135deg,${T.a0},#9A6518)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,zIndex:1}}>
                        <span style={{fontSize:9,fontWeight:700,color:T.bg0,fontFamily:"JetBrains Mono,monospace"}}>{String(i+1).padStart(2,"0")}</span>
                      </div>
                      {!last&&<div style={{width:2,flex:1,minHeight:16,background:`linear-gradient(${T.a0}44,${T.b1})`,margin:"3px 0"}}/>}
                    </div>
                    <div style={{paddingBottom:last?0:20}}>
                      <span style={{fontSize:9,color:T.a0,fontFamily:"JetBrains Mono,monospace",textTransform:"uppercase",letterSpacing:"0.08em"}}>{t.phase}</span>
                      <p style={{margin:"3px 0 4px",fontSize:13,fontWeight:600,color:T.t0,fontFamily:"Playfair Display,serif"}}>{t.title}</p>
                      <p style={{margin:0,fontSize:12,color:T.t2,lineHeight:1.6,fontFamily:"Instrument Sans,sans-serif"}}>{t.desc}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Team */}
        <section style={{padding:"64px 0 56px",borderBottom:`1px solid ${T.b0}`}}>
          <div style={{textAlign:"center",marginBottom:44}}>
            <p style={{margin:"0 0 8px",fontSize:11,color:T.a0,fontFamily:"JetBrains Mono,monospace",textTransform:"uppercase",letterSpacing:"0.1em"}}>The team</p>
            <h2 style={{margin:"0 0 10px",fontSize:36,fontWeight:700,color:T.t0,fontFamily:"Playfair Display,serif",letterSpacing:"-.03em",lineHeight:1.15}}>Built by four, for everyone</h2>
            <p style={{margin:0,fontSize:14,color:T.t1,lineHeight:1.7,maxWidth:480,marginLeft:"auto",marginRight:"auto"}}>A multidisciplinary team from India — engineers, designers, and data scientists working together.</p>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:16}}>
            {TEAM.map((m,i)=>(
              <div key={i} style={{padding:"24px",borderRadius:16,background:T.bg1,border:`1px solid ${T.b1}`,transition:"border-color .15s,background .15s",animation:`fadeUp .5s ease ${i*.1}s both`}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor=m.color+"44";e.currentTarget.style.background=T.bg2;}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor=T.b1;e.currentTarget.style.background=T.bg1;}}>
                <div style={{display:"flex",alignItems:"flex-start",gap:14,marginBottom:14}}>
                  <div style={{width:52,height:52,borderRadius:"50%",background:m.grad,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:700,color:T.bg0,flexShrink:0,boxShadow:`0 4px 16px ${m.color}44`}}>
                    {m.initials}
                  </div>
                  <div style={{flex:1}}>
                    <p style={{margin:"0 0 2px",fontSize:16,fontWeight:700,color:T.t0,fontFamily:"Playfair Display,serif"}}>{m.name}</p>
                    <p style={{margin:"0 0 8px",fontSize:11,color:m.color,fontFamily:"JetBrains Mono,monospace"}}>{m.role}</p>
                    <div style={{display:"flex",gap:6}}>
                      <a href={m.linkedin} style={{all:"unset",cursor:"pointer",width:26,height:26,borderRadius:7,background:T.bg3,border:`1px solid ${T.b1}`,display:"flex",alignItems:"center",justifyContent:"center",color:T.t2,transition:"all .12s"}}
                        onMouseEnter={e=>{e.currentTarget.style.borderColor=T.b2;e.currentTarget.style.color=T.t0;}}
                        onMouseLeave={e=>{e.currentTarget.style.borderColor=T.b1;e.currentTarget.style.color=T.t2;}}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6zM2 9h4v12H2z"/><circle cx="4" cy="4" r="2"/></svg>
                      </a>
                      <a href={m.github} style={{all:"unset",cursor:"pointer",width:26,height:26,borderRadius:7,background:T.bg3,border:`1px solid ${T.b1}`,display:"flex",alignItems:"center",justifyContent:"center",color:T.t2,transition:"all .12s"}}
                        onMouseEnter={e=>{e.currentTarget.style.borderColor=T.b2;e.currentTarget.style.color=T.t0;}}
                        onMouseLeave={e=>{e.currentTarget.style.borderColor=T.b1;e.currentTarget.style.color=T.t2;}}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
                      </a>
                    </div>
                  </div>
                </div>
                <p style={{margin:"0 0 12px",fontSize:13,color:T.t1,lineHeight:1.65,fontFamily:"Instrument Sans,sans-serif"}}>{m.bio}</p>
                <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                  {m.skills.map((s,j)=>(
                    <span key={j} style={{fontSize:10,color:m.color,background:`${m.color}15`,border:`1px solid ${m.color}33`,padding:"2px 8px",borderRadius:6,fontFamily:"JetBrains Mono,monospace"}}>{s}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Tech stack */}
        <section style={{padding:"64px 0 56px",borderBottom:`1px solid ${T.b0}`}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:48,alignItems:"start"}}>
            <div>
              <p style={{margin:"0 0 10px",fontSize:11,color:T.a0,fontFamily:"JetBrains Mono,monospace",textTransform:"uppercase",letterSpacing:"0.1em"}}>Tech stack</p>
              <h2 style={{margin:"0 0 14px",fontSize:32,fontWeight:700,color:T.t0,fontFamily:"Playfair Display,serif",letterSpacing:"-.03em",lineHeight:1.2}}>What we built with</h2>
              <p style={{margin:"0 0 24px",fontSize:14,color:T.t1,lineHeight:1.8,fontFamily:"Instrument Sans,sans-serif"}}>
                Every technology in DataIntel was chosen for speed of development, reliability, and the best possible user experience. The entire frontend is a single React file — no build complexity, no hidden dependencies.
              </p>
              <div style={{padding:"16px 18px",borderRadius:12,background:T.bg2,border:`1px solid ${T.b1}`}}>
                <p style={{margin:"0 0 8px",fontSize:11,color:T.a0,fontFamily:"JetBrains Mono,monospace",textTransform:"uppercase",letterSpacing:"0.08em"}}>Core architecture</p>
                <p style={{margin:0,fontSize:13,color:T.t1,lineHeight:1.7,fontFamily:"Instrument Sans,sans-serif"}}>
                  Natural language → Claude Sonnet (SQL + chart config) → React state → Recharts render. The entire pipeline from question to dashboard runs in under 5 seconds.
                </p>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8}}>
              {TECH_STACK.map((t,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"12px 14px",borderRadius:11,background:T.bg2,border:`1px solid ${T.b1}`,transition:"border-color .15s"}}
                  onMouseEnter={e=>e.currentTarget.style.borderColor=T.b2}
                  onMouseLeave={e=>e.currentTarget.style.borderColor=T.b1}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:t.color,flexShrink:0,boxShadow:`0 0 6px ${t.color}88`}}/>
                  <div>
                    <p style={{margin:0,fontSize:13,fontWeight:600,color:T.t0,fontFamily:"Instrument Sans,sans-serif"}}>{t.name}</p>
                    <p style={{margin:0,fontSize:10,color:T.t2,fontFamily:"JetBrains Mono,monospace"}}>{t.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section style={{padding:"64px 0 80px",textAlign:"center"}}>
          <div style={{display:"inline-flex",alignItems:"center",gap:7,padding:"5px 14px",borderRadius:20,background:T.aBg,border:`1px solid ${T.a0}33`,marginBottom:20}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:T.a0,boxShadow:`0 0 8px ${T.a0}`}}/>
            <span style={{fontSize:11,color:T.a1,fontFamily:"JetBrains Mono,monospace",letterSpacing:"0.06em"}}>Open source · MIT license</span>
          </div>
          <h2 style={{margin:"0 0 12px",fontSize:36,fontWeight:700,color:T.t0,fontFamily:"Playfair Display,serif",letterSpacing:"-.03em",lineHeight:1.15}}>Ready to explore?</h2>
          <p style={{margin:"0 0 28px",fontSize:15,color:T.t1,lineHeight:1.7,maxWidth:480,marginLeft:"auto",marginRight:"auto"}}>
            Try the live demo — no account needed — or create a free account and start asking your own data questions. Built for the hackathon, designed for the real world.
          </p>
          <div style={{display:"flex",alignItems:"center",gap:10,justifyContent:"center",flexWrap:"wrap",marginBottom:20}}>
            <button onClick={onGetStarted}
              style={{all:"unset",cursor:"pointer",padding:"13px 28px",borderRadius:12,fontSize:14,fontWeight:700,color:T.bg0,background:`linear-gradient(135deg,${T.a0},#B8882E)`,fontFamily:"Playfair Display,serif",boxShadow:`0 6px 22px ${T.a0}44`,transition:"all .15s"}}
              onMouseEnter={e=>e.currentTarget.style.background=`linear-gradient(135deg,${T.a1},${T.a0})`}
              onMouseLeave={e=>e.currentTarget.style.background=`linear-gradient(135deg,${T.a0},#B8882E)`}>
              Get started free →
            </button>
            <a href={GH_URL} target="_blank" rel="noreferrer"
              style={{all:"unset",cursor:"pointer",display:"flex",alignItems:"center",gap:7,padding:"13px 22px",borderRadius:12,fontSize:14,color:T.t1,border:`1px solid ${T.b2}`,fontFamily:"Instrument Sans,sans-serif",transition:"all .15s"}}
              onMouseEnter={e=>{e.currentTarget.style.color=T.t0;e.currentTarget.style.borderColor=T.b3;e.currentTarget.style.background=T.bg2;}}
              onMouseLeave={e=>{e.currentTarget.style.color=T.t1;e.currentTarget.style.borderColor=T.b2;e.currentTarget.style.background="transparent";}}>
              <GitHubIcon/>
              Star on GitHub
            </a>
            <a href={DEVPOST_URL} target="_blank" rel="noreferrer"
              style={{all:"unset",cursor:"pointer",display:"flex",alignItems:"center",gap:7,padding:"13px 22px",borderRadius:12,fontSize:14,color:"#7BB8FF",border:"1px solid rgba(13,110,253,0.3)",fontFamily:"Instrument Sans,sans-serif",transition:"all .15s"}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(13,110,253,0.55)";e.currentTarget.style.background="rgba(13,60,97,0.3)";}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(13,110,253,0.3)";e.currentTarget.style.background="transparent";}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="#7BB8FF"><path d="M6.002 1.61 0 12.004 6.002 22.39h11.996L24 12.004 17.998 1.61zm1.593 4.084h3.947c3.605 0 6.276 1.695 6.276 6.31 0 4.436-3.21 6.302-6.456 6.302H7.595zm2.517 2.449v7.714h1.241c2.646 0 3.862-1.55 3.862-3.861.009-2.569-1.096-3.853-3.767-3.853z"/></svg>
              View on Devpost
            </a>
          </div>
          {/* Repo stats row */}
          <div style={{display:"flex",alignItems:"center",gap:16,justifyContent:"center",flexWrap:"wrap"}}>
            {[
              {icon:"⭐",label:"Stars",val:"—"},
              {icon:"🍴",label:"Forks",val:"—"},
              {icon:"📋",label:"License",val:"MIT"},
              {icon:"🏆",label:"Hackathon",val:"2025"},
            ].map((s,i)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 12px",borderRadius:9,background:T.bg2,border:`1px solid ${T.b1}`}}>
                <span style={{fontSize:12}}>{TOUR_ICONS[s.iconKey]}</span>
                <span style={{fontSize:11,color:T.t2,fontFamily:"JetBrains Mono,monospace"}}>{s.label}</span>
                <span style={{fontSize:11,fontWeight:600,color:T.t0,fontFamily:"JetBrains Mono,monospace"}}>{s.val}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

// ─── LIVE COUNTER ─────────────────────────────────────────────────────────────
function useLiveCount(seed,tickMs=3200,delta=()=>Math.floor(Math.random()*3)+1){
  const[count,setCount]=useState(seed);
  useEffect(()=>{
    const id=setInterval(()=>setCount(c=>c+delta()),tickMs+(Math.random()*1000|0));
    return()=>clearInterval(id);
  },[]);
  return count;
}

function NavLiveBadge(){
  const q=useLiveCount(24817,2800,()=>Math.floor(Math.random()*4)+1);
  const fmt=n=>n>=1000?`${(n/1000).toFixed(1)}k`:String(n);
  return(
    <div style={{display:"flex",alignItems:"center",gap:5,padding:"3px 9px",borderRadius:20,background:T.aBg,border:`1px solid ${T.a0}33`,marginLeft:6}}>
      <div style={{width:6,height:6,borderRadius:"50%",background:T.a0,boxShadow:`0 0 5px ${T.a0}`,flexShrink:0}}/>
      <span style={{fontSize:10,color:T.a1,fontFamily:"JetBrains Mono,monospace",whiteSpace:"nowrap"}}>{fmt(q)} dashboards</span>
    </div>
  );
}

function LiveCounter(){
  const queries=useLiveCount(24817,2800,()=>Math.floor(Math.random()*4)+1);
  const users=useLiveCount(1342,5500,()=>1);
  const[flash,setFlash]=useState(false);
  const prevQ=useRef(queries);
  useEffect(()=>{
    if(queries!==prevQ.current){setFlash(true);setTimeout(()=>setFlash(false),600);prevQ.current=queries;}
  },[queries]);

  const fmt=n=>n>=1000?`${(n/1000).toFixed(1)}k`:String(n);

  return(
    <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",justifyContent:"center"}}>
      {/* Query counter */}
      <div style={{display:"flex",alignItems:"center",gap:8,padding:"7px 14px",borderRadius:20,background:T.bg2,border:`1px solid ${flash?T.a0+"66":T.b1}`,transition:"border-color .4s",boxShadow:flash?`0 0 12px ${T.a0}22`:"none"}}>
        <div style={{position:"relative",width:8,height:8,flexShrink:0}}>
          <div style={{width:8,height:8,borderRadius:"50%",background:T.a0,boxShadow:`0 0 6px ${T.a0}`}}/>
          <div style={{position:"absolute",inset:0,borderRadius:"50%",background:T.a0,animation:"ping 1.5s ease-out infinite",opacity:0.4}}/>
        </div>
        <span style={{fontSize:13,fontWeight:700,color:T.t0,fontFamily:"Playfair Display,serif",letterSpacing:"-.01em",transition:"color .3s",minWidth:48,display:"inline-block",textAlign:"right"}}>{fmt(queries)}</span>
        <span style={{fontSize:11,color:T.t2,fontFamily:"JetBrains Mono,monospace"}}>dashboards generated</span>
      </div>

      <div style={{width:1,height:16,background:T.b1,flexShrink:0}}/>

      {/* Active users */}
      <div style={{display:"flex",alignItems:"center",gap:8,padding:"7px 14px",borderRadius:20,background:T.bg2,border:`1px solid ${T.b1}`}}>
        {/* Mini avatar stack */}
        <div style={{display:"flex",alignItems:"center",marginRight:2}}>
          {["#D4A854","#7ECB9E","#B07EE8","#6BA8E8"].map((c,i)=>(
            <div key={i} style={{width:18,height:18,borderRadius:"50%",background:c,border:`2px solid ${T.bg2}`,marginLeft:i===0?0:-6,zIndex:4-i,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:700,color:T.bg0,flexShrink:0}}>
              {["A","P","R","S"][i]}
            </div>
          ))}
        </div>
        <span style={{fontSize:13,fontWeight:700,color:T.t0,fontFamily:"Playfair Display,serif",letterSpacing:"-.01em"}}>{fmt(users)}</span>
        <span style={{fontSize:11,color:T.t2,fontFamily:"JetBrains Mono,monospace"}}>users this week</span>
      </div>

      <div style={{width:1,height:16,background:T.b1,flexShrink:0}}/>

      {/* Powered by badge */}
      <div style={{display:"flex",alignItems:"center",gap:6,padding:"7px 14px",borderRadius:20,background:T.bg2,border:`1px solid ${T.b1}`}}>
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><polygon points="8,1 2,14 8,10 14,14" fill={T.a0} opacity=".9"/></svg>
        <span style={{fontSize:11,color:T.t2,fontFamily:"JetBrains Mono,monospace"}}>Powered by</span>
        <span style={{fontSize:11,fontWeight:600,color:T.a1,fontFamily:"JetBrains Mono,monospace"}}>Claude Sonnet</span>
      </div>
    </div>
  );
}

// ─── LANDING PAGE ────────────────────────────────────────────────────────────
const FEATURES_GRID=[
  {iconKey:"chart",title:"Natural language queries",desc:"Type any business question in plain English. No SQL, no code, no training required. DataIntel figures out the rest."},
  {iconKey:"grid",title:"Instant dashboards",desc:"KPI cards, bar charts, donut charts, area graphs and more — generated automatically in seconds from a single question."},
  {iconKey:"alert",title:"Anomaly detection",desc:"Outliers and unusual spikes are automatically flagged on charts with AI commentary explaining what changed and why."},
  {iconKey:"share",title:"Share & export",desc:"Share a public link, embed via iframe, or export as PDF, PNG, CSV or JSON — with one click from any dashboard."},
  {iconKey:"cal",title:"Scheduled reports",desc:"Auto-run any saved query on a daily, weekly or monthly schedule and receive the dashboard PDF directly in your inbox."},
  {iconKey:"mic",title:"Voice input",desc:"Click the mic and speak your question. DataIntel transcribes and generates the dashboard — perfect for quick lookups on the go."},
];

const STEPS_HOW=[
  {n:"01",title:"Connect your data",desc:"Point DataIntel at your YouTube dataset. 12 columns pre-loaded — or connect your own PostgreSQL database."},
  {n:"02",title:"Ask a question",desc:"Type anything: \"Which regions have the highest engagement?\" or \"Compare monetized vs non-monetized videos\"."},
  {n:"03",title:"Explore your dashboard",desc:"Get interactive KPIs, charts, AI insights and follow-up suggestions. Drill down, annotate, export — all in one place."},
];

const STATS=[
  {val:"<5s",label:"Avg dashboard generation time"},
  {val:"12",label:"Pre-loaded YouTube columns"},
  {val:"7",label:"Chart types supported"},
  {val:"0",label:"Lines of SQL required"},
];

function LandingPage({onGetStarted,onDemo,onAbout}){
const FEATURE_ICONS={
  chart:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  grid:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>,
  alert:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  share:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>,
  cal:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  mic:<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="9" y="1" width="6" height="11" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="9" y1="23" x2="15" y2="23"/></svg>,
};

  const[scrolled,setScrolled]=useState(false);
  const[hov,setHov]=useState(null);
  const ref=useRef();

  useEffect(()=>{
    const el=ref.current;
    if(!el)return;
    const h=()=>setScrolled(el.scrollTop>20);
    el.addEventListener("scroll",h);
    return()=>el.removeEventListener("scroll",h);
  },[]);

  return(
    <div ref={ref} style={{height:"100vh",overflowY:"auto",background:`radial-gradient(circle at top, ${T.bg2} 0%, ${T.bg0} 38%), ${T.bg0}`,color:T.t0,fontFamily:"Instrument Sans,sans-serif",position:"relative"}}>

      {/* ── Navbar ── */}
      <nav style={{position:"sticky",top:0,zIndex:100,height:60,display:"flex",alignItems:"center",padding:"0 60px",borderBottom:`1px solid ${scrolled?T.b1:"transparent"}`,background:scrolled?`${T.bg0}EE`:"transparent",backdropFilter:scrolled?"blur(12px)":"none",transition:"all .25s"}}>
        {/* Logo */}
        <div style={{display:"flex",alignItems:"center",gap:10,marginRight:"auto"}}>
          <div style={{width:34,height:34,borderRadius:10,background:`linear-gradient(135deg,${T.a0},#9A6518)`,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 4px 14px ${T.a0}44`}}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><polygon points="8,1 2,14 8,10 14,14" fill={T.bg0} opacity=".95"/></svg>
          </div>
          <span style={{fontSize:16,fontWeight:700,color:T.t0,fontFamily:"Playfair Display,serif",letterSpacing:"-.02em"}}>DataIntel</span>
        </div>
        {/* Nav links — 3 only */}
        <div style={{display:"flex",alignItems:"center",gap:32,marginRight:36}}>
          {["Features","How it works"].map(l=>(
            <a key={l} href={`#${l.toLowerCase().replace(" ","-")}`} style={{all:"unset",cursor:"pointer",fontSize:13,color:T.t1,fontFamily:"Instrument Sans,sans-serif",transition:"color .12s"}}
              onMouseEnter={e=>e.currentTarget.style.color=T.t0}
              onMouseLeave={e=>e.currentTarget.style.color=T.t1}>{l}</a>
          ))}
          <button onClick={onAbout} style={{all:"unset",cursor:"pointer",fontSize:13,color:T.t1,fontFamily:"Instrument Sans,sans-serif",transition:"color .12s"}}
            onMouseEnter={e=>e.currentTarget.style.color=T.t0}
            onMouseLeave={e=>e.currentTarget.style.color=T.t1}>About</button>
        </div>
        {/* Single CTA */}
        <button onClick={onGetStarted} style={{all:"unset",cursor:"pointer",padding:"10px 22px",borderRadius:12,fontSize:13,fontWeight:600,color:T.bg0,background:`linear-gradient(135deg,${T.a0},#B8882E)`,fontFamily:"Playfair Display,serif",boxShadow:`0 10px 24px ${T.a0}33`,transition:"transform .15s, box-shadow .15s, background .15s"}}
          onMouseEnter={e=>{e.currentTarget.style.background=`linear-gradient(135deg,${T.a1},${T.a0})`;e.currentTarget.style.transform="translateY(-1px)";e.currentTarget.style.boxShadow=`0 14px 28px ${T.a0}44`;}}
          onMouseLeave={e=>{e.currentTarget.style.background=`linear-gradient(135deg,${T.a0},#B8882E)`;e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow=`0 10px 24px ${T.a0}33`;}}>
          Get started →
        </button>
      </nav>

      {/* ── Hero ── */}
      <section style={{minHeight:"92vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"88px 60px 72px",textAlign:"center",position:"relative",overflow:"hidden"}}>
        {/* bg glows */}
        <div style={{position:"absolute",inset:0,background:`radial-gradient(ellipse 60% 50% at 50% 30%,${T.a0}12,transparent 65%)`,pointerEvents:"none",animation:"aurora 14s ease-in-out infinite"}}/>
        <div style={{position:"absolute",bottom:0,left:"20%",width:300,height:300,borderRadius:"50%",background:`radial-gradient(circle,${T.green}0A,transparent 70%)`,pointerEvents:"none",animation:"floatSlow 11s ease-in-out infinite"}}/>
        <div style={{position:"absolute",bottom:0,right:"15%",width:260,height:260,borderRadius:"50%",background:`radial-gradient(circle,#C97B6E0A,transparent 70%)`,pointerEvents:"none",animation:"floatSlow 13s ease-in-out infinite reverse"}}/>
        <div style={{position:"absolute",top:120,right:"12%",width:180,height:180,borderRadius:"50%",background:`radial-gradient(circle,${T.a0}14,transparent 72%)`,filter:"blur(12px)",pointerEvents:"none",animation:"tiltGlow 16s ease-in-out infinite"}}/>
        {/* Grid */}
        <div style={{position:"absolute",inset:0,backgroundImage:`linear-gradient(${T.b0} 1px,transparent 1px),linear-gradient(90deg,${T.b0} 1px,transparent 1px)`,backgroundSize:"48px 48px",pointerEvents:"none",maskImage:"radial-gradient(ellipse 80% 80% at 50% 50%,black 20%,transparent 100%)"}}/>

        {/* Badge */}
        <div style={{display:"inline-flex",alignItems:"center",gap:7,padding:"7px 16px",borderRadius:999,background:`linear-gradient(180deg, ${T.aBg2}, ${T.aBg})`,border:`1px solid ${T.a0}33`,boxShadow:`inset 0 1px 0 rgba(255,255,255,.04)`,marginBottom:24,animation:"riseIn .6s cubic-bezier(.16,1,.3,1) both"}}>
          <div style={{width:6,height:6,borderRadius:"50%",background:T.a0,boxShadow:`0 0 8px ${T.a0}`}}/>
          <span style={{fontSize:11,color:T.a1,fontFamily:"JetBrains Mono,monospace",letterSpacing:"0.06em"}}> · Built for YouTube Analytics</span>
        </div>

        {/* Headline */}
        <h1 style={{margin:"0 0 20px",fontSize:"clamp(40px,6vw,76px)",fontWeight:700,color:T.t0,fontFamily:"Playfair Display,serif",letterSpacing:"-.04em",lineHeight:1.04,maxWidth:860,animation:"riseIn .65s cubic-bezier(.16,1,.3,1) .08s both"}}>
          Your YouTube data,<br/>
          <span style={{color:T.a0,fontStyle:"italic"}}>in plain English.</span>
        </h1>

        {/* Sub */}
        <p style={{margin:"0 0 44px",fontSize:"clamp(15px,1.8vw,18px)",color:T.t1,lineHeight:1.8,maxWidth:620,animation:"riseIn .65s cubic-bezier(.16,1,.3,1) .16s both"}}>
          Ask any question about your analytics. Get an interactive dashboard with KPIs, charts, and AI insights — in under 5 seconds. No SQL. No code. No waiting.
        </p>

        {/* CTAs */}
        <div style={{display:"flex",alignItems:"center",gap:12,flexWrap:"wrap",justifyContent:"center",marginBottom:56,animation:"riseIn .65s cubic-bezier(.16,1,.3,1) .24s both"}}>
          <button onClick={onGetStarted}
            style={{all:"unset",cursor:"pointer",padding:"15px 34px",borderRadius:15,fontSize:15,fontWeight:700,color:T.bg0,background:`linear-gradient(135deg,${T.a0},#B8882E)`,fontFamily:"Playfair Display,serif",boxShadow:`0 12px 30px ${T.a0}44`,transition:"transform .18s, box-shadow .18s, background .18s",letterSpacing:"-.01em"}}
            onMouseEnter={e=>{e.currentTarget.style.background=`linear-gradient(135deg,${T.a1},${T.a0})`;e.currentTarget.style.boxShadow=`0 18px 40px ${T.a0}55`;e.currentTarget.style.transform="translateY(-2px)";}}
            onMouseLeave={e=>{e.currentTarget.style.background=`linear-gradient(135deg,${T.a0},#B8882E)`;e.currentTarget.style.boxShadow=`0 12px 30px ${T.a0}44`;e.currentTarget.style.transform="translateY(0)";}}>
            Start for free →
          </button>
          <button onClick={onDemo}
            style={{all:"unset",cursor:"pointer",padding:"15px 28px",borderRadius:15,fontSize:15,fontWeight:500,color:T.t0,border:`1px solid ${T.b2}`,background:`linear-gradient(180deg,${T.bg2},${T.bg3})`,fontFamily:"Instrument Sans,sans-serif",transition:"transform .18s, border-color .18s, background .18s, box-shadow .18s",display:"flex",alignItems:"center",gap:8,boxShadow:`inset 0 1px 0 rgba(255,255,255,.03)`}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor=T.a0+"55";e.currentTarget.style.background=`linear-gradient(180deg,${T.bg3},${T.bg2})`;e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow=`0 14px 30px rgba(0,0,0,.18)`;}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor=T.b2;e.currentTarget.style.background=`linear-gradient(180deg,${T.bg2},${T.bg3})`;e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow=`inset 0 1px 0 rgba(255,255,255,.03)`;}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            Live demo
          </button>
        </div>

        {/* ── Live social proof bar ── */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,flexWrap:"wrap",marginBottom:20,animation:"riseIn .65s cubic-bezier(.16,1,.3,1) .3s both"}}>
          <LiveCounter/>
        </div>

        {/* Stats row */}
        <div style={{display:"flex",alignItems:"center",gap:0,flexWrap:"wrap",justifyContent:"center",animation:"riseIn .65s cubic-bezier(.16,1,.3,1) .36s both",padding:"14px 20px",borderRadius:24,background:"rgba(20,14,8,.42)",backdropFilter:"blur(12px)",border:`1px solid ${T.b0}`,boxShadow:`0 18px 36px rgba(0,0,0,.16)`}}>
          {STATS.map((s,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center"}}>
              <div style={{textAlign:"center",padding:"0 28px"}}>
                <p style={{margin:"0 0 2px",fontSize:26,fontWeight:700,color:T.t0,fontFamily:"Playfair Display,serif",letterSpacing:"-.02em"}}>{s.val}</p>
                <p style={{margin:0,fontSize:11,color:T.t2,fontFamily:"JetBrains Mono,monospace"}}>{s.label}</p>
              </div>
              {i<STATS.length-1&&<div style={{width:1,height:32,background:T.b1}}/>}
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" style={{padding:"88px 60px",maxWidth:1100,margin:"0 auto"}}>
        <div style={{textAlign:"center",marginBottom:52}}>
          <p style={{margin:"0 0 8px",fontSize:11,color:T.a0,fontFamily:"JetBrains Mono,monospace",textTransform:"uppercase",letterSpacing:"0.1em"}}>Everything you need</p>
          <h2 style={{margin:"0 0 12px",fontSize:"clamp(28px,4vw,42px)",fontWeight:700,color:T.t0,fontFamily:"Playfair Display,serif",letterSpacing:"-.03em",lineHeight:1.15}}>Built for real analytics work</h2>
          <p style={{margin:0,fontSize:15,color:T.t1,lineHeight:1.7,maxWidth:480,marginLeft:"auto",marginRight:"auto"}}>Everything a data team needs — without any of the complexity.</p>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:18}}>
          {FEATURES_GRID.map((f,i)=>(
            <div key={i}
              onMouseEnter={()=>setHov(i)} onMouseLeave={()=>setHov(null)}
              style={{padding:"24px 24px 22px",borderRadius:20,background:hov===i?`linear-gradient(180deg,${T.bg2},${T.bg3})`:T.bg1,border:`1px solid ${hov===i?T.b2:T.b1}`,transition:"transform .2s, border-color .2s, box-shadow .2s, background .2s",cursor:"default",position:"relative",overflow:"hidden",boxShadow:hov===i?"0 18px 34px rgba(0,0,0,.18), inset 0 1px 0 rgba(255,255,255,.04)":"inset 0 1px 0 rgba(255,255,255,.02)",transform:hov===i?"translateY(-4px)":"translateY(0)",animation:`riseIn .55s cubic-bezier(.16,1,.3,1) ${0.05*i}s both`}}>
              {/* top accent */}
              <div style={{position:"absolute",top:0,left:0,right:0,height:2,borderRadius:"16px 16px 0 0",background:hov===i?`linear-gradient(90deg,${T.a0},${T.green})`:`linear-gradient(90deg,${T.b1},transparent)`,transition:"all .2s"}}/>
              <div style={{width:42,height:42,borderRadius:13,background:hov===i?T.aBg2:T.aBg,border:`1px solid ${T.a0}22`,display:"flex",alignItems:"center",justifyContent:"center",color:T.a0,marginBottom:14,boxShadow:hov===i?`0 10px 24px ${T.a0}18`:"none",transition:"all .18s"}}>{FEATURE_ICONS[f.iconKey]}</div>
              <p style={{margin:"0 0 6px",fontSize:14,fontWeight:600,color:T.t0,fontFamily:"Playfair Display,serif"}}>{f.title}</p>
              <p style={{margin:0,fontSize:13,color:T.t2,lineHeight:1.65,fontFamily:"Instrument Sans,sans-serif"}}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section id="how-it-works" style={{padding:"88px 60px",background:`linear-gradient(180deg, ${T.bg1}, ${T.bg0})`,borderTop:`1px solid ${T.b0}`,borderBottom:`1px solid ${T.b0}`}}>
        <div style={{maxWidth:900,margin:"0 auto"}}>
          <div style={{textAlign:"center",marginBottom:52}}>
            <p style={{margin:"0 0 8px",fontSize:11,color:T.a0,fontFamily:"JetBrains Mono,monospace",textTransform:"uppercase",letterSpacing:"0.1em"}}>How it works</p>
            <h2 style={{margin:"0 0 12px",fontSize:"clamp(28px,4vw,42px)",fontWeight:700,color:T.t0,fontFamily:"Playfair Display,serif",letterSpacing:"-.03em",lineHeight:1.15}}>From question to dashboard in 3 steps</h2>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:20}}>
            {STEPS_HOW.map((s,i)=>(
              <div key={i} style={{position:"relative"}}>
                {i<STEPS_HOW.length-1&&(
                  <div style={{position:"absolute",top:22,left:"calc(100% - 10px)",width:"calc(100% - 20px)",height:1,background:`linear-gradient(90deg,${T.a0}44,transparent)`,zIndex:0}}/>
                )}
                <div style={{position:"relative",zIndex:1,padding:"24px",borderRadius:18,background:`linear-gradient(180deg,${T.bg2},${T.bg3})`,border:`1px solid ${T.b1}`,boxShadow:`0 16px 30px rgba(0,0,0,.12), inset 0 1px 0 rgba(255,255,255,.04)`,animation:`riseIn .55s cubic-bezier(.16,1,.3,1) ${0.08*i}s both`}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
                    <div style={{width:36,height:36,borderRadius:10,background:`linear-gradient(135deg,${T.a0},#9A6518)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                      <span style={{fontSize:12,fontWeight:700,color:T.bg0,fontFamily:"JetBrains Mono,monospace"}}>{s.n}</span>
                    </div>
                    <p style={{margin:0,fontSize:15,fontWeight:600,color:T.t0,fontFamily:"Playfair Display,serif"}}>{s.title}</p>
                  </div>
                  <p style={{margin:0,fontSize:13,color:T.t2,lineHeight:1.65,fontFamily:"Instrument Sans,sans-serif"}}>{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Demo CTA section ── */}
      <section id="demo" style={{padding:"88px 60px",textAlign:"center"}}>
        <div style={{maxWidth:700,margin:"0 auto",padding:"34px 30px",borderRadius:26,background:`linear-gradient(180deg, rgba(34,24,12,.92), rgba(23,17,8,.95))`,border:`1px solid ${T.b1}`,boxShadow:`0 24px 50px rgba(0,0,0,.18), inset 0 1px 0 rgba(255,255,255,.04)`}}>
          <div style={{display:"inline-flex",alignItems:"center",gap:7,padding:"5px 14px",borderRadius:20,background:T.greenBg,border:`1px solid ${T.green}33`,marginBottom:20}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:T.green,boxShadow:`0 0 8px ${T.green}`}}/>
            <span style={{fontSize:11,color:T.green,fontFamily:"JetBrains Mono,monospace",letterSpacing:"0.06em"}}>No account required</span>
          </div>
          <h2 style={{margin:"0 0 14px",fontSize:"clamp(28px,4vw,44px)",fontWeight:700,color:T.t0,fontFamily:"Playfair Display,serif",letterSpacing:"-.03em",lineHeight:1.15}}>
            Try it right now
          </h2>
          <p style={{margin:"0 0 32px",fontSize:15,color:T.t1,lineHeight:1.75}}>
            3 pre-built dashboards. One click. No sign-up, no API key, no waiting. See exactly what DataIntel can do in 30 seconds.
          </p>
          <div style={{display:"flex",alignItems:"center",gap:12,justifyContent:"center",flexWrap:"wrap"}}>
            <button onClick={onDemo}
              style={{all:"unset",cursor:"pointer",padding:"14px 32px",borderRadius:15,fontSize:15,fontWeight:700,color:T.bg0,background:`linear-gradient(135deg,${T.a0},#B8882E)`,fontFamily:"Playfair Display,serif",boxShadow:`0 12px 30px ${T.a0}44`,transition:"transform .18s, box-shadow .18s, background .18s",display:"flex",alignItems:"center",gap:8}}
              onMouseEnter={e=>{e.currentTarget.style.background=`linear-gradient(135deg,${T.a1},${T.a0})`;e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow=`0 18px 38px ${T.a0}55`;}}
              onMouseLeave={e=>{e.currentTarget.style.background=`linear-gradient(135deg,${T.a0},#B8882E)`;e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow=`0 12px 30px ${T.a0}44`;}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              Launch live demo
            </button>
            <button onClick={onGetStarted}
              style={{all:"unset",cursor:"pointer",padding:"14px 28px",borderRadius:15,fontSize:15,color:T.t1,border:`1px solid ${T.b2}`,fontFamily:"Instrument Sans,sans-serif",transition:"transform .18s, color .18s, border-color .18s, background .18s"}}
              onMouseEnter={e=>{e.currentTarget.style.color=T.t0;e.currentTarget.style.borderColor=T.b3;e.currentTarget.style.background=T.bg2;e.currentTarget.style.transform="translateY(-2px)";}}
              onMouseLeave={e=>{e.currentTarget.style.color=T.t1;e.currentTarget.style.borderColor=T.b2;e.currentTarget.style.background="transparent";e.currentTarget.style.transform="translateY(0)";}}>
              Create free account
            </button>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{borderTop:`1px solid ${T.b0}`,padding:"28px 60px",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:12}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:26,height:26,borderRadius:8,background:`linear-gradient(135deg,${T.a0},#9A6518)`,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><polygon points="8,1 2,14 8,10 14,14" fill={T.bg0} opacity=".95"/></svg>
          </div>
          <span style={{fontSize:13,color:T.t1,fontFamily:"Instrument Sans,sans-serif"}}>DataIntel</span>
          <span style={{fontSize:11,color:T.t2,fontFamily:"JetBrains Mono,monospace",marginLeft:8}}>· Made with ♥ in India</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:20}}>
          {["React","Claude API","Recharts","Next.js","Vercel"].map((t,i)=>(
            <span key={i} style={{fontSize:11,color:T.t2,fontFamily:"JetBrains Mono,monospace",padding:"2px 8px",borderRadius:5,background:T.bg2,border:`1px solid ${T.b1}`}}>{t}</span>
          ))}
        </div>
        <span style={{fontSize:11,color:T.t2,fontFamily:"JetBrains Mono,monospace"}}>v1.0.0 · Hackathon Edition</span>
      </footer>
    </div>
  );
}

// ─── AUTH SCREEN ─────────────────────────────────────────────────────────────
// Animated grid of mini chart bars for background decoration
function MiniBarChart({heights,color,delay=0}){
  return(
    <div style={{display:"flex",alignItems:"flex-end",gap:3,opacity:0.35,animation:`fadeIn 1s ease ${delay}s both`}}>
      {heights.map((h,i)=>(
        <div key={i} style={{width:8,borderRadius:"3px 3px 0 0",background:`linear-gradient(180deg,${color},${color}55)`,height:h,transition:"height .5s ease"}}/>
      ))}
    </div>
  );
}

// Floating stat card for hero decoration
function FloatCard({label,value,delta,up,style={}}){
  return(
    <div style={{background:"rgba(22,17,8,0.88)",backdropFilter:"blur(12px)",border:`1px solid ${T.b2}`,borderRadius:14,padding:"12px 16px",...(style||{})}}>
      <p style={{margin:"0 0 4px",fontSize:10,color:T.t2,fontFamily:"JetBrains Mono,monospace",textTransform:"uppercase",letterSpacing:"0.08em"}}>{label}</p>
      <p style={{margin:"0 0 4px",fontSize:22,fontWeight:700,color:T.t0,fontFamily:"Playfair Display,serif",letterSpacing:"-0.02em"}}>{value}</p>
      <span style={{fontSize:11,fontFamily:"JetBrains Mono,monospace",color:up?T.green:T.red,background:up?T.greenBg:T.redBg,padding:"2px 7px",borderRadius:20}}>{up?"↑":"↓"} {delta}</span>
    </div>
  );
}

// ─── DEMO DATA ────────────────────────────────────────────────────────────────
const DEMO_SCENARIOS = [
  {
    id:"d1",
    label:"Category Performance",
    emoji:"📊",
    desc:"Views & sentiment by content genre",
    title:"Category Performance Overview",
    summary:"Tech Reviews dominates with 450K total views and an average sentiment score of 0.82 — the highest across all categories. Gaming shows the fastest month-over-month growth at +34% but trails on sentiment at 0.61, suggesting engagement without satisfaction.",
    sql:"SELECT category, SUM(views) as total_views, AVG(sentiment_score) as avg_sentiment, AVG((likes+comments+shares)/views) as engagement_rate FROM youtube_videos GROUP BY category ORDER BY total_views DESC",
    kpis:[
      {label:"Total Views",value:"2.4M",delta:"+18.2%",trend:"up",sub:"across all categories"},
      {label:"Avg Sentiment",value:"0.74",delta:"+0.08",trend:"up",sub:"above baseline"},
      {label:"Avg Engagement",value:"6.3%",delta:"-0.4pp",trend:"down",sub:"likes+comments+shares"},
      {label:"Monetized",value:"58%",delta:"+6pp",trend:"up",sub:"ads enabled"},
    ],
    charts:[
      {id:"c1",type:"bar",title:"Total views by category",desc:"Aggregated views grouped by content genre",
       xKey:"category",yKeys:[{key:"views",label:"Views",color:"#D4A854"}],size:"wide",
       data:[{category:"Tech Reviews",views:450000},{category:"Gaming",views:320000},{category:"Vlogs",views:245000},{category:"Education",views:180000},{category:"Music",views:130000},{category:"Comedy",views:95000}],
       insight:"Tech Reviews has 87% more views than the second-ranked Gaming category — a strong signal to increase production frequency.",anomalies:["Gaming"]},
      {id:"c2",type:"donut",title:"Sentiment distribution",desc:"Positive vs neutral vs negative breakdown",
       xKey:"name",yKeys:[{key:"value",label:"Share",color:"#D4A854"}],size:"normal",
       data:[{name:"Positive",value:50},{name:"Neutral",value:30},{name:"Negative",value:20}],
       insight:"50% of content generates positive sentiment — Tech Reviews skews this significantly.",anomalies:[]},
      {id:"c3",type:"area",title:"Monthly views trend",desc:"Total views over the last 6 months",
       xKey:"month",yKeys:[{key:"views",label:"Views",color:"#7ECB9E"}],size:"normal",
       data:[{month:"Apr",views:180000},{month:"May",views:210000},{month:"Jun",views:240000},{month:"Jul",views:295000},{month:"Aug",views:340000},{month:"Sep",views:390000}],
       insight:"Consistent 15-20% month-over-month growth — acceleration began in July.",anomalies:[]},
    ],
    followUps:["Which language gets highest views in Tech Reviews?","Do longer videos perform better in Gaming?","Compare monetized vs non-monetized by category"],
  },
  {
    id:"d2",
    label:"Regional Reach",
    emoji:"🌏",
    desc:"Engagement rates across regions",
    title:"Regional Engagement Analysis",
    summary:"India (IN) leads engagement at 8.2% — nearly double the global average of 4.3%. The US drives the most absolute views but shows lower engagement per view. South-East Asian markets are emerging fast with sentiment scores above 0.80.",
    sql:"SELECT region, AVG((likes+comments+shares)/views)*100 as engagement_pct, SUM(views) as total_views, AVG(sentiment_score) as avg_sentiment FROM youtube_videos GROUP BY region ORDER BY engagement_pct DESC LIMIT 10",
    kpis:[
      {label:"Top Region",value:"IN",delta:"+8.2%",trend:"up",sub:"engagement rate"},
      {label:"Regions Covered",value:"24",delta:"+4 new",trend:"up",sub:"active markets"},
      {label:"Global Avg ER",value:"4.3%",delta:"+0.6pp",trend:"up",sub:"engagement rate"},
      {label:"Best Sentiment",value:"SG",delta:"0.86",trend:"up",sub:"avg sentiment score"},
    ],
    charts:[
      {id:"c4",type:"bar",title:"Engagement rate by region",desc:"(likes+comments+shares)/views × 100",
       xKey:"region",yKeys:[{key:"engagement",label:"Engagement %",color:"#7ECB9E"}],size:"wide",
       data:[{region:"IN",engagement:8.2},{region:"SG",engagement:7.1},{region:"PH",engagement:6.8},{region:"MY",engagement:6.2},{region:"GB",engagement:5.1},{region:"US",engagement:4.3},{region:"AU",engagement:3.9},{region:"CA",engagement:3.7}],
       insight:"India's engagement rate is 91% above the global average — optimising content for the IN market could significantly boost overall metrics.",anomalies:["IN"]},
      {id:"c5",type:"radar",title:"Regional performance radar",desc:"Multi-metric comparison across top regions",
       xKey:"subject",yKeys:[{key:"value",label:"Score",color:"#D4A854"}],size:"normal",
       data:[{subject:"Views",value:85},{subject:"Engagement",value:92},{subject:"Sentiment",value:78},{subject:"Shares",value:65},{subject:"Comments",value:88},{subject:"Likes",value:90}],
       insight:"Comments and engagement are the strongest performers — sentiment and shares have room to grow.",anomalies:[]},
    ],
    followUps:["Which video categories perform best in India?","What's the sentiment breakdown for top 5 regions?","Show views vs engagement rate scatter for all regions"],
  },
  {
    id:"d3",
    label:"Monetization Impact",
    emoji:"💰",
    desc:"Ads enabled vs disabled comparison",
    title:"Monetization Impact Analysis",
    summary:"Monetized videos (ads_enabled = true) average 34% more views than non-monetized content, but show 12% lower sentiment scores — suggesting ad interruptions affect viewer satisfaction. Shorts-style content under 60 seconds shows the best balance of views and sentiment.",
    sql:"SELECT ads_enabled, COUNT(*) as video_count, AVG(views) as avg_views, AVG(likes) as avg_likes, AVG(sentiment_score) as avg_sentiment, AVG((likes+comments+shares)/views) as avg_engagement FROM youtube_videos GROUP BY ads_enabled",
    kpis:[
      {label:"Monetized Avg Views",value:"52K",delta:"+34%",trend:"up",sub:"vs non-monetized"},
      {label:"Sentiment Gap",value:"-0.09",delta:"ads impact",trend:"down",sub:"monetized vs not"},
      {label:"Revenue Potential",value:"High",delta:"58% enabled",trend:"up",sub:"of all videos"},
      {label:"Best Format",value:"<60s",delta:"2.1× ER",trend:"up",sub:"engagement rate"},
    ],
    charts:[
      {id:"c6",type:"composed",title:"Views vs sentiment by monetization",desc:"Comparing monetized and non-monetized video performance",
       xKey:"metric",yKeys:[{key:"monetized",label:"Monetized",color:"#D4A854"},{key:"nonMonetized",label:"Non-monetized",color:"#7ECB9E"}],size:"wide",
       data:[{metric:"Avg Views",monetized:52000,nonMonetized:38800},{metric:"Avg Likes",monetized:3200,nonMonetized:2900},{metric:"Avg Comments",monetized:480,nonMonetized:520},{metric:"Avg Shares",monetized:1100,nonMonetized:950}],
       insight:"Monetized videos win on views and likes but non-monetized content earns more comments — suggesting deeper organic engagement.",anomalies:[]},
      {id:"c7",type:"bar",title:"Sentiment by monetization status",desc:"Average sentiment_score for ads-enabled vs disabled",
       xKey:"type",yKeys:[{key:"sentiment",label:"Sentiment Score",color:"#EAC97A"}],size:"normal",
       data:[{type:"Ads Disabled",sentiment:0.79},{type:"Ads Enabled",sentiment:0.70}],
       insight:"Non-monetized content scores 13% higher on sentiment — viewers respond more positively without ad interruptions.",anomalies:[]},
    ],
    followUps:["Which categories are most affected by ads on sentiment?","Show revenue-optimised posting schedule by region","Compare long-form vs short-form monetization performance"],
  },
];

// ─── DEMO BANNER ──────────────────────────────────────────────────────────────
function DemoBanner({onExit}){
  return(
    <div style={{background:`linear-gradient(90deg,rgba(212,168,84,0.14),rgba(212,168,84,0.08))`,borderBottom:`1px solid ${T.a0}33`,padding:"8px 20px",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
      <div style={{width:8,height:8,borderRadius:"50%",background:T.a0,boxShadow:`0 0 8px ${T.a0}`,flexShrink:0}}/>
      <span style={{fontSize:12,color:T.a1,fontFamily:"Instrument Sans,sans-serif",fontWeight:500}}>
        Live Demo Mode
      </span>
      <span style={{fontSize:11,color:T.t1,fontFamily:"Instrument Sans,sans-serif"}}>
        — pre-loaded with sample YouTube analytics data. No sign-in required.
      </span>
      <div style={{flex:1}}/>
      <button onClick={onExit}
        style={{all:"unset",cursor:"pointer",fontSize:11,color:T.a0,fontFamily:"JetBrains Mono,monospace",padding:"4px 10px",borderRadius:7,border:`1px solid ${T.a0}44`,transition:"all .12s"}}
        onMouseEnter={e=>{e.currentTarget.style.background=T.aBg;}}
        onMouseLeave={e=>{e.currentTarget.style.background="transparent";}}>
        Sign in for full access →
      </button>
    </div>
  );
}

// ─── DEMO SCENARIO PICKER ─────────────────────────────────────────────────────
function DemoScenarioPicker({onPick}){
  const[hov,setHov]=useState(null);
  return(
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"40px 24px 32px",animation:"fadeUp .5s ease both",gap:24}}>
      {/* Header */}
      <div style={{textAlign:"center",maxWidth:520}}>
        <div style={{display:"inline-flex",alignItems:"center",gap:6,padding:"4px 14px",borderRadius:20,background:`linear-gradient(90deg,${T.aBg2},${T.aBg})`,border:`1px solid ${T.a0}44`,marginBottom:16}}>
          <div style={{width:7,height:7,borderRadius:"50%",background:T.a0,boxShadow:`0 0 8px ${T.a0}`}}/>
          <span style={{fontSize:11,color:T.a1,fontFamily:"JetBrains Mono,monospace",letterSpacing:"0.06em"}}>LIVE DEMO — no sign-in required</span>
        </div>
        <h2 style={{margin:"0 0 10px",fontSize:28,fontWeight:700,color:T.t0,fontFamily:"Playfair Display,serif",letterSpacing:"-0.03em",lineHeight:1.2}}>
          Explore a pre-built dashboard
        </h2>
        <p style={{margin:0,fontSize:14,color:T.t1,lineHeight:1.7,fontFamily:"Instrument Sans,sans-serif"}}>
          Pick any scenario below — no typing, no API key, instant results.
        </p>
      </div>

      {/* Scenario cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,width:"100%",maxWidth:780}}>
        {DEMO_SCENARIOS.map((s,i)=>(
          <button key={s.id} onClick={()=>onPick(s)}
            onMouseEnter={()=>setHov(s.id)} onMouseLeave={()=>setHov(null)}
            style={{all:"unset",cursor:"pointer",display:"flex",flexDirection:"column",gap:10,padding:"20px",borderRadius:16,background:hov===s.id?T.bg3:T.bg2,border:`1px solid ${hov===s.id?T.b3:T.b1}`,transition:"all .15s",animation:`fadeUp .5s ease ${i*.1}s both`,boxShadow:hov===s.id?`0 8px 32px rgba(0,0,0,.4),inset 0 1px 0 ${T.b2}`:`inset 0 1px 0 ${T.b1}`}}>
            {/* Top accent */}
            <div style={{height:2,borderRadius:2,background:hov===s.id?`linear-gradient(90deg,${T.a0},${T.green})`:`linear-gradient(90deg,${T.b2},transparent)`,transition:"all .2s"}}/>
            {/* Emoji + label */}
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:40,height:40,borderRadius:11,background:T.aBg,border:`1px solid ${T.a0}22`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>
                {s.emoji}
              </div>
              <div>
                <p style={{margin:0,fontSize:14,fontWeight:600,color:T.t0,fontFamily:"Playfair Display,serif"}}>{s.label}</p>
                <p style={{margin:0,fontSize:11,color:T.t2,fontFamily:"Instrument Sans,sans-serif",marginTop:2}}>{s.desc}</p>
              </div>
            </div>
            {/* Preview pills */}
            <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
              {s.kpis.slice(0,2).map((k,j)=>(
                <span key={j} style={{fontSize:10,color:T.t2,background:T.bg4,padding:"2px 8px",borderRadius:6,fontFamily:"JetBrains Mono,monospace"}}>{k.label}</span>
              ))}
              <span style={{fontSize:10,color:T.t2,background:T.bg4,padding:"2px 8px",borderRadius:6,fontFamily:"JetBrains Mono,monospace"}}>{s.charts.length} charts</span>
            </div>
            {/* CTA */}
            <div style={{display:"flex",alignItems:"center",gap:6,color:hov===s.id?T.a1:T.t2,transition:"color .15s",marginTop:2}}>
              <span style={{fontSize:12,fontFamily:"JetBrains Mono,monospace",fontWeight:500}}>
                {hov===s.id?"Load this dashboard →":"Explore →"}
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* Sub note */}
      <p style={{fontSize:12,color:T.t2,fontFamily:"Instrument Sans,sans-serif",textAlign:"center"}}>
        Powered by Claude Sonnet · Pre-computed for instant loading · All data is simulated
      </p>
    </div>
  );
}


function AuthScreen({onAuth}){
  const[tab,setTab]=useState("login");
  const[email,setEmail]=useState("");
  const[pw,setPw]=useState("");
  const[name,setName]=useState("");
  const[loading,setLoading]=useState(false);
  const[error,setError]=useState(null);
  const[focusField,setFocusField]=useState(null);

  const submit = async () => {
    if(!email.trim() || !pw.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const endpoint =
       tab === "login"
         ? "/api/login"
         : "/api/register";

      const body = {
        email: email,
        password: pw
      };

      if(tab === "signup"){
        body.name = name;
      }
      const res = await fetch(endpoint,{
        method:"POST",
        headers:{
          "Content-Type":"application/json"
        },
        body:JSON.stringify(body)
      });
      const data = await res.json();
      if(!res.ok){
        throw new Error(data.error || "Authentication failed");
      }
      onAuth({
        email: email,
        name: name || email
      });
    } catch(e){
      setError(e.message);
    }
    setLoading(false);
  };

  const inp=(field)=>({
    all:"unset",width:"100%",fontSize:14,color:T.t0,
    background:T.bg2,border:`1px solid ${focusField===field?T.a0+"99":T.b1}`,
    borderRadius:10,padding:"11px 14px",fontFamily:"Instrument Sans,sans-serif",
    caretColor:T.a0,transition:"border-color .15s,box-shadow .15s",
    boxShadow:focusField===field?`0 0 0 3px ${T.aRing}`:"none",
  });

  return(
    <div style={{display:"flex",height:"100vh",background:`radial-gradient(circle at top left, ${T.bg2} 0%, ${T.bg0} 32%), ${T.bg0}`,fontFamily:"Instrument Sans,sans-serif",overflow:"hidden"}}>

      {/* ══ LEFT — immersive hero ══ */}
      <div style={{flex:1,position:"relative",overflow:"hidden",borderRight:`1px solid ${T.b0}`,background:`linear-gradient(180deg, ${T.bg0}, ${T.bg1})`}}>

        {/* Deep layered background glows */}
        <div style={{position:"absolute",inset:0,background:`
          radial-gradient(ellipse 70% 60% at 20% 20%, ${T.a0}18 0%, transparent 60%),
          radial-gradient(ellipse 50% 40% at 80% 80%, ${T.green}10 0%, transparent 60%),
          radial-gradient(ellipse 40% 50% at 60% 10%, #C97B6E18 0%, transparent 50%)
        `,pointerEvents:"none",animation:"aurora 16s ease-in-out infinite"}}/>

        {/* Subtle grid texture */}
        <div style={{position:"absolute",inset:0,backgroundImage:`
          linear-gradient(${T.b0} 1px, transparent 1px),
          linear-gradient(90deg, ${T.b0} 1px, transparent 1px)
        `,backgroundSize:"48px 48px",pointerEvents:"none",maskImage:"radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 100%)"}}/>

        {/* Central hero content — scrollable */}
        <div style={{position:"absolute",inset:0,overflowY:"auto",padding:"52px 56px 52px",display:"flex",flexDirection:"column",gap:0}}>
          <div style={{position:"absolute",top:110,right:70,width:220,height:220,borderRadius:"50%",background:`radial-gradient(circle, ${T.a0}12, transparent 72%)`,filter:"blur(10px)",pointerEvents:"none",animation:"floatSlow 14s ease-in-out infinite"}}/>
          <div style={{position:"absolute",bottom:100,left:40,width:180,height:180,borderRadius:"50%",background:`radial-gradient(circle, ${T.green}12, transparent 72%)`,filter:"blur(14px)",pointerEvents:"none",animation:"floatSlow 17s ease-in-out infinite reverse"}}/>

          {/* Logo */}
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:36,flexShrink:0,animation:"riseIn .55s cubic-bezier(.16,1,.3,1) both"}}>
            <div style={{width:44,height:44,borderRadius:13,background:`linear-gradient(135deg,${T.a0},#9A6518)`,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 0 0 1px ${T.a0}44, 0 8px 32px ${T.a0}55`}}>
              <svg width="22" height="22" viewBox="0 0 16 16" fill="none"><polygon points="8,1 2,14 8,10 14,14" fill={T.bg0} opacity="0.95"/></svg>
            </div>
            <div>
              <p style={{margin:0,fontSize:20,fontWeight:700,color:T.t0,fontFamily:"Playfair Display,serif",letterSpacing:"-0.02em"}}>DataIntel</p>
              <p style={{margin:0,fontSize:11,color:T.t2,fontFamily:"JetBrains Mono,monospace",letterSpacing:"0.04em"}}>YouTube Analytics Platform</p>
            </div>
          </div>

          {/* Headline */}
          <h1 style={{margin:"0 0 14px",fontSize:48,fontWeight:700,color:T.t0,fontFamily:"Playfair Display,serif",letterSpacing:"-0.04em",lineHeight:1.06,animation:"riseIn .6s cubic-bezier(.16,1,.3,1) .08s both",flexShrink:0}}>
            Your data,<br/>
            <span style={{color:T.a0,fontStyle:"italic"}}>in plain English.</span>
          </h1>

          <p style={{margin:"0 0 28px",fontSize:15,color:T.t1,lineHeight:1.8,maxWidth:420,animation:"riseIn .6s cubic-bezier(.16,1,.3,1) .14s both",flexShrink:0}}>
            Ask any question about your YouTube analytics. Get instant interactive dashboards powered by AI — no SQL required.
          </p>

          {/* Feature pills */}
          <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:28,animation:"riseIn .6s cubic-bezier(.16,1,.3,1) .2s both",flexShrink:0}}>
            {["AI dashboards","Voice queries","Anomaly detection","Scheduled reports","Export & share","NL alerts"].map((f,i)=>(
              <span key={i} style={{cursor:"default",fontSize:11,color:T.a1,background:`linear-gradient(180deg, ${T.aBg2}, ${T.aBg})`,border:`1px solid ${T.a0}22`,padding:"5px 12px",borderRadius:999,fontFamily:"Instrument Sans,sans-serif",fontWeight:500,transition:"all .15s",boxShadow:`inset 0 1px 0 rgba(255,255,255,.04)`}}
                onMouseEnter={e=>{e.currentTarget.style.background=T.a0+"22";e.currentTarget.style.color=T.a0;e.currentTarget.style.transform="translateY(-1px)";}}
                onMouseLeave={e=>{e.currentTarget.style.background=`linear-gradient(180deg, ${T.aBg2}, ${T.aBg})`; e.currentTarget.style.color=T.a1;e.currentTarget.style.transform="translateY(0)";}}>
                {f}
              </span>
            ))}
          </div>

          {/* Testimonials */}
          <div style={{marginBottom:28,flexShrink:0,animation:"riseIn .6s cubic-bezier(.16,1,.3,1) .28s both"}}>
            <ReviewCarousel darkMode={true}/>
          </div>

          {/* Divider */}
          <div style={{height:1,background:`linear-gradient(90deg,transparent,${T.b1},transparent)`,marginBottom:28,flexShrink:0}}/>

          {/* About the developers */}
          <div style={{flexShrink:0,animation:"riseIn .65s cubic-bezier(.16,1,.3,1) .34s both"}}>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>
              <span style={{fontSize:10,color:T.t2,fontFamily:"JetBrains Mono,monospace",textTransform:"uppercase",letterSpacing:"0.1em"}}>About the developers</span>
              <div style={{height:1,flex:1,background:`linear-gradient(90deg,${T.b2},transparent)`}}/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
              {[
                {initials:"KH",name:"Kaushiki Halder",role:"Frontend UI/UX Engine",color:"#F29F05",grad:"linear-gradient(135deg,#F29F05,#E0BB3A)"},
                {initials:"SN",name:"Swagato Naskar",role:"Backend Architect",color:"#1B9CAF",grad:"linear-gradient(135deg,#1B9CAF,#5AC2EA)"},
                {initials:"SM",name:"Sohom Kumar Mandal",role:"Backend Architect",color:"#AC5EC4",grad:"linear-gradient(135deg,#AC5EC4,#A971D4)"},
                {initials:"NC",name:"Norris the Cat",role:"Emotional Support",color:"#F25A7A",grad:"linear-gradient(135deg,#F25A7A,#FFB2D6)"},
              ].map((d,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:14,background:`linear-gradient(180deg,${T.bg2},${T.bg3})`,border:`1px solid ${T.b1}`,transition:"border-color .15s, transform .15s, box-shadow .15s",boxShadow:`inset 0 1px 0 rgba(255,255,255,.03)`}}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor=d.color+"44";e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow="0 12px 24px rgba(0,0,0,.14)";}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor=T.b1;e.currentTarget.style.transform="translateY(0)";e.currentTarget.style.boxShadow=`inset 0 1px 0 rgba(255,255,255,.03)`;}}>
                  <div style={{width:32,height:32,borderRadius:"50%",background:d.grad,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:T.bg0,flexShrink:0}}>
                    {d.initials}
                  </div>
                  <div>
                    <p style={{margin:0,fontSize:12,fontWeight:600,color:T.t0,fontFamily:"Instrument Sans,sans-serif"}}>{d.name}</p>
                    <p style={{margin:0,fontSize:10,color:T.t2,fontFamily:"JetBrains Mono,monospace"}}>{d.role}</p>
                  </div>
                </div>
              ))}
            </div>
            <div style={{padding:"14px 16px",borderRadius:16,background:`linear-gradient(180deg,${T.bg2},${T.bg3})`,border:`1px solid ${T.b1}`,boxShadow:`0 14px 28px rgba(0,0,0,.14), inset 0 1px 0 rgba(255,255,255,.03)`}}>
              <p style={{margin:"0 0 6px",fontSize:12,color:T.t1,lineHeight:1.7,fontFamily:"Instrument Sans,sans-serif"}}>
                DataIntel was built to make data analysis accessible to everyone — not just data scientists. We believe insights should be a conversation, not a query.
              </p>
              <div style={{display:"flex",alignItems:"center",gap:12}}>
                <span style={{fontSize:10,color:T.t2,fontFamily:"JetBrains Mono,monospace"}}>Made with ♥ in India</span>
                <div style={{height:1,flex:1,background:T.b0}}/>
                <span style={{fontSize:10,color:T.a0,fontFamily:"JetBrains Mono,monospace"}}>v1.0.0</span>
              </div>
            </div>
          </div>

          {/* Bottom padding for scroll */}
          <div style={{height:32,flexShrink:0}}/>
        </div>
      </div>

      {/* ══ RIGHT — auth form ══ */}
      <div style={{width:460,flexShrink:0,display:"flex",flexDirection:"column",justifyContent:"flex-start",padding:"78px 48px 48px",overflowY:"auto",background:T.bg1}}>

        {/* Tab toggle */}
        <div style={{display:"flex",gap:0,marginBottom:32,background:T.bg2,borderRadius:12,padding:4,border:`1px solid ${T.b1}`}}>
          {[{id:"login",label:"Sign in"},{id:"signup",label:"Create account"}].map(t=>(
            <button key={t.id} onClick={()=>{setTab(t.id);setError(null);}}
              style={{all:"unset",cursor:"pointer",flex:1,padding:"10px 0",textAlign:"center",borderRadius:9,fontSize:13,fontWeight:tab===t.id?600:400,fontFamily:"Instrument Sans,sans-serif",background:tab===t.id?T.bg3:"transparent",color:tab===t.id?T.t0:T.t2,border:`1px solid ${tab===t.id?T.b2:"transparent"}`,transition:"all .15s"}}>
              {t.label}
            </button>
          ))}
        </div>

        <h2 style={{margin:"0 0 4px",fontSize:24,fontWeight:700,color:T.t0,fontFamily:"Playfair Display,serif",letterSpacing:"-0.02em"}}>
          {tab==="login"?"Welcome back.":"Join DataIntel."}
        </h2>
        <p style={{margin:"0 0 28px",fontSize:14,color:T.t1,fontFamily:"Instrument Sans,sans-serif",lineHeight:1.5}}>
          {tab==="login"?"Sign in to your analytics workspace.":"Start turning questions into dashboards."}
        </p>

        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {tab==="signup"&&(
            <div>
              <p style={{margin:"0 0 5px",fontSize:11,color:T.t2,fontFamily:"JetBrains Mono,monospace",textTransform:"uppercase",letterSpacing:"0.07em"}}>Full name</p>
              <input value={name} onChange={e=>setName(e.target.value)} placeholder="Your name"
                onFocus={()=>setFocusField("name")} onBlur={()=>setFocusField(null)} style={inp("name")}/>
            </div>
          )}
          <div>
            <p style={{margin:"0 0 5px",fontSize:11,color:T.t2,fontFamily:"JetBrains Mono,monospace",textTransform:"uppercase",letterSpacing:"0.07em"}}>Email</p>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@company.com"
              onFocus={()=>setFocusField("email")} onBlur={()=>setFocusField(null)} style={inp("email")}/>
          </div>
          <div>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
              <p style={{margin:0,fontSize:11,color:T.t2,fontFamily:"JetBrains Mono,monospace",textTransform:"uppercase",letterSpacing:"0.07em"}}>Password</p>
              {tab==="login"&&<button style={{all:"unset",cursor:"pointer",fontSize:11,color:T.a0,fontFamily:"Instrument Sans,sans-serif"}}>Forgot password?</button>}
            </div>
            <input type="password" value={pw} onChange={e=>setPw(e.target.value)} placeholder="••••••••"
              onFocus={()=>setFocusField("pw")} onBlur={()=>setFocusField(null)}
              onKeyDown={e=>e.key==="Enter"&&submit()} style={inp("pw")}/>
          </div>

          {error&&(
            <div style={{padding:"10px 14px",borderRadius:9,background:T.redBg,border:`1px solid ${T.red}33`,display:"flex",gap:8,alignItems:"flex-start"}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.red} strokeWidth="2" style={{flexShrink:0,marginTop:1}}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <p style={{margin:0,fontSize:12,color:T.red,lineHeight:1.5,fontFamily:"Instrument Sans,sans-serif"}}>{error}</p>
            </div>
          )}

          {/* Primary CTA */}
          <button onClick={submit} disabled={loading||!email.trim()||!pw.trim()}
            style={{all:"unset",cursor:loading||!email.trim()||!pw.trim()?"not-allowed":"pointer",padding:"14px 0",textAlign:"center",borderRadius:12,fontSize:14,fontWeight:600,fontFamily:"Playfair Display,serif",background:email.trim()&&pw.trim()&&!loading?`linear-gradient(135deg,${T.a0},#B8882E)`:T.bg3,color:email.trim()&&pw.trim()&&!loading?T.bg0:T.t2,transition:"all .15s",marginTop:2,display:"flex",alignItems:"center",justifyContent:"center",gap:8,boxShadow:email.trim()&&pw.trim()&&!loading?`0 6px 24px ${T.a0}55`:"none"}}
            onMouseEnter={e=>{if(email.trim()&&pw.trim()&&!loading){e.currentTarget.style.background=`linear-gradient(135deg,${T.a1},${T.a0})`;e.currentTarget.style.boxShadow=`0 8px 32px ${T.a0}66`;}}}
            onMouseLeave={e=>{if(email.trim()&&pw.trim()&&!loading){e.currentTarget.style.background=`linear-gradient(135deg,${T.a0},#B8882E)`;e.currentTarget.style.boxShadow=`0 6px 24px ${T.a0}55`;}}}>
            {loading
              ?<span style={{display:"flex",alignItems:"center",gap:8}}><div style={{width:14,height:14,border:`2px solid rgba(12,9,4,0.4)`,borderTopColor:T.bg0,borderRadius:"50%",animation:"spin 1s linear infinite"}}/><span>Signing in…</span></span>
              :<span>{tab==="login"?"Sign in to DataIntel →":"Create free account →"}</span>
            }
          </button>

          {/* Divider */}
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{flex:1,height:1,background:T.b1}}/><span style={{fontSize:11,color:T.t2,fontFamily:"JetBrains Mono,monospace"}}>or</span><div style={{flex:1,height:1,background:T.b1}}/>
          </div>

          {/* Guest button */}
          <button onClick={()=>onAuth({guest:true,email:"guest@dataintel.app",name:"Guest"})}
            style={{all:"unset",cursor:"pointer",padding:"13px 0",textAlign:"center",borderRadius:12,fontSize:13,fontFamily:"Instrument Sans,sans-serif",fontWeight:500,background:"transparent",color:T.t1,border:`1px solid ${T.b1}`,transition:"all .15s",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor=T.b2;e.currentTarget.style.color=T.t0;e.currentTarget.style.background=T.bg2;}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor=T.b1;e.currentTarget.style.color=T.t1;e.currentTarget.style.background="transparent";}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            Continue as guest
          </button>
        </div>

        <p style={{margin:"24px 0 0",fontSize:12,color:T.t2,textAlign:"center",fontFamily:"Instrument Sans,sans-serif",lineHeight:1.6}}>
          {tab==="login"
            ?<span>No account yet? <button onClick={()=>{setTab("signup");setError(null);}} style={{all:"unset",cursor:"pointer",color:T.a0,fontWeight:500}}>Sign up free →</button></span>
            :<span>Already have an account? <button onClick={()=>{setTab("login");setError(null);}} style={{all:"unset",cursor:"pointer",color:T.a0,fontWeight:500}}>Sign in →</button></span>
          }
        </p>

        {/* Trust badges */}
        <div style={{marginTop:28,paddingTop:20,borderTop:`1px solid ${T.b0}`,display:"flex",justifyContent:"center",gap:20}}>
          {["SOC 2 Ready","GDPR Compliant","256-bit SSL"].map((b,i)=>(
            <div key={i} style={{display:"flex",alignItems:"center",gap:4}}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={T.t2} strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
              <span style={{fontSize:10,color:T.t2,fontFamily:"JetBrains Mono,monospace"}}>{b}</span>
            </div>
          ))}
        </div>

        {/* Live demo CTA */}
        <div style={{marginTop:20,padding:"14px 16px",borderRadius:12,background:`linear-gradient(135deg,${T.aBg2},${T.aBg})`,border:`1px solid ${T.a0}33`}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
            <div style={{width:8,height:8,borderRadius:"50%",background:T.a0,boxShadow:`0 0 8px ${T.a0}`}}/>
            <span style={{fontSize:12,fontWeight:600,color:T.a1,fontFamily:"Instrument Sans,sans-serif"}}>Judges &amp; reviewers</span>
          </div>
          <p style={{margin:"0 0 10px",fontSize:12,color:T.t1,fontFamily:"Instrument Sans,sans-serif",lineHeight:1.6}}>
            Explore 3 pre-built dashboards instantly — no account needed.
          </p>
          <button onClick={()=>onAuth({demo:true,name:"Demo",email:"demo@dataintel.app"})}
            style={{all:"unset",cursor:"pointer",display:"block",width:"100%",padding:"10px 0",textAlign:"center",borderRadius:9,fontSize:13,fontWeight:600,fontFamily:"Playfair Display,serif",background:`linear-gradient(135deg,${T.a0},#B8882E)`,color:T.bg0,boxShadow:`0 4px 16px ${T.a0}44`,transition:"all .15s"}}
            onMouseEnter={e=>e.currentTarget.style.background=`linear-gradient(135deg,${T.a1},${T.a0})`}
            onMouseLeave={e=>e.currentTarget.style.background=`linear-gradient(135deg,${T.a0},#B8882E)`}>
            ⚡ Try Live Demo — instant access
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── DB CONNECTOR PANEL ───────────────────────────────────────────────────────
function DBConnectorPanel(){
  const[conn,setConn]=useState("");
  const[notice,setNotice]=useState(null);
  return(
    <div>
      <p style={{margin:"0 0 8px 8px",fontSize:10,color:T.t2,fontFamily:"JetBrains Mono,monospace",textTransform:"uppercase",letterSpacing:"0.08em"}}>Live DB Connector</p>
      <div style={{padding:"10px",borderRadius:10,background:T.bg3,border:`1px solid ${T.b1}`,marginBottom:10}}>
        <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:6}}>
          <div style={{width:7,height:7,borderRadius:"50%",background:T.green,boxShadow:`0 0 6px ${T.green}`}}/>
          <span style={{fontSize:12,fontWeight:600,color:T.t0,fontFamily:"Instrument Sans,sans-serif"}}>youtube_videos (mock)</span>
          <span style={{marginLeft:"auto",fontSize:9,fontFamily:"JetBrains Mono,monospace",color:T.green,background:T.greenBg,padding:"1px 6px",borderRadius:4}}>ACTIVE</span>
        </div>
        <p style={{margin:0,fontSize:11,color:T.t2,fontFamily:"JetBrains Mono,monospace"}}>Simulated · 12 columns</p>
      </div>
      <p style={{margin:"0 0 4px",fontSize:11,color:T.t2,fontFamily:"JetBrains Mono,monospace"}}>PostgreSQL connection string</p>
      <input value={conn} onChange={e=>setConn(e.target.value)} placeholder="postgresql://user:pass@host:5432/db"
        style={{all:"unset",width:"100%",fontSize:11,color:T.t0,background:T.bg3,border:`1px solid ${T.b1}`,borderRadius:8,padding:"8px 10px",fontFamily:"JetBrains Mono,monospace",caretColor:T.a0,marginBottom:8}}/>
      <button onClick={()=>setNotice("Live DB connection requires a backend proxy to avoid exposing credentials. See docs.")}
        style={{all:"unset",cursor:"pointer",width:"100%",padding:"8px 0",textAlign:"center",borderRadius:9,fontSize:12,fontFamily:"Instrument Sans,sans-serif",background:T.aBg,border:`1px solid ${T.a0}44`,color:T.a1,transition:"all .15s"}}>
        Connect database
      </button>
      {notice&&<p style={{margin:"6px 0 0",fontSize:10,color:T.amber,fontFamily:"JetBrains Mono,monospace",lineHeight:1.5}}>{notice}</p>}
    </div>
  );
}

// ─── VOICE BUTTON ────────────────────────────────────────────────────────────
function VoiceButton({onTranscript,disabled}){
  const[listening,setListening]=useState(false);
  const[unsupported,setUnsupported]=useState(false);
  const recRef=useRef(null);
  const toggle=()=>{
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR){setUnsupported(true);return;}
    if(listening){recRef.current?.stop();return;}
    const rec=new SR();rec.lang="en-US";rec.interimResults=false;rec.continuous=false;recRef.current=rec;
    rec.onstart=()=>setListening(true);rec.onend=()=>setListening(false);rec.onerror=()=>setListening(false);
    rec.onresult=e=>{const t=Array.from(e.results).map(r=>r[0].transcript).join(" ").trim();if(t)onTranscript(t);};
    rec.start();
  };
  if(unsupported)return null;
  return(
    <button onClick={toggle} disabled={disabled} title={listening?"Stop recording":"Voice input"}
      style={{all:"unset",cursor:disabled?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",width:36,height:36,borderRadius:10,flexShrink:0,marginBottom:6,marginRight:2,background:listening?T.redBg:"transparent",border:`1px solid ${listening?T.red+"55":T.b1}`,color:listening?T.red:T.t2,transition:"all .15s",boxShadow:listening?`0 0 12px ${T.red}33`:"none",opacity:disabled?0.4:1}}
      onMouseEnter={e=>{if(!disabled&&!listening){e.currentTarget.style.background=T.bg3;e.currentTarget.style.borderColor=T.b2;e.currentTarget.style.color=T.t0;}}}
      onMouseLeave={e=>{if(!listening){e.currentTarget.style.background="transparent";e.currentTarget.style.borderColor=T.b1;e.currentTarget.style.color=T.t2;}}}>
      {listening
        ?<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23" style={{animation:"pulse .8s ease-in-out infinite"}}/><line x1="7" y1="5" x2="7" y2="19" style={{animation:"pulse .8s ease-in-out .1s infinite"}}/><line x1="17" y1="5" x2="17" y2="19" style={{animation:"pulse .8s ease-in-out .1s infinite"}}/><line x1="3" y1="9" x2="3" y2="15" style={{animation:"pulse .8s ease-in-out .2s infinite"}}/><line x1="21" y1="9" x2="21" y2="15" style={{animation:"pulse .8s ease-in-out .2s infinite"}}/></svg>
        :<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="1" width="6" height="11" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="9" y1="23" x2="15" y2="23"/></svg>
      }
    </button>
  );
}

// ─── CHAT MODE TOGGLE ─────────────────────────────────────────────────────────
function ChatModeToggle({mode,onChange,hasHistory}){
  const MODE_ICONS={
    plus:<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
    refresh:<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/></svg>,
  };
  return(
    <div style={{display:"flex",alignItems:"center",gap:0,background:T.bg3,border:`1px solid ${T.b1}`,borderRadius:10,padding:3,position:"relative"}}>
      <div style={{position:"absolute",top:3,left:mode==="new"?3:"calc(50% + 1px)",width:"calc(50% - 4px)",height:"calc(100% - 6px)",background:mode==="new"?T.bg4:T.aBg2,border:`1px solid ${mode==="new"?T.b2:T.a0+"55"}`,borderRadius:7,transition:"left .2s cubic-bezier(.16,1,.3,1), background .2s, border-color .2s",pointerEvents:"none"}}/>
      {[
        {id:"new",label:"New chat",iconKey:"plus"},
        {id:"continue",label:"Continue chat",iconKey:"refresh"},
      ].map(opt=>(
        <button key={opt.id} onClick={()=>onChange(opt.id)} disabled={opt.id==="continue"&&!hasHistory}
          style={{all:"unset",cursor:opt.id==="continue"&&!hasHistory?"not-allowed":"pointer",position:"relative",zIndex:1,display:"flex",alignItems:"center",gap:7,padding:"6px 16px",borderRadius:7,flex:1,justifyContent:"center",fontSize:11,fontWeight:500,fontFamily:"Instrument Sans,sans-serif",color:mode===opt.id?(opt.id==="continue"?T.a1:T.t0):T.t2,opacity:opt.id==="continue"&&!hasHistory?0.4:1,transition:"color .2s",whiteSpace:"nowrap"}}>
          <span style={{color:mode===opt.id?(opt.id==="continue"?T.a0:T.t1):T.t2,transition:"color .2s"}}>{MODE_ICONS[opt.iconKey]}</span>
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ─── INPUT BAR ────────────────────────────────────────────────────────────────
function InputBar({
  value,
  onChange,
  onSubmit,
  loading,
  chatMode,
  onChatModeChange,
  hasHistory,
  turnCount,
  schema
}){

  const CHAT_ICONS={
    plus:<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
    refresh:<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/></svg>,
  };

  const ref = useRef();
  const [focus,setFocus] = useState(false);

  // Safe column count
  const columnCount = schema?.columns ? Object.keys(schema.columns).length : 0;

  const onKey = e => {
    if(e.key==="Enter" && !e.shiftKey){
      e.preventDefault();
      onSubmit();
    }
  };

  const resize = e => {
    e.target.style.height="auto";
    e.target.style.height=Math.min(e.target.scrollHeight,120)+"px";
  };

  const placeholder =
    chatMode==="continue" && hasHistory
      ? "Ask a follow-up question…"
      : "Ask anything about your YouTube data…";

  return(
    <div style={{display:"flex",flexDirection:"column",gap:8}}>

      {/* Chat mode indicator */}
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <ChatModeToggle
          mode={chatMode}
          onChange={onChatModeChange}
          hasHistory={hasHistory}
        />

        {chatMode==="continue" && hasHistory && (
          <div style={{
            display:"flex",
            alignItems:"center",
            gap:6,
            padding:"5px 10px",
            borderRadius:8,
            background:T.aBg,
            border:`1px solid ${T.a0}33`,
            animation:"fadeIn .2s ease both"
          }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={T.a0} strokeWidth="2.5">
              <polyline points="17 1 21 5 17 9"/>
              <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
            </svg>

            <span style={{
              fontSize:11,
              color:T.a1,
              fontFamily:"JetBrains Mono,monospace"
            }}>
              {turnCount} {turnCount===1?"turn":"turns"} in context
            </span>
          </div>
        )}

        {chatMode==="new" && hasHistory && (
          <div style={{
            display:"flex",
            alignItems:"center",
            gap:6,
            padding:"5px 10px",
            borderRadius:8,
            background:T.b0,
            border:`1px solid ${T.b1}`,
            animation:"fadeIn .2s ease both"
          }}>
            <span style={{
              fontSize:11,
              color:T.t2,
              fontFamily:"JetBrains Mono,monospace"
            }}>
              Fresh context · history cleared
            </span>
          </div>
        )}
      </div>

      {/* Input container */}
      <div style={{
        background:`linear-gradient(180deg,${T.bg2},${T.bg3})`,
        borderRadius:20,
        border:`1px solid ${
          focus
            ? (chatMode==="continue" ? T.a0+"99" : T.b3)
            : T.b2
        }`,
        boxShadow:focus
          ? `0 0 0 3px ${chatMode==="continue"?T.aRing:"rgba(212,168,84,0.15)"},0 16px 36px rgba(0,0,0,.24)`
          : "0 12px 28px rgba(0,0,0,.18)",
        transition:"border-color .2s,box-shadow .2s",
        overflow:"hidden"
      }}>

        {chatMode==="continue" &&
          <div style={{
            height:2,
            background:`linear-gradient(90deg,${T.a0},${T.green})`
          }}/>
        }

        <div style={{
          display:"flex",
          gap:0,
          alignItems:"flex-end",
          padding:"6px 6px 6px 18px"
        }}>

          {/* Status dot */}
          <div style={{
            width:6,
            height:6,
            borderRadius:"50%",
            background:focus
              ? (chatMode==="continue"?T.a0:T.t1)
              : T.t2,
            boxShadow:focus ? `0 0 8px ${T.a0}` : "none",
            flexShrink:0,
            marginBottom:15,
            marginRight:10,
            transition:"all .2s"
          }}/>

          {/* Textarea */}
          <textarea
            ref={ref}
            value={value}
            onChange={e=>{
              onChange(e.target.value);
              resize(e);
            }}
            onKeyDown={onKey}
            onFocus={()=>setFocus(true)}
            onBlur={()=>setFocus(false)}
            disabled={loading}
            rows={1}
            placeholder={placeholder}
            style={{
              all:"unset",
              flex:1,
              fontSize:15,
              color:T.t0,
              lineHeight:1.6,
              padding:"10px 0",
              resize:"none",
              maxHeight:120,
              overflowY:"auto",
              opacity: loading ? .5 : 1,
              caretColor:T.a0,
              fontFamily:"Instrument Sans,sans-serif"
            }}
          />

          {/* Voice */}
          <VoiceButton
            onTranscript={txt=>{
              onChange(value ? value+" "+txt : txt);
            }}
            disabled={loading}
          />

          {/* Submit */}
          <button
            onClick={onSubmit}
            disabled={loading || !value.trim()}
            style={{
              all:"unset",
              cursor:value.trim()&&!loading?"pointer":"not-allowed",
              display:"flex",
              alignItems:"center",
              gap:7,
              margin:"8px 8px 8px 4px",
              padding:"10px 18px",
              borderRadius:14,
              fontSize:13,
              fontWeight:600,
              fontFamily:"Playfair Display,serif",
              background:value.trim()&&!loading
                ? `linear-gradient(135deg,${T.a0},#C79233)`
                : T.bg4,
              color:value.trim()&&!loading?T.bg0:T.t2,
              transition:"all .15s",
              flexShrink:0,
              boxShadow:value.trim()&&!loading
                ? `0 10px 20px ${T.a0}2A`
                : "none"
            }}
          >
            {loading
              ? <div style={{
                  width:14,
                  height:14,
                  border:`2px solid ${T.t2}`,
                  borderTopColor:T.t0,
                  borderRadius:"50%",
                  animation:"spin 1s linear infinite"
                }}/>
              : chatMode==="continue"
                ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/></svg>
                : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            }

            <span>
              {loading
                ? "Analyzing"
                : chatMode==="continue"
                  ? "Follow up"
                  : "Generate"}
            </span>

          </button>
        </div>

        {/* Footer */}
        <div style={{
          padding:"8px 16px",
          borderTop:`1px solid ${T.b0}`,
          display:"flex",
          alignItems:"center",
          gap:8,
          background:T.bg3
        }}>
          <span style={{
            fontSize:10,
            color:T.t2,
            fontFamily:"JetBrains Mono,monospace"
          }}>
            ↵ {chatMode==="continue"?"follow up":"generate"} · ⇧↵ new line
          </span>

          <div style={{flex:1}}/>

          <div style={{display:"flex",alignItems:"center",gap:5}}>
            <div style={{
              width:5,
              height:5,
              borderRadius:"50%",
              background:T.green
            }}/>

            <span style={{
              fontSize:10,
              color:T.green,
              fontFamily:"JetBrains Mono,monospace"
            }}>
              {columnCount
                ? `data pipeline active`
                : "No database connected"}
            </span>

          </div>
        </div>

      </div>
    </div>
  );
}

// ─── SIDEBAR ─────────────────────────────────────────────────────────────────
function Sidebar({activeTab,onTab,qHistory,onHistoryClick,alerts,onAddAlert,onDeleteAlert,schedule,onSaveSchedule,uploadedDatasets,onLoadUploadedDataset,onToast,schema,onUploadCsv}){
  const[uploadedData,setUploadedData]=useState(null);

  const navItems=[
    {id:"dash",label:"Dashboard",icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>},
    {id:"hist",label:"History",icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 16 14"/></svg>},
    {id:"schema",label:"Schema",icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/></svg>},
    {id:"alerts",label:"Alerts",badge:alerts.length,icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>},
    {id:"schedule",label:"Reports",icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>},
    {id:"db",label:"Database",icon:<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/></svg>},
  ];
  const sectionLabelStyle={margin:"0 0 10px 12px",fontSize:10,color:T.t2,fontFamily:"JetBrains Mono,monospace",textTransform:"uppercase",letterSpacing:"0.12em"};
  return(
    <div style={{width:252,flexShrink:0,background:`linear-gradient(180deg,${T.bg1} 0%,${T.bg0} 100%)`,borderRight:`1px solid ${T.b0}`,display:"flex",flexDirection:"column",overflow:"hidden",boxShadow:`inset -1px 0 0 ${T.b0}`}}>
      <div style={{padding:"20px 18px 16px",borderBottom:`1px solid ${T.b0}`,display:"flex",alignItems:"center",gap:12}}>
        <div style={{width:38,height:38,borderRadius:12,background:`linear-gradient(135deg,${T.a0},#C79233)`,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 8px 18px ${T.a0}2A,inset 0 1px 0 rgba(255,255,255,.1)`}}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><polygon points="8,1 2,14 8,10 14,14" fill={T.bg0} opacity="0.96"/></svg>
        </div>
        <div style={{minWidth:0}}>
          <p style={{margin:0,fontSize:16,fontWeight:700,color:T.t0,fontFamily:"Playfair Display,serif",letterSpacing:"-0.02em",lineHeight:1.1}}>DataIntel</p>
          <p style={{margin:"4px 0 0",fontSize:10,color:T.t2,fontFamily:"JetBrains Mono,monospace",letterSpacing:"0.08em"}}>YouTube Analytics</p>
        </div>
      </div>
      <div style={{padding:"14px 12px 0"}}>
        {navItems.map(({id,label,icon,badge})=>{
          const active=activeTab===id;
          return(
            <button key={id} onClick={()=>onTab(id)}
              style={{all:"unset",cursor:"pointer",display:"flex",alignItems:"center",gap:12,width:"calc(100% - 20px)",alignSelf:"center",padding:"7px 12px",borderRadius:12,fontSize:14,fontWeight:active?600:500,color:active?T.t0:T.t1,background:active?`linear-gradient(180deg,${T.aBg},${T.aBg2})`:"transparent",border:`1px solid ${active?T.a0+"30":"transparent"}`,boxShadow:active?`inset 0 1px 0 ${T.a0}14`:"none",transition:"all .16s ease",marginBottom:6,fontFamily:"Instrument Sans,sans-serif"}}
              onMouseEnter={e=>{if(!active){e.currentTarget.style.background=T.bg2;e.currentTarget.style.borderColor=T.b1;}}}
              onMouseLeave={e=>{if(!active){e.currentTarget.style.background="transparent";e.currentTarget.style.borderColor="transparent";}}}>
              <span style={{width:18,height:18,display:"flex",alignItems:"center",justifyContent:"center",color:active?T.a0:T.t2,transition:"color .15s",flexShrink:0}}>{icon}</span>
              <span style={{flex:1,textAlign:"left"}}>{label}</span>
              {badge>0&&<span style={{marginLeft:"auto",fontSize:10,fontWeight:700,padding:"3px 7px",borderRadius:999,background:active?`${T.a0}22`:T.bg2,color:active?T.a1:T.t2,fontFamily:"JetBrains Mono,monospace",border:`1px solid ${active?T.a0+"30":T.b1}`}}>{badge}</span>}
              {active&&!badge&&<div style={{marginLeft:"auto",width:6,height:6,borderRadius:"50%",background:T.a0}}/>}
            </button>
          );
        })}
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"18px 12px 14px"}}>
        {activeTab==="hist"&&(
          <div>
            <p style={sectionLabelStyle}>Recent queries</p>
            {qHistory.length===0?<p style={{fontSize:12,color:T.t2,padding:"10px 12px",fontFamily:"Instrument Sans,sans-serif",lineHeight:1.5}}>No queries yet</p>
              :qHistory.map((h,i)=>(
                <button key={i} onClick={()=>onHistoryClick(h.q)}
                  style={{all:"unset",cursor:"pointer",display:"flex",alignItems:"flex-start",gap:10,width:"100%",padding:"10px 12px",borderRadius:12,fontSize:12,color:T.t1,lineHeight:1.45,transition:"background .12s,border-color .12s",marginBottom:4,fontFamily:"Instrument Sans,sans-serif",background:T.bg1,border:`1px solid ${T.b0}`}}
                  onMouseEnter={e=>{e.currentTarget.style.background=T.bg2;e.currentTarget.style.borderColor=T.b1;}}
                  onMouseLeave={e=>{e.currentTarget.style.background=T.bg1;e.currentTarget.style.borderColor=T.b0;}}>
                  <span style={{color:h.mode==="continue"?T.a0:T.t2,fontSize:10,marginTop:2,flexShrink:0}}>{h.mode==="continue"?"↻":"›"}</span>
                  <span style={{overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",flex:1}}>{h.q}</span>
                  {h.mode==="continue"&&<span style={{fontSize:8,padding:"1px 5px",borderRadius:4,background:T.aBg,color:T.a0,fontFamily:"JetBrains Mono,monospace",flexShrink:0,marginTop:2}}>+ctx</span>}
                </button>
              ))
            }
          </div>
        )}
        {activeTab==="schema"&&(
          <div>
            <p style={sectionLabelStyle}>Data Schema</p>

            {!schema && (
              <div style={{
                padding:"12px",
                borderRadius:14,
                background:T.bg2,
                border:`1px solid ${T.b1}`
              }}>
                <span style={{
                  fontSize:12,
                  color:T.t2,
                  fontFamily:"Instrument Sans,sans-serif",
                  lineHeight:1.5
                }}>
                  No database connected
                </span>
              </div>
            )}

            {schema && (
              <div style={{
                padding:"12px",
                borderRadius:14,
                background:T.bg2,
                border:`1px solid ${T.b1}`
              }}>

                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                  <div style={{
                    width:7,
                    height:7,
                    borderRadius:"50%",
                    background:T.green,
                    boxShadow:`0 0 6px ${T.green}`
                  }}/>

                  <span style={{
                    fontSize:12,
                    fontWeight:600,
                    color:T.t0,
                    fontFamily:"Instrument Sans,sans-serif"
                  }}>
                    Connected Dataset
                  </span>

                  <span style={{
                    marginLeft:"auto",
                    fontSize:10,
                    fontFamily:"JetBrains Mono,monospace",
                    color:T.green,
                    background:T.greenBg,
                    padding:"3px 7px",
                    borderRadius:999
                  }}>
                    {Object.keys(schema.columns).length} cols
                  </span>
                </div>

                {Object.entries(schema.columns).map(([name,info])=>(
                  <div key={name} style={{
                    display:"flex",
                    alignItems:"baseline",
                    gap:8,
                    padding:"5px 0",
                    borderBottom:`1px solid ${T.b0}`
                  }}>
                    <span style={{
                      fontSize:11,
                      color:T.a1,
                      fontFamily:"JetBrains Mono,monospace",
                      flex:1,
                      overflow:"hidden",
                      textOverflow:"ellipsis",
                      whiteSpace:"nowrap"
                    }}>
                      {name}
                    </span>

                    <span style={{
                      fontSize:10,
                      color:T.t2,
                      fontFamily:"JetBrains Mono,monospace",
                      flexShrink:0
                    }}>
                      {info.type}
                    </span>

                    <span style={{
                      fontSize:10,
                      color:T.green,
                      fontFamily:"JetBrains Mono,monospace",
                      flexShrink:0
                    }}>
                      {info.role}
                    </span>

                  </div>
                ))}

              </div>
            )}

          </div>
        )}
        {activeTab==="alerts"&&<AlertsPanel alerts={alerts} onAdd={onAddAlert} onDelete={onDeleteAlert}/>}
        {activeTab==="schedule"&&<SchedulePanel schedule={schedule} onSave={onSaveSchedule}/>}
        {activeTab==="db"&&(
          <div>
            <p style={sectionLabelStyle}>Uploaded Datasets</p>
            {!schema?.columns
              ?<p style={{
                fontSize:12,
                color:T.t2,
                padding:"10px 12px",
                fontFamily:"Instrument Sans,sans-serif",
                lineHeight:1.5
              }}>
                No database connected. Upload a CSV to begin.
              </p>
              :(
                <div style={{
                  padding:"10px 12px",
                  borderRadius:12,
                  background:T.bg2,
                  border:`1px solid ${T.b1}`,
                  display:"flex",
                  alignItems:"center",
                  justifyContent:"space-between"
                }}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <div style={{
                      width:6,
                      height:6,
                      borderRadius:"50%",
                      background:T.green
                    }}/>
                    <span style={{
                      fontSize:12,
                      color:T.green,
                      fontFamily:"Instrument Sans,sans-serif",
                      fontWeight:500
                    }}>
                      Database connected
                    </span>
                  </div>

                  <span style={{
                    fontSize:10,
                    color:T.t2,
                    fontFamily:"JetBrains Mono,monospace"
                  }}>
                    {Object.keys(schema.columns).length} columns
                  </span>
                </div>
              )
            }
            {uploadedData&&(
              <div style={{marginTop:14,padding:12,border:`1px solid ${T.b1}`,borderRadius:14,background:T.bg2}}>
                <p style={{margin:"0 0 10px",fontSize:11,color:T.a1,fontFamily:"JetBrains Mono,monospace",lineHeight:1.5}}>Dataset preview: {uploadedData.headers.join(", ")}</p>
                <div style={{maxHeight:180,overflowX:"auto",overflowY:"auto",background:T.bg0,border:`1px solid ${T.b0}`,borderRadius:10}}>
                  <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,fontFamily:"JetBrains Mono,monospace"}}>
                    <thead>
                      <tr>
                        {uploadedData.headers.map((h,i)=>(
                          <th key={i} style={{textAlign:"left",padding:"6px 8px",borderBottom:`1px solid ${T.b1}`,color:T.t2,whiteSpace:"nowrap"}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {uploadedData.rows.slice(0,8).map((row,ridx)=>(
                        <tr key={ridx} style={{borderBottom:`1px solid ${T.b1}`}}>
                          {uploadedData.headers.map((h,cidx)=>(
                            <td key={cidx} style={{padding:"6px 8px",color:T.t0,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{row[h]}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <div style={{padding:"14px 12px 16px",borderTop:`1px solid ${T.b0}`,display:"flex",flexDirection:"column",gap:10,background:`linear-gradient(180deg,rgba(0,0,0,0),${T.bg1})`}}>
        <button onClick={onUploadCsv}
          style={{all:"unset",cursor:"pointer",display:"flex",alignItems:"center",gap:10,width:"calc(100% - 10px)",alignSelf:"center",padding:"10px 11px",borderRadius:12,background:T.bg2,border:`1px solid ${T.b1}`,transition:"all .16s",overflow:"hidden"}}
          onMouseEnter={e=>{e.currentTarget.style.borderColor=T.a0+"4A";e.currentTarget.style.background=T.bg3;}}
          onMouseLeave={e=>{e.currentTarget.style.borderColor=T.b1;e.currentTarget.style.background=T.bg2;}}>
          <div style={{width:34,height:34,borderRadius:11,display:"flex",alignItems:"center",justifyContent:"center",background:T.aBg,border:`1px solid ${T.a0}22`,color:T.a0,flexShrink:0}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v12m0 0l-4-4m4 4l4-4"/><path d="M12 21v-8"/></svg>
          </div>
          <div style={{display:"flex",flexDirection:"column",minWidth:0,flex:1}}>
            <span style={{fontSize:12,fontWeight:600,color:T.t0,fontFamily:"Instrument Sans,sans-serif",lineHeight:1.15}}>Upload CSV</span>
            <span style={{fontSize:10,color:T.t2,fontFamily:"JetBrains Mono,monospace",letterSpacing:"0.04em"}}>Import local data</span>
          </div>
          <span style={{fontSize:10,fontWeight:700,color:T.a1,fontFamily:"JetBrains Mono,monospace",letterSpacing:"0.03em",flexShrink:0}}>
            Choose
          </span>
        </button>
        {[{label:"Settings",icon:<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>}].map(({label,icon})=>(
          <button key={label} style={{all:"unset",cursor:"pointer",display:"flex",alignItems:"center",gap:10,width:"100%",padding:"9px 11px",borderRadius:12,fontSize:12,color:T.t2,fontFamily:"Instrument Sans,sans-serif",transition:"all .12s"}}
            onMouseEnter={e=>{e.currentTarget.style.background=T.bg2;e.currentTarget.style.color=T.t1;}}
            onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color=T.t2;}}
          >{icon} {label}</button>
        ))}
      </div>
    </div>
  );
}

// ─── TOPBAR ──────────────────────────────────────────────────────────────────
function Topbar({title,onNew,onToggle,onSave,onShare,onExport,hasResult,dateRange,onDateRangeChange,user,onSignOut}){
  return(
    <div style={{height:52,borderBottom:`1px solid ${T.b0}`,display:"flex",alignItems:"center",padding:"0 20px",gap:8,background:T.bg0,flexShrink:0}}>
      <button onClick={onToggle} style={{all:"unset",cursor:"pointer",width:30,height:30,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",color:T.t2,transition:"all .12s"}}
        onMouseEnter={e=>{e.currentTarget.style.background=T.bg3;e.currentTarget.style.color=T.t0;}}
        onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color=T.t2;}}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="3" y1="7" x2="21" y2="7"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="17" x2="21" y2="17"/></svg>
      </button>
      <div style={{width:1,height:16,background:T.b1}}/>
      <p style={{fontSize:13,fontWeight:600,color:title?T.t0:T.t2,fontFamily:"Playfair Display,serif",minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:200}}>{title||"YouTube Analytics"}</p>
      <div style={{flex:1}}/>
      {hasResult&&<DateRangePicker value={dateRange} onChange={onDateRangeChange}/>}
      {hasResult&&(
        <button onClick={onSave} style={{all:"unset",cursor:"pointer",display:"flex",alignItems:"center",gap:5,padding:"5px 11px",borderRadius:8,background:T.bg2,border:`1px solid ${T.b1}`,fontSize:12,color:T.t1,fontFamily:"Instrument Sans,sans-serif",transition:"all .12s"}}
          onMouseEnter={e=>{e.currentTarget.style.borderColor=T.b2;e.currentTarget.style.color=T.t0;}}
          onMouseLeave={e=>{e.currentTarget.style.borderColor=T.b1;e.currentTarget.style.color=T.t1;}}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
          Save
        </button>
      )}
      {hasResult&&(
        <button onClick={onShare} style={{all:"unset",cursor:"pointer",display:"flex",alignItems:"center",gap:5,padding:"5px 11px",borderRadius:8,background:T.bg2,border:`1px solid ${T.b1}`,fontSize:12,color:T.t1,fontFamily:"Instrument Sans,sans-serif",transition:"all .12s"}}
          onMouseEnter={e=>{e.currentTarget.style.borderColor=T.b2;e.currentTarget.style.color=T.t0;}}
          onMouseLeave={e=>{e.currentTarget.style.borderColor=T.b1;e.currentTarget.style.color=T.t1;}}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
          Share
        </button>
      )}
      {hasResult&&(
        <button onClick={onExport} style={{all:"unset",cursor:"pointer",display:"flex",alignItems:"center",gap:5,padding:"5px 11px",borderRadius:8,background:T.bg2,border:`1px solid ${T.b1}`,fontSize:12,color:T.t1,fontFamily:"Instrument Sans,sans-serif",transition:"all .12s"}}
          onMouseEnter={e=>{e.currentTarget.style.borderColor=T.b2;e.currentTarget.style.color=T.t0;}}
          onMouseLeave={e=>{e.currentTarget.style.borderColor=T.b1;e.currentTarget.style.color=T.t1;}}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Export
        </button>
      )}
      <button onClick={onNew} style={{all:"unset",cursor:"pointer",display:"flex",alignItems:"center",gap:5,padding:"6px 13px",borderRadius:9,background:T.aBg,border:`1px solid ${T.a0}44`,fontSize:12,color:T.a1,fontWeight:600,fontFamily:"Instrument Sans,sans-serif",transition:"all .15s"}}
        onMouseEnter={e=>e.currentTarget.style.background=T.aBg2}
        onMouseLeave={e=>e.currentTarget.style.background=T.aBg}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        New
      </button>
      {/* User avatar */}
      {user&&(
        <div style={{display:"flex",alignItems:"center",gap:8,marginLeft:4,paddingLeft:8,borderLeft:`1px solid ${T.b1}`}}>
          <div style={{width:28,height:28,borderRadius:"50%",background:`linear-gradient(135deg,${T.a0},#B8882E)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            <span style={{fontSize:11,fontWeight:700,color:T.bg0,fontFamily:"Instrument Sans,sans-serif"}}>{(user.name||user.email||"G")[0].toUpperCase()}</span>
          </div>
          <div style={{display:"flex",flexDirection:"column"}}>
            <span style={{fontSize:11,color:T.t0,fontFamily:"Instrument Sans,sans-serif",fontWeight:500,lineHeight:1.2}}>{user.guest?"Guest":user.name||user.email}</span>
            {user.guest&&<span style={{fontSize:9,color:T.t2,fontFamily:"JetBrains Mono,monospace"}}>guest mode</span>}
          </div>
          <button onClick={() => {
            console.log("logout clicked");
            localStorage.removeItem("token");
            setUser(null);
            setShowLanding(true);
            }} 
            title="Sign out"
            style={{all:"unset",cursor:"pointer",width:26,height:26,borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",color:T.t2,transition:"all .12s"}}
            onMouseEnter={e=>{e.currentTarget.style.background=T.bg3;e.currentTarget.style.color=T.red;}}
            onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color=T.t2;}}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>
        </div>
      )}
    </div>
  );
}

// ─── EMPTY STATE ──────────────────────────────────────────────────────────────
const PROMPTS=[
  {label:"Category Performance",q:"Show total views and average sentiment_score by category"},
  {label:"Regional Reach",q:"Which regions have the highest engagement rate (likes + comments + shares / views)?"},
  {label:"Monetization Impact",q:"Compare views and likes between ads_enabled true vs false videos"},
  {label:"Video Length vs Views",q:"Does duration_sec correlate with higher views? Show distribution by length bucket"},
  {label:"Top Languages",q:"Which languages generate the most shares and comments?"},
  {label:"Sentiment by Region",q:"Show average sentiment_score by region — which regions react most positively?"},
];
function EmptyState({onPrompt}){
  return(
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"44px 24px 32px",animation:"fadeUp .5s ease both",gap:28}}>
      <div style={{position:"relative",animation:"float 4s ease-in-out infinite"}}>
        <div style={{width:72,height:72,borderRadius:22,background:`linear-gradient(135deg,${T.bg3},${T.bg4})`,border:`1px solid ${T.b2}`,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 0 40px ${T.a0}22,0 16px 40px rgba(0,0,0,.5)`}}>
          <svg width="34" height="34" viewBox="0 0 34 34" fill="none">
            <rect x="3" y="8" width="28" height="18" rx="4" stroke={T.a0} strokeWidth="1.5" opacity="0.6"/>
            <polygon points="14,12 24,17 14,22" fill={T.a0}/>
            <rect x="6" y="28" width="8" height="2" rx="1" fill={T.green} opacity="0.7"/>
            <rect x="16" y="28" width="12" height="2" rx="1" fill={T.green} opacity="0.4"/>
          </svg>
        </div>
        <div style={{position:"absolute",top:-4,right:-4,width:14,height:14,borderRadius:"50%",background:T.green,boxShadow:`0 0 12px ${T.green}`,border:`2px solid ${T.bg0}`}}/>
      </div>
      <div style={{textAlign:"center",maxWidth:460}}>
        <h2 style={{margin:"0 0 8px",fontSize:26,fontWeight:700,color:T.t0,fontFamily:"Playfair Display,serif",lineHeight:1.2}}>YouTube analytics, in plain English.</h2>
        <p style={{margin:"0 0 6px",fontSize:14,color:T.t1,lineHeight:1.7,fontFamily:"Instrument Sans,sans-serif"}}>Ask anything about your dataset — views, sentiment, monetization, regional performance, and more.</p>
        <div style={{display:"inline-flex",alignItems:"center",gap:6,padding:"4px 12px",borderRadius:20,background:T.aBg,border:`1px solid ${T.a0}33`,marginTop:4}}>
          <div style={{width:5,height:5,borderRadius:"50%",background:T.green}}/>
          <span style={{fontSize:11,color:T.a1,fontFamily:"JetBrains Mono,monospace"}}>Dataset Connected · Analytics Engine Ready</span>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,width:"100%",maxWidth:720}}>
        {PROMPTS.map((p,i)=><PromptCard key={i} label={p.label} q={p.q} idx={i} onClick={()=>onPrompt(p.q)}/>)}
      </div>
    </div>
  );
}
function PromptCard({label,q,idx,onClick}){
  const[hov,setHov]=useState(false);
  return(
    <button onClick={onClick} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{all:"unset",cursor:"pointer",textAlign:"left",padding:"13px 15px",borderRadius:12,background:hov?T.bg3:T.bg2,border:`1px solid ${hov?T.b2:T.b1}`,transition:"all .15s",display:"flex",flexDirection:"column",gap:4,animation:`fadeUp .5s ease ${.1+idx*.06}s both`,boxShadow:hov?`0 4px 20px rgba(0,0,0,.35),inset 0 1px 0 ${T.b2}`:`inset 0 1px 0 ${T.b1}`}}>
      <span style={{fontSize:14,fontWeight:600,color:hov?T.a1:T.t0,fontFamily:"Playfair Display,serif",transition:"color .15s"}}>{label}</span>
      <span style={{fontSize:13,color:T.t2,fontFamily:"Instrument Sans,sans-serif",lineHeight:1.5}}>{q}</span>
      <span style={{fontSize:11,color:hov?T.a0:T.t2,fontFamily:"JetBrains Mono,monospace",marginTop:3,transition:"color .15s"}}>Try this ↗</span>
    </button>
  );
}

// ─── LIGHT / DARK THEME ──────────────────────────────────────────────────────
const LIGHT = {
  bg0:"#F5F2EC",bg1:"#EDE9E0",bg2:"#E4DED3",bg3:"#D9D2C4",bg4:"#CEC5B4",
  b0:"rgba(90,70,30,0.07)",b1:"rgba(90,70,30,0.13)",b2:"rgba(90,70,30,0.20)",b3:"rgba(90,70,30,0.30)",
  t0:"#1C1508",t1:"#5A4520",t2:"#9A845A",
  a0:"#A87828",a1:"#C49440",a2:"#7A5418",
  aBg:"rgba(168,120,40,0.10)",aBg2:"rgba(168,120,40,0.18)",aRing:"rgba(168,120,40,0.25)",
  green:"#2E7D52",greenBg:"rgba(46,125,82,0.10)",greenDim:"rgba(46,125,82,0.06)",
  red:"#B84030",redBg:"rgba(184,64,48,0.10)",
  blue:"#2A6EA8",blueBg:"rgba(42,110,168,0.10)",
  purple:"#6A4AB0",purpleBg:"rgba(106,74,176,0.10)",
  chart:["#A87828","#2E7D52","#B84030","#C49440","#7A5418","#8A4A3A","#2A6080","#7A6020"],
};

// ─── SKELETON LOADER ─────────────────────────────────────────────────────────
function Skeleton({w="100%",h=16,r=6,style={}}){
  return(
    <div style={{width:w,height:h,borderRadius:r,background:`linear-gradient(90deg,${T.b1} 25%,${T.b2} 50%,${T.b1} 75%)`,backgroundSize:"200% 100%",animation:"shimmer 1.5s infinite",...style}}/>
  );
}
function KPISkeleton(){
  return(
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:10}}>
      {[0,1,2,3].map(i=>(
        <div key={i} style={{background:T.bg2,border:`1px solid ${T.b1}`,borderRadius:16,padding:"20px 22px",display:"flex",flexDirection:"column",gap:12,animation:`fadeUp .4s ease ${i*.07}s both`}}>
          <Skeleton w="55%" h={10}/>
          <Skeleton w="70%" h={28} r={8}/>
          <Skeleton w="40%" h={10}/>
        </div>
      ))}
    </div>
  );
}
function ChartSkeleton(){
  return(
    <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12}}>
      {[0,1].map(i=>(
        <div key={i} style={{background:T.bg2,border:`1px solid ${T.b1}`,borderRadius:16,padding:"20px 22px",animation:`fadeUp .4s ease ${.1+i*.08}s both`}}>
          <Skeleton w="50%" h={14} style={{marginBottom:6}}/>
          <Skeleton w="35%" h={10} style={{marginBottom:20}}/>
          <div style={{display:"flex",alignItems:"flex-end",gap:6,height:180}}>
            {[60,90,45,110,75,130,85,100].map((h,j)=>(
              <div key={j} style={{flex:1,height:`${h}px`,borderRadius:"4px 4px 0 0",background:`linear-gradient(180deg,${T.b2},${T.b1})`,animation:"shimmer 1.5s infinite",backgroundSize:"200% 100%",animationDelay:`${j*.08}s`}}/>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function LoadingExperience({step,query}){
  const [pulse,setPulse]=useState(0);
  const [pointer,setPointer]=useState({x:50,y:50,active:false});
  const particles=useMemo(()=>[
    {x:18,y:22,size:10,color:T.a0,delay:0},
    {x:76,y:16,size:8,color:T.green,delay:.8},
    {x:88,y:60,size:12,color:T.blue,delay:1.6},
    {x:60,y:84,size:9,color:T.purple,delay:.3},
    {x:24,y:74,size:7,color:T.red,delay:1.2},
    {x:48,y:48,size:14,color:T.a1,delay:.5},
  ],[]);

  useEffect(()=>{
    const id=setInterval(()=>setPulse(p=>p+1),1400);
    return()=>clearInterval(id);
  },[]);

  const activeStep=STEPS[Math.min(step,STEPS.length-1)]?.label||"Preparing dashboard";

  return(
    <div style={{display:"grid",gridTemplateColumns:"minmax(0,1.2fr) minmax(320px,.8fr)",gap:16,alignItems:"stretch"}}>
      <div
        onMouseMove={e=>{
          const rect=e.currentTarget.getBoundingClientRect();
          setPointer({
            x:((e.clientX-rect.left)/rect.width)*100,
            y:((e.clientY-rect.top)/rect.height)*100,
            active:true,
          });
        }}
        onMouseLeave={()=>setPointer(p=>({...p,active:false}))}
        style={{position:"relative",overflow:"hidden",minHeight:330,borderRadius:22,background:`linear-gradient(135deg,${T.bg2},${T.bg1})`,border:`1px solid ${T.b2}`,boxShadow:`inset 0 1px 0 ${T.b1}, 0 16px 50px rgba(0,0,0,.28)`}}
      >
        <div style={{position:"absolute",inset:0,background:`radial-gradient(circle at ${pointer.x}% ${pointer.y}%, ${T.a0}22, transparent 24%), radial-gradient(circle at 20% 15%, ${T.greenDim}, transparent 26%), radial-gradient(circle at 85% 80%, ${T.blueBg}, transparent 24%)`,transition:pointer.active?"none":"background .4s ease"}}/>
        <div style={{position:"absolute",inset:0,backgroundImage:`linear-gradient(${T.b0} 1px,transparent 1px),linear-gradient(90deg,${T.b0} 1px,transparent 1px)`,backgroundSize:"44px 44px",maskImage:"radial-gradient(circle at 50% 50%, black 45%, transparent 100%)",opacity:.9}}/>
        <div style={{position:"absolute",left:"50%",top:"50%",transform:"translate(-50%,-50%)",width:220,height:220,borderRadius:"50%",border:`1px solid ${T.b1}`,boxShadow:`inset 0 0 40px ${T.a0}10`}}>
          <div style={{position:"absolute",inset:16,borderRadius:"50%",border:`1px dashed ${T.b1}`}}/>
          <div style={{position:"absolute",inset:40,borderRadius:"50%",border:`1px solid ${T.b0}`}}/>
          <div style={{position:"absolute",left:"50%",top:"50%",transform:"translate(-50%,-50%)",width:72,height:72,borderRadius:"50%",background:`radial-gradient(circle,${T.a0}55,${T.a0}10 65%,transparent 75%)`,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`0 0 40px ${T.a0}22`}}>
            <div style={{width:28,height:28,borderRadius:"50%",background:`linear-gradient(135deg,${T.a0},${T.a1})`,boxShadow:`0 0 24px ${T.a0}66`,animation:"glow 2s ease-in-out infinite"}}/>
          </div>
          {[0,1,2].map(i=>(
            <div key={i} style={{position:"absolute",left:"50%",top:"50%",width:10,height:10,borderRadius:"50%",background:i===1?T.green:i===2?T.blue:T.a1,boxShadow:`0 0 12px ${i===1?T.green:i===2?T.blue:T.a1}`,animation:`orbit ${6+i*1.3}s linear infinite`,animationDelay:`-${i*1.2}s`}}/>
          ))}
        </div>

        {particles.map((p,i)=>(
          <div key={i} style={{position:"absolute",left:`${p.x}%`,top:`${p.y}%`,transform:"translate(-50%,-50%)",animation:`drift ${3.6+p.delay}s ease-in-out infinite`,animationDelay:`-${p.delay}s`}}>
            <div style={{width:p.size,height:p.size,borderRadius:"50%",background:p.color,boxShadow:`0 0 16px ${p.color}88`}}/>
          </div>
        ))}

        <div style={{position:"absolute",left:22,right:22,bottom:20,display:"flex",alignItems:"flex-end",justifyContent:"space-between",gap:16}}>
          <div style={{flex:1}}>
            <div style={{display:"inline-flex",alignItems:"center",gap:8,padding:"5px 12px",borderRadius:20,background:T.aBg,border:`1px solid ${T.a0}33`,marginBottom:12}}>
              <div style={{width:6,height:6,borderRadius:"50%",background:T.green,boxShadow:`0 0 8px ${T.green}`}}/>
              <span style={{fontSize:10,color:T.a1,fontFamily:"JetBrains Mono,monospace",letterSpacing:"0.08em"}}>{activeStep}</span>
            </div>
            <p style={{margin:"0 0 6px",fontSize:26,color:T.t0,fontWeight:700,fontFamily:"Playfair Display,serif",letterSpacing:"-0.03em"}}>Building your dashboard</p>
            <p style={{margin:0,fontSize:13,color:T.t1,lineHeight:1.7,fontFamily:"Instrument Sans,sans-serif",maxWidth:460}}>
              {query ? `Parsing "${query.slice(0,72)}${query.length>72?"…":""}" and shaping the best view.` : "Parsing the question, testing groupings, and composing the best visual story."}
            </p>
          </div>
          <div style={{display:"flex",alignItems:"flex-end",gap:6,height:76,flexShrink:0}}>
            {[28,44,62,34,54,72,48].map((h,i)=>(
              <div key={i} style={{width:10,height:h,borderRadius:999,transformOrigin:"bottom",background:`linear-gradient(180deg,${i%2?T.green:T.a0},${T.bg4})`,boxShadow:`0 0 16px ${(i%2?T.green:T.a0)}33`,animation:`wave 1.15s ease-in-out infinite`,animationDelay:`${i*.12}s`}}/>
            ))}
          </div>
        </div>
      </div>

      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        <div style={{background:T.bg2,border:`1px solid ${T.b1}`,borderRadius:20,padding:"20px 20px 16px",boxShadow:`inset 0 1px 0 ${T.b1}`}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
            <div>
              <p style={{margin:"0 0 4px",fontSize:11,color:T.a0,fontFamily:"JetBrains Mono,monospace",textTransform:"uppercase",letterSpacing:"0.08em"}}>Realtime pipeline</p>
              <p style={{margin:0,fontSize:15,color:T.t0,fontWeight:600,fontFamily:"Playfair Display,serif"}}>{pulse%2===0?"Optimizing chart mix":"Testing metric groupings"}</p>
            </div>
            <div style={{width:34,height:34,borderRadius:10,background:T.aBg,border:`1px solid ${T.a0}33`,display:"flex",alignItems:"center",justifyContent:"center"}}>
              <div style={{width:12,height:12,borderRadius:"50%",background:T.a0,animation:"pulse 1.1s ease-in-out infinite"}}/>
            </div>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {STEPS.map((s,i)=>{
              const done=i<step;
              const active=i===step;
              return(
                <div key={s.label} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 0"}}>
                  <div style={{width:20,height:20,borderRadius:"50%",background:done?T.greenBg:active?T.aBg2:T.bg3,border:`1px solid ${done?T.green+"55":active?T.a0+"55":T.b1}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    {done
                      ?<svg width="10" height="10" viewBox="0 0 10 10"><polyline points="1.5,5 4,7.5 8.5,2.5" stroke={T.green} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      :<div style={{width:6,height:6,borderRadius:"50%",background:active?T.a0:T.b2,animation:active?"pulse 1.2s ease-in-out infinite":"none"}}/>
                    }
                  </div>
                  <span style={{fontSize:12,color:done?T.green:active?T.t0:T.t2,fontFamily:"Instrument Sans,sans-serif",flex:1}}>{s.label}</span>
                  <span style={{fontSize:10,color:done?T.green:active?T.a0:T.t2,fontFamily:"JetBrains Mono,monospace"}}>
                    {done?"done":active?"live":"queued"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{background:T.bg2,border:`1px solid ${T.b1}`,borderRadius:20,padding:"18px 20px",display:"flex",flexDirection:"column",gap:10}}>
          <p style={{margin:0,fontSize:11,color:T.t2,fontFamily:"JetBrains Mono,monospace",textTransform:"uppercase",letterSpacing:"0.08em"}}>Play with the glow</p>
          <p style={{margin:0,fontSize:13,color:T.t1,lineHeight:1.6,fontFamily:"Instrument Sans,sans-serif"}}>Move your cursor over the visualizer while the query runs. The signal field reacts in real time so the wait feels alive instead of frozen.</p>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginTop:2}}>
            {["views","engagement","sentiment"].map((m,i)=>(
              <div key={m} style={{padding:"10px 10px 12px",borderRadius:12,background:T.bg3,border:`1px solid ${T.b1}`}}>
                <p style={{margin:"0 0 7px",fontSize:10,color:T.t2,fontFamily:"JetBrains Mono,monospace",textTransform:"uppercase"}}>{m}</p>
                <div style={{display:"flex",alignItems:"flex-end",gap:4,height:46}}>
                  {[22,34,18,38].map((h,j)=>(
                    <div key={j} style={{flex:1,height:h+(i*4)+(j===pulse%4?10:0),borderRadius:"999px 999px 4px 4px",background:`linear-gradient(180deg,${i===0?T.a0:i===1?T.green:T.blue},${T.bg4})`,transition:"height .35s ease"}}/>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── EDITABLE TITLE ──────────────────────────────────────────────────────────
function EditableTitle({title,onChange}){
  const[editing,setEditing]=useState(false);
  const[val,setVal]=useState(title||"");
  const ref=useRef();
  useEffect(()=>{setVal(title||"");},[title]);
  useEffect(()=>{if(editing)ref.current?.select();},[editing]);
  const commit=()=>{setEditing(false);if(val.trim()&&val!==title)onChange(val.trim());else setVal(title||"");};
  if(!title)return<p style={{fontSize:13,fontWeight:600,color:T.t2,fontFamily:"Playfair Display,serif"}}>YouTube Analytics</p>;
  if(editing)return(
    <input ref={ref} value={val} onChange={e=>setVal(e.target.value)}
      onBlur={commit} onKeyDown={e=>{if(e.key==="Enter")commit();if(e.key==="Escape"){setEditing(false);setVal(title);}}}
      style={{all:"unset",fontSize:13,fontWeight:600,color:T.t0,fontFamily:"Playfair Display,serif",background:T.bg2,border:`1px solid ${T.a0}88`,borderRadius:6,padding:"2px 8px",caretColor:T.a0,minWidth:120}}/>
  );
  return(
    <button onClick={()=>setEditing(true)} title="Click to rename" style={{all:"unset",cursor:"pointer",display:"flex",alignItems:"center",gap:5,group:"true"}}>
      <p style={{margin:0,fontSize:13,fontWeight:600,color:T.t0,fontFamily:"Playfair Display,serif",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:200}}>{title}</p>
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={T.t2} strokeWidth="2" style={{flexShrink:0,opacity:0.6}}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
    </button>
  );
}

// ─── CHART FULLSCREEN ────────────────────────────────────────────────────────
function ChartFullscreen({chart,onClose}){
  useEffect(()=>{
    const h=e=>{if(e.key==="Escape")onClose();};
    window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);
  },[]);
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.85)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:500,animation:"fadeIn .15s ease both",padding:32}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:T.bg2,border:`1px solid ${T.b2}`,borderRadius:20,padding:"24px 28px",width:"100%",maxWidth:1000,maxHeight:"90vh",overflow:"auto",boxShadow:"0 32px 80px rgba(0,0,0,.7)",animation:"fadeUp .2s ease both"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
          <div>
            <h3 style={{margin:0,fontSize:18,fontWeight:700,color:T.t0,fontFamily:"Playfair Display,serif"}}>{chart.title}</h3>
            {chart.desc&&<p style={{margin:"4px 0 0",fontSize:13,color:T.t2,fontFamily:"Instrument Sans,sans-serif"}}>{chart.desc}</p>}
          </div>
          <button onClick={onClose} style={{all:"unset",cursor:"pointer",width:32,height:32,borderRadius:9,display:"flex",alignItems:"center",justifyContent:"center",background:T.bg3,color:T.t1,fontSize:16,transition:"all .12s"}}
            onMouseEnter={e=>{e.currentTarget.style.background=T.bg4;e.currentTarget.style.color=T.t0;}}
            onMouseLeave={e=>{e.currentTarget.style.background=T.bg3;e.currentTarget.style.color=T.t1;}}>✕</button>
        </div>
        <div style={{height:460}}><ChartRenderer chart={{...chart,size:"wide"}}/></div>
        {chart.insight&&(
          <div style={{marginTop:16,padding:"10px 14px",borderRadius:10,background:T.aBg,border:`1px solid ${T.a0}22`,display:"flex",gap:10}}>
            <span style={{fontSize:13,color:T.a0}}>◆</span>
            <p style={{margin:0,fontSize:13,color:T.a2,lineHeight:1.6,fontFamily:"Instrument Sans,sans-serif"}}>{chart.insight}</p>
          </div>
        )}
        <p style={{margin:"12px 0 0",fontSize:11,color:T.t2,textAlign:"center",fontFamily:"JetBrains Mono,monospace"}}>ESC to close</p>
      </div>
    </div>
  );
}

// ─── DRAG-TO-REORDER CHART GRID ───────────────────────────────────────────────
function DraggableChartGrid({charts,onReorder,onTypeChange,onAnnotate,onFullscreen}){
  const[dragIdx,setDragIdx]=useState(null);
  const[overIdx,setOverIdx]=useState(null);
  const onDragStart=(i)=>setDragIdx(i);
  const onDragOver=(e,i)=>{e.preventDefault();setOverIdx(i);};
  const onDrop=(i)=>{
    if(dragIdx===null||dragIdx===i)return;
    const next=[...charts];
    const [item]=next.splice(dragIdx,1);
    next.splice(i,0,item);
    onReorder(next);
    setDragIdx(null);setOverIdx(null);
  };
  const onDragEnd=()=>{setDragIdx(null);setOverIdx(null);};
  return(
    <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:12}}>
      {charts.map((c,i)=>(
        <div key={c.id||i}
          draggable onDragStart={()=>onDragStart(i)} onDragOver={e=>onDragOver(e,i)}
          onDrop={()=>onDrop(i)} onDragEnd={onDragEnd}
          style={{gridColumn:c.size==="wide"?"1 / -1":"auto",opacity:dragIdx===i?0.4:1,outline:overIdx===i&&dragIdx!==i?`2px dashed ${T.a0}`:"none",outlineOffset:4,borderRadius:18,transition:"opacity .15s,outline .1s",cursor:"grab"}}>
          <ChartCard chart={c} idx={i} onTypeChange={onTypeChange}
            onFullscreen={()=>onFullscreen(c)} onAnnotate={()=>onAnnotate(c.id||i)}/>
        </div>
      ))}
    </div>
  );
}

// ─── CHART ANNOTATIONS ───────────────────────────────────────────────────────
function AnnotationModal({chartId,annotations,onSave,onClose}){
  const[text,setText]=useState("");
  const existing=(annotations[chartId]||[]);
  const add=()=>{if(!text.trim())return;onSave(chartId,[...existing,{text:text.trim(),ts:Date.now()}]);setText("");};
  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.75)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:500,animation:"fadeIn .15s ease both"}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:T.bg2,border:`1px solid ${T.b2}`,borderRadius:18,padding:"24px",width:420,maxWidth:"90vw",boxShadow:"0 24px 60px rgba(0,0,0,.6)",animation:"fadeUp .2s ease both"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
          <p style={{margin:0,fontSize:15,fontWeight:600,color:T.t0,fontFamily:"Playfair Display,serif"}}>Chart annotations</p>
          <button onClick={onClose} style={{all:"unset",cursor:"pointer",color:T.t2,fontSize:17,lineHeight:1}} onMouseEnter={e=>e.currentTarget.style.color=T.t0} onMouseLeave={e=>e.currentTarget.style.color=T.t2}>✕</button>
        </div>
        {existing.length===0?<p style={{fontSize:12,color:T.t2,fontFamily:"Instrument Sans,sans-serif",marginBottom:14}}>No annotations yet.</p>
          :existing.map((a,i)=>(
            <div key={i} style={{display:"flex",gap:8,padding:"8px 10px",borderRadius:9,background:T.bg3,border:`1px solid ${T.b1}`,marginBottom:6}}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.a0} strokeWidth="2" style={{flexShrink:0,marginTop:2}}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              <div style={{flex:1}}>
                <p style={{margin:"0 0 2px",fontSize:12,color:T.t0,fontFamily:"Instrument Sans,sans-serif",lineHeight:1.5}}>{a.text}</p>
                <p style={{margin:0,fontSize:10,color:T.t2,fontFamily:"JetBrains Mono,monospace"}}>{new Date(a.ts).toLocaleString()}</p>
              </div>
              <button onClick={()=>onSave(chartId,existing.filter((_,j)=>j!==i))} style={{all:"unset",cursor:"pointer",color:T.t2,fontSize:13}} onMouseEnter={e=>e.currentTarget.style.color=T.red} onMouseLeave={e=>e.currentTarget.style.color=T.t2}>✕</button>
            </div>
          ))
        }
        <div style={{display:"flex",gap:8,marginTop:8}}>
          <input value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>e.key==="Enter"&&add()}
            placeholder="Add a note…"
            style={{all:"unset",flex:1,fontSize:13,color:T.t0,background:T.bg3,border:`1px solid ${T.b1}`,borderRadius:9,padding:"9px 12px",fontFamily:"Instrument Sans,sans-serif",caretColor:T.a0}}/>
          <button onClick={add} style={{all:"unset",cursor:"pointer",padding:"9px 14px",borderRadius:9,background:T.aBg2,border:`1px solid ${T.a0}44`,color:T.a1,fontSize:12,fontFamily:"Instrument Sans,sans-serif",fontWeight:500}}>Add</button>
        </div>
      </div>
    </div>
  );
}

// ─── ERROR BOUNDARY ───────────────────────────────────────────────────────────
class ErrorBoundary extends React.Component{
  constructor(p){super(p);this.state={err:null,cleared:false};}
  static getDerivedStateFromError(e){return{err:e};}
  componentDidCatch(e){
    // Auto-clear localStorage on any crash — stale data is the most common cause
    try{localStorage.clear();}catch{}
  }
  render(){
    if(this.state.err){
      const msg=this.state.err?.message||String(this.state.err)||"Unknown error";
      return(
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"100vh",background:"#0C0904",gap:16,padding:32,fontFamily:"Instrument Sans,sans-serif"}}>
          <div style={{width:56,height:56,borderRadius:16,background:"rgba(224,112,96,0.10)",border:"1px solid rgba(224,112,96,0.25)",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#E07060" strokeWidth="1.8"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </div>
          <div style={{textAlign:"center"}}>
            <p style={{margin:"0 0 6px",fontSize:18,fontWeight:700,color:"#FDF6E3",fontFamily:"Playfair Display,serif"}}>Something went wrong</p>
            <p style={{margin:"0 0 4px",fontSize:13,color:"#E07060",maxWidth:360,lineHeight:1.5,fontFamily:"JetBrains Mono,monospace",wordBreak:"break-all"}}>{msg}</p>
            <p style={{margin:"0 0 20px",fontSize:12,color:"#5E4A2E",fontFamily:"Instrument Sans,sans-serif"}}>Local storage has been cleared automatically.</p>
            <button onClick={()=>{try{localStorage.clear();}catch{}window.location.reload();}}
              style={{all:"unset",cursor:"pointer",padding:"10px 28px",borderRadius:10,background:"rgba(212,168,84,0.18)",border:"1px solid rgba(212,168,84,0.44)",color:"#EAC97A",fontSize:13,fontWeight:500,fontFamily:"Instrument Sans,sans-serif"}}>
              Reload app
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── COMMAND PALETTE ─────────────────────────────────────────────────────────
function CommandPalette({onClose,onQuery,saved,qHistory}){
  const[q,setQ]=useState("");
  const ref=useRef();
  useEffect(()=>{ref.current?.focus();},[]);
  useEffect(()=>{
    const h=e=>{if(e.key==="Escape")onClose();};
    window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);
  },[]);

  const examples=["Show total views by category","Which regions have the highest sentiment?","Compare monetized vs non-monetized videos","Top languages by engagement rate"];
  const filtered=q.trim()
    ?[...qHistory.map(h=>({type:"history",label:h.q})),...saved.map(s=>({type:"saved",label:s.title})),...examples.map(e=>({type:"example",label:e}))].filter(i=>i.label.toLowerCase().includes(q.toLowerCase())).slice(0,8)
    :[...saved.slice(0,3).map(s=>({type:"saved",label:s.title})),...qHistory.slice(0,3).map(h=>({type:"history",label:h.q})),...examples.slice(0,4).map(e=>({type:"example",label:e}))];

  const typeIcon={saved:<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>,history:<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 16 14"/></svg>,example:<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>};

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.7)",display:"flex",alignItems:"flex-start",justifyContent:"center",zIndex:600,paddingTop:"14vh",animation:"fadeIn .1s ease both"}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{width:560,maxWidth:"92vw",background:T.bg2,border:`1px solid ${T.b2}`,borderRadius:16,overflow:"hidden",boxShadow:"0 24px 60px rgba(0,0,0,.7)",animation:"fadeUp .15s ease both"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 16px",borderBottom:`1px solid ${T.b1}`}}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.t2} strokeWidth="1.8"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input ref={ref} value={q} onChange={e=>setQ(e.target.value)}
            placeholder="Search queries, saved dashboards, or ask anything…"
            style={{all:"unset",flex:1,minWidth:420,fontSize:14,color:T.t0,fontFamily:"Instrument Sans,sans-serif",caretColor:T.a0}}/>
          <kbd style={{fontSize:10,color:T.t2,background:T.bg3,border:`1px solid ${T.b1}`,borderRadius:5,padding:"2px 6px",fontFamily:"JetBrains Mono,monospace"}}>ESC</kbd>
        </div>
        <div style={{maxHeight:360,overflowY:"auto"}}>
          {filtered.length===0&&<p style={{padding:"16px",fontSize:13,color:T.t2,fontFamily:"Instrument Sans,sans-serif",textAlign:"center"}}>No results</p>}
          {filtered.map((item,i)=>(
            <button key={i} onClick={()=>{onQuery(item.label);onClose();}}
              style={{all:"unset",cursor:"pointer",display:"flex",alignItems:"center",gap:10,width:"100%",padding:"11px 16px",borderBottom:`1px solid ${T.b0}`,transition:"background .1s",fontFamily:"Instrument Sans,sans-serif"}}
              onMouseEnter={e=>e.currentTarget.style.background=T.bg3}
              onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <span style={{color:T.t2,flexShrink:0}}>{typeIcon[item.type]}</span>
              <span style={{flex:1,fontSize:13,color:T.t0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{item.label}</span>
              <span style={{fontSize:10,color:T.t2,background:T.bg4,padding:"2px 7px",borderRadius:6,fontFamily:"JetBrains Mono,monospace",flexShrink:0}}>{item.type}</span>
            </button>
          ))}
        </div>
        <div style={{padding:"8px 16px",borderTop:`1px solid ${T.b0}`,display:"flex",gap:16}}>
          {[["↵","run query"],["ESC","close"],["↑↓","navigate"]].map(([k,l])=>(
            <div key={k} style={{display:"flex",alignItems:"center",gap:4}}>
              <kbd style={{fontSize:10,color:T.t2,background:T.bg3,border:`1px solid ${T.b1}`,borderRadius:4,padding:"1px 5px",fontFamily:"JetBrains Mono,monospace"}}>{k}</kbd>
              <span style={{fontSize:11,color:T.t2,fontFamily:"Instrument Sans,sans-serif"}}>{l}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── ONBOARDING TOUR ─────────────────────────────────────────────────────────
const TOUR_STEPS=[
  {
    id:"input",
    title:"Ask anything in plain English",
    body:"Type any business question here — 'Which categories have the highest sentiment?' or 'Show views by region for last 90 days'. Press Enter to generate a full dashboard instantly.",
    hint:"Try: 'Show total views by category'",
    iconKey:"chat",
    shortcut:"↵ to submit",
    pos:"bottom-center",
  },
  {
    id:"kpis",
    title:"KPIs generated automatically",
    body:"Every query produces 4 key performance indicators with trend deltas. Hover over any KPI to see the underlying value and context. Cards update live when you follow up.",
    hint:"Hover a KPI card to see details",
    iconKey:"grid",
    shortcut:"Ctrl S to save",
    pos:"top-center",
  },
  {
    id:"charts",
    title:"Interactive charts with AI insights",
    body:"Charts come with anomaly badges, insight strips, and a type switcher — change any chart from bar to line to donut in one click. Click the fullscreen icon to expand any chart.",
    hint:"Click the chart type badge to switch",
    iconKey:"pulse",
    shortcut:"Ctrl E to export",
    pos:"top-center",
  },
  {
    id:"sidebar",
    title:"History, schema & alerts",
    body:"The sidebar has 7 tabs — Dashboard, Saved, History, Schema, Alerts, Reports, and Database. All your past queries are one click away. Schema shows the 12 dataset columns.",
    hint:"Click any history item to re-run",
    iconKey:"menu",
    shortcut:"Ctrl . to toggle",
    pos:"top-right",
  },
  {
    id:"cmdpalette",
    title:"Command palette & shortcuts",
    body:"Hit Ctrl+K to open the command palette — search your saved dashboards, re-run history, and launch any action from one place. It's the fastest way to navigate the app.",
    hint:"Press Ctrl+K to try it now",
    iconKey:"search",
    shortcut:"Ctrl K to open",
    pos:"top-right",
  },
];

function OnboardingTour({onDone}){
  const TOUR_ICONS={
    chat:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
    grid:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>,
    pulse:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
    menu:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="3" y1="7" x2="21" y2="7"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="17" x2="21" y2="17"/></svg>,
    search:<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  };
  const[step,setStep]=useState(0);
  const[visible,setVisible]=useState(false);
  const s=TOUR_STEPS[step];
  const isLast=step===TOUR_STEPS.length-1;

  useEffect(()=>{setTimeout(()=>setVisible(true),100);},[]);

  const next=()=>{
    setVisible(false);
    setTimeout(()=>{if(isLast){onDone();}else{setStep(p=>p+1);setVisible(true);}},200);
  };
  const prev=()=>{
    setVisible(false);
    setTimeout(()=>{setStep(p=>p-1);setVisible(true);},200);
  };
  const skip=()=>onDone();

  return(
    <div style={{position:"fixed",inset:0,zIndex:500,pointerEvents:"none"}}>
      {/* Dim overlay with cutout feel */}
      <div style={{position:"absolute",inset:0,background:"rgba(12,9,4,0.72)",pointerEvents:"all"}} onClick={skip}/>

      {/* Tour card */}
      <div style={{
        position:"absolute",bottom:110,right:32,
        width:340,pointerEvents:"all",
        opacity:visible?1:0,
        transform:visible?"translateY(0)":"translateY(12px)",
        transition:"opacity .22s ease, transform .22s ease",
      }}>
        {/* Progress bar */}
        <div style={{height:2,borderRadius:2,background:T.bg3,marginBottom:12,overflow:"hidden"}}>
          <div style={{height:"100%",borderRadius:2,background:`linear-gradient(90deg,${T.a0},${T.green})`,width:`${((step+1)/TOUR_STEPS.length)*100}%`,transition:"width .4s ease"}}/>
        </div>

        <div style={{background:T.bg2,border:`1px solid ${T.b2}`,borderRadius:18,overflow:"hidden",boxShadow:`0 24px 60px rgba(0,0,0,.7), 0 0 0 1px ${T.a0}18`}}>
          {/* Card top accent */}
          <div style={{height:2,background:`linear-gradient(90deg,${T.a0},${T.green},transparent)`}}/>

          <div style={{padding:"20px 22px"}}>
            {/* Header row */}
            <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:14}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:36,height:36,borderRadius:10,background:T.aBg,border:`1px solid ${T.a0}33`,display:"flex",alignItems:"center",justifyContent:"center",color:T.a0,flexShrink:0}}>
                  {TOUR_ICONS[s.iconKey]}
                </div>
                <div>
                  <p style={{margin:0,fontSize:10,color:T.a0,fontFamily:"JetBrains Mono,monospace",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:2}}>Step {step+1} of {TOUR_STEPS.length}</p>
                  <p style={{margin:0,fontSize:15,fontWeight:700,color:T.t0,fontFamily:"Playfair Display,serif",letterSpacing:"-.01em"}}>{s.title}</p>
                </div>
              </div>
              <button onClick={skip} style={{all:"unset",cursor:"pointer",width:26,height:26,borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",color:T.t2,flexShrink:0,transition:"all .12s"}}
                onMouseEnter={e=>{e.currentTarget.style.background=T.bg3;e.currentTarget.style.color=T.t0;}}
                onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color=T.t2;}}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            {/* Body */}
            <p style={{margin:"0 0 14px",fontSize:13,color:T.t1,lineHeight:1.7,fontFamily:"Instrument Sans,sans-serif"}}>{s.body}</p>

            {/* Hint pill */}
            <div style={{display:"flex",alignItems:"center",gap:7,padding:"7px 11px",borderRadius:9,background:T.bg3,border:`1px solid ${T.b1}`,marginBottom:16}}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={T.a0} strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
              <span style={{fontSize:11,color:T.t2,fontFamily:"Instrument Sans,sans-serif",fontStyle:"italic"}}>{s.hint}</span>
              <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:4}}>
                <kbd style={{fontSize:9,color:T.a1,background:T.aBg,border:`1px solid ${T.a0}33`,borderRadius:5,padding:"2px 7px",fontFamily:"JetBrains Mono,monospace",whiteSpace:"nowrap"}}>{s.shortcut}</kbd>
              </div>
            </div>

            {/* Dot steps + nav */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{display:"flex",gap:5}}>
                {TOUR_STEPS.map((_,i)=>(
                  <button key={i} onClick={()=>{setVisible(false);setTimeout(()=>{setStep(i);setVisible(true);},180);}}
                    style={{all:"unset",cursor:"pointer",width:i===step?18:7,height:7,borderRadius:4,background:i===step?T.a0:i<step?T.a0+"66":T.b2,transition:"all .25s"}}/>
                ))}
              </div>
              <div style={{display:"flex",gap:6}}>
                {step>0&&(
                  <button onClick={prev} style={{all:"unset",cursor:"pointer",padding:"7px 13px",borderRadius:9,border:`1px solid ${T.b1}`,fontSize:12,color:T.t1,fontFamily:"Instrument Sans,sans-serif",transition:"all .12s"}}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor=T.b2;e.currentTarget.style.color=T.t0;}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor=T.b1;e.currentTarget.style.color=T.t1;}}>
                    ← Back
                  </button>
                )}
                <button onClick={next} style={{all:"unset",cursor:"pointer",padding:"7px 16px",borderRadius:9,background:`linear-gradient(135deg,${T.a0},#B8882E)`,fontSize:12,fontWeight:600,color:T.bg0,fontFamily:"Instrument Sans,sans-serif",boxShadow:`0 4px 14px ${T.a0}44`,transition:"all .12s"}}
                  onMouseEnter={e=>e.currentTarget.style.background=`linear-gradient(135deg,${T.a1},${T.a0})`}
                  onMouseLeave={e=>e.currentTarget.style.background=`linear-gradient(135deg,${T.a0},#B8882E)`}>
                  {isLast?"Finish tour ✓":"Next →"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Skip hint */}
        <p style={{margin:"10px 0 0",textAlign:"center",fontSize:11,color:T.t2,fontFamily:"Instrument Sans,sans-serif",cursor:"pointer"}} onClick={skip}>
          Click anywhere to skip
        </p>
      </div>
    </div>
  );
}

// ─── SHORTCUTS MODAL ─────────────────────────────────────────────────────────
function ShortcutsModal({onClose}){
  const groups=[
    {label:"Navigation",shortcuts:[
      {key:"Ctrl K",desc:"Open command palette"},
      {key:"Ctrl .",desc:"Toggle sidebar"},
      {key:"ESC",desc:"Close any modal or palette"},
    ]},
    {label:"Dashboard",shortcuts:[
      {key:"Ctrl S",desc:"Save current dashboard"},
      {key:"Ctrl E",desc:"Export as PDF / PNG / CSV"},
      {key:"Ctrl /",desc:"Show this shortcuts panel"},
    ]},
    {label:"Input",shortcuts:[
      {key:"↵",desc:"Submit query"},
      {key:"⇧ ↵",desc:"Insert new line"},
      {key:"Ctrl ↑",desc:"Recall last query"},
    ]},
  ];

  useEffect(()=>{
    const h=(e)=>{if(e.key==="Escape")onClose();};
    window.addEventListener("keydown",h);
    return()=>window.removeEventListener("keydown",h);
  },[]);

  return(
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.75)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:600,animation:"fadeIn .15s ease both"}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:T.bg2,border:`1px solid ${T.b2}`,borderRadius:20,width:460,maxWidth:"90vw",overflow:"hidden",boxShadow:"0 32px 80px rgba(0,0,0,.7)",animation:"fadeUp .2s ease both"}}>
        {/* Top accent */}
        <div style={{height:2,background:`linear-gradient(90deg,${T.a0},${T.green},transparent)`}}/>
        <div style={{padding:"22px 24px"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{width:32,height:32,borderRadius:9,background:T.aBg,border:`1px solid ${T.a0}33`,display:"flex",alignItems:"center",justifyContent:"center"}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.a0} strokeWidth="2"><rect x="2" y="6" width="20" height="14" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01M10 14h4"/></svg>
              </div>
              <div>
                <p style={{margin:0,fontSize:15,fontWeight:700,color:T.t0,fontFamily:"Playfair Display,serif"}}>Keyboard shortcuts</p>
                <p style={{margin:0,fontSize:10,color:T.t2,fontFamily:"JetBrains Mono,monospace"}}>Ctrl/ to toggle · ESC to close</p>
              </div>
            </div>
            <button onClick={onClose} style={{all:"unset",cursor:"pointer",width:28,height:28,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",color:T.t2,transition:"all .12s"}}
              onMouseEnter={e=>{e.currentTarget.style.background=T.bg3;e.currentTarget.style.color=T.t0;}}
              onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color=T.t2;}}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16}}>
            {groups.map((g,gi)=>(
              <div key={gi}>
                <p style={{margin:"0 0 8px",fontSize:9,color:T.a0,fontFamily:"JetBrains Mono,monospace",textTransform:"uppercase",letterSpacing:"0.1em"}}>{g.label}</p>
                <div style={{display:"flex",flexDirection:"column",gap:4}}>
                  {g.shortcuts.map((s,si)=>(
                    <div key={si} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"7px 10px",borderRadius:9,background:T.bg3,border:`1px solid ${T.b0}`}}>
                      <span style={{fontSize:12,color:T.t1,fontFamily:"Instrument Sans,sans-serif"}}>{s.desc}</span>
                      <kbd style={{fontSize:10,color:T.a1,background:T.aBg,border:`1px solid ${T.a0}33`,borderRadius:6,padding:"2px 8px",fontFamily:"JetBrains Mono,monospace",whiteSpace:"nowrap",marginLeft:8,flexShrink:0}}>{s.key}</kbd>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Footer tip */}
          <div style={{marginTop:16,padding:"10px 14px",borderRadius:10,background:T.bg3,border:`1px solid ${T.b0}`,display:"flex",alignItems:"center",gap:8}}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.a0} strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
            <span style={{fontSize:11,color:T.t2,fontFamily:"Instrument Sans,sans-serif"}}>On Mac use <kbd style={{fontSize:9,color:T.a1,background:T.aBg,border:`1px solid ${T.a0}33`,borderRadius:4,padding:"1px 5px",fontFamily:"JetBrains Mono,monospace"}}>Cmd</kbd>, on Windows/Linux use <kbd style={{fontSize:9,color:T.a1,background:T.aBg,border:`1px solid ${T.a0}33`,borderRadius:4,padding:"1px 5px",fontFamily:"JetBrains Mono,monospace"}}>Ctrl</kbd></span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── HELP BUTTON ─────────────────────────────────────────────────────────────
function HelpButton({onTour,onShortcuts}){
  const[open,setOpen]=useState(false);
  return(
    <div style={{position:"fixed",bottom:28,right:28,zIndex:399,display:"flex",flexDirection:"column",alignItems:"flex-end",gap:8}}>
      {open&&(
        <div style={{display:"flex",flexDirection:"column",gap:6,animation:"fadeUp .18s ease both"}}>
          <button onClick={()=>{setOpen(false);onTour();}}
            style={{all:"unset",cursor:"pointer",display:"flex",alignItems:"center",gap:8,padding:"9px 14px",borderRadius:11,background:T.bg2,border:`1px solid ${T.b2}`,fontSize:12,color:T.t0,fontFamily:"Instrument Sans,sans-serif",fontWeight:500,whiteSpace:"nowrap",boxShadow:"0 8px 24px rgba(0,0,0,.5)",transition:"all .12s"}}
            onMouseEnter={e=>e.currentTarget.style.borderColor=T.a0+"55"}
            onMouseLeave={e=>e.currentTarget.style.borderColor=T.b2}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.a0} strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            Product tour
          </button>
          <button onClick={()=>{setOpen(false);onShortcuts();}}
            style={{all:"unset",cursor:"pointer",display:"flex",alignItems:"center",gap:8,padding:"9px 14px",borderRadius:11,background:T.bg2,border:`1px solid ${T.b2}`,fontSize:12,color:T.t0,fontFamily:"Instrument Sans,sans-serif",fontWeight:500,whiteSpace:"nowrap",boxShadow:"0 8px 24px rgba(0,0,0,.5)",transition:"all .12s"}}
            onMouseEnter={e=>e.currentTarget.style.borderColor=T.a0+"55"}
            onMouseLeave={e=>e.currentTarget.style.borderColor=T.b2}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.a0} strokeWidth="2"><rect x="2" y="6" width="20" height="14" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01M10 14h4"/></svg>
            Keyboard shortcuts
            <kbd style={{fontSize:9,color:T.t2,background:T.bg3,border:`1px solid ${T.b1}`,borderRadius:4,padding:"1px 5px",fontFamily:"JetBrains Mono,monospace"}}>Ctrl/</kbd>
          </button>
        </div>
      )}
      <button onClick={()=>setOpen(o=>!o)}
        style={{all:"unset",cursor:"pointer",width:44,height:44,borderRadius:"50%",background:open?T.bg3:`linear-gradient(135deg,${T.a0},#9A6518)`,border:open?`1px solid ${T.b2}`:"none",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:open?"0 4px 16px rgba(0,0,0,.4)":`0 6px 22px ${T.a0}55`,transition:"all .2s",color:open?T.t1:T.bg0}}>
        {open
          ?<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          :<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
        }
      </button>
    </div>
  );
}



// ─── ONBOARDING COMPLETE SCREEN ──────────────────────────────────────────────
function OnboardingComplete({user,darkMode = true,onDone}){
  const firstName=(user?.name||user?.email||"there").split(/[\s@]/)[0];
  const name=firstName.charAt(0).toUpperCase()+firstName.slice(1);
  const[step,setStep]=useState(0);

  useEffect(()=>{
    const timers=[
      setTimeout(()=>setStep(1),100),
      setTimeout(()=>setStep(2),500),
      setTimeout(()=>setStep(3),900),
      setTimeout(()=>setStep(4),1300),
    ];
    return()=>timers.forEach(clearTimeout);
  },[]);

  const fade=(i,extra={})=>({
    opacity:step>=i?1:0,
    transform:step>=i?"translateY(0)":"translateY(14px)",
    transition:"opacity .55s ease, transform .55s ease",
    ...extra,
  });

  const stats=[
    {val:"Connection",label:"Successful"},
    {val:"AI",label:"pipeline active"},
    {val:"live",label:"status"},
  ];

  return(
    <div style={{display:"flex",height:"100vh",background:T.bg0,alignItems:"center",justifyContent:"center",fontFamily:"Instrument Sans,sans-serif",padding:24,position:"relative",overflow:"hidden"}}>

      {/* ── Background layer ── */}

      {/* Grid texture */}
      <div style={{position:"absolute",inset:0,backgroundImage:`linear-gradient(${T.b0} 1px,transparent 1px),linear-gradient(90deg,${T.b0} 1px,transparent 1px)`,backgroundSize:"48px 48px",pointerEvents:"none",maskImage:"radial-gradient(ellipse 80% 80% at 50% 50%, black 20%, transparent 100%)"}}/>

      {/* Layered glows */}
      <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",width:500,height:500,borderRadius:"50%",background:`radial-gradient(circle,${T.a0}10,transparent 65%)`,pointerEvents:"none"}}/>
      <div style={{position:"absolute",top:"20%",left:"10%",width:280,height:280,borderRadius:"50%",background:`radial-gradient(circle,${T.green}0A,transparent 70%)`,pointerEvents:"none"}}/>
      <div style={{position:"absolute",bottom:"15%",right:"8%",width:240,height:240,borderRadius:"50%",background:`radial-gradient(circle,#C97B6E10,transparent 70%)`,pointerEvents:"none"}}/>

      {/* Full-canvas SVG decorations */}
      <svg style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none"}} viewBox="0 0 1200 800" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="wg1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={T.a0} stopOpacity="0.7"/>
            <stop offset="100%" stopColor={T.a0} stopOpacity="0.1"/>
          </linearGradient>
          <linearGradient id="wg2" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={T.green} stopOpacity="0.6"/>
            <stop offset="100%" stopColor={T.green} stopOpacity="0.05"/>
          </linearGradient>
          <linearGradient id="wg3" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#C97B6E" stopOpacity="0.5"/>
            <stop offset="100%" stopColor="#C97B6E" stopOpacity="0.05"/>
          </linearGradient>
        </defs>

        {/* Top-left: rotating square */}
        <rect x="60" y="60" width="120" height="120" rx="16"
          fill="none" stroke="url(#wg1)" strokeWidth="1.2"
          transform="rotate(18 120 120)"
          style={{animation:"spin 45s linear infinite",transformOrigin:"120px 120px"}}/>
        <rect x="80" y="80" width="80" height="80" rx="10"
          fill={T.a0} fillOpacity="0.04" stroke="none"
          transform="rotate(18 120 120)"/>

        {/* Bottom-left: triangle */}
        <polygon points="80,720 200,720 140,600"
          fill="none" stroke="url(#wg2)" strokeWidth="1.2" strokeLinejoin="round"
          style={{animation:"float 10s ease-in-out infinite",transformOrigin:"140px 660px"}}/>
        <polygon points="95,715 185,715 140,618"
          fill={T.green} fillOpacity="0.05" stroke="none"/>

        {/* Top-right: diamond */}
        <rect x="1050" y="60" width="90" height="90" rx="5"
          fill="none" stroke="url(#wg3)" strokeWidth="1.2"
          transform="rotate(45 1095 105)"
          style={{animation:"float 12s ease-in-out 1s infinite",transformOrigin:"1095px 105px"}}/>
        <rect x="1062" y="72" width="66" height="66" rx="3"
          fill="#C97B6E" fillOpacity="0.05" stroke="none"
          transform="rotate(45 1095 105)"/>

        {/* Bottom-right: hexagon */}
        <polygon points="1080,640 1120,617 1160,640 1160,686 1120,709 1080,686"
          fill="none" stroke="url(#wg1)" strokeWidth="1.2" strokeLinejoin="round"
          style={{animation:"float 8s ease-in-out 2s infinite",transformOrigin:"1120px 663px"}}/>
        <polygon points="1090,644 1120,627 1150,644 1150,682 1120,699 1090,682"
          fill={T.a0} fillOpacity="0.05" stroke="none"/>

        {/* Mid-right: circle accent */}
        <circle cx="1140" cy="380" r="50"
          fill="none" stroke={T.a0} strokeWidth="0.8" strokeOpacity="0.25"
          style={{animation:"float 7s ease-in-out 0.5s infinite",transformOrigin:"1140px 380px"}}/>
        <circle cx="1140" cy="380" r="30"
          fill="none" stroke={T.a0} strokeWidth="0.6" strokeOpacity="0.15"/>
        <circle cx="1140" cy="380" r="7"
          fill={T.a0} fillOpacity="0.20"/>

        {/* Mid-left: plus cross */}
        <line x1="60" y1="390" x2="60" y2="450" stroke={T.green} strokeWidth="1.5" strokeOpacity="0.4" strokeLinecap="round"/>
        <line x1="30" y1="420" x2="90" y2="420" stroke={T.green} strokeWidth="1.5" strokeOpacity="0.4" strokeLinecap="round"/>

        {/* Small detail clusters */}
        {[[320,80],[355,70],[340,105],[375,95],[310,110]].map(([x,y],i)=>(
          <rect key={i} x={x-3} y={y-3} width="6" height="6" rx="1.5"
            fill={T.a0} fillOpacity={0.12+i*0.04}
            transform={`rotate(${i*20} ${x} ${y})`}/>
        ))}
        {[[850,680],[880,695],[860,720],[895,710],[840,700]].map(([x,y],i)=>(
          <rect key={i} x={x-3} y={y-3} width="6" height="6" rx="1.5"
            fill={T.green} fillOpacity={0.10+i*0.04}
            transform={`rotate(${i*25} ${x} ${y})`}/>
        ))}

        {/* Mini sparkline chart — bottom centre left */}
        <polyline points="260,720 285,700 310,710 335,685 360,690 385,668 410,672"
          fill="none" stroke={T.a0} strokeWidth="1.5" strokeOpacity="0.3" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="410" cy="672" r="3.5" fill={T.a0} fillOpacity="0.5"/>
        <polyline points="780,100 810,118 840,95 870,108 900,82 930,90 960,72"
          fill="none" stroke={T.green} strokeWidth="1.5" strokeOpacity="0.25" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="960" cy="72" r="3" fill={T.green} fillOpacity="0.45"/>
        <line x1="200" y1="780" x2="700" y2="100"
          stroke={T.a0} strokeWidth="0.4" strokeOpacity="0.07" strokeDasharray="6 10"/>
        <line x1="500" y1="780" x2="1100" y2="50"
          stroke={T.green} strokeWidth="0.4" strokeOpacity="0.05" strokeDasharray="4 12"/>
      </svg>

      {/* ── Card content ── */}
      <div style={{maxWidth:400,width:"100%",display:"flex",flexDirection:"column",alignItems:"center",textAlign:"center",gap:0,position:"relative",zIndex:1}}>

        {/* Logo ring */}
        <div style={{...fade(1),marginBottom:22}}>
          <div style={{width:76,height:76,borderRadius:"50%",border:`1.5px solid ${T.b2}`,display:"flex",alignItems:"center",justifyContent:"center",position:"relative"}}>
            {/* outer orbit ring dashes */}
            <svg width="76" height="76" viewBox="0 0 76 76" style={{position:"absolute",top:0,left:0}}>
              <circle cx="38" cy="38" r="36" fill="none" stroke={T.a0} strokeWidth="0.8" strokeOpacity="0.3" strokeDasharray="4 6"
                style={{animation:"spin 20s linear infinite",transformOrigin:"38px 38px"}}/>
            </svg>
            <div style={{width:56,height:56,borderRadius:"50%",background:T.aBg,border:`1px solid ${T.b3}`,display:"flex",alignItems:"center",justifyContent:"center"}}>
              <svg width="22" height="22" viewBox="0 0 16 16" fill="none"><polygon points="8,1 2,14 8,10 14,14" fill={T.a0} opacity="0.95"/></svg>
            </div>
            {/* live dot */}
            <div style={{position:"absolute",top:3,right:3,width:11,height:11,borderRadius:"50%",background:T.green,border:`2px solid ${T.bg0}`,boxShadow:`0 0 10px ${T.green}`}}/>
          </div>
        </div>

        {/* Heading */}
        <div style={{...fade(2),marginBottom:8}}>
          <h1 style={{fontSize:30,fontWeight:700,color:T.t0,fontFamily:"Playfair Display,serif",letterSpacing:"-.03em",lineHeight:1.2}}>
            Welcome, <span style={{color:T.a0}}>{name}</span>
          </h1>
        </div>

        {/* Subtext */}
        <div style={{...fade(2),marginBottom:28}}>
          <p style={{fontSize:14,color:T.t1,lineHeight:1.7,maxWidth:300}}>
            Your DataIntel workspace is ready. Everything is connected and waiting for your first question.
          </p>
        </div>

        {/* Stats row */}
        <div style={{...fade(3),display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,width:"100%",marginBottom:28}}>
          {stats.map((s,i)=>(
            <div key={i} style={{background:T.bg2,border:`1px solid ${T.b1}`,borderRadius:12,padding:"14px 10px",textAlign:"center"}}>
              <p style={{margin:"0 0 4px",fontSize:20,fontWeight:700,color:T.t0,fontFamily:"Playfair Display,serif",letterSpacing:"-.02em"}}>{s.val}</p>
              <p style={{margin:0,fontSize:9,color:T.t2,fontFamily:"JetBrains Mono,monospace",textTransform:"uppercase",letterSpacing:"0.07em"}}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div style={{...fade(4),width:"100%",display:"flex",flexDirection:"column",gap:10}}>
          <button onClick={onDone}
            style={{all:"unset",cursor:"pointer",display:"block",width:"100%",padding:"14px 0",textAlign:"center",borderRadius:12,fontSize:14,fontWeight:600,fontFamily:"Playfair Display,serif",background:`linear-gradient(135deg,${T.a0},#B8882E)`,color:T.bg0,boxShadow:`0 6px 24px ${T.a0}44`,transition:"all .15s"}}
            onMouseEnter={e=>{e.currentTarget.style.background=`linear-gradient(135deg,${T.a1},${T.a0})`;e.currentTarget.style.boxShadow=`0 8px 32px ${T.a0}55`;}}
            onMouseLeave={e=>{e.currentTarget.style.background=`linear-gradient(135deg,${T.a0},#B8882E)`;e.currentTarget.style.boxShadow=`0 6px 24px ${T.a0}44`;}}>
            Open dashboard →
          </button>
          <button onClick={onDone} style={{all:"unset",cursor:"pointer",fontSize:12,color:T.t2,textAlign:"center",fontFamily:"Instrument Sans,sans-serif",transition:"color .12s"}}
            onMouseEnter={e=>e.currentTarget.style.color=T.t1} onMouseLeave={e=>e.currentTarget.style.color=T.t2}>
            Skip intro
          </button>
        </div>

      </div>
    </div>
  );
}


function Toast({msg,onDone}){
  useEffect(()=>{const t=setTimeout(onDone,2500);return()=>clearTimeout(t);},[]);
  return(
    <div style={{position:"fixed",bottom:24,left:"50%",transform:"translateX(-50%)",background:T.bg3,border:`1px solid ${T.b2}`,borderRadius:12,padding:"10px 18px",display:"flex",alignItems:"center",gap:8,boxShadow:"0 8px 32px rgba(0,0,0,.5)",animation:"fadeUp .3s ease both",zIndex:300}}>
      <div style={{width:7,height:7,borderRadius:"50%",background:T.green}}/>
      <span style={{fontSize:13,color:T.t0,fontFamily:"Instrument Sans,sans-serif"}}>{msg}</span>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function DIDashboard(){
  const[query,setQuery]=useState("");
  const[loadingPrompt,setLoadingPrompt]=useState("");
  const[loading,setLoading]=useState(false);
  const[step,setStep]=useState(0);
  const[result,setResult]=useState(null);
  const[charts,setCharts]=useState([]);
  const[error,setError]=useState(null);
  const[history,setHistory]=useState([]);
  const[qHistory,setQHistory]=useState([]);
  const[saved,setSaved]=useState(()=>{try{return loadSaved();}catch{return[];}});
  const[tab,setTab]=useState("dash");
  const[sidebar,setSidebar]=useState(true);
  const[chatMode,setChatMode]=useState("new");
  const[dateRange,setDateRange]=useState("all");
  const[alerts,setAlerts]=useState([]);
  const[schedule,setSchedule]=useState(null);
  const[showShare,setShowShare]=useState(false);
  const[showExport,setShowExport]=useState(false);
  const[toast,setToast]=useState(null);
  const [user,setUser]=useState(null);
  const handleSignOut = () => {
    setUser(null);
    setShowLanding(true);
  };
  const[showOnboarding,setShowOnboarding]=useState(false);
  const[demoMode,setDemoMode]=useState(false);
  const[showLanding,setShowLanding]=useState(true);
  const[showAbout,setShowAbout]=useState(false);
  // New feature state
  const[darkMode,setDarkMode]=useState(true);
  const[fullscreenChart,setFullscreenChart]=useState(null);
  const[annotatingChart,setAnnotatingChart]=useState(null);
  const[annotations,setAnnotations]=useState({});
  const[showCmdPalette,setShowCmdPalette]=useState(false);
  const[showShortcuts,setShowShortcuts]=useState(false);
  const[showTour,setShowTour]=useState(false);
  const[dashTitle,setDashTitle]=useState(null);
  const[csvDelimiter,setCsvDelimiter]=useState(",");
  const[csvHasHeader,setCsvHasHeader]=useState(true);
  const[uploadedData,setUploadedData]=useState(null);
  const[uploadedDatasets,setUploadedDatasets]=useState(()=>{
    if(typeof window==='undefined')return[];
    try{return JSON.parse(localStorage.getItem('dataintel_uploaded_datasets_v1')||'[]');}catch{return[];}
  });
  const fileInputRef=useRef(null);
  const bottomRef=useRef();
  const [schema,setSchema] = useState(null);
  useEffect(()=>{
    console.log("Schema state updated:", schema);
  },[schema]);

  // Apply theme
  Object.assign(T, darkMode ? {
    bg0:"#0C0904",bg1:"#171108",bg2:"#22180C",bg3:"#2E2110",bg4:"#3A2A14",
    b0:"rgba(212,168,84,0.06)",b1:"rgba(212,168,84,0.11)",b2:"rgba(212,168,84,0.18)",b3:"rgba(212,168,84,0.28)",
    t0:"#FDF6E3",t1:"#A8895C",t2:"#5E4A2E",
    a0:"#D4A854",a1:"#EAC97A",a2:"#F5DFA0",
    aBg:"rgba(212,168,84,0.10)",aBg2:"rgba(212,168,84,0.18)",aRing:"rgba(212,168,84,0.25)",
    green:"#7ECB9E",greenBg:"rgba(126,203,158,0.10)",greenDim:"rgba(126,203,158,0.06)",
    red:"#E07060",redBg:"rgba(224,112,96,0.10)",
    blue:"#6BA8E8",blueBg:"rgba(107,168,232,0.10)",
    purple:"#B07EE8",purpleBg:"rgba(176,126,232,0.10)",
    chart:["#D4A854","#7ECB9E","#E07060","#EAC97A","#A8895C","#C97B6E","#5E9E80","#E8C4A0"],
  } : LIGHT);

  // ALL hooks before any conditional return (Rules of Hooks)
  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"});},[result,loading]);
  useEffect(()=>{if(result?.charts){setCharts(result.charts);setDashTitle(result.title);}},[result]);

  const parseCSVRow=(row,delimiter)=>{
    const values=[];
    let current='';
    let inQuotes=false;
    for(let i=0;i<row.length;i++){
      const ch=row[i];
      if(inQuotes){
        if(ch==='"'&&row[i+1]==='"'){current+='"';i++;}
        else if(ch==='"'){inQuotes=false;}
        else{current+=ch;}
      } else {
        if(ch==='"'){inQuotes=true;}
        else if(ch===delimiter){values.push(current.trim());current='';}
        else{current+=ch;}
      }
    }
    values.push(current.trim());
    return values;
  };

  const parseCSVToData=(csvText,{delimiter=",",hasHeader=true}={})=>{
    const rows=csvText.trim().split(/\r?\n/).filter(l=>l.trim().length>0);
    if(rows.length<1)return null;

    const first = parseCSVRow(rows[0],delimiter);
    const headers = hasHeader ? first.map(h=>h.trim()||"col"+Math.random().toString(36).slice(2,6)) : first.map((_,idx)=>`col${idx+1}`);
    const dataRows = hasHeader ? rows.slice(1) : rows;

    const data = dataRows.map(line=>{
      const values=parseCSVRow(line,delimiter);
      while(values.length<headers.length)values.push("");
      return Object.fromEntries(headers.map((h,i)=>[h,values[i]??""]));
    });

    const numberCols=headers.filter(h=>data.length>0 && data.every(r=>r[h]===""||!Number.isNaN(Number(r[h]))));
    return {headers,data,numberCols};
  };

  const handleCSVUpload = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;

    try {
      const formData = new FormData();
      formData.append("file", f);

      const res = await fetch(`${BACKEND_BASE_URL}/upload_csv`, {
        method: "POST",
        body: formData
      });

      const data = await res.json();

      if (!res.ok || data.status !== "success") {
        throw new Error(data.message || "Upload failed");
      }

      console.log("Backend upload:", data);
      await loadSchema();

    } catch (err) {
      console.error("Backend upload failed:", err);
      setToast("Backend upload failed");
    }

    const text = await f.text();

    const parsed = parseCSVToData(text,{
      delimiter: csvDelimiter,
      hasHeader: csvHasHeader
    });

    if (!parsed){
      setToast("File could not be parsed as CSV.");
      e.target.value="";
      return;
    }

    setUploadedData({
      name:f.name,
      headers:parsed.headers,
      rows:parsed.data,
      numberCols:parsed.numberCols
    });

    const dataset={
      id:Date.now(),
      name:f.name,
      headers:parsed.headers,
      rows:parsed.data,
      numberCols:parsed.numberCols,
      delimiter:csvDelimiter,
      hasHeader:csvHasHeader,
      uploadedAt:new Date().toISOString(),
    };

    const updatedDatasets=[dataset,...uploadedDatasets].slice(0,20);

    setUploadedDatasets(updatedDatasets);
    saveDatasetsToLocalStorage(updatedDatasets);

    loadUploadedDataset(dataset);

    setToast(`Loaded ${parsed.data.length} rows from ${f.name}`);

    e.target.value="";

    loadSchema();
  };

  const loadSchema = async () => {

    try {

      const res = await fetch(`${BACKEND_BASE_URL}/schema`);
      const data = await res.json();
      console.log("SCHEMA RESPONSE:", data);
      if (data.status === "success") {
        setSchema(data.schema);
      } else {
        setSchema(null);
      }

    } catch (e) {
      console.error("Schema load failed", e);
      setSchema(null);
    }

  };

  const openCSVPicker=()=>fileInputRef.current?.click();

  const saveDatasetsToLocalStorage=(data)=>{
    try{localStorage.setItem('dataintel_uploaded_datasets_v1',JSON.stringify(data));}catch{}
  };

  const loadUploadedDataset=useCallback((dataset)=>{
    setUploadedData(dataset);
    const xKey=dataset.headers[0];
    const yKey=dataset.numberCols.find(c=>c!==xKey)||dataset.numberCols[0];
    const chartData=dataset.rows.slice(0,15).map(r=>({[xKey]:r[xKey], [yKey]:Number(r[yKey]||0)}));
    setResult({
      title:`Active Dataset`,
      summary:`${dataset.rows.length} rows loaded, ${dataset.headers.length} columns`,
      sql:`-- source: uploaded csv ${dataset.name}`,
      kpis:[
        {label:'Rows',value:`${dataset.rows.length}`,delta:'+0',trend:'neutral',sub:'uploaded'},
        {label:'Columns',value:`${dataset.headers.length}`,delta:'+0',trend:'neutral',sub:'detected'},
      ],
      followUps:['Ask a question', 'Run a chart'],
      charts: yKey ? [{id:'uploaded_csv',type:'bar',title:'CSV data preview',desc:`x=${xKey}, y=${yKey}`,data:chartData,xKey,yKeys:[{key:yKey,label:yKey,color:T.chart[1]}],anomalies:[]}]:[],
    });
    setCharts(yKey? [{id:'uploaded_csv',type:'bar',title:'CSV data preview',desc:`x=${xKey}, y=${yKey}`,data:chartData,xKey,yKeys:[{key:yKey,label:yKey,color:T.chart[1]}],anomalies:[]}] : []);
    setDashTitle(`CSV: ${dataset.name}`);
    setTab('dash');
  },[]);

  const handleSave=useCallback(()=>{
    if(!result)return;
    const title=dashTitle||result.title;
    const entry={id:Date.now(),title,summary:result.summary,kpis:result.kpis,charts,sql:result.sql,followUps:result.followUps,savedAt:Date.now()};
    const updated=[entry,...saved].slice(0,20);
    setSaved(updated);saveToDisk(updated);
    setToast(`"${title}" saved`);
  },[result,dashTitle,charts,saved]);
  
  useEffect(()=>{
    loadSchema();
  },[]);

  useEffect(()=>{
    const h=e=>{
      const mod=e.metaKey||e.ctrlKey;
      if(mod&&e.key==="k"){e.preventDefault();setShowCmdPalette(s=>!s);}
      if(mod&&e.key==="s"){e.preventDefault();handleSave();}
      if(mod&&e.key==="e"){e.preventDefault();if(result)setShowExport(true);}
      if(mod&&e.key==="/"){e.preventDefault();setShowShortcuts(s=>!s);}
      if(mod&&e.key==="."){e.preventDefault();setSidebar(s=>!s);}
    };
    window.addEventListener("keydown",h);
    return()=>window.removeEventListener("keydown",h);
  },[result,handleSave]);

  const handleModeChange=useCallback(mode=>{
    setChatMode(mode);
    if(mode==="new"){setHistory([]);setResult(null);setError(null);setCharts([]);setDashTitle(null);}
  },[]);

  const handleDeleteSaved=useCallback(id=>{const updated=saved.filter(s=>s.id!==id);setSaved(updated);saveToDisk(updated);},[saved]);
  const handleLoadSaved=useCallback(s=>{setResult(s);setCharts(s.charts||[]);setDashTitle(s.title);setTab("dash");setError(null);},[]);
  const handleChartTypeChange=useCallback((chartId,newType)=>setCharts(prev=>prev.map(c=>c.id===chartId?{...c,type:newType}:c)),[]);
  const handleAnnotationSave=useCallback((chartId,notes)=>setAnnotations(prev=>({...prev,[chartId]:notes})),[]);

  const submit = useCallback(async (q) => {

    // Handle both string input and form submit events
    const input = typeof q === "string" ? q : query;
    const text = String(input || "").trim();

    if (!text || loading) return;

    setLoadingPrompt(text);
    setQuery("");
    setLoading(true);
    setError(null);
    setStep(0);

    const baseHistory = chatMode === "continue" ? history : [];

    if (chatMode === "new") {
      setHistory([]);
      setResult(null);
      setCharts([]);
      setDashTitle(null);
    }

    // fake pipeline animation
    for (let i = 1; i < STEPS.length; i++) {
      await new Promise(r => setTimeout(r, 420));
      setStep(i);
    }

    try {

      // keep UI content separate from query
      const content = text + (
        dateRange !== "all"
          ? ` [Filter: date range = ${dateRange}]`
          : ""
      );

      // send CLEAN text to backend
      const msgs = [...baseHistory, {
        role: "user",
        content: text
      }];

      const data = await callAPI(msgs, chatMode);

      if (data.error) {
        const fallback = buildNoAnswerResult(text, data.error);
        setError(null);
        setResult(fallback);
        setCharts([]);
        setDashTitle(fallback.title);
        setQHistory(prev => [
          { q: text, mode: chatMode },
          ...prev
        ].slice(0, 15));
      } else {

        setResult(data);

        const newHistory = [
          ...msgs,
          { role: "assistant", content: JSON.stringify(data) }
        ];

        setHistory(newHistory);

        setQHistory(prev => [
          { q: text, mode: chatMode },
          ...prev
        ].slice(0, 15));

        // switch to follow-up mode automatically
        if (chatMode === "new") {
          setChatMode("continue");
        }
      }

    } catch (e) {
      const fallback = buildNoAnswerResult(
        text,
        e.message || "I couldn't answer that request right now. Try rephrasing it with a metric, dimension, or date range."
      );
      setError(null);
      setResult(fallback);
      setCharts([]);
      setDashTitle(fallback.title);
    }

    setLoading(false);
    setLoadingPrompt("");

  }, [query, loading, history, chatMode, dateRange]);

  // Single return — no early returns (avoids JSX transform issues)
  return(
    <ErrorBoundary>
      <style>{CSS}</style>
      {showLanding && !user && !showAbout && (
        <LandingPage
          onGetStarted={()=>setShowLanding(false)}
          onAbout={()=>setShowAbout(true)}
          onDemo={()=>{
            setShowLanding(false);
            setUser({demo:true,name:"Demo",email:"demo@dataintel.app"});
            setDemoMode(true);
          }}
        />
      )}
      {showAbout && !user && (
        <AboutPage
          onBack={()=>setShowAbout(false)}
          onGetStarted={()=>{setShowAbout(false);setShowLanding(false);}}
        />
      )}
      {!showLanding && !showAbout && !user && <AuthScreen onAuth={u=>{setUser(u);if(u.demo){setDemoMode(true);}else{setShowOnboarding(true);}}}/>}
      {user && showOnboarding && <OnboardingComplete user={user} darkMode={darkMode} onDone={()=>{setShowOnboarding(false);setShowTour(false);}}/>}
      {user && !showOnboarding && (
      <div style={{display:"flex",height:"100vh",background:T.bg0,color:T.t0,fontFamily:"Instrument Sans,sans-serif",overflow:"hidden"}}>
        {sidebar&&(
          
          <Sidebar activeTab={tab} onTab={setTab}
            qHistory={qHistory} onHistoryClick={q=>submit(q)}
            schema={schema}
            alerts={alerts} onAddAlert={a=>setAlerts(p=>[...p,a])} onDeleteAlert={i=>setAlerts(p=>p.filter((_,j)=>j!==i))}
            schedule={schedule} onSaveSchedule={setSchedule}
            uploadedDatasets={uploadedDatasets} onLoadUploadedDataset={loadUploadedDataset}
            onUploadCsv={openCSVPicker}
          />
        )}
        <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0,overflow:"hidden"}}>
          {/* Topbar — with editable title, theme toggle, shortcuts button */}
          <div style={{height:56,borderBottom:`1px solid ${T.b0}`,display:"flex",alignItems:"center",padding:"0 22px",gap:10,background:`linear-gradient(180deg,${T.bg0},${T.bg1})`,flexShrink:0,boxShadow:`inset 0 -1px 0 ${T.b0}`}}>
            <button onClick={()=>setSidebar(s=>!s)} style={{all:"unset",cursor:"pointer",width:30,height:30,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",color:T.t2,transition:"all .12s"}}
              onMouseEnter={e=>{e.currentTarget.style.background=T.bg3;e.currentTarget.style.color=T.t0;}}
              onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color=T.t2;}}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><line x1="3" y1="7" x2="21" y2="7"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="17" x2="21" y2="17"/></svg>
            </button>
            <div style={{width:1,height:16,background:T.b1}}/>
            <EditableTitle title={dashTitle} onChange={t=>{setDashTitle(t);setResult(r=>r?{...r,title:t}:r);}}/>
            <div style={{flex:1}}/>
            {result&&<DateRangePicker value={dateRange} onChange={setDateRange}/>}
            {/* Ctrl+K button */}
            <button onClick={()=>setShowCmdPalette(true)} title="Command palette (Ctrl+K)"
              style={{all:"unset",cursor:"pointer",display:"flex",alignItems:"center",gap:6,padding:"6px 10px",borderRadius:10,background:T.aBg,border:`1px solid ${T.a0}33`,fontSize:12,color:T.a1,fontFamily:"JetBrains Mono,monospace",transition:"all .12s",boxShadow:`inset 0 1px 0 rgba(255,255,255,.04)`}}
              onMouseEnter={e=>{e.currentTarget.style.background=T.aBg2;e.currentTarget.style.borderColor=T.a0+"55";}}
              onMouseLeave={e=>{e.currentTarget.style.background=T.aBg;e.currentTarget.style.borderColor=T.a0+"33";}}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <kbd style={{fontSize:10}}>Ctrl+K</kbd>
            </button>
            {/* Shortcuts button */}
            <button onClick={()=>setShowShortcuts(true)} title="Keyboard shortcuts (Ctrl+/)"
              style={{all:"unset",cursor:"pointer",display:"flex",alignItems:"center",gap:5,padding:"6px 10px",borderRadius:10,background:T.bg2,border:`1px solid ${T.b1}`,fontSize:12,color:T.t1,fontFamily:"JetBrains Mono,monospace",transition:"all .12s",boxShadow:`inset 0 1px 0 rgba(255,255,255,.03)`}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=T.b2;e.currentTarget.style.color=T.t0;}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor=T.b1;e.currentTarget.style.color=T.t1;}}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="6" width="20" height="14" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M18 14h.01M10 14h4"/></svg>
              <kbd style={{fontSize:10}}>Ctrl+/</kbd>
            </button>
            <div style={{display:"flex",alignItems:"center",gap:8,padding:"0 8px"}}>
              <label style={{display:"flex",alignItems:"center",gap:4,fontSize:11,color:T.t1,fontFamily:"JetBrains Mono,monospace"}}>
                Delim:
                <select value={csvDelimiter} onChange={e=>setCsvDelimiter(e.target.value)} style={{all:"unset",cursor:"pointer",padding:"4px 8px",borderRadius:6,border:`1px solid ${T.b1}`,background:T.bg2,color:T.t0}}>
                  <option value=",">Comma</option>
                  <option value=";">Semicolon</option>
                  <option value="\t">Tab</option>
                </select>
              </label>
              <label style={{display:"flex",alignItems:"center",gap:4,fontSize:11,color:T.t1,fontFamily:"JetBrains Mono,monospace"}}>
                <input type="checkbox" checked={csvHasHeader} onChange={e=>setCsvHasHeader(e.target.checked)} /> Header
              </label>
            </div>
            {/* Theme toggle */}
            <input type="file" accept=".csv,text/csv" ref={fileInputRef} onChange={handleCSVUpload} style={{display:"none"}} />
            <button onClick={()=>setDarkMode(d=>!d)} title={darkMode?"Switch to light mode":"Switch to dark mode"}
              style={{all:"unset",cursor:"pointer",width:30,height:30,borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",color:T.t2,background:T.bg2,border:`1px solid ${T.b1}`,transition:"all .12s"}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=T.b2;e.currentTarget.style.color=T.t0;}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor=T.b1;e.currentTarget.style.color=T.t2;}}>
              {darkMode
                ?<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                :<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
              }
            </button>
            {result&&(
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <button onClick={handleSave} style={{all:"unset",cursor:"pointer",display:"flex",alignItems:"center",gap:5,padding:"5px 11px",borderRadius:8,background:T.bg2,border:`1px solid ${T.b1}`,fontSize:12,color:T.t1,fontFamily:"Instrument Sans,sans-serif",transition:"all .12s"}}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor=T.b2;e.currentTarget.style.color=T.t0;}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor=T.b1;e.currentTarget.style.color=T.t1;}}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
                  Save
                </button>
                <button onClick={()=>setShowShare(true)} style={{all:"unset",cursor:"pointer",display:"flex",alignItems:"center",gap:5,padding:"5px 11px",borderRadius:8,background:T.bg2,border:`1px solid ${T.b1}`,fontSize:12,color:T.t1,fontFamily:"Instrument Sans,sans-serif",transition:"all .12s"}}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor=T.b2;e.currentTarget.style.color=T.t0;}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor=T.b1;e.currentTarget.style.color=T.t1;}}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                  Share
                </button>
                <button onClick={()=>setShowExport(true)} style={{all:"unset",cursor:"pointer",display:"flex",alignItems:"center",gap:5,padding:"5px 11px",borderRadius:8,background:T.bg2,border:`1px solid ${T.b1}`,fontSize:12,color:T.t1,fontFamily:"Instrument Sans,sans-serif",transition:"all .12s"}}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor=T.b2;e.currentTarget.style.color=T.t0;}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor=T.b1;e.currentTarget.style.color=T.t1;}}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Export
                </button>
              </div>
            )}
            <button onClick={()=>{setResult(null);setError(null);setHistory([]);setQuery("");setChatMode("new");setCharts([]);setDashTitle(null);}}
              style={{all:"unset",cursor:"pointer",display:"flex",alignItems:"center",gap:5,padding:"6px 13px",borderRadius:9,background:T.aBg,border:`1px solid ${T.a0}44`,fontSize:12,color:T.a1,fontWeight:600,fontFamily:"Instrument Sans,sans-serif",transition:"all .15s"}}
              onMouseEnter={e=>e.currentTarget.style.background=T.aBg2}
              onMouseLeave={e=>e.currentTarget.style.background=T.aBg}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              New
            </button>
            {user&&(
              <div style={{display:"flex",alignItems:"center",gap:8,marginLeft:4,paddingLeft:8,borderLeft:`1px solid ${T.b1}`}}>
                <div style={{width:28,height:28,borderRadius:"50%",background:`linear-gradient(135deg,${T.a0},#B8882E)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <span style={{fontSize:11,fontWeight:700,color:T.bg0,fontFamily:"Instrument Sans,sans-serif"}}>{(user.name||user.email||"G")[0].toUpperCase()}</span>
                </div>
                <div style={{display:"flex",flexDirection:"column"}}>
                  <span style={{fontSize:11,color:T.t0,fontFamily:"Instrument Sans,sans-serif",fontWeight:500,lineHeight:1.2}}>{user.guest?"Guest":user.name||user.email}</span>
                  {user.guest&&<span style={{fontSize:9,color:T.t2,fontFamily:"JetBrains Mono,monospace"}}>guest mode</span>}
                </div>
                <button onClick={()=>setUser(null)} title="Sign out"
                  style={{all:"unset",cursor:"pointer",width:26,height:26,borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",color:T.t2,transition:"all .12s"}}
                  onMouseEnter={e=>{e.currentTarget.style.background=T.bg3;e.currentTarget.style.color=T.red;}}
                  onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color=T.t2;}}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                </button>
              </div>
            )}
          </div>

          {/* Demo banner */}
          {demoMode&&<DemoBanner onExit={()=>{setUser(null);setDemoMode(false);setResult(null);setCharts([]);}}/>}

          {/* Scrollable content */}
          <div style={{flex:1,overflowY:"auto",padding:"24px 28px 8px"}}>
            <div style={{maxWidth:1060,margin:"0 auto",display:"flex",flexDirection:"column",gap:16}}>
              {loading&&(
                <div style={{display:"flex",flexDirection:"column",gap:16}}>
                  <LoadingExperience step={step} query={loadingPrompt}/>
                  <div style={{display:"flex",flexDirection:"column",gap:16}}>
                    <KPISkeleton/>
                    <ChartSkeleton/>
                  </div>
                </div>
              )}
              {!loading&&error&&(
                <div style={{display:"flex",gap:12,padding:"14px 18px",borderRadius:13,background:T.redBg,border:`1px solid ${T.red}33`,animation:"fadeUp .3s ease both",alignItems:"flex-start"}}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.red} strokeWidth="2" style={{flexShrink:0,marginTop:1}}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  <p style={{margin:0,fontSize:14,color:T.red,lineHeight:1.6,fontFamily:"Instrument Sans,sans-serif"}}>{error}</p>
                </div>
              )}
              {!result&&!loading&&!error&&(demoMode
                ?<DemoScenarioPicker onPick={s=>{setResult(s);setCharts(s.charts);setDashTitle(s.title);}}/>
                :<EmptyState onPrompt={q=>submit(q)}/>
              )}
              {result&&!loading&&(
                <div style={{display:"flex",flexDirection:"column",gap:14}}>
                  <SummaryBanner title={dashTitle||result.title} summary={result.summary}/>
                  {result.unanswerable&&(
                    <div style={{display:"flex",gap:12,padding:"14px 16px",borderRadius:14,background:T.bg2,border:`1px solid ${T.a0}33`,alignItems:"flex-start"}}>
                      <div style={{width:30,height:30,borderRadius:10,background:T.aBg,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={T.a0} strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2-3 4"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                      </div>
                      <div style={{display:"flex",flexDirection:"column",gap:6}}>
                        <p style={{margin:0,fontSize:13,color:T.t0,fontFamily:"Instrument Sans,sans-serif",fontWeight:600}}>Try a more specific analytics prompt</p>
                        <p style={{margin:0,fontSize:12,color:T.t1,lineHeight:1.6,fontFamily:"Instrument Sans,sans-serif"}}>
                          Mention a metric like views, revenue, or engagement, plus a dimension such as category, region, language, or date range.
                        </p>
                        {result.originalQuery&&(
                          <p style={{margin:0,fontSize:11,color:T.t2,fontFamily:"JetBrains Mono,monospace"}}>
                            Last query: {result.originalQuery}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                  {uploadedData&&(
                    <div style={{padding:"12px",borderRadius:12,background:T.bg2,border:`1px solid ${T.b1}`}}>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                        <h4 style={{margin:0,fontSize:13,color:T.t0,fontFamily:"Playfair Display,serif"}}>Dataset preview</h4>
                        <span style={{fontSize:10,color:T.t2,fontFamily:"JetBrains Mono,monospace"}}>{uploadedData.rows.length} rows · {uploadedData.headers.length} cols</span>
                      </div>
                      <div style={{overflowX:"auto"}}>
                        <table style={{width:"100%",borderCollapse:"collapse",fontFamily:"JetBrains Mono,monospace"}}>
                          <thead>
                            <tr>
                              {uploadedData.headers.map((h,i)=>(
                                <th key={i} style={{border:"1px solid rgba(212,168,84,.2)",padding:"6px 8px",fontSize:11,color:T.t1,background:T.bg3,textAlign:"left"}}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {uploadedData.rows.slice(0,5).map((row,r)=>(
                              <tr key={r} style={{background:r%2===0?T.bg1:T.bg0}}>
                                {uploadedData.headers.map((h,c)=>(
                                  <td key={c} style={{border:"1px solid rgba(212,168,84,.2)",padding:"6px 8px",fontSize:11,color:T.t2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:130}}>{row[h]}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  {result.sql&&<SQLPanel sql={result.sql}/>}

                  {result.kpis?.length>0&&(
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))",gap:10}}>
                      {result.kpis.map((k,i)=><KPICard key={i} kpi={k} idx={i}/>)}
                    </div>
                  )}
                  {charts.length>0&&(
                    <DraggableChartGrid
                      charts={charts} onReorder={setCharts}
                      onTypeChange={handleChartTypeChange}
                      onFullscreen={c=>setFullscreenChart(c)}
                      onAnnotate={id=>setAnnotatingChart(id)}
                    />
                  )}
                  {result.followUps?.length>0&&<FollowUps items={result.followUps} onSelect={q=>submit(q)}/>}
                </div>
              )}
              <div ref={bottomRef}/>
            </div>
          </div>

          {/* Bottom input */}
          <div style={{borderTop:`1px solid ${T.b0}`,padding:"14px 28px 16px",background:T.bg0,flexShrink:0}}>
            <div style={{maxWidth:1060,margin:"0 auto"}}>
              {/* Shortcut hint strip — only shown when no result yet */}
              {!result&&!loading&&!demoMode&&(
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,flexWrap:"wrap"}}>
                  <span style={{fontSize:10,color:T.t2,fontFamily:"JetBrains Mono,monospace"}}>Try:</span>
                  {["Views by category","Sentiment by region","Monetization impact"].map((q,i)=>(
                    <button key={i} onClick={()=>{setQuery(q);}}
                      style={{all:"unset",cursor:"pointer",fontSize:11,color:T.t1,background:T.bg2,border:`1px solid ${T.b1}`,padding:"3px 10px",borderRadius:7,fontFamily:"Instrument Sans,sans-serif",transition:"all .12s"}}
                      onMouseEnter={e=>{e.currentTarget.style.borderColor=T.b2;e.currentTarget.style.color=T.t0;}}
                      onMouseLeave={e=>{e.currentTarget.style.borderColor=T.b1;e.currentTarget.style.color=T.t1;}}>
                      {q}
                    </button>
                  ))}
                  <div style={{flex:1}}/>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    {[{k:"Ctrl+K",l:"palette"},{k:"Ctrl+S",l:"save"},{k:"Ctrl+E",l:"export"},{k:"Ctrl+/",l:"shortcuts"}].map((s,i)=>(
                      <span key={i} style={{display:"flex",alignItems:"center",gap:4,fontSize:10,color:T.t2,fontFamily:"JetBrains Mono,monospace"}}>
                        <kbd style={{fontSize:9,color:T.a1,background:T.aBg,border:`1px solid ${T.a0}28`,borderRadius:4,padding:"1px 5px"}}>{s.k}</kbd>
                        <span style={{color:T.t2}}>{s.l}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {demoMode?(
                <div style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",borderRadius:14,background:T.bg2,border:`1px solid ${T.b1}`}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:T.a0,boxShadow:`0 0 8px ${T.a0}`,flexShrink:0}}/>
                  <span style={{fontSize:13,color:T.t1,fontFamily:"Instrument Sans,sans-serif"}}>Demo mode — viewing pre-loaded data</span>
                  <div style={{flex:1}}/>
                  <button onClick={()=>{setResult(null);setCharts([]);setDashTitle(null);}}
                    style={{all:"unset",cursor:"pointer",padding:"7px 14px",borderRadius:9,background:T.aBg,border:`1px solid ${T.a0}44`,fontSize:12,color:T.a1,fontFamily:"Instrument Sans,sans-serif",fontWeight:500,transition:"all .12s"}}
                    onMouseEnter={e=>e.currentTarget.style.background=T.aBg2}
                    onMouseLeave={e=>e.currentTarget.style.background=T.aBg}>
                    ← Try another scenario
                  </button>
                  <button onClick={()=>{setUser(null);setDemoMode(false);setResult(null);setCharts([]);}}
                    style={{all:"unset",cursor:"pointer",padding:"7px 14px",borderRadius:9,background:`linear-gradient(135deg,${T.a0},#B8882E)`,fontSize:12,color:T.bg0,fontFamily:"Instrument Sans,sans-serif",fontWeight:600,transition:"all .12s"}}>
                    Sign up free →
                  </button>
                </div>
              ):(
                <InputBar
                  value={query}
                  onChange={setQuery}
                  onSubmit={submit}
                  loading={loading}
                  chatMode={chatMode}
                  onChatModeChange={handleModeChange}
                  schema={schema}
                  hasHistory={history.length > 0}
                  turnCount={Math.floor(history.length / 2)}
                />
              )}
            </div>
          </div>
        </div>
      </div>
      )}
      {/* Overlays — always rendered when user is present */}
      {user&&!showOnboarding&&showShare&&<ShareModal title={dashTitle||result?.title||"Dashboard"} onClose={()=>setShowShare(false)}/>}
      {user&&!showOnboarding&&showExport&&<ExportModal result={result} onClose={()=>setShowExport(false)}/>}
      {user&&!showOnboarding&&fullscreenChart&&<ChartFullscreen chart={fullscreenChart} onClose={()=>setFullscreenChart(null)}/>}
      {user&&!showOnboarding&&annotatingChart!==null&&<AnnotationModal chartId={annotatingChart} annotations={annotations} onSave={handleAnnotationSave} onClose={()=>setAnnotatingChart(null)}/>}
      {user&&!showOnboarding&&showCmdPalette&&<CommandPalette onClose={()=>setShowCmdPalette(false)} onQuery={q=>submit(q)} saved={saved} qHistory={qHistory}/>}
      {user&&!showOnboarding&&showShortcuts&&<ShortcutsModal onClose={()=>setShowShortcuts(false)}/>}
      {user&&!showOnboarding&&showTour&&<OnboardingTour onDone={()=>setShowTour(false)}/>}
      {user&&!showOnboarding&&<HelpButton onTour={()=>setShowTour(true)} onShortcuts={()=>setShowShortcuts(true)}/>}
      {user&&!showOnboarding&&toast&&<Toast msg={toast} onDone={()=>setToast(null)}/>}
    </ErrorBoundary>
  );
}
