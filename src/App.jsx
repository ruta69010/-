import { useState, useEffect, useCallback, useRef, memo } from "react";

const STORAGE_TTL_DAYS = 3;
const PFX_NAR = "k:n:";
const PFX_JRA = "k:j:";
const EDGE_URL = "https://gsexqsgavasrmankimwl.supabase.co/functions/v1/predict";

function getToday() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;
}

// JRA開催祝日リスト（2025-2026年）
const JRA_HOLIDAYS = [
  "20250101","20250113","20250211","20250220","20250321",
  "20250429","20250503","20250504","20250505","20250721",
  "20250811","20250915","20250923","20251013","20251103",
  "20251123","20260101","20260112","20260211","20260320",
  "20260429","20260503","20260504","20260505","20260720",
  "20260811","20260921","20260923","20261012","20261103",
  "20261123",
];

function isJRADay(dateStr) {
  const d = new Date(
    parseInt(dateStr.slice(0,4)),
    parseInt(dateStr.slice(4,6))-1,
    parseInt(dateStr.slice(6,8))
  );
  const dow = d.getDay();
  return dow === 0 || dow === 6 || JRA_HOLIDAYS.includes(dateStr);
}

function getJRADateList() {
  const dates = [];
  const d = new Date();
  let count = 0;
  let i = 0;
  while (count < 3 && i < 30) {
    const cur = new Date(d);
    cur.setDate(d.getDate() - i);
    const str = `${cur.getFullYear()}${String(cur.getMonth()+1).padStart(2,"0")}${String(cur.getDate()).padStart(2,"0")}`;
    if (isJRADay(str)) {
      const label = `${cur.getMonth()+1}/${cur.getDate()}`;
      dates.push({ str, label });
      count++;
    }
    i++;
  }
  return dates.reverse();
}

function getNARDateList() {
  const dates = [];
  for (let i = 2; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const str = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;
    const label = `${d.getMonth()+1}/${d.getDate()}`;
    dates.push({ str, label });
  }
  return dates;
}

const NAR_TRACKS = [
  {trackId:"36",trackName:"門別"},{trackId:"15",trackName:"船橋"},
  {trackId:"16",trackName:"大井"},{trackId:"17",trackName:"川崎"},
  {trackId:"14",trackName:"浦和"},{trackId:"22",trackName:"金沢"},
  {trackId:"23",trackName:"笠松"},{trackId:"24",trackName:"名古屋"},
  {trackId:"27",trackName:"園田"},{trackId:"28",trackName:"姫路"},
  {trackId:"31",trackName:"高知"},{trackId:"32",trackName:"佐賀"},
  {trackId:"11",trackName:"水沢"},{trackId:"12",trackName:"盛岡"},
  {trackId:"40",trackName:"ばんえい",isBanei:true},
];

const JRA_TRACKS = [
  {trackId:"j05",trackName:"東京"},{trackId:"j06",trackName:"中山"},
  {trackId:"j08",trackName:"京都"},{trackId:"j09",trackName:"阪神"},
  {trackId:"j01",trackName:"札幌"},{trackId:"j02",trackName:"函館"},
  {trackId:"j03",trackName:"福島"},{trackId:"j04",trackName:"新潟"},
  {trackId:"j07",trackName:"中京"},{trackId:"j10",trackName:"小倉"},
];

const RACE_TIMES = {
  nar: ["10:30","11:00","11:30","12:00","12:30","13:00","13:30","14:00","14:30","15:00","15:30","16:00"],
  jra: ["10:00","10:35","11:10","11:45","12:20","12:55","13:30","14:05","14:40","15:15","15:50","16:25"],
  banei: ["14:05","14:35","15:05","15:35","16:05","16:35","17:05","17:35","18:05","18:35"],
};

