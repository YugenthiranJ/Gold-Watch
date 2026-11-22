const $ = (id) => document.getElementById(id);
const OUNCE_GRAMS = 31.1034768;
const DB_KEY = "goldwatch-v1";
let state = { entries: [], alerts: [], adjustment: 0, notified: [] };
let deferredInstall = null;

function loadState() {
  try { const saved = JSON.parse(localStorage.getItem(DB_KEY) || "{}"); state = {...state, ...saved}; }
  catch(e) { console.warn("Could not read local data", e); }
}
function saveState() { localStorage.setItem(DB_KEY, JSON.stringify(state)); }
function money(value, currency="INR", digits=2) {
  if (!Number.isFinite(Number(value))) return "—";
  return new Intl.NumberFormat("en-IN", {style:"currency",currency,minimumFractionDigits:digits,maximumFractionDigits:digits}).format(value);
}
function dateLabel(date) { return new Date(date + "T12:00:00").toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}); }
function calculate(entry) {
  const base24 = (entry.cme * entry.fx / OUNCE_GRAMS) * (1 + (Number(state.adjustment)||0)/100);
  return {24:base24,22:base24*22/24,18:base24*18/24};
}
function latestEntries() {
  const sorted = [...state.entries].sort((a,b)=>a.date.localeCompare(b.date) || a.savedAt.localeCompare(b.savedAt));
  if (!sorted.length) return {previous:null,current:null};
  const current = sorted[sorted.length-1];
  const previous = [...sorted].reverse().find(x=>x.date < current.date) || sorted[sorted.length-2] || null;
  return {previous,current};
}
function showToast(message) {
  $("toast").textContent = message; $("toast").classList.add("show");
  clearTimeout(showToast.timer); showToast.timer=setTimeout(()=>$("toast").classList.remove("show"),2600);
}
function render() {
  const {previous,current}=latestEntries();
  if (!current) {
    $("dataStatus").textContent="Waiting for your first price update";
    $("lastUpdated").textContent="No saved update yet.";
    return renderAlerts();
  }
  const p = calculate(current), old = previous ? calculate(previous) : null;
  const cmeDiff = previous ? current.cme-previous.cme : null;
  $("currentCme").textContent=money(current.cme,"USD");
  $("previousCme").textContent=previous?money(previous.cme,"USD"):"—";
  $("latestCmeSmall").textContent=money(current.cme,"USD");
  $("cmeChange").textContent=previous?`${cmeDiff>=0?"▲":"▼"} ${money(Math.abs(cmeDiff),"USD")} (${(cmeDiff/previous.cme*100).toFixed(2)}%) vs previous saved entry`:"Save another trading day to see the change";
  $("cmeChange").className="change-line "+(cmeDiff===null?"":cmeDiff>=0?"positive":"negative");
  $("current22").textContent=money(p[22]);
  $("today24").textContent=money(p[24]); $("today22").textContent=money(p[22]); $("today18").textContent=money(p[18]);
  $("previous22").textContent=old?money(old[22]):"—"; $("latest22").textContent=money(p[22]);
  if(old){const diff=p[22]-old[22];$("indianChange").textContent=`${diff>=0?"▲":"▼"} ${money(Math.abs(diff))} (${(diff/old[22]*100).toFixed(2)}%) vs previous saved entry`;$("indianChange").className="change-line "+(diff>=0?"positive":"negative");}
  else {$("indianChange").textContent="Save another trading day to see the change";$("indianChange").className="change-line";}
  $("dataStatus").textContent=`Latest saved quote · ${dateLabel(current.date)}`;
  $("lastUpdated").textContent=`Last saved: ${new Date(current.savedAt).toLocaleString("en-IN")} · Quote date: ${dateLabel(current.date)}`;
  $("prevCmeInput").value=previous?previous.cme:"";
  $("prevDateInput").value=previous?previous.date:"";
  $("currentCmeInput").value=current.cme; $("fxInput").value=current.fx; $("quoteDateInput").value=current.date;
  $("adjustmentInput").value=state.adjustment||0;
  renderChart(); renderAlerts(); checkAlerts(current,p);
}
function renderChart() {
  const canvas=$("historyChart"), ctx=canvas.getContext("2d");
  const range=Number($("historyRange").value||7);
  const rows=[...state.entries].sort((a,b)=>a.date.localeCompare(b.date)).slice(-range);
  const empty=$("emptyChart");
  if(!rows.length){empty.style.display="grid";ctx.clearRect(0,0,canvas.width,canvas.height);return;}
  empty.style.display="none";
  const dpr=window.devicePixelRatio||1, rect=canvas.getBoundingClientRect();
  canvas.width=Math.max(300,rect.width*dpr);canvas.height=Math.max(150,rect.height*dpr);
  ctx.scale(dpr,dpr);
  const w=rect.width,h=rect.height,pad={l:45,r:12,t:14,b:27};
  const values=rows.map(r=>calculate(r)[22]), min=Math.min(...values),max=Math.max(...values),span=(max-min)||1;
  ctx.font="10px DM Sans";ctx.strokeStyle="#29364d";ctx.fillStyle="#9ba8bd";ctx.lineWidth=1;
  for(let i=0;i<4;i++){const y=pad.t+(h-pad.t-pad.b)*i/3;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(w-pad.r,y);ctx.stroke();const val=max-span*i/3;ctx.fillText(Math.round(val).toLocaleString("en-IN"),2,y+3);}
  const x=i=>pad.l+(w-pad.l-pad.r)*(rows.length===1?.5:i/(rows.length-1));
  const y=v=>pad.t+(h-pad.t-pad.b)*(max-v)/span;
  ctx.strokeStyle="#e7bd69";ctx.lineWidth=2.5;ctx.beginPath();
  values.forEach((v,i)=>i?ctx.lineTo(x(i),y(v)):ctx.moveTo(x(i),y(v)));ctx.stroke();
  values.forEach((v,i)=>{ctx.fillStyle="#e7bd69";ctx.beginPath();ctx.arc(x(i),y(v),3.5,0,Math.PI*2);ctx.fill();});
  ctx.fillStyle="#9ba8bd";ctx.textAlign="center";
  rows.forEach((r,i)=>{if(rows.length<8||i%Math.ceil(rows.length/6)===0||i===rows.length-1)ctx.fillText(r.date.slice(5),x(i),h-7);});
}
function renderAlerts() {
  $("alertCount").textContent=`${state.alerts.filter(a=>a.enabled).length} active`;
  const list=$("alertsList");
  if(!state.alerts.length){list.innerHTML='<p class="muted small">No alerts configured yet.</p>';return;}
  list.innerHTML="";
  state.alerts.forEach(a=>{
    const div=document.createElement("div");div.className="alert-item";
    const label=a.type==="cme"?"CME USD/oz":`${a.type}K INR/g`;
    const text=document.createElement("span");text.textContent=`${label} ${a.condition==="below"?"below":"above"} ${a.type==="cme"?money(a.target,"USD"):money(a.target)}`;
    const del=document.createElement("button");del.textContent="Remove";del.addEventListener("click",()=>{state.alerts=state.alerts.filter(x=>x.id!==a.id);saveState();renderAlerts();});
    div.append(text,del);list.append(div);
  });
}
function checkAlerts(current, calculated) {
  state.alerts.forEach(a=>{
    const value=a.type==="cme"?current.cme:calculated[Number(a.type)];
    const hit=a.condition==="below"?value<=a.target:value>=a.target;
    const key=`${a.id}:${current.date}:${hit}`;
    if(hit && !state.notified.includes(key)){
      state.notified.push(key); saveState();
      const msg=`Gold Watch: ${a.type==="cme"?"CME gold":a.type+"K gold"} reached ${a.condition} ${a.target}. Current: ${value.toFixed(2)}.`;
      showToast(msg);
      if("Notification" in window && Notification.permission==="granted") new Notification("Gold Watch price alert",{body:msg,icon:"assets/icon.svg"});
    }
  });
}
$("priceForm").addEventListener("submit",e=>{
  e.preventDefault();
  const entry={cme:Number($("currentCmeInput").value),fx:Number($("fxInput").value),date:$("quoteDateInput").value,savedAt:new Date().toISOString()};
  const previousValue=Number($("prevCmeInput").value), previousDate=$("prevDateInput").value;
  if(!(entry.cme>0&&entry.fx>0&&entry.date&&previousValue>0&&previousDate&&previousDate<entry.date)){showToast("Enter valid prices and a previous trading date earlier than the latest quote date.");return;}
  const previousEntry={cme:previousValue,fx:entry.fx,date:previousDate,savedAt:new Date().toISOString(),note:"Previous settlement manually entered"};
  const previousIndex=state.entries.findIndex(x=>x.date===previousDate);
  if(previousIndex>=0)state.entries[previousIndex]=previousEntry;else state.entries.push(previousEntry);
  const existing=state.entries.findIndex(x=>x.date===entry.date);
  if(existing>=0)state.entries[existing]=entry;else state.entries.push(entry);
  state.entries.sort((a,b)=>a.date.localeCompare(b.date));saveState();render();showToast("Price update saved on this device.");
});
$("sampleBtn").addEventListener("click",()=>{
  const today=new Date(), yesterday=new Date(today);yesterday.setDate(today.getDate()-1);
  $("prevCmeInput").value="4050";$("prevDateInput").value=yesterday.toISOString().slice(0,10);$("currentCmeInput").value="4020";$("fxInput").value="89.50";$("quoteDateInput").value=today.toISOString().slice(0,10);
  showToast("Sample values loaded. Save to view the dashboard.");
});
$("saveAdjustment").addEventListener("click",()=>{state.adjustment=Number($("adjustmentInput").value)||0;saveState();render();showToast("Indian market adjustment saved.");});
$("alertForm").addEventListener("submit",async e=>{
  e.preventDefault();
  const target=Number($("alertTarget").value);if(!(target>0)){showToast("Enter a valid target price.");return;}
  const alert={id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),type:$("alertType").value,condition:$("alertCondition").value,target,enabled:true};
  state.alerts.push(alert);saveState();renderAlerts();$("alertTarget").value="";
  if("Notification" in window && Notification.permission==="default"){
    try{await Notification.requestPermission();}catch(e){}
  }
  showToast("Price alert added.");
});
$("historyRange").addEventListener("change",renderChart);
$("exportBtn").addEventListener("click",()=>{
  const lines=["date,cme_usd_per_oz,usd_inr,estimated_24k_inr_g,estimated_22k_inr_g,estimated_18k_inr_g"];
  state.entries.forEach(r=>{const p=calculate(r);lines.push([r.date,r.cme,r.fx,p[24].toFixed(2),p[22].toFixed(2),p[18].toFixed(2)].join(","));});
  download(lines.join("\n"),"goldwatch-history.csv","text/csv");
});
$("importFile").addEventListener("change",async e=>{
  const file=e.target.files[0];if(!file)return;
  const text=await file.text(),rows=text.trim().split(/\r?\n/).slice(1);let count=0;
  rows.forEach(line=>{const [date,cme,fx]=line.split(",");if(date&&Number(cme)>0&&Number(fx)>0){const i=state.entries.findIndex(x=>x.date===date);const item={date,cme:Number(cme),fx:Number(fx),savedAt:new Date().toISOString()};if(i>=0)state.entries[i]=item;else state.entries.push(item);count++;}});
  state.entries.sort((a,b)=>a.date.localeCompare(b.date));saveState();render();showToast(`${count} CSV row(s) imported.`);
});
$("clearBtn").addEventListener("click",()=>{if(confirm("Delete all Gold Watch prices, alerts and settings stored in this browser?")){state={entries:[],alerts:[],adjustment:0,notified:[]};saveState();render();showToast("Local data cleared.");}});
function download(content,name,type){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);}
window.addEventListener("resize",()=>{if(state.entries.length)renderChart();});

