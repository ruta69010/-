import { useState, useEffect, useCallback, useRef, memo } from "react";

function getToday() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;
}


const NAR_TRACKS = [
  {trackId:"36",trackName:"門別"},{trackId:"15",trackName:"船橋"},
  {trackId:"16",trackName:"大井"},{trackId:"17",trackName:"川崎"},
  {trackId:"14",trackName:"浦和"},{trackId:"22",trackName:"金沢"},
  {trackId:"23",trackName:"笠松"},{trackId:"24",trackName:"名古屋"},
  {trackId:"27",trackName:"園田"},{trackId:"28",trackName:"姫路"},
  {trackId:"31",trackName:"高知"},{trackId:"32",trackName:"佐賀"},
  {trackId:"11",trackName:"水沢"},{trackId:"12",trackName:"盛岡"},
  {trackId:"40",trackName:"帯広",isBanei:true},
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
  banei: ["14:05","14:35","15:05","15:35","16:05","16:35","17:05","17:35","18:05","18:35","19:05","19:35"],
};

const MARKS  = {1:"◎",2:"○",3:"▲",4:"△",5:"★"};
const MARK_C = {
  1:{bg:"#FFD700",tx:"#111"},2:{bg:"#e2e8f0",tx:"#111"},
  3:{bg:"#f97316",tx:"#fff"},4:{bg:"#3b82f6",tx:"#fff"},5:{bg:"#1e2035",tx:"#6b7280"},
};
const FRAME_C = [
  "#eee","#eee","#222","#222","#dc2626","#dc2626",
  "#2563eb","#2563eb","#facc15","#facc15","#16a34a","#16a34a",
  "#f97316","#f97316","#a21caf","#a21caf",
];

// 一般ユーザー用：キャッシュ済みの予想をAPIから取得（AI呼び出しはしない）
// notReadyの場合も含めて最大3回リトライする
async function getRace(type, date, trackId, raceNum, trackName) {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "read", cacheKey: { date, type, trackId, raceNum, trackName } }),
      });
      const data = await res.json();
      if (data?.horses) return data;
      // notReadyまたはエラーの場合、最初の2回はリトライ、3回目はnullを返す
      if (i < 2) await new Promise(r=>setTimeout(r, 1000));
    } catch {
      if (i < 2) await new Promise(r=>setTimeout(r, 1000));
    }
  }
  return null;
}
// 管理者用：渡された出走馬データ(URL or テキスト)を元にAIで予想を生成し、Supabaseへ保存
async function generatePrediction(type, date, trackId, raceNum, trackName, input) {
  try {
    const res = await fetch("/api/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "generate", cacheKey: { date, type, trackId, raceNum, trackName }, input }),
    });
    const data = await res.json();
    if (!res.ok || !data?.horses) {
      return { ok:false, error: data?.error || `HTTP ${res.status}` };
    }
    return { ok:true, data };
  } catch(e) {
    return { ok:false, error: e.message };
  }
}

// 管理者用：パスコードをサーバー側で検証する（パスコード自体はフロントに置かない）
async function verifyAdminPasscode(passcode) {
  try {
    const res = await fetch("/api/admin-auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode }),
    });
    const data = await res.json();
    return !!data?.ok;
  } catch {
    return false;
  }
}

const Spin = memo(({size=36})=>(
  <div style={{width:size,height:size,border:`${size*.09}px solid #1e2035`,borderTop:`${size*.09}px solid #FFD700`,borderRadius:"50%",animation:"kspin .65s linear infinite"}}/>
));

// 指数の色: 0-49=灰, 50-69=白, 70-89=金, 90-109=赤, 110-130=青
function scoreColor(v) {
  if (v == null) return "#4b5563";
  if (v >= 110) return "#60a5fa";
  if (v >= 90)  return "#ef4444";
  if (v >= 70)  return "#FFD700";
  if (v >= 50)  return "#e2e8f0";
  return "#4b5563";
}