const MARKS  = {1:"◎",2:"○",3:"▲",4:"△",5:"×"};
const MARK_C = {
  1:{bg:"#FFD700",tx:"#111"},2:{bg:"#e2e8f0",tx:"#111"},
  3:{bg:"#f97316",tx:"#fff"},4:{bg:"#3b82f6",tx:"#fff"},5:{bg:"#1e2035",tx:"#6b7280"},
};
const FRAME_C = [
  "#eee","#eee","#222","#222","#dc2626","#dc2626",
  "#2563eb","#2563eb","#facc15","#facc15","#16a34a","#16a34a",
  "#f97316","#f97316","#a21caf","#a21caf",
];
const AXES = [
  {key:"recentIdx",w:0.30},{key:"distIdx",w:0.20},{key:"trackIdx",w:0.15},
  {key:"jockeyIdx",w:0.15},{key:"trainerIdx",w:0.10},{key:"peakIdx",w:0.10},
];

const L1 = new Map();

async function stGet(key) {
  if (L1.has(key)) return L1.get(key);
  try {
    const r = await window.storage.get(key);
    if (!r) return null;
    const p = JSON.parse(r.value);
    if ((Date.now()-p.t)/86400000>STORAGE_TTL_DAYS) { window.storage.delete(key).catch(()=>{}); return null; }
    L1.set(key,p.d);
    return p.d;
  } catch { return null; }
}

async function stSet(key,data) {
  L1.set(key,data);
  try { await window.storage.set(key,JSON.stringify({d:data,t:Date.now()})); } catch{}
}

async function stPurge() {
  for (const pfx of [PFX_NAR,PFX_JRA]) {
    try {
      const list = await window.storage.list(pfx);
      for (const key of (list?.keys||[])) {
        try {
          const r = await window.storage.get(key);
          if (!r) continue;
          const p = JSON.parse(r.value);
          if ((Date.now()-p.t)/86400000>STORAGE_TTL_DAYS) window.storage.delete(key).catch(()=>{});
        } catch{}
      }
    } catch{}
  }
}

function calcScore(h) {
  let s=0,w=0;
  for(const a of AXES){const v=h[a.key];if(typeof v==="number"){s+=v*a.w;w+=a.w;}}
  return w>0?Math.round(s/w):h.aiScore??50;
}

async function getRace(type, date, trackId, raceNum, trackName) {
  const pfx = type==="nar"?PFX_NAR:PFX_JRA;
  const key = `${pfx}${date}:${trackId}:${raceNum}`;
  const cached = await stGet(key);
  if (cached) return cached;
  const isBanei = trackId==="40";
  const label = type==="nar"?(isBanei?"ばんえい(帯広)":`地方 ${trackName}`):`JRA ${trackName}`;
  const sys = `競馬AI。JSONのみ。{"raceName":"名","distance":"1400m","surface":"良","analysisNote":"30字","horses":[{"num":1,"name":"馬名","jockey":"騎手","trainer":"調教師","weight":55,"bodyWeight":"498(-2)","recentIdx":75,"distIdx":70,"trackIdx":65,"jockeyIdx":80,"trainerIdx":60,"peakIdx":70,"aiScore":73,"odds":3.5,"comment":"40字","prevResults":"前走2着","strengths":"強み","weaknesses":"弱み"}]}`;
  const usr = `${date} ${label} 第${raceNum}R。${isBanei?"8-10":"10-12"}頭。JSONのみ返せ。`;
  try {
    const res = await fetch(EDGE_URL,{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "Authorization":`Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdzZXhxc2dhdmFzcm1hbmtpbXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3MDI4NzAsImV4cCI6MjA5NjI3ODg3MH0.NDyGjZkjX_9DutkQ9VLk3W31SF_9-0yVu5DKcjWbfQI`,
      },
      body:JSON.stringify({system:sys,user:usr}),
    });
    if(!res.ok) {
  const errText = await res.text();
  console.error("Edge error:", res.status, errText);
  return null;
}
const data = await res.json();
console.log("Edge response:", JSON.stringify(data).slice(0,200));
if(!data?.horses) return null;
    data.horses = data.horses.map(h=>({...h,aiScore:calcScore(h)}));
    await stSet(key,data);
    return data;
  } catch(e) { return null; }
}
const Spin = memo(({size=36})=>(
  <div style={{width:size,height:size,border:`${size*.09}px solid #1e2035`,borderTop:`${size*.09}px solid #FFD700`,borderRadius:"50%",animation:"kspin .65s linear infinite"}}/>
));

