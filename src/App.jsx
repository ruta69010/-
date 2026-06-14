import { useState, useEffect, useCallback, useRef, memo } from "react";

// ⚠️ 設定。好きな値に変更してください
const ADMIN_PASSCODE = "Akito092130@";

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
async function getRace(type, date, trackId, raceNum, trackName) {
  try {
    const res = await fetch("/api/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "read", cacheKey: { date, type, trackId, raceNum, trackName } }),
    });
    const data = await res.json();
    if (!res.ok || data?.notReady || !data?.horses) return null;
    return data;
  } catch { return null; }
}

// 管理者用：渡された出走馬データ(生テキスト)を元にAIで予想を生成し、Supabaseへ保存
async function generatePrediction(type, date, trackId, raceNum, trackName, rawText) {
  const isBanei = trackId==="40";
  const label = type==="nar"?(isBanei?"ばんえい(帯広)":`地方 ${trackName}`):`JRA ${trackName}`;
  const sys = `競馬AI。渡された出走馬データから実際の馬名・騎手・調教師・斤量・オッズ・前走成績などを抽出し、それに基づいて分析せよ。データに無い情報の創作・改変は禁止。JSONのみ、前後の説明文は一切不要。各文字列フィールドは指定字数以内で簡潔に。{"raceName":"名","distance":"1400m","surface":"良","analysisNote":"20字以内","horses":[{"num":1,"name":"馬名","jockey":"騎手","trainer":"調教師","weight":55,"bodyWeight":"498(-2)","recentIdx":75,"distIdx":70,"trackIdx":65,"jockeyIdx":80,"trainerIdx":60,"peakIdx":70,"aiScore":73,"odds":3.5,"comment":"20字以内","prevResults":"前走2着","strengths":"8字以内","weaknesses":"8字以内"}]}`;
  const usr = `${date} ${label} 第${raceNum}R\n\n【出走馬データ】\n${rawText}\n\n上記データに基づいてJSONを作成せよ。データに無い項目は妥当な値を補ってよいが、馬名・騎手・調教師・オッズなど実データに含まれる項目は改変しないこと。JSONのみ返せ。`;

  try {
    const res = await fetch("/api/predict", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ system: sys, user: usr, mode: "generate", cacheKey: { date, type, trackId, raceNum, trackName } }),
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
        <div style={{display:"flex",gap:4,fontSize:9}}>
          <span style={{color:"#f97316"}}>近:{horse.recentIdx??"-"}</span>
          <span style={{color:"#4ade80"}}>距:{horse.distIdx??"-"}</span>
          <span style={{color:"#60a5fa"}}>場:{horse.trackIdx??"-"}</span>
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
  const [view,     setView]     = useState("home");
  const [history,  setHistory]  = useState([]);
  const [raceData, setRaceData] = useState(null);
  const [selTrack, setSelTrack] = useState(null);
  const [selRace,  setSelRace]  = useState(null);
  const [selHorse, setSelHorse] = useState(null);
  const [selRank,  setSelRank]  = useState(1);
  const [raceTab,  setRaceTab]  = useState("予想");
  const [errMsg,   setErrMsg]   = useState(null);

  // 本日の開催会場（共有ストレージから読み込み。null=読み込み中）
  const [activeTracks, setActiveTracks] = useState(null);

  // ---- 管理画面用 ----
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [adminPassInput, setAdminPassInput] = useState("");
  const [adminTab,  setAdminTab]  = useState("nar");
  const [adminTrack,setAdminTrack]= useState(null);
  const [adminRaceNum, setAdminRaceNum] = useState(1);
  const [adminText, setAdminText] = useState("");
  const [adminStatus, setAdminStatus] = useState("idle"); // idle | loading | success | error
  const [adminMsg,  setAdminMsg]  = useState("");
  const [adminActiveTracks, setAdminActiveTracks] = useState([]);
  const [activeSaveStatus, setActiveSaveStatus] = useState("idle"); // idle | loading | success

  useEffect(()=>{
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

  // ホーム表示用：本日の開催会場を読み込み
  useEffect(()=>{
    let alive = true;
    setActiveTracks(null);
    fetch(`/api/active-tracks?date=${today}&type=${tab}`)
      .then(r=>r.json())
      .then(data=>{ if(alive) setActiveTracks(Array.isArray(data?.trackIds) ? data.trackIds : []); })
      .catch(()=>{ if(alive) setActiveTracks([]); });
    return ()=>{ alive=false; };
  },[tab, today]);

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

  // タブ切替
  const handleTabChange = useCallback((newTab)=>{
    setTab(newTab);
  },[]);

  const openRace = useCallback(async(trackId, raceNum, trackName)=>{
    setHistory(h=>[...h,{view,raceData,selTrack,selRace}]);
    setSelTrack({id:trackId,name:trackName});
    setSelRace(raceNum);
    setRaceData(null);
    setErrMsg(null);
    setView("loading");
    setRaceTab("予想");
    const data = await getRace(tab, today, trackId, raceNum, trackName);
    if(data){ setRaceData(data); setView("race"); }
    else { setView("notready"); }
  },[tab,today,view,raceData,selTrack,selRace]);

  const horses = raceData?.horses
    ? [...raceData.horses].sort((a,b)=>(b.aiScore??0)-(a.aiScore??0))
    : [];

  const allTracks = tab==="nar" ? NAR_TRACKS : JRA_TRACKS;
  const curTracks = activeTracks ? allTracks.filter(t=>activeTracks.includes(t.trackId)) : [];
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
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{fontSize:10,color:"#4b5563"}}>{today.slice(4,6)}/{today.slice(6,8)}</div>
            {view==="home"&&(
              <button onClick={()=>setView(adminUnlocked?"admin":"adminlock")} style={{background:"none",border:"none",color:"#374151",fontSize:13,cursor:"pointer",padding:0,lineHeight:1}}>⚙</button>
            )}
          </div>
        </div>
        {view==="race"&&raceData&&(
          <div style={{padding:"0 16px 7px",fontSize:11,color:"#9ca3af"}}>
            {selTrack?.name} 第{selRace}R ／ <span style={{color:"#e2e8f0"}}>{raceData.raceName}</span> ／ {raceData.distance} {raceData.surface}
          </div>
        )}
        {view==="home"&&(
          <div style={{display:"flex",borderTop:"1px solid #111827"}}>
            {[{id:"nar",label:"🏟 地方・ばんえい"},{id:"jra",label:"🏆 中央（JRA）"}].map(s=>(
              <button key={s.id} onClick={()=>handleTabChange(s.id)} style={{flex:1,padding:"10px 0",background:"none",border:"none",fontSize:12,fontWeight:700,cursor:"pointer",color:tab===s.id?"#FFD700":"#4b5563",borderBottom:tab===s.id?"2px solid #FFD700":"2px solid transparent"}}>
                {s.label}
              </button>
            ))}
          </div>
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
            value={adminPassInput}
            onChange={e=>setAdminPassInput(e.target.value)}
            onKeyDown={e=>{
              if(e.key==="Enter"){
                if(adminPassInput===ADMIN_PASSCODE){ setAdminUnlocked(true); setAdminPassInput(""); setView("admin"); }
                else { setAdminPassInput(""); }
              }
            }}
            style={{width:"100%",maxWidth:240,padding:"10px 12px",borderRadius:8,border:"1px solid #1e2035",background:"#111827",color:"#f1f5f9",fontSize:14,textAlign:"center"}}
            placeholder="パスコード"
          />
          <button onClick={()=>{
            if(adminPassInput===ADMIN_PASSCODE){ setAdminUnlocked(true); setAdminPassInput(""); setView("admin"); }
            else { setAdminPassInput(""); }
          }} style={{background:"#FFD700",border:"none",borderRadius:8,padding:"10px 24px",color:"#111",fontSize:13,fontWeight:700,cursor:"pointer"}}>解除</button>
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
            <div style={{fontSize:11,color:"#6b7280",marginBottom:6}}>出走馬データ（サイトのテキストをコピペ）</div>
            <textarea
              value={adminText}
              onChange={e=>setAdminText(e.target.value)}
              rows={10}
              placeholder="netkeibaなどの出走表ページのテキストをそのまま貼り付け"
              style={{width:"100%",padding:"10px",borderRadius:8,border:"1px solid #1e2035",background:"#111827",color:"#f1f5f9",fontSize:12,resize:"vertical",fontFamily:"inherit"}}
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

          <button onClick={()=>setView("home")} style={{marginTop:16,width:"100%",background:"none",border:"1px solid #374151",borderRadius:8,padding:"10px",color:"#9ca3af",fontSize:12,cursor:"pointer"}}>ホームに戻る</button>
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