const Bar = memo(({value})=>{
  const pct=Math.min(100,Math.max(0,(value??0)/130*100));
  return (
    <div style={{display:"flex",alignItems:"center",gap:3}}>
      <div style={{width:46,height:5,background:"#1e2035",borderRadius:3,overflow:"hidden"}}>
        <div style={{width:`${pct}%`,height:"100%",background:"#4ade80",borderRadius:3}}/>
      </div>
      <span style={{fontSize:10,color:scoreColor(value),fontWeight:700,minWidth:18,textAlign:"right"}}>{value??"-"}</span>
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

const HorseRow = memo(({horse,rank})=>{
  const isMaiden = horse.prevResults==="新馬";
  return (
    <div style={{display:"flex",alignItems:"center",padding:"9px 12px",borderBottom:"1px solid #0f172a",gap:7,position:"relative"}}>
      <Frame num={horse.num}/>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:13,fontWeight:700,color:"#f1f5f9",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{horse.name}</div>
        <div style={{fontSize:10,color:"#4b5563",marginTop:1}}>{horse.jockey} / {horse.weight}kg</div>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:2,alignItems:"flex-end"}}>
        {isMaiden
          ? <div style={{fontSize:9,color:"#4b5563"}}>データなし</div>
          : <div style={{display:"flex",gap:4,fontSize:9}}>
              <span><span style={{color:"#e2e8f0"}}>近:</span><span style={{color:scoreColor(horse.recentIdx)}}>{horse.recentIdx??"-"}</span>{horse.recentIdxMax!=null&&<span style={{color:"#6b7280"}}>(最{horse.recentIdxMax})</span>}</span>
              <span><span style={{color:"#e2e8f0"}}>距:</span><span style={{color:scoreColor(horse.distIdx)}}>{horse.distIdx??"-"}</span></span>
              <span><span style={{color:"#e2e8f0"}}>場:</span><span style={{color:scoreColor(horse.trackIdx)}}>{horse.trackIdx??"-"}</span></span>
            </div>
        }
      </div>
      <div style={{minWidth:30,textAlign:"center",fontSize:15,fontWeight:900,color:scoreColor(horse.aiScore)}}>{horse.aiScore??"-"}</div>
    </div>
  );
});

const RaceListModal = memo(({open,onClose,curTrackObj,times,curSelRace,tab,selDate,onSelect})=>{
  const [info, setInfo] = useState({});
  useEffect(()=>{
    if(!open||!curTrackObj) return;
    let alive = true;
    const raceCount = curTrackObj.isBanei?RACE_TIMES.banei.length:times.length;
    Promise.all(
      Array.from({length:raceCount},(_,i)=>i+1).map(raceNum=>
        fetch("/api/predict",{
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({mode:"read",cacheKey:{date:selDate,type:tab,trackId:curTrackObj.trackId,raceNum,trackName:curTrackObj.trackName}}),
        }).then(r=>r.json()).then(d=>({
          raceNum,
          data: d?.raceName ? {
            title: d.raceName,
            postTime: d.postTime || "",
            distance: d.distance || "",
            trackType: d.trackType || "",
            horseCount: d.horseCount || (d.horses ? d.horses.length : null),
          } : null,
        })).catch(()=>({raceNum,data:null}))
      )
    ).then(results=>{
      if(!alive) return;
      const map = {};
      results.forEach(r=>{ if(r.data) map[r.raceNum]=r.data; });
      setInfo(map);
    });
    return ()=>{ alive=false; };
  },[open,curTrackObj,times,tab,selDate]);

  if(!open||!curTrackObj) return null;
  const raceCount = curTrackObj.isBanei?RACE_TIMES.banei.length:times.length;
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.85)",zIndex:200,display:"flex",alignItems:"flex-end"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{width:"100%",maxWidth:430,margin:"0 auto",maxHeight:"80vh",overflowY:"auto",background:"#0d0d1a",borderRadius:"20px 20px 0 0",border:"1px solid #1e2035",padding:"0 0 24px"}}>
        <div style={{textAlign:"center",padding:"12px 0 0"}}><div style={{width:36,height:4,background:"#1e2035",borderRadius:2,display:"inline-block"}}/></div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 16px"}}>
          <div>
            <span style={{fontSize:14,fontWeight:900,color:"#FFD700"}}>{curTrackObj.trackName}</span>
            {selDate&&<span style={{fontSize:11,color:"#6b7280",marginLeft:8}}>{parseInt(selDate.slice(4,6))}/{parseInt(selDate.slice(6,8))}</span>}
          </div>
          <button onClick={onClose} style={{background:"#1e2035",border:"1px solid #374151",borderRadius:8,padding:"5px 12px",color:"#9ca3af",fontSize:12,fontWeight:700,cursor:"pointer"}}>閉じる</button>
        </div>
        {Array.from({length:raceCount},(_,i)=>i+1).map(raceNum=>{
          const isCur = curSelRace===raceNum;
          const d = info[raceNum];
          return (
            <button key={raceNum} onClick={()=>onSelect(curTrackObj.trackId,raceNum,curTrackObj.trackName)}
              style={{display:"flex",flexDirection:"column",alignItems:"flex-start",width:"100%",padding:"12px 16px",gap:3,background:isCur?"rgba(255,215,0,.08)":"transparent",border:"none",borderBottom:"1px solid #111827",cursor:"pointer",textAlign:"left"}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:13,fontWeight:900,color:isCur?"#FFD700":"#e2e8f0"}}>第{raceNum}R</span>
                {d?.title&&<span style={{fontSize:12,color:isCur?"#FFD700":"#e2e8f0"}}>{d.title}</span>}
              </div>
              {d&&(
                <div style={{fontSize:11,color:"#6b7280"}}>
                  {d.postTime&&<span>{d.postTime}　</span>}
                  {d.trackType&&<span>{d.trackType==="ダート"?"ダ":d.trackType==="芝"?"芝":d.trackType}</span>}
                  {d.distance&&<span>{d.distance}　</span>}
                  {d.horseCount&&<span>{d.horseCount}頭</span>}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
});




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
  const [availableDates, setAvailableDates] = useState([]);
  const [view,     setView]     = useState("home");
  const [history,  setHistory]  = useState([]);
  const [raceData, setRaceData] = useState(null);
  const [selTrack, setSelTrack] = useState(null);
  const [selRace,  setSelRace]  = useState(null);
  const [raceTab,  setRaceTab]  = useState("予想");
  const [errMsg,   setErrMsg]   = useState(null);
  const [deleteRaceStatus, setDeleteRaceStatus] = useState("idle"); // idle | loading | success | error
  const [showRaceList, setShowRaceList] = useState(false);

  // 本日の開催会場（共有ストレージから読み込み。null=読み込み中）
  const [activeTracks, setActiveTracks] = useState(null);

  // ---- 管理画面用 ----
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [adminPassInput, setAdminPassInput] = useState("");
  const [adminAuthChecking, setAdminAuthChecking] = useState(false);
  const [adminTab,  setAdminTab]  = useState("nar");
  const [adminTrack,setAdminTrack]= useState(null);
  const [adminRaceNum, setAdminRaceNum] = useState(1);
  const [adminText, setAdminText] = useState("");
  const [adminStatus, setAdminStatus] = useState("idle");
  const [adminMsg,  setAdminMsg]  = useState("");
  const [adminActiveTracks, setAdminActiveTracks] = useState([]);
  const [activeSaveStatus, setActiveSaveStatus] = useState("idle");
  const [adminDates, setAdminDates] = useState({ nar: [], jra: [] });
  const [deleteDateStatus, setDeleteDateStatus] = useState({});

  useEffect(()=>{
    const t = setInterval(()=>{ if(getToday()!==today) location.reload(); },60000);
    return ()=>clearInterval(t);
  },[]);

  const goBack = useCallback(()=>{
    window.scrollTo(0,0);
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

  // ホーム表示用：選択日の開催会場を読み込み
  useEffect(()=>{
    let alive = true;
    setActiveTracks(null);
    fetch(`/api/active-tracks?date=${selDate}&type=${tab}`)
      .then(r=>r.json())
      .then(data=>{ if(alive) setActiveTracks(Array.isArray(data?.trackIds) ? data.trackIds : []); })
      .catch(()=>{ if(alive) setActiveTracks([]); });
    return ()=>{ alive=false; };
  },[tab, selDate]);

  // ホーム表示用：この種別で予想がある日付一覧を読み込み
  useEffect(()=>{
    let alive = true;
    setAvailableDates([]);
    fetch(`/api/active-tracks?type=${tab}`)
      .then(r=>r.json())
      .then(data=>{ if(alive) setAvailableDates(Array.isArray(data?.dates) ? data.dates : []); })
      .catch(()=>{ if(alive) setAvailableDates([]); });
    return ()=>{ alive=false; };
  },[tab]);

  // 管理画面用：本日の開催会場（編集中リスト）を読み込み
  useEffect(()=>{
    if(view!=="admin") return;
    let alive = true;
    fetch(`/api/active-tracks?date=${today}&type=${adminTab}`)
      .then(r=>r.json())
      .then(data=>{ if(alive) setAdminActiveTracks(Array.isArray(data?.trackIds) ? data.trackIds : []); })
      .catch(()=>{ if(alive) setAdminActiveTracks([]); });
    return ()=>{ alive=false; };
  },[adminTab, view, today]);

  // 管理画面用：日付一覧（地方・JRA両方まとめて取得）
  useEffect(()=>{
    if(view!=="admin") return;
    let alive = true;
    Promise.all([
      fetch(`/api/active-tracks?type=nar`).then(r=>r.json()).catch(()=>({dates:[]})),
      fetch(`/api/active-tracks?type=jra`).then(r=>r.json()).catch(()=>({dates:[]})),
    ]).then(([narData, jraData])=>{
      if(!alive) return;
      setAdminDates({
        nar: Array.isArray(narData?.dates) ? narData.dates : [],
        jra: Array.isArray(jraData?.dates) ? jraData.dates : [],
      });
    });
    return ()=>{ alive=false; };
  },[view]);

  // availableDatesが読み込まれたら最新日付にselDateを同期
  useEffect(()=>{
    if(availableDates.length > 0) {
      setSelDate(availableDates[0]); // 新しい順なので[0]が最新
    }
  },[availableDates]);

  // タブ切替
  const handleTabChange = useCallback((newTab)=>{
    setTab(newTab);
    setSelDate(today);
  },[today]);

  const openRace = useCallback(async(trackId, raceNum, trackName)=>{
    setHistory(h=>[...h,{view,raceData,selTrack,selRace}]);
    setSelTrack({id:trackId,name:trackName});
    setSelRace(raceNum);
    setRaceData(null);
    setErrMsg(null);
    setView("loading");
    setRaceTab("予想");
    setDeleteRaceStatus("idle");
    window.scrollTo(0,0);
    const data = await getRace(tab, selDate, trackId, raceNum, trackName);
    if(data){ setRaceData(data); setView("race"); }
    else { setView("notready"); }
    window.scrollTo(0,0);
  },[tab,selDate,view,raceData,selTrack,selRace]);

  const horses = raceData?.horses
    ? [...raceData.horses].sort((a,b)=>(b.aiScore??0)-(a.aiScore??0))
    : [];

  const allTracks = tab==="nar" ? NAR_TRACKS : JRA_TRACKS;
  const curTracks = activeTracks ? allTracks.filter(t=>activeTracks.includes(t.trackId)) : [];
  const times = tab==="nar" ? RACE_TIMES.nar : RACE_TIMES.jra;

  // 予想済みレースのpostTimeを取得(ホーム画面のボタンに表示するため)
  const [postTimes, setPostTimes] = useState({}); // {trackId_raceNum: postTime}
  useEffect(()=>{
    if(!curTracks.length || !selDate) return;
    let alive = true;
    const promises = curTracks.flatMap(track=>
      Array.from({length: track.isBanei?RACE_TIMES.banei.length:times.length}, (_,i)=>i+1).map(raceNum=>
        fetch("/api/predict",{
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({mode:"read",cacheKey:{date:selDate,type:tab,trackId:track.trackId,raceNum,trackName:track.trackName}}),
        }).then(r=>r.json()).then(data=>{
          if(data?.postTime) return {key:`${track.trackId}_${raceNum}`,time:data.postTime};
          return null;
        }).catch(()=>null)
      )
    );
    Promise.all(promises).then(results=>{
      if(!alive) return;
      const map = {};
      results.forEach(r=>{ if(r) map[r.key]=r.time; });
      setPostTimes(map);
    });
    return ()=>{ alive=false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[curTracks.length, selDate, tab]);

  return (
    <div style={{minHeight:"100vh",background:"#080812",color:"#f1f5f9",fontFamily:"'Noto Sans JP','Hiragino Kaku Gothic ProN',sans-serif",width:"100%",position:"relative",overflowX:"hidden"}}>
      <style>{`
        @keyframes kspin{to{transform:rotate(360deg)}}
        @keyframes kfade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        *{box-sizing:border-box}
        html,body{margin:0;padding:0;width:100%;background:#080812}
        ::-webkit-scrollbar{width:3px}
        ::-webkit-scrollbar-thumb{background:#1e2035;border-radius:3px}
      `}</style>

      <div style={{position:"sticky",top:0,zIndex:50,background:"#080812",borderBottom:"1px solid #111827"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 16px 8px",position:"relative"}}>
          {view!=="home"
            ?<button onClick={goBack} style={{background:"none",border:"none",color:"#FFD700",fontSize:15,cursor:"pointer",fontWeight:700}}>← 戻る</button>
            :<div style={{fontSize:14,fontWeight:900,letterSpacing:1,background:"linear-gradient(90deg,#FFD700,#f97316)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>🏇 うまぜん - AI競馬予想</div>
          }
          <div style={{fontSize:10,color:"#4b5563"}}>{today.slice(4,6)}/{today.slice(6,8)}</div>
          {view==="home"&&(
            <button onClick={()=>setView(adminUnlocked?"admin":"adminlock")}
              style={{position:"absolute",left:"70%",top:"50%",width:28,height:28,transform:"translate(-50%,-50%)",background:"transparent",border:"none",padding:0,margin:0,cursor:"pointer",WebkitTapHighlightColor:"transparent"}}
            />
          )}
        </div>
        {view==="race"&&raceData&&(
          <>
            <div style={{padding:"0 16px 7px",fontSize:11,color:"#9ca3af"}}>
              {selTrack?.name} 第{selRace}R{raceData.postTime?` ${raceData.postTime}`:""} ／ <span style={{color:"#e2e8f0"}}>{raceData.raceName}</span> ／ {raceData.distance} {raceData.surface}
            </div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0 16px 8px",gap:8}}>
              {selRace>1
                ? <button onClick={()=>openRace(selTrack.id,selRace-1,selTrack.name)} style={{background:"#0f172a",border:"1px solid #1e2035",borderRadius:8,padding:"6px 12px",color:"#FFD700",fontSize:12,fontWeight:700,cursor:"pointer"}}>← 第{selRace-1}R</button>
                : <div/>
              }
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                <button onClick={()=>setShowRaceList(true)}
                  style={{background:"#0f172a",border:"1px solid #1e2035",borderRadius:8,padding:"6px 10px",color:"#9ca3af",fontSize:14,cursor:"pointer",lineHeight:1}}>☰</button>
                {adminUnlocked&&(
                  <button onClick={async()=>{
                    if(!window.confirm(`第${selRace}Rの予想を削除しますか？`)) return;
                    setDeleteRaceStatus("loading");
                    const res = await fetch("/api/predict",{
                      method:"POST",
                      headers:{"Content-Type":"application/json"},
                      body:JSON.stringify({mode:"delete",cacheKey:{date:selDate,type:tab,trackId:selTrack.id,raceNum:selRace,trackName:selTrack.name}}),
                    });
                    const d = await res.json();
                    if(d.ok){ setDeleteRaceStatus("success"); setTimeout(()=>{ goBack(); },800); }
                    else { setDeleteRaceStatus("error"); }
                  }}
                    style={{background:deleteRaceStatus==="success"?"#4ade80":deleteRaceStatus==="error"?"#f87171":"#1e2035",border:"1px solid #374151",borderRadius:8,padding:"5px 10px",color:deleteRaceStatus==="success"?"#111":"#9ca3af",fontSize:10,fontWeight:700,cursor:"pointer"}}>
                    {deleteRaceStatus==="loading"?"削除中...":deleteRaceStatus==="success"?"✓ 削除済":deleteRaceStatus==="error"?"エラー":"🗑 削除"}
                  </button>
                )}
              </div>
              {selRace<(selTrack?.id==="40"?RACE_TIMES.banei.length:(tab==="nar"?RACE_TIMES.nar.length:RACE_TIMES.jra.length))
                ? <button onClick={()=>openRace(selTrack.id,selRace+1,selTrack.name)} style={{background:"#0f172a",border:"1px solid #1e2035",borderRadius:8,padding:"6px 12px",color:"#FFD700",fontSize:12,fontWeight:700,cursor:"pointer"}}>第{selRace+1}R →</button>
                : <div/>
              }
            </div>
          </>
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
            {availableDates.length>0&&(
              <div style={{display:"flex",borderTop:"1px solid #111827",background:"#0a0a14",overflowX:"auto"}}>
                {availableDates.slice(0,3).reverse().map(d=>{
                  const label=`${parseInt(d.slice(4,6))}/${parseInt(d.slice(6,8))}`;
                  return (
                    <button key={d} onClick={()=>setSelDate(d)}
                      style={{flex:1,padding:"7px 4px",background:"none",border:"none",fontSize:11,fontWeight:700,cursor:"pointer",color:selDate===d?"#FFD700":"#4b5563",borderBottom:selDate===d?"2px solid #FFD700":"2px solid transparent",whiteSpace:"nowrap"}}>
                      {label}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
        {view==="race"&&(
          <div style={{borderTop:"1px solid #111827",height:2}}/>
        )}
      </div>

      {view==="home"&&(
        <div style={{paddingBottom:80,animation:"kfade .25s ease"}}>
          {activeTracks===null&&(
            <div style={{display:"flex",justifyContent:"center",padding:"60px 0"}}><Spin size={32}/></div>
          )}
          {activeTracks!==null&&curTracks.length===0&&(
            <div style={{textAlign:"center",padding:"60px 24px",color:"#4b5563",fontSize:12,lineHeight:1.8}}>
              本日の{tab==="nar"?"地方・ばんえい":"JRA"}開催情報は<br/>まだ設定されていません
            </div>
          )}
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
                  const pt = postTimes[`${track.trackId}_${raceNum}`];
                  return (
                    <button key={raceNum} onClick={()=>openRace(track.trackId,raceNum,track.trackName)}
                      style={{background:"#0f172a",border:"1px solid #1e2035",borderRadius:8,padding:"8px 6px",cursor:"pointer",textAlign:"center"}}>
                      <div style={{fontSize:13,fontWeight:700,color:"#e2e8f0"}}>{raceNum}R</div>
                      {pt&&<div style={{fontSize:9,color:"#9ca3af",marginTop:2}}>{pt}</div>}
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
            <div style={{fontSize:15,color:"#e2e8f0",fontWeight:700}}>AI予想を確認中</div>
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

      {view==="notready"&&(
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"60vh",gap:12,padding:"0 24px"}}>
          <div style={{fontSize:32}}>🕐</div>
          <div style={{fontSize:14,color:"#e2e8f0",fontWeight:700}}>予想準備中</div>
          <div style={{fontSize:12,color:"#6b7280",textAlign:"center"}}>{selTrack?.name} 第{selRace}Rの予想はまだ公開されていません。<br/>準備が整うまでお待ちください。</div>
          <button onClick={goBack} style={{background:"#1e2035",border:"1px solid #374151",borderRadius:8,padding:"8px 16px",color:"#9ca3af",fontSize:12,cursor:"pointer"}}>ホームに戻る</button>
        </div>
      )}

      {view==="adminlock"&&(
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",minHeight:"60vh",gap:14,padding:"0 24px"}}>
          <div style={{fontSize:28}}>🔒</div>
          <div style={{fontSize:13,color:"#9ca3af"}}>管理者用パスコード</div>
          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            value={adminPassInput}
            onChange={e=>setAdminPassInput(e.target.value)}
            onKeyDown={async e=>{
              if(e.key==="Enter" && !adminAuthChecking){
                setAdminAuthChecking(true);
                const ok = await verifyAdminPasscode(adminPassInput);
                setAdminAuthChecking(false);
                if(ok){ setAdminUnlocked(true); setAdminPassInput(""); setView("admin"); }
                else { setAdminPassInput(""); }
              }
            }}
            style={{width:"100%",maxWidth:240,padding:"10px 12px",borderRadius:8,border:"1px solid #1e2035",background:"#111827",color:"#f1f5f9",fontSize:16,textAlign:"center"}}
            placeholder="パスコード"
          />
          <button disabled={adminAuthChecking} onClick={async()=>{
            if(adminAuthChecking) return;
            setAdminAuthChecking(true);
            const ok = await verifyAdminPasscode(adminPassInput);
            setAdminAuthChecking(false);
            if(ok){ setAdminUnlocked(true); setAdminPassInput(""); setView("admin"); }
            else { setAdminPassInput(""); }
          }} style={{background:"#FFD700",border:"none",borderRadius:8,padding:"10px 24px",color:"#111",fontSize:13,fontWeight:700,cursor:"pointer",opacity:adminAuthChecking?0.6:1}}>
            {adminAuthChecking?"確認中...":"解除"}
          </button>
        </div>
      )}

      {view==="admin"&&(
        <div style={{padding:"14px 16px 90px",animation:"kfade .25s ease"}}>
          <div style={{fontSize:13,fontWeight:900,color:"#FFD700",marginBottom:4}}>🔧 予想生成（管理者用）</div>
          <div style={{fontSize:10,color:"#6b7280",marginBottom:14}}>※生成した予想は全ユーザーに共有されます</div>

          <div style={{display:"flex",gap:8,marginBottom:14}}>
            {[{id:"nar",label:"地方・ばんえい"},{id:"jra",label:"JRA"}].map(s=>(
              <button key={s.id} onClick={()=>{ setAdminTab(s.id); setAdminTrack(null); }}
                style={{flex:1,padding:"8px 0",borderRadius:8,border:"1px solid #1e2035",background:adminTab===s.id?"#FFD700":"#111827",color:adminTab===s.id?"#111":"#9ca3af",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                {s.label}
              </button>
            ))}
          </div>

          <div style={{marginBottom:18,padding:"12px",borderRadius:10,border:"1px solid #1e2035",background:"#0c0c18"}}>
            <div style={{fontSize:11,color:"#6b7280",marginBottom:8}}>本日の開催会場（タップで選択）</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10}}>
              {(adminTab==="nar"?NAR_TRACKS:JRA_TRACKS).map(t=>{
                const on = adminActiveTracks.includes(t.trackId);
                return (
                  <button key={t.trackId} onClick={()=>{
                    setAdminActiveTracks(prev=>prev.includes(t.trackId)?prev.filter(id=>id!==t.trackId):[...prev,t.trackId]);
                  }}
                    style={{padding:"6px 12px",borderRadius:8,border:on?"1px solid #FFD700":"1px solid #1e2035",background:on?"rgba(255,215,0,.12)":"#111827",color:on?"#FFD700":"#6b7280",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                    {on?"✓ ":""}{t.trackName}
                  </button>
                );
              })}
            </div>
            <button onClick={async()=>{
              setActiveSaveStatus("loading");
              try {
                await fetch("/api/active-tracks", {
                  method:"POST",
                  headers:{"Content-Type":"application/json"},
                  body: JSON.stringify({ date: today, type: adminTab, trackIds: adminActiveTracks }),
                });
                setActiveTracks(prev=> tab===adminTab ? adminActiveTracks : prev);
                setActiveSaveStatus("success");
              } catch {
                setActiveSaveStatus("idle");
              }
              setTimeout(()=>setActiveSaveStatus("idle"),1500);
            }} style={{width:"100%",padding:"9px",background:activeSaveStatus==="success"?"#4ade80":"#1e2035",border:"1px solid #374151",borderRadius:8,color:activeSaveStatus==="success"?"#111":"#e2e8f0",fontSize:12,fontWeight:700,cursor:"pointer"}}>
              {activeSaveStatus==="loading"?"保存中...":activeSaveStatus==="success"?"✓ 保存しました":"開催会場を保存"}
            </button>
          </div>

          <div style={{marginBottom:12}}>
            <div style={{fontSize:11,color:"#6b7280",marginBottom:6}}>予想を生成する競馬場</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {(adminTab==="nar"?NAR_TRACKS:JRA_TRACKS).map(t=>(
                <button key={t.trackId} onClick={()=>setAdminTrack(t)}
                  style={{padding:"6px 12px",borderRadius:8,border:"1px solid #1e2035",background:adminTrack?.trackId===t.trackId?"#FFD700":"#111827",color:adminTrack?.trackId===t.trackId?"#111":"#9ca3af",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                  {t.trackName}
                </button>
              ))}
            </div>
          </div>

          <div style={{marginBottom:12}}>
            <div style={{fontSize:11,color:"#6b7280",marginBottom:6}}>レース番号</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {Array.from({length:12},(_,i)=>i+1).map(n=>(
                <button key={n} onClick={()=>setAdminRaceNum(n)}
                  style={{width:36,height:36,borderRadius:8,border:"1px solid #1e2035",background:adminRaceNum===n?"#FFD700":"#111827",color:adminRaceNum===n?"#111":"#9ca3af",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div style={{marginBottom:12}}>
            <div style={{fontSize:11,color:"#6b7280",marginBottom:6}}>出走馬データ（出走表のURL、またはページのテキストを貼り付け）</div>
            <textarea
              value={adminText}
              onChange={e=>setAdminText(e.target.value)}
              rows={6}
              placeholder="例: https://nar.netkeiba.com/race/shutuba.html?race_id=...&#10;またはページ本文のテキストを貼り付け"
              style={{width:"100%",padding:"10px",borderRadius:8,border:"1px solid #1e2035",background:"#111827",color:"#f1f5f9",fontSize:16,resize:"vertical",fontFamily:"inherit"}}
            />
          </div>

          <button
            disabled={!adminTrack||!adminText.trim()||adminStatus==="loading"}
            onClick={async()=>{
              setAdminStatus("loading");
              setAdminMsg("");
              const r = await generatePrediction(adminTab, today, adminTrack.trackId, adminRaceNum, adminTrack.trackName, adminText.trim());
              if(r.ok){
                setAdminStatus("success");
                setAdminMsg(`✅ ${r.data.raceName}（${r.data.horses.length}頭）を保存しました`);
              } else {
                setAdminStatus("error");
                setAdminMsg(`❌ ${r.error}`);
              }
            }}
            style={{width:"100%",padding:"13px",background:adminStatus==="loading"?"#374151":"linear-gradient(135deg,#FFD700,#f59e0b)",border:"none",borderRadius:10,fontSize:14,fontWeight:700,color:"#111",cursor:(!adminTrack||!adminText.trim())?"default":"pointer",opacity:(!adminTrack||!adminText.trim())?0.5:1}}>
            {adminStatus==="loading"?"生成中...":"予想を生成して保存"}
          </button>

          {adminMsg&&(
            <div style={{marginTop:10,padding:"10px 12px",borderRadius:8,background:adminStatus==="success"?"rgba(74,222,128,.08)":"rgba(248,113,113,.08)",border:`1px solid ${adminStatus==="success"?"rgba(74,222,128,.25)":"rgba(248,113,113,.25)"}`,fontSize:12,color:adminStatus==="success"?"#4ade80":"#f87171"}}>
              {adminMsg}
            </div>
          )}

          {(adminDates.nar.length>0 || adminDates.jra.length>0)&&(
            <div style={{marginBottom:16,padding:"12px",borderRadius:10,border:"1px solid #374151",background:"#0c0c18"}}>
              <div style={{fontSize:11,color:"#6b7280",marginBottom:8}}>📅 日付ごとの予想を削除</div>

              {adminDates.nar.length>0&&(
                <div style={{marginBottom:12}}>
                  <div style={{fontSize:10,color:"#FFD700",fontWeight:700,marginBottom:4}}>地方・ばんえい</div>
                  {adminDates.nar.map(d=>{
                    const label=`${parseInt(d.slice(4,6))}/${parseInt(d.slice(6,8))}`;
                    const key=`nar_${d}`;
                    const st=deleteDateStatus[key]||"idle";
                    return (
                      <div key={key} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #111827"}}>
                        <span style={{fontSize:12,color:"#9ca3af"}}>{d===today?"当日":label}</span>
                        <button onClick={async()=>{
                          if(!window.confirm(`地方・ばんえい ${label}の予想・開催会場を全削除しますか？`)) return;
                          setDeleteDateStatus(prev=>({...prev,[key]:"loading"}));
                          const res = await fetch("/api/active-tracks",{
                            method:"DELETE",
                            headers:{"Content-Type":"application/json"},
                            body:JSON.stringify({date:d,type:"nar"}),
                          });
                          const data = await res.json();
                          if(data.ok){
                            setDeleteDateStatus(prev=>({...prev,[key]:"success"}));
                            setAdminDates(prev=>({...prev,nar:prev.nar.filter(x=>x!==d)}));
                          } else {
                            setDeleteDateStatus(prev=>({...prev,[key]:"error"}));
                          }
                        }}
                          style={{background:st==="success"?"#4ade80":st==="error"?"#f87171":"#1e2035",border:"1px solid #374151",borderRadius:8,padding:"5px 12px",color:st==="success"?"#111":"#9ca3af",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                          {st==="loading"?"削除中...":st==="success"?"✓ 削除済":st==="error"?"エラー":"🗑 削除"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {adminDates.jra.length>0&&(
                <div>
                  <div style={{fontSize:10,color:"#FFD700",fontWeight:700,marginBottom:4}}>JRA</div>
                  {adminDates.jra.map(d=>{
                    const label=`${parseInt(d.slice(4,6))}/${parseInt(d.slice(6,8))}`;
                    const key=`jra_${d}`;
                    const st=deleteDateStatus[key]||"idle";
                    return (
                      <div key={key} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 0",borderBottom:"1px solid #111827"}}>
                        <span style={{fontSize:12,color:"#9ca3af"}}>{d===today?"当日":label}</span>
                        <button onClick={async()=>{
                          if(!window.confirm(`JRA ${label}の予想・開催会場を全削除しますか？`)) return;
                          setDeleteDateStatus(prev=>({...prev,[key]:"loading"}));
                          const res = await fetch("/api/active-tracks",{
                            method:"DELETE",
                            headers:{"Content-Type":"application/json"},
                            body:JSON.stringify({date:d,type:"jra"}),
                          });
                          const data = await res.json();
                          if(data.ok){
                            setDeleteDateStatus(prev=>({...prev,[key]:"success"}));
                            setAdminDates(prev=>({...prev,jra:prev.jra.filter(x=>x!==d)}));
                          } else {
                            setDeleteDateStatus(prev=>({...prev,[key]:"error"}));
                          }
                        }}
                          style={{background:st==="success"?"#4ade80":st==="error"?"#f87171":"#1e2035",border:"1px solid #374151",borderRadius:8,padding:"5px 12px",color:st==="success"?"#111":"#9ca3af",fontSize:11,fontWeight:700,cursor:"pointer"}}>
                          {st==="loading"?"削除中...":st==="success"?"✓ 削除済":st==="error"?"エラー":"🗑 削除"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <button onClick={()=>setView("home")} style={{marginTop:16,width:"100%",background:"none",border:"1px solid #374151",borderRadius:8,padding:"10px",color:"#9ca3af",fontSize:12,cursor:"pointer"}}>ホームに戻る</button>
        </div>
      )}

      {view==="race"&&raceData&&(
        <div style={{paddingBottom:80,animation:"kfade .25s ease"}}>
          {raceTab==="予想"&&(
            <>
              {horses.map((h,i)=>(
                <HorseRow key={h.num} horse={h} rank={i+1}/>
              ))}
            </>
          )}
        </div>
      )}

      <RaceListModal
        open={showRaceList}
        onClose={()=>setShowRaceList(false)}
        curTrackObj={selTrack ? (tab==="nar"?NAR_TRACKS:JRA_TRACKS).find(t=>t.trackId===selTrack.id) : null}
        times={tab==="nar"?RACE_TIMES.nar:RACE_TIMES.jra}
        curSelRace={selRace}
        tab={tab}
        selDate={selDate}
        onSelect={(trackId,raceNum,trackName)=>{
          setShowRaceList(false);
          openRace(trackId,raceNum,trackName);
        }}
      />

      <div style={{position:"fixed",bottom:0,left:0,right:0,background:"#080812",borderTop:"1px solid #111827",display:"flex",paddingBottom:"env(safe-area-inset-bottom,0px)"}}>
        {[
          {icon:"🏠",label:"ホーム",fn:()=>{window.scrollTo(0,0);setView("home");setRaceData(null);setHistory([]);}},
          {icon:"🏟",label:"地方",fn:()=>{window.scrollTo(0,0);handleTabChange("nar");setView("home");setRaceData(null);setHistory([]);}},
          {icon:"🏆",label:"JRA",fn:()=>{window.scrollTo(0,0);handleTabChange("jra");setView("home");setRaceData(null);setHistory([]);}},
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