const Bar = memo(({value})=>{
  const pct=Math.min(100,Math.max(0,value??0));
  const c=value>=75?"#FFD700":value>=55?"#4ade80":value>=35?"#60a5fa":"#4b5563";
  return (
    <div style={{display:"flex",alignItems:"center",gap:3}}>
      <div style={{width:46,height:5,background:"#1e2035",borderRadius:3,overflow:"hidden"}}>
        <div style={{width:`${pct}%`,height:"100%",background:c,borderRadius:3}}/>
      </div>
      <span style={{fontSize:10,color:c,fontWeight:700,minWidth:18,textAlign:"right"}}>{value??"-"}</span>
    </div>
  );
});

const Mark = memo(({rank})=>{
  const c=MARK_C[rank]||MARK_C[5];
  return <div style={{width:26,height:26,borderRadius:6,flexShrink:0,background:c.bg,color:c.tx,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:900,boxShadow:rank===1?"0 0 8px rgba(255,215,0,.45)":"none"}}>{MARKS[rank]||rank}</div>;
});

const Frame = memo(({num})=>{
  const idx=Math.min(num-1,FRAME_C.length-1);
  const bg=FRAME_C[idx]||"#555";
  const dark=idx<=1;
  return <div style={{width:22,height:22,borderRadius:4,flexShrink:0,background:bg,color:dark?"#111":"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:900,border:"1px solid rgba(255,255,255,.12)"}}>{num}</div>;
});

const HorseRow = memo(({horse,rank,onTap})=>{
  const top=rank<=3;
  return (
    <div onClick={onTap} style={{display:"flex",alignItems:"center",padding:"9px 12px",borderBottom:"1px solid #0f172a",background:rank===1?"rgba(255,215,0,.04)":"transparent",cursor:"pointer",gap:7,position:"relative"}}>
      {top&&<div style={{position:"absolute",left:0,top:0,bottom:0,width:2,background:MARK_C[rank]?.bg}}/>}
      <Mark rank={rank}/><Frame num={horse.num}/>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:13,fontWeight:700,color:"#f1f5f9",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{horse.name}</div>
        <div style={{fontSize:10,color:"#4b5563",marginTop:1}}>{horse.jockey} / {horse.weight}kg{horse.odds?<span style={{color:"#374151"}}> / {horse.odds}倍</span>:null}</div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:2,alignItems:"flex-end"}}>
        <Bar value={horse.aiScore}/>
        <div style={{display:"flex",gap:3,fontSize:9}}>
          <span style={{color:"#f97316"}}>近:{horse.recentIdx??"-"}</span>
          <span style={{color:"#4ade80"}}>距:{horse.distIdx??"-"}</span>
          <span style={{color:"#c084fc"}}>騎:{horse.jockeyIdx??"-"}</span>
        </div>
        <div style={{display:"flex",gap:3,fontSize:9}}>
          <span style={{color:"#60a5fa"}}>場:{horse.trackIdx??"-"}</span>
          <span style={{color:"#f472b6"}}>厩:{horse.trainerIdx??"-"}</span>
          <span style={{color:"#34d399"}}>峰:{horse.peakIdx??"-"}</span>
        </div>
      </div>
      <div style={{minWidth:30,textAlign:"center",fontSize:15,fontWeight:900,color:horse.aiScore>=70?"#FFD700":horse.aiScore>=50?"#4ade80":"#6b7280"}}>{horse.aiScore??"-"}</div>
      <div style={{fontSize:14,color:"#374151"}}>›</div>
    </div>
  );
});