// ==========================================
// AUTOMATIC GOLD PRICE INTEGRATION
// ==========================================

const GOLD_API =
    "https://xaudaily.com/readings.en.json?src=gold-watch";

const FX_API =
    "https://api.frankfurter.dev/v2/rates";

async function fetchJSON(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    try {
        const response = await fetch(url, {
            method: "GET",
            cache: "no-store",
            signal: controller.signal
        });

        if (!response.ok) {
            throw new Error(`API returned HTTP ${response.status}`);
        }

        return await response.json();
    } finally {
        clearTimeout(timeout);
    }
}

function validNumber(value) {
    return Number.isFinite(Number(value)) && Number(value) > 0;
}

function previousCalendarDate(dateString, days = 7) {
    const date = new Date(dateString + "T12:00:00Z");
    date.setUTCDate(date.getUTCDate() - days);
    return date.toISOString().slice(0, 10);
}

function findLatestFxOnOrBefore(rows, targetDate) {
    return rows
        .filter(row =>
            row.quote === "INR" &&
            row.date <= targetDate &&
            validNumber(row.rate)
        )
        .sort((a, b) => b.date.localeCompare(a.date))[0];
}

async function loadGoldPrices() {
    const refreshButton = $("refreshBtn");

    if (refreshButton) {
        refreshButton.disabled = true;
        refreshButton.textContent = "Fetching...";
    }

    $("dataStatus").textContent = "Fetching latest market prices...";

    try {
        // 1. Fetch COMEX gold data
        const goldData = await fetchJSON(GOLD_API);

        const gold = goldData?.readings?.gold;
        const live = gold?.live;
        const rows = gold?.rows;

        if (!gold || !live || !Array.isArray(rows)) {
            throw new Error("Unexpected gold API response.");
        }

        if (gold.stale === true) {
            throw new Error("Gold provider reports stale data.");
        }

        const currentGold = Number(live.last);
        const currentDate = live.date;

        if (!validNumber(currentGold) || !currentDate) {
            throw new Error("Invalid latest gold price.");
        }

        // 2. Find previous completed trading-day candle
        const previousRows = rows
            .filter(row =>
                row.d < currentDate &&
                validNumber(row.c)
            )
            .sort((a, b) => b.d.localeCompare(a.d));

        const previousRow = previousRows[0];

        if (!previousRow) {
            throw new Error("Previous trading-day close unavailable.");
        }

        const previousGold = Number(previousRow.c);

        // 3. Fetch historical USD/INR reference rates
        const fromDate = previousCalendarDate(previousRow.d, 7);

        const fxURL =
            `${FX_API}?base=USD&quotes=INR` +
            `&from=${fromDate}&to=${currentDate}`;

        const fxRows = await fetchJSON(fxURL);

        if (!Array.isArray(fxRows) || fxRows.length === 0) {
            throw new Error("USD/INR data unavailable.");
        }

        // 4. Select appropriate FX rates for each gold date
        const currentFx = findLatestFxOnOrBefore(
            fxRows,
            currentDate
        );

        const previousFx = findLatestFxOnOrBefore(
            fxRows,
            previousRow.d
        );

        if (!currentFx || !previousFx) {
            throw new Error("Required USD/INR historical rates unavailable.");
        }

        // 5. Save current and previous market entries
        const savedAt = new Date().toISOString();

        const previousEntry = {
            date: previousRow.d,
            cme: previousGold,
            fx: Number(previousFx.rate),
            savedAt
        };

        const currentEntry = {
            date: currentDate,
            cme: currentGold,
            fx: Number(currentFx.rate),
            savedAt
        };

        function saveEntry(entry) {
            const index = state.entries.findIndex(
                item => item.date === entry.date
            );

            if (index >= 0) {
                state.entries[index] = entry;
            } else {
                state.entries.push(entry);
            }
        }

        saveEntry(previousEntry);
        saveEntry(currentEntry);

        state.entries.sort(
            (a, b) => a.date.localeCompare(b.date)
        );

        // Store source information for display
        state.lastFetch = {
            goldDate: currentDate,
            goldTime: live.time || "",
            goldSource: gold.source || "XAU Daily",
            fxDate: currentFx.date,
            fetchedAt: savedAt
        };

        saveState();

        // 6. Refresh existing dashboard
        render();

        $("dataStatus").textContent =
            `Updated · Gold: ${currentDate} ${live.time || ""} · FX: ${currentFx.date}`;

        showToast("Gold prices updated successfully!");

    } catch (error) {
        console.error("Gold Watch API error:", error);

        $("dataStatus").textContent =
            "Price update failed · " + error.message;

        showToast("Unable to fetch prices. Check your connection.");

    } finally {
        if (refreshButton) {
            refreshButton.disabled = false;
            refreshButton.textContent = "↻ Refresh prices";
        }
    }
}
const INDIA_GOLD_API =
  "https://snapdata.dev/api/v1/gold/in/latest.json";

async function loadIndianGoldRates() {
  const status = document.getElementById("indiaStatus");

  status.textContent = "Fetching Indian gold prices...";

  try {
    const response = await fetch(INDIA_GOLD_API, {
      method: "GET",
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    if (data.dataset !== "gold" || data.scope !== "in") {
      throw new Error("Unexpected Indian gold data");
    }

    if (!data.sources?.some(source => source.id === "ibja")) {
      throw new Error("IBJA source could not be verified");
    }

    const observations = data.observations || [];

    function getRate(purity) {
      const row = observations.find(item =>
        item.instrument === `XAU.${purity}` &&
        item.instrument_id === `XAU.${purity}.INR.G` &&
        item.source === "ibja" &&
        item.is_trading_day === true &&
        Number.isFinite(Number(item.value)) &&
        Number(item.value) > 0
      );

      if (!row) {
        throw new Error(`${purity} rate unavailable`);
      }

      return Number(row.value);
    }

    // Each purity comes directly from the provider.
    const rate24 = getRate("24K");
    const rate22 = getRate("22K");
    const rate18 = getRate("18K");

    function displayRate(id, price) {
      document.getElementById(id).textContent =
        "₹" + price.toLocaleString("en-IN");

      document.getElementById(id + "Eight").textContent =
        "₹" + (price * 8).toLocaleString("en-IN", {
          maximumFractionDigits: 2
        }) + " per 8g";
    }

    displayRate("india24", rate24);
    displayRate("india22", rate22);
    displayRate("india18", rate18);

    status.textContent =
      `Updated: ${data.observations[0].date} · IBJA benchmark`;

    // Save the independently fetched rates locally.
    localStorage.setItem("goldWatchIndianRates", JSON.stringify({
      date: data.observations[0].date,
      rate24,
      rate22,
      rate18,
      fetchedAt: new Date().toISOString()
    }));

  } catch (error) {
    console.error("Indian gold API error:", error);
    status.textContent =
      "Indian rate update failed: " + error.message;
  }
}
// ==========================================
// APPLICATION INITIALIZATION
// ==========================================

loadState();
render();

// Fetch prices automatically whenever the page opens
loadGoldPrices();
loadIndianGoldRates();

$("refreshBtn").addEventListener("click", async () => {
  await Promise.allSettled([
    loadGoldPrices(),
    loadIndianGoldRates()
  ]);
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      const registration =
        await navigator.serviceWorker.register("./sw.js", {
          updateViaCache: "none"
        });

      await registration.update();

      console.log("Gold Watch service worker updated");
    } catch (error) {
      console.error("Service worker error:", error);
    }
  });
}
window.addEventListener("beforeinstallprompt",e=>{e.preventDefault();deferredInstall=e;$("installBtn").classList.remove("hidden");});
$("installBtn").addEventListener("click",async()=>{if(!deferredInstall)return;deferredInstall.prompt();await deferredInstall.userChoice;deferredInstall=null;$("installBtn").classList.add("hidden");});