function HorseModal({horse,rank,onClose}) {
  if(!horse) return null;
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.88)",zIndex:200,display:"flex",alignItems:"flex-end"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:430,margin:"0 auto",maxHeight:"82vh",overflowY:"auto",background:"#0d0d1a",borderRadius:"20px 20px 0 0",padding:"0 0 32px",border:"1px solid #1e2035"}}>
        <div style={{textAlign:"center",padding:"12px 0 0"}}><div style={{width:36,height:4,background:"#1e2035",borderRadius:2,display:"inline-block"}}/></div>
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 16px",borderBottom:"1px solid #111827"}}>
          <Mark rank={rank}/><Frame num={horse.num}/>
          <div style={{flex:1}}>
            <div style={{fontSize:17,fontWeight:900,color:"#f1f5f9"}}>{horse.name}</div>
            <div style={{fontSize:11,color:"#6b7280"}}>{horse.jockey} 騎手 / {horse.trainer} 調教師</div>
          </div>
        </div>
        <div style={{padding:"12px 16px"}}>
          <div style={{background:"rgba(255,215,0,.07)",borderRadius:10,padding:"12px 14px",border:"1px solid rgba(255,215,0,.25)",marginBottom:10,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontSize:10,color:"#FFD700",marginBottom:2}}>🤖 AI総合スコア</div>
              <div style={{fontSize:28,fontWeight:900,color:"#FFD700"}}>{horse.aiScore??"-"}<span style={{fontSize:12,color:"#9ca3af",fontWeight:400}}> / 100</span></div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontSize:10,color:"#6b7280",marginBottom:2}}>推定オッズ</div>
              <div style={{fontSize:18,fontWeight:700,color:"#e2e8f0"}}>{horse.odds??"-"}倍</div>
              {horse.bodyWeight&&<div style={{fontSize:10,color:"#6b7280",marginTop:2}}>{horse.bodyWeight}</div>}
            </div>
          </div>
          <div style={{background:"#111827",borderRadius:10,padding:"12px 14px",border:"1px solid #1e2035",marginBottom:10}}>
            <div style={{fontSize:10,color:"#6b7280",marginBottom:10}}>📊 分析指数（6軸）</div>
            {[
              {label:"近走指数",val:horse.recentIdx,color:"#f97316"},
              {label:"距離適性",val:horse.distIdx,color:"#4ade80"},
              {label:"馬場適性",val:horse.trackIdx,color:"#60a5fa"},
              {label:"騎手指数",val:horse.jockeyIdx,color:"#c084fc"},
              {label:"厩舎指数",val:horse.trainerIdx,color:"#f472b6"},
              {label:"状態指数",val:horse.peakIdx,color:"#34d399"},
            ].map(item=>{
              const pct=Math.min(100,Math.max(0,item.val??0));
              return (
                <div key={item.label} style={{marginBottom:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                    <span style={{fontSize:10,color:"#9ca3af"}}>{item.label}</span>
                    <span style={{fontSize:11,fontWeight:700,color:item.color}}>{item.val??"-"}</span>
                  </div>
                  <div style={{height:6,background:"#1e2035",borderRadius:3,overflow:"hidden"}}>
                    <div style={{width:`${pct}%`,height:"100%",background:item.color,borderRadius:3}}/>
                  </div>
                </div>
              );
            })}
          </div>
          {(horse.strengths||horse.weaknesses)&&(
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:10}}>
              {horse.strengths&&<div style={{background:"rgba(74,222,128,.05)",borderRadius:10,padding:"10px 12px",border:"1px solid rgba(74,222,128,.2)"}}>
                <div style={{fontSize:10,color:"#4ade80",marginBottom:4}}>✅ 強み</div>
                <div style={{fontSize:11,color:"#d1d5db",lineHeight:1.5}}>{horse.strengths}</div>
              </div>}
              {horse.weaknesses&&<div style={{background:"rgba(248,113,113,.05)",borderRadius:10,padding:"10px 12px",border:"1px solid rgba(248,113,113,.2)"}}>
                <div style={{fontSize:10,color:"#f87171",marginBottom:4}}>⚠️ 弱み</div>
                <div style={{fontSize:11,color:"#d1d5db",lineHeight:1.5}}>{horse.weaknesses}</div>
              </div>}
            </div>
          )}
          {horse.prevResults&&<div style={{background:"#111827",borderRadius:10,padding:"10px 12px",border:"1px solid #1e2035",marginBottom:10}}>
            <div style={{fontSize:10,color:"#6b7280",marginBottom:4}}>📋 前走実績</div>
            <div style={{fontSize:12,color:"#9ca3af"}}>{horse.prevResults}</div>
          </div>}
          {horse.comment&&<div style={{background:"rgba(255,215,0,.05)",borderRadius:10,padding:"12px",border:"1px solid rgba(255,215,0,.15)",marginBottom:12}}>
            <div style={{fontSize:10,color:"#FFD700",marginBottom:6}}>🤖 AI分析</div>
            <div style={{fontSize:13,color:"#d1d5db",lineHeight:1.65}}>{horse.comment}</div>
          </div>}
          <button onClick={onClose} style={{width:"100%",padding:"13px",background:"linear-gradient(135deg,#FFD700,#f59e0b)",border:"none",borderRadius:10,fontSize:14,fontWeight:700,color:"#111",cursor:"pointer"}}>閉じる</button>
        </div>
      </div>
    </div>
  );
}

const BettingTab = memo(({horses})=>{
  const [t1,t2,t3,t4]=horses;
  const bets=[
    t1&&t2&&{type:"馬単",combo:`${t1.num} → ${t2.num}`,desc:"本命→対抗",star:true},
    t1&&t2&&{type:"馬複",combo:`${t1.num} - ${t2.num}`,desc:"堅め軸"},
    t1&&t2&&t3&&{type:"三連複",combo:`${t1.num}-${t2.num}-${t3.num}`,desc:"上位3頭BOX"},
    t1&&t2&&t3&&{type:"三連単",combo:`${t1.num}→${t2.num}→${t3.num}`,desc:"本線"},
    t1&&t2&&t3&&t4&&{type:"ワイド",combo:`${t1.num}-${t2.num} / ${t3.num}-${t4.num}`,desc:"ヒモ拡張"},
  ].filter(Boolean);
  return (
    <div style={{padding:14}}>
      <div style={{fontSize:11,color:"#6b7280",marginBottom:12}}>🤖 AI推奨買い目</div>
      {bets.map((b,i)=>(
        <div key={i} style={{background:b.star?"rgba(255,215,0,.07)":"#111827",borderRadius:12,padding:"14px 16px",marginBottom:9,border:b.star?"1px solid rgba(255,215,0,.3)":"1px solid #1e2035",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div>
            {b.star&&<div style={{fontSize:10,color:"#FFD700",marginBottom:3}}>⭐ おすすめ</div>}
            <div style={{fontSize:11,color:"#6b7280",marginBottom:4}}>{b.desc}</div>
            <div style={{fontSize:19,fontWeight:900,color:"#f1f5f9",letterSpacing:1}}>{b.combo}</div>
          </div>
          <div style={{background:b.star?"#FFD700":"#1e2035",color:b.star?"#111":"#9ca3af",borderRadius:8,padding:"5px 11px",fontSize:12,fontWeight:700}}>{b.type}</div>
        </div>
      ))}
      <div style={{marginTop:14,padding:"12px 14px",background:"#0f172a",borderRadius:10,border:"1px solid #1e2035",fontSize:10,color:"#4b5563",lineHeight:1.7}}>
        ⚠️ 本予想はAIによる参考情報です。馬券の購入はご自身の判断・責任でお願いします。20歳未満は馬券購入禁止。
      </div>
    </div>
  );
});
export default function App() {
  const today = useRef(getToday()).current;
  const [tab,      setTab]      = useState("nar");
  const [selDate,  setSelDate]  = useState(today);
  const [view,     setView]     = useState("home");
  const [history,  setHistory]  = useState([]);
  const [raceData, setRaceData] = useState(null);
  const [selTrack, setSelTrack] = useState(null);
  const [selRace,  setSelRace]  = useState(null);
  const [selHorse, setSelHorse] = useState(null);
  const [selRank,  setSelRank]  = useState(1);
  const [raceTab,  setRaceTab]  = useState("予想");
  const [errMsg,   setErrMsg]   = useState(null);

  const narDates = useRef(getNARDateList()).current;
  const jraDates = useRef(getJRADateList()).current;

  useEffect(()=>{
    stPurge();
    const t = setInterval(()=>{ if(getToday()!==today) location.reload(); },60000);
    return ()=>clearInterval(t);
  },[]);

  const goBack = useCallback(()=>{
    if(history.length===0){ setView("home"); setRaceData(null); return; }
    const prev = history[history.length-1];
    setHistory(h=>h.slice(0,-1));
    if(prev.view==="home"){ setView("home"); setRaceData(null); }
    else if(prev.view==="race"){
      setView("race");
      setRaceData(prev.raceData);
      setSelTrack(prev.selTrack);
      setSelRace(prev.selRace);
      setRaceTab("予想");
    }
  },[history]);

  useEffect(()=>{
    window.history.pushState(null,"",window.location.href);
    const onPop = ()=>{
      window.history.pushState(null,"",window.location.href);
      goBack();
    };
    window.addEventListener("popstate",onPop);
    return ()=>window.removeEventListener("popstate",onPop);
  },[goBack]);

  // タブ切替時に日付をリセット
  const handleTabChange = useCallback((newTab)=>{
    setTab(newTab);
    const dates = newTab==="nar" ? getNARDateList() : getJRADateList();
    setSelDate(dates[dates.length-1].str);
  },[]);

  const openRace = useCallback(async(trackId, raceNum, trackName)=>{
    setHistory(h=>[...h,{view,raceData,selTrack,selRace}]);
    setSelTrack({id:trackId,name:trackName});
    setSelRace(raceNum);
    setRaceData(null);
    setErrMsg(null);
    setView("loading");
    setRaceTab("予想");
    const data = await getRace(tab, selDate, trackId, raceNum, trackName);
    if(data){ setRaceData(data); setView("race"); }
    else { setErrMsg("予想の取得に失敗しました。もう一度お試しください。"); setView("error"); }
  },[tab,selDate,view,raceData,selTrack,selRace]);

  const horses = raceData?.horses
    ? [...raceData.horses].sort((a,b)=>(b.aiScore??0)-(a.aiScore??0))
    : [];

  const curDates = tab==="nar" ? narDates : jraDates;
  const curTracks = tab==="nar" ? NAR_TRACKS : JRA_TRACKS;
  const times = tab==="nar" ? RACE_TIMES.nar : RACE_TIMES.jra;

  return (
    <div style={{minHeight:"100vh",background:"#080812",color:"#f1f5f9",fontFamily:"'Noto Sans JP','Hiragino Kaku Gothic ProN',sans-serif",width:"100%",position:"relative",overflowX:"hidden"}}>
      <style>{`
        @keyframes kspin{to{transform:rotate(360deg)}}
        @keyframes kfade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        *{box-sizing:border-box}
        html,body{margin:0;padding:0;width:100%}
        ::-webkit-scrollbar{width:3px}
        ::-webkit-scrollbar-thumb{background:#1e2035;border-radius:3px}
      `}</style>

      <div style={{position:"sticky",top:0,zIndex:50,background:"#080812",borderBottom:"1px solid #111827"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 16px 8px"}}>
          {view!=="home"
            ?<button onClick={goBack} style={{background:"none",border:"none",color:"#FFD700",fontSize:15,cursor:"pointer",fontWeight:700}}>← 戻る</button>
            :<div style={{fontSize:15,fontWeight:900,letterSpacing:1,background:"linear-gradient(90deg,#FFD700,#f97316)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>🏇 AI競馬予想</div>
          }
          <div style={{fontSize:10,color:"#4b5563"}}>{today.slice(4,6)}/{today.slice(6,8)}</div>
        </div>
        {view==="race"&&raceData&&(
          <div style={{padding:"0 16px 7px",fontSize:11,color:"#9ca3af"}}>
            {selTrack?.name} 第{selRace}R ／ <span style={{color:"#e2e8f0"}}>{raceData.raceName}</span> ／ {raceData.distance} {raceData.surface}
          </div>
        )}
        {view==="home"&&(
          <>
            <div style={{display:"flex",borderTop:"1px solid #111827"}}>
              {[{id:"nar",label:"🏟 地方・ばんえい"},{id:"jra",label:"🏆 中央（JRA）"}].map(s=>(
                <button key={s.id} onClick={()=>handleTabChange(s.id)} style={{flex:1,padding:"10px 0",background:"none",border:"none",fontSize:12,fontWeight:700,cursor:"pointer",color:tab===s.id?"#FFD700":"#4b5563",borderBottom:tab===s.id?"2px solid #FFD700":"2px solid transparent"}}>
                  {s.label}
                </button>
              ))}
            </div>
            <div style={{display:"flex",borderTop:"1px solid #111827",background:"#0a0a14"}}>
              {curDates.map(d=>(
                <button key={d.str} onClick={()=>setSelDate(d.str)} style={{flex:1,padding:"7px 0",background:"none",border:"none",fontSize:11,fontWeight:700,cursor:"pointer",color:selDate===d.str?"#FFD700":"#4b5563",borderBottom:selDate===d.str?"2px solid #FFD700":"2px solid transparent"}}>
                  {d.label}
                </button>
              ))}
            </div>
          </>
        )}
        {view==="race"&&(
          <div style={{display:"flex",borderTop:"1px solid #111827"}}>
            {["予想","買い目"].map(t=>(
              <button key={t} onClick={()=>setRaceTab(t)} style={{flex:1,padding:"9px 0",background:"none",border:"none",fontSize:12,fontWeight:700,cursor:"pointer",color:raceTab===t?"#FFD700":"#4b5563",borderBottom:raceTab===t?"2px solid #FFD700":"2px solid transparent"}}>
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      {view==="home"&&(
        <div style={{paddingBottom:80,animation:"kfade .25s ease"}}>
          {curTracks.map(track=>(
            <div key={track.trackId} style={{marginTop:12}}>
              <div style={{padding:"8px 16px 6px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{fontSize:13,fontWeight:900,color:"#FFD700"}}>{track.trackName}</span>
                  {track.isBanei&&<span style={{fontSize:9,background:"#7c3aed",color:"#fff",borderRadius:4,padding:"1px 6px",fontWeight:700}}>ばんえい</span>}
                </div>
                <span style={{fontSize:10,color:"#374151"}}>12R</span>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,padding:"0 16px"}}>
                {(track.isBanei?RACE_TIMES.banei:times).map((time,i)=>{
                  const raceNum = i+1;
                  return (
                    <button key={raceNum} onClick={()=>openRace(track.trackId,raceNum,track.trackName)}
                      style={{background:"#0f172a",border:"1px solid #1e2035",borderRadius:8,padding:"8px 6px",cursor:"pointer",textAlign:"center"}}>
                      <div style={{fontSize:13,fontWeight:700,color:"#e2e8f0"}}>{raceNum}R</div>
                      <div style={{fontSize:9,color:"#6b7280",marginTop:1}}>{time}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {view==="loading"&&(
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"60vh",gap:16}}>
          <div style={{width:64,height:64,background:"radial-gradient(circle,rgba(255,215,0,.08),transparent)",borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <Spin size={44}/>
          </div>
          <div style={{textAlign:"center"}}>
            <div style={{fontSize:15,color:"#e2e8f0",fontWeight:700}}>AI予想を生成中</div>
            <div style={{fontSize:12,color:"#6b7280",marginTop:4}}>{selTrack?.name} 第{selRace}R</div>
            <div style={{fontSize:11,color:"#4b5563",marginTop:8}}>しばらくお待ちください</div>
          </div>
        </div>
      )}

      {view==="error"&&(
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"60vh",gap:12,padding:"0 24px"}}>
          <div style={{fontSize:32}}>⚠️</div>
          <div style={{fontSize:13,color:"#6b7280",textAlign:"center"}}>{errMsg}</div>
          <button onClick={()=>openRace(selTrack.id,selRace,selTrack.name)} style={{background:"#FFD700",border:"none",borderRadius:8,padding:"10px 20px",color:"#111",fontSize:13,fontWeight:700,cursor:"pointer"}}>もう一度試す</button>
          <button onClick={goBack} style={{background:"#1e2035",border:"1px solid #374151",borderRadius:8,padding:"8px 16px",color:"#9ca3af",fontSize:12,cursor:"pointer"}}>ホームに戻る</button>
        </div>
      )}
      {view==="race"&&raceData&&(
        <div style={{paddingBottom:80,animation:"kfade .25s ease"}}>
          {raceTab==="予想"&&(
            <>
              <div style={{display:"flex",gap:8,padding:"7px 12px",background:"#0a0a14",borderBottom:"1px solid #111827",alignItems:"center"}}>
                {[1,2,3,4].map(r=>(
                  <div key={r} style={{display:"flex",alignItems:"center",gap:3}}>
                    <Mark rank={r}/>
                    <span style={{fontSize:9,color:"#4b5563"}}>{r===1?"本命":r===2?"対抗":r===3?"単穴":"連下"}</span>
                  </div>
                ))}
                <div style={{marginLeft:"auto",fontSize:9,color:"#374151"}}>タップ→詳細</div>
              </div>
              {raceData.analysisNote&&(
                <div style={{padding:"7px 12px",background:"#0c0c18",borderBottom:"1px solid #111827",fontSize:11,color:"#9ca3af"}}>
                  📝 {raceData.analysisNote}
                </div>
              )}
              {horses.map((h,i)=>(
                <HorseRow key={h.num} horse={h} rank={i+1}
                  onTap={()=>{setSelHorse(h);setSelRank(i+1);}}
                />
              ))}
            </>
          )}
          {raceTab==="買い目"&&<BettingTab horses={horses}/>}
        </div>
      )}

      <HorseModal horse={selHorse} rank={selRank} onClose={()=>setSelHorse(null)}/>

      <div style={{position:"fixed",bottom:0,left:0,right:0,background:"#080812",borderTop:"1px solid #111827",display:"flex",paddingBottom:"env(safe-area-inset-bottom,0px)"}}>
        {[
          {icon:"🏠",label:"ホーム",fn:()=>{setView("home");setRaceData(null);setHistory([]);}},
          {icon:"🏟",label:"地方",fn:()=>{handleTabChange("nar");setView("home");setRaceData(null);setHistory([]);}},
          {icon:"🏆",label:"JRA",fn:()=>{handleTabChange("jra");setView("home");setRaceData(null);setHistory([]);}},
        ].map(n=>(
          <button key={n.label} onClick={n.fn} style={{flex:1,padding:"9px 0 10px",background:"none",border:"none",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
            <span style={{fontSize:18}}>{n.icon}</span>
            <span style={{fontSize:9,color:"#4b5563",fontWeight:600}}>{n.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
