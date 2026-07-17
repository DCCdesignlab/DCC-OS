
const API_BASE = "https://dcc-os-api.daviscountertops309.workers.dev";
function apiUrl(path){
  return API_BASE + path;
}


const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
/* ============================================================
   DCC Project Intelligence
   This becomes the master description of every project.
   AI, Estimators, Quotes and Renderings all read from here.
============================================================ */

const EMPTY_PROJECT={
    drawing:null,
    rooms:[],
    countertops:[],
    backsplashes:[],
    walls:[],
    showers:[],
    islands:[],
    sinks:[],
    appliances:[],
    notes:"",
    renderPrompt:"",
    aiSummary:"",
    lastAIUpdate:null
};
const pricingDefaults={counterLabor:35,ledLabor:35,fiberLabor:50,deepLabor:50,actualLaborRate:35,epoxyKit:260,epoxyUsableOz:250,polyKit:280,polyUsableOz:250,colorOzSqFt:5,polyOzSqFt:13,topCoatKit:80,topCoatCoverage:50,deepKit:260,deepOz:375,acrylic:200,ledStrip:50,controller:65,psu:130,plywood:45,suppliesPct:5,overheadPct:5,taxPct:10,substrate:150,substrateUsableSqFt:16,mileageRate:0.68,freeOneWayMiles:30,defaultRoundTrips:3};
const defaults={customerName:"",phone:"",email:"",estimateNo:"DCC-2026-",projectName:"",address:"",oneWayMiles:0,roundTrips:3,mileageLastAddress:"",finishSystem:"Polykote",depositPct:50,laborDiscountPct:0,salesperson:"Summer",jobStatus:"Draft Quote",notes:"",designNotes:"",pieces:Array.from({length:8},(_,i)=>({name:`Counter ${i+1}`,surfaceType:"Horizontal",length:"",width:25.25,backsplash:false,backsplashHeight:4})),deep:{enabled:false,type:"Straight",length:"",width:"",diameter:"",thickness:1,manualSqFt:""},universal:{enabled:false,manualSqFt:"",laborSqFt:"",materialAllowance:0,laborRate:35,epoxyKits:0,polyKits:0,topCoatKits:0,substrateSheets:0,description:"",customerSuppliedWood:false,embeddedItems:false},timeEntries:[],activeTimer:null,backlit:{enabled:false,orientation:"Vertical",length:48,height:48,spacing:3,acrylicSheets:1,controllerQty:1,controllerCost:65,psuQty:1,psuCost:130,fiberPoints:0,fiberKitCost:0},beforePhoto:"",conceptPhoto:""};
function clone(v){return JSON.parse(JSON.stringify(v))}
let state=Object.assign(clone(defaults),JSON.parse(localStorage.getItem("dcc-os-state")||"null")||{});

state.project=Object.assign(
    clone(EMPTY_PROJECT),
    state.project||{}
);
state.deep=Object.assign({},defaults.deep,state.deep||{});state.universal=Object.assign({},defaults.universal,state.universal||{});state.timeEntries=state.timeEntries||[];state.backlit=Object.assign({},defaults.backlit,state.backlit||{});state.pieces=state.pieces?.length?state.pieces:clone(defaults.pieces);
state.pieces=state.pieces.map((p,i)=>({name:p.name||`Piece ${i+1}`,surfaceType:p.surfaceType||(p.vertical?"Horizontal":"Horizontal"),length:p.length??"",width:p.width===""||p.width==null?25.25:p.width,backsplash:p.backsplash??(!!p.vertical),backsplashHeight:p.backsplashHeight??(+p.vertical||4)}));
let pricing=Object.assign({},pricingDefaults,JSON.parse(localStorage.getItem("dcc-os-pricing")||"null")||{});
async function analyzeProjectDrawing(file){

    const project = clone(EMPTY_PROJECT);

    project.drawing = {
        name:file.name,
        uploaded:new Date().toISOString()
    };

    project.aiSummary = "Analyzing drawing...";
    project.lastAIUpdate = new Date().toISOString();

    state.project = project;
    save();

    return project;
}
function save(){localStorage.setItem("dcc-os-state",JSON.stringify(state))}
function savePricing(){localStorage.setItem("dcc-os-pricing",JSON.stringify(pricing))}
function jobs(){
    const list=JSON.parse(localStorage.getItem("dcc-os-jobs")||"[]");

    return list.map(job=>({
        ...job,
        project:Object.assign(
            clone(EMPTY_PROJECT),
            job.project||{}
        )
    }));
}
function saveJobs(v){localStorage.setItem("dcc-os-jobs",JSON.stringify(v))}
async function fetchJobCloud(pathOptions, options={}){
 let lastErr;
 for(const path of pathOptions){
  try{
   const r=await fetch(apiUrl(path)+(options.method?"":((path.includes("?")?"&":"?")+"ts="+Date.now())),Object.assign({cache:"no-store"},options));
   if(r.ok)return r;
   lastErr=new Error(`Cloud route ${path} returned ${r.status}`);
  }catch(e){lastErr=e}
 }
 throw lastErr||new Error("Cloud unavailable");
}
async function syncJobsFromCloud(){
 try{
  // Push every locally saved job first. This migrates jobs that were created
  // before cloud sync worked, so a second device can see the full Job Board.
  const localBefore=jobs();
  for(const snap of localBefore){
   try{await saveJobToCloud(snap)}catch(e){console.warn("Local job still pending cloud sync:",snap.id,e)}
  }

  const r=await fetchJobCloud(["/api/jobs","/jobs"]);
  const raw=await r.json();
  const rows=Array.isArray(raw)?raw:(raw.jobs||raw.results||raw.data||[]);
  const cloud=rows.map(row=>{
   let data=row.data??row.payload??row.job_data;
   if(typeof data==="string"){try{data=JSON.parse(data)}catch{data={}}}
   const snap=(data&&data.state)?data:{state:(data||{}),id:row.id,total:Number(row.total||0),updated:row.updated_at||row.updated};
   return {id:String(row.id||snap.id||""),updated:snap.updated||row.updated_at||row.updated||"",state:snap.state||{},total:Number(snap.total??row.total??0)};
  }).filter(j=>j.id);

  const merged=new Map();
  [...localBefore,...cloud].forEach(j=>{
   const old=merged.get(j.id);
   if(!old||new Date(j.updated||0)>=new Date(old.updated||0))merged.set(j.id,j);
  });
  const all=[...merged.values()].sort((a,b)=>new Date(b.updated||0)-new Date(a.updated||0));
  saveJobs(all);
  if(state._jobId){
   const active=all.find(j=>j.id===state._jobId);
   if(active&&new Date(active.updated||0)>new Date(state._cloudUpdated||0)){
    state=clone(active.state);state._cloudUpdated=active.updated;save();
   }
  }
  if($('#savedJobs'))drawSavedJobs();if($('#kanban'))drawKanban();
  return true;
 }catch(e){console.warn("Using local job cache:",e);return false}
}
async function saveJobToCloud(snap){
 const payload={id:snap.id,customer_name:snap.state.customerName||"",project_name:snap.state.projectName||"",status:snap.state.jobStatus||"Draft Quote",total:snap.total,data:snap};
 let r;
 try{r=await fetchJobCloud(["/api/jobs"],{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)})}
 catch(e){r=await fetchJobCloud(["/jobs/"+encodeURIComponent(snap.id)],{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)})}
 const result=await r.json();
 const serverUpdated=result.updated_at||result.updated||snap.updated;
 snap.updated=serverUpdated;snap.state._cloudUpdated=serverUpdated;
 const all=jobs(),ix=all.findIndex(j=>j.id===snap.id);
 if(ix>=0)all[ix]=clone(snap);else all.unshift(clone(snap));
 saveJobs(all);
 if(state._jobId===snap.id){state._cloudUpdated=serverUpdated;save()}
 return result;
}
async function deleteJobFromCloud(id){
 const r=await fetchJobCloud(["/api/jobs/"+encodeURIComponent(id),"/jobs/"+encodeURIComponent(id)],{method:"DELETE"});
 return r.json();
}

async function syncSettingsFromCloud(){
 try{
  const r=await fetch(apiUrl("/api/settings"),{cache:"no-store"});if(!r.ok)throw new Error("Cloud settings unavailable");
  const cloud=await r.json();
  if(cloud.pricing&&typeof cloud.pricing==="object"){pricing=Object.assign({},pricingDefaults,cloud.pricing);savePricing()}
  return true;
 }catch(e){console.warn("Using local pricing cache:",e);return false}
}
async function savePricingToCloud(){
 try{
  const r=await fetch(apiUrl("/api/settings"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({key:"pricing",data:pricing})});
  if(!r.ok)throw new Error("Cloud pricing save failed");return r.json();
 }catch(e){console.warn(e);return null}
}
async function refreshCloudData(){
 await Promise.all([syncJobsFromCloud(),syncTimeFromCloud(),syncSettingsFromCloud()]);
 if($("#savedJobs"))drawSavedJobs();if($("#kanban"))drawKanban();syncDerivedScreens();
}

async function syncTimeFromCloud(){
 try{
  const r=await fetch(apiUrl("/api/time"),{cache:"no-store"});if(!r.ok)throw new Error("Cloud time unavailable");
  const rows=await r.json();
  const entries=(rows||[]).map(x=>({id:x.id,jobId:x.job_id||"",worker:x.worker||"",workType:x.work_type||"",start:x.start_time||"",end:x.end_time||"",hours:Number(x.hours||0),note:x.note||"",updated:x.updated_at||""}));
  localStorage.setItem("dcc-os-time",JSON.stringify(entries));
  const all=jobs();all.forEach(j=>{j.state.timeEntries=entries.filter(e=>e.jobId===j.id)});saveJobs(all);
  if(state._jobId)state.timeEntries=entries.filter(e=>e.jobId===state._jobId);
  return entries;
 }catch(e){console.warn("Using local time cache:",e);return JSON.parse(localStorage.getItem("dcc-os-time")||"[]")}
}
async function saveTimeEntryToCloud(entry){
 const payload={id:entry.id||crypto.randomUUID(),job_id:entry.jobId||state._jobId||"",worker:entry.worker||"",work_type:entry.workType||"",start_time:entry.start||"",end_time:entry.end||"",hours:Number(entry.hours||0),note:entry.note||""};
 const r=await fetch(apiUrl("/api/time"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
 if(!r.ok)throw new Error("Cloud time save failed");return r.json();
}

function money(n){return(Number(n)||0).toLocaleString(undefined,{style:"currency",currency:"USD",maximumFractionDigits:2})}
function num(n){return(Number(n)||0).toLocaleString(undefined,{maximumFractionDigits:2})}

function n(v){return Number(v||0)||0}
function projectMetrics(){
 const c=calcBase();
 return Object.assign({},c,{
  counterSqft:n(c.counterSqFt||0),
  verticalSqft:n(c.backSqFt||0),
  deepSqft:n(c.deepSqFt||0),
  riverSqft:n(c.universalSqFt||0),
  lightSqft:n(c.backlitSqFt||0),
  totalSqft:n(c.counterSqFt||0)+n(c.backSqFt||0)+n(c.deepSqFt||0)+n(c.universalSqFt||0)+n(c.backlitSqFt||0)
 });
}
function purchaseRows(){
 const c=calcBase(), rows=[];
 const add=(item,qty,unit,unitCost,note)=>{qty=Math.ceil(n(qty));if(qty>0)rows.push({item,qty,unit,unitCost:n(unitCost),cost:qty*n(unitCost),note})};
 add("Epoxy 2 Gal Kit",c.colorKits+c.universalEpoxyKits,"kit",pricing.epoxyKit,"Countertop + Universal / River");
 add("Polykote 2 Gal Kit",c.polyKits+c.universalPolyKits,"kit",pricing.polyKit,"Countertop + Universal / River");
 add("Top Coat Kit",c.topCoatKits+c.universalTopCoatKits,"kit",pricing.topCoatKit,"All finished surface modules");
 add("Extira Sheet",c.substrateSheets+c.universalSubstrateSheets+c.backlitExtiraSheets,"sheet",pricing.substrate,"Countertop + Universal / River + horizontal lighting");
 add("Deep Pour 3 Gal Kit",c.deepKits,"kit",pricing.deepKit,"375 usable oz per kit; full kits round up");
 add("WS2815 LED Strip",c.ledStrips,"16 ft strip",pricing.ledStrip,"Backlit / lighting module");
 add("SP608E Controller",c.controllerQty,"each",pricing.controller,"Backlit / lighting module");
 add("Power Supply",c.psuQty,"each",pricing.psu,"Backlit / lighting module");
 add("Acrylic Sheet",c.acrylicSheets,"sheet",pricing.acrylic,"Backlit face panels");
 add("1/2 Plywood LED Board",c.plywoodSheets,"sheet",pricing.plywood,"Vertical LED substrate");
 if(c.fiberKitCost>0)rows.push({item:"Fiber Optic Kit / Engine",qty:1,unit:"job",unitCost:c.fiberKitCost,cost:c.fiberKitCost,note:"Fiber material / engine allowance"});
 if(c.universalMaterials>0)rows.push({item:"Universal Material Allowance",qty:1,unit:"allowance",unitCost:c.universalMaterials,cost:c.universalMaterials,note:"Manual specialty material allowance"});
 if(c.pre>0){add("Hardware / Fasteners",1,"job",0,"Production reminder");add("Adhesive / Silicone",1,"job",0,"Production reminder");add("Sandpaper / Consumables",1,"job",0,"Production reminder")}
 if(c.supplies>0)rows.push({item:"Shop Supplies",qty:1,unit:"allowance",unitCost:c.supplies,cost:c.supplies,note:`${pricing.suppliesPct}% estimator allowance`});
 return rows;
}
function renderQuoteSummary(){
 const el=$("#quoteAutoSummary"); if(!el)return;
 const m=projectMetrics();
 el.innerHTML=`<div class="metrics">
 <div class="metric"><span>Project Total</span><b>${money(m.total)}</b></div>
 <div class="metric"><span>Deposit Due</span><b>${money(m.deposit)}</b></div>
 <div class="metric"><span>Balance</span><b>${money(m.balance)}</b></div>
 <div class="metric"><span>Total Sq Ft</span><b>${m.totalSqft.toFixed(1)}</b></div>
 </div><div class="saved-job"><div><strong>${esc(state.customerName||"Customer")}</strong><span>${esc(state.projectName||"Project")} · ${esc(state.finishSystem||"DCC Finish")}</span></div><b>${money(m.total)}</b></div>`;
}
function renderPurchaseSummary(){
 const el=$("#purchaseAutoList"); if(!el)return;
 const rows=purchaseRows(), total=rows.reduce((a,r)=>a+n(r.cost),0);
 el.innerHTML=rows.length?`<div class="table-wrap"><table><thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th>Est. Cost</th><th>Note</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.item)}</td><td>${r.qty}</td><td>${esc(r.unit)}</td><td>${money(r.cost)}</td><td>${esc(r.note)}</td></tr>`).join("")}</tbody><tfoot><tr><th colspan="3">Estimated Purchase Total</th><th>${money(total)}</th><th></th></tr></tfoot></table></div>`:'<p class="note">No purchase items yet. Add project measurements or modules.</p>';
}
function syncDerivedScreens(){renderQuoteSummary();renderPurchaseSummary()}

function calcBase(){
 let topSqFt=0,vertSqFt=0;
 for(const p of state.pieces){const L=n(p.length),W=n(p.width);if(p.surfaceType==="Vertical"){if(L>0&&W>0)vertSqFt+=(L*W)/144}else{if(L>0&&W>0)topSqFt+=(L*W)/144;if(p.backsplash&&L>0&&n(p.backsplashHeight)>0)vertSqFt+=(L*n(p.backsplashHeight))/144}}
 const coated=topSqFt+vertSqFt,discount=1-n(state.laborDiscountPct)/100;
 const colorKits=coated?Math.ceil((coated*pricing.colorOzSqFt)/pricing.epoxyUsableOz):0;
 const polyKits=state.finishSystem==="Polykote"&&coated?Math.ceil((coated*pricing.polyOzSqFt)/pricing.polyUsableOz):0;
 const topCoatKits=coated?Math.ceil(coated/pricing.topCoatCoverage):0;
 const substrateSheets=topSqFt?Math.ceil(topSqFt/pricing.substrateUsableSqFt)+1:0;
 const counterMaterials=colorKits*pricing.epoxyKit+polyKits*pricing.polyKit+topCoatKits*pricing.topCoatKit+substrateSheets*pricing.substrate;
 const counterLaborGross=coated*pricing.counterLabor,counterLabor=counterLaborGross*discount,counterTotal=counterMaterials+counterLabor;
 let deepSqFt=0;if(state.deep.enabled){if(state.deep.type==="Circle")deepSqFt=Math.PI*Math.pow(n(state.deep.diameter)/24,2);else if(state.deep.type==="Manual")deepSqFt=n(state.deep.manualSqFt);else deepSqFt=(n(state.deep.length)*n(state.deep.width))/144}
 const deepOz=deepSqFt*144*n(state.deep.thickness)*0.554112554,deepKits=state.deep.enabled&&deepOz>0?Math.ceil((deepOz-1e-9)/pricing.deepOz):0,deepGallons=deepOz/128,deepMaterials=deepKits*pricing.deepKit,deepLabor=state.deep.enabled?deepSqFt*pricing.deepLabor*discount:0,deepTotal=deepMaterials+deepLabor;
 const b=state.backlit,backlitSqFt=b.enabled?(n(b.length)*n(b.height))/144:0,spacing=n(b.spacing)||(b.orientation==="Horizontal"?1:3),runs=b.enabled?Math.ceil(n(b.length)/spacing):0,totalLedFt=runs*(n(b.height)/12),ledStrips=b.enabled?Math.ceil(totalLedFt/16):0,ledCount=ledStrips*300;
 const acrylicSheets=b.enabled?n(b.acrylicSheets):0,controllerQty=b.enabled?n(b.controllerQty):0,psuQty=b.enabled?n(b.psuQty):0,fiberKitCost=b.enabled?n(b.fiberKitCost):0;
 const backlitExtiraSheets=b.enabled&&b.orientation==="Horizontal"&&backlitSqFt>0?Math.ceil(backlitSqFt/32):0,plywoodSheets=b.enabled&&b.orientation==="Vertical"&&backlitSqFt>0?Math.ceil(backlitSqFt/32):0;
 const backlitMaterials=b.enabled?ledStrips*pricing.ledStrip+acrylicSheets*pricing.acrylic+controllerQty*pricing.controller+psuQty*pricing.psu+fiberKitCost+backlitExtiraSheets*pricing.substrate+plywoodSheets*pricing.plywood:0;
 const backlitLabor=b.enabled?(backlitSqFt*pricing.ledLabor+(n(b.fiberPoints)>0?backlitSqFt*pricing.fiberLabor:0))*discount:0,backlitTotal=backlitMaterials+backlitLabor;
 const u=state.universal||{},universalSqFt=u.enabled?n(u.manualSqFt):0,universalEpoxyKits=u.enabled?Math.ceil(n(u.epoxyKits)):0,universalPolyKits=u.enabled?Math.ceil(n(u.polyKits)):0,universalTopCoatKits=u.enabled?Math.ceil(n(u.topCoatKits)):0,universalSubstrateSheets=u.enabled?Math.ceil(n(u.substrateSheets)):0;
 const universalMaterials=u.enabled?n(u.materialAllowance)+universalEpoxyKits*pricing.epoxyKit+universalPolyKits*pricing.polyKit+universalTopCoatKits*pricing.topCoatKit+universalSubstrateSheets*pricing.substrate:0;
 const universalLabor=u.enabled?(n(u.laborSqFt)||universalSqFt)*(n(u.laborRate)||pricing.counterLabor)*discount:0,universalTotal=universalMaterials+universalLabor;
 const actualHours=(state.timeEntries||[]).reduce((sum,e)=>sum+n(e.hours),0),estimatedLaborValue=counterLabor+deepLabor+backlitLabor+universalLabor,actualLaborValue=actualHours*pricing.actualLaborRate,laborDifference=actualLaborValue-estimatedLaborValue;
 const mileage=dccMileageChargeV30(),mileageCharge=mileage.mileageCharge,billableMiles=mileage.billableMiles,oneWayMiles=mileage.oneWayMiles,roundTrips=mileage.roundTrips; const materials=counterMaterials+deepMaterials+backlitMaterials+universalMaterials,laborNet=estimatedLaborValue,pre=counterTotal+deepTotal+backlitTotal+universalTotal,supplies=pre*(pricing.suppliesPct/100),overhead=(pre+supplies)*(pricing.overheadPct/100),subtotal=pre+supplies+overhead+mileageCharge,tax=subtotal*(pricing.taxPct/100),total=subtotal+tax,deposit=total*(n(state.depositPct||50)/100);
 return{topSqFt,vertSqFt,counterSqFt:topSqFt,backSqFt:vertSqFt,coated,universalSqFt,universalMaterials,universalLabor,universalTotal,universalEpoxyKits,universalPolyKits,universalTopCoatKits,universalSubstrateSheets,actualHours,estimatedLaborValue,actualLaborValue,laborDifference,colorKits,polyKits,topCoatKits,substrateSheets,counterMaterials,counterLabor,counterTotal,deepSqFt,deepGallons,deepKits,deepMaterials,deepLabor,deepTotal,backlitSqFt,runs,totalLedFt,ledStrips,ledCount,acrylicSheets,controllerQty,psuQty,fiberKitCost,backlitExtiraSheets,plywoodSheets,backlitMaterials,backlitLabor,backlitTotal,materials,laborNet,pre,supplies,overhead,oneWayMiles,roundTrips,billableMiles,mileageCharge,subtotal,tax,total,deposit,balance:total-deposit}
}
function calc(){return projectMetrics()}

function render(screen=current){if(screen==="mission"||!document.getElementById(screen))screen="customer";current=screen;$$('.tabbar button').forEach(b=>b.classList.toggle('active',b.dataset.screen===screen));$('#screen').innerHTML=$('#'+screen).innerHTML;$('#topStatus').textContent=state.jobStatus||'Draft Quote';bindScreen();updateBindings()}
function bindScreen(){
 $$('input,select,textarea').forEach(el=>{const key=el.id;if(!key||key.startsWith('price'))return;if(key==='beforePhoto'||key==='conceptPhoto'){el.addEventListener('change',e=>{const f=e.target.files[0];if(!f)return;const rd=new FileReader();rd.onload=()=>{state[key]=rd.result;save();render(current)};rd.readAsDataURL(f)});return}el.value=state[key]??'';el.addEventListener('input',()=>{state[key]=el.type==='number'?+el.value:el.value;save();updateBindings()})});
 if($('#dccMileageV30'))dccBindMileageV30();if($('#beforePreview'))photoPreview('beforePhoto','beforePreview');if($('#conceptPreview'))photoPreview('conceptPhoto','conceptPreview');if($('#purchaseList'))drawPurchase();if($('#kanban'))drawKanban();if($('#savedJobs'))drawSavedJobs();if($('#timeEntries')){bindTimeClock();setTimeout(dccRenderTimeTracking,0);setTimeout(dccRenderTimeSummary,0);setTimeout(dccRenderJobTimeBreakdown,0);setTimeout(dccRenderOutsideHelp,0)}if($('#dccJobCommandV21'))setTimeout(dccRenderJobCommand,0);if($('#dccProductionV22'))setTimeout(dccRenderProductionV22,0);if($('#dccMaterialsV23')){setTimeout(dccRenderMaterialsV23,100);setTimeout(dccRenderPurchaseReconcileV24,180)}if($('#dccInventoryV24'))setTimeout(dccRenderInventoryV24,0);if($('#dccBackboneV25'))setTimeout(dccRenderBackboneV25,0);if($('#dccFreshStartV28'))setTimeout(dccRenderFreshStartV28,0);if($('#dccBusinessReportV26'))setTimeout(dccRenderBusinessReportV26,0);if($('#dccFollowupsV26'))setTimeout(dccRenderFollowupsV26,0);if(current==='pricing')bindPricing();
 if(current==='project'){drawModule();$$('[data-module]').forEach(b=>b.addEventListener('click',()=>{activeModule=b.dataset.module;drawModule()}));$('#clearJob').addEventListener('click',()=>{if(confirm('Clear the current DCC job and start fresh?')){state=clone(defaults);save();render('customer')}})}
 if($('#printQuote'))$('#printQuote').onclick=()=>window.print();if($('#nextActionBtn'))$('#nextActionBtn').onclick=()=>render(nextScreen());if($('#newJob'))$('#newJob').onclick=newJob;if($('#saveJob'))$('#saveJob').onclick=saveCurrentJob;
 $$('[data-open-module]').forEach(b=>b.onclick=()=>{activeModule=b.dataset.openModule;render('project')})
}
function bindPricing(){const map={priceCounterLabor:'counterLabor',priceLedLabor:'ledLabor',priceFiberLabor:'fiberLabor',priceDeepLabor:'deepLabor',priceActualLaborRate:'actualLaborRate',priceEpoxyKit:'epoxyKit',priceEpoxyUsableOz:'epoxyUsableOz',pricePolyKit:'polyKit',pricePolyUsableOz:'polyUsableOz',priceColorOzSqFt:'colorOzSqFt',pricePolyOzSqFt:'polyOzSqFt',priceTopCoatKit:'topCoatKit',priceTopCoatCoverage:'topCoatCoverage',priceDeepKit:'deepKit',priceDeepOz:'deepOz',priceAcrylic:'acrylic',priceLedStrip:'ledStrip',priceController:'controller',pricePsu:'psu',pricePlywood:'plywood',priceSuppliesPct:'suppliesPct',priceOverheadPct:'overheadPct',priceTaxPct:'taxPct',priceSubstrate:'substrate',priceSubstrateUsableSqFt:'substrateUsableSqFt'};Object.entries(map).forEach(([id,key])=>{const el=$('#'+id);el.value=pricing[key];el.oninput=()=>{pricing[key]=+el.value;savePricing();savePricingToCloud();updateBindings();syncDerivedScreens()}});$('#resetPricing').onclick=()=>{if(confirm('Reset pricing to DCC defaults?')){pricing=clone(pricingDefaults);savePricing();render('pricing')}}}
function photoPreview(key,id){if(state[key])$('#'+id).innerHTML=`<img src="${state[key]}" alt="">`}
function nextScreen(){const c=calc();return!state.customerName?'customer':c.topSqFt===0&&!state.deep.enabled&&!state.backlit.enabled?'project':'quote'}
function drawModule(){const host=$('#moduleHost');if(!host)return;$$('[data-module]').forEach(b=>b.classList.toggle('active',b.dataset.module===activeModule));if(activeModule==='countertop')drawCounter(host);if(activeModule==='universal')drawUniversal(host);if(activeModule==='deep')drawDeep(host);if(activeModule==='backlit')drawBacklit(host);updateBindings()}
function drawCounter(host){host.innerHTML=`<section class="module-card"><h2>Countertop / Bar / Wall Estimator</h2><p>Choose Horizontal for counters and bars. DCC depth defaults to 25.25&quot;. Turn on backsplash when needed. Choose Vertical for a standalone full wall or other vertical surface.</p><div class="surface-head"><span>Piece</span><span>Surface</span><span>Length</span><span>Width / Depth</span><span>Backsplash</span><span></span></div><div id="pieceRows"></div><button class="secondary" id="addPiece">+ Add Surface</button><div class="metric-strip"><div><span>Horizontal Sq Ft</span><strong data-num="topSqFt">0</strong></div><div><span>Vertical Sq Ft</span><strong data-num="vertSqFt">0</strong></div><div><span>Material</span><strong data-money="counterMaterials">$0</strong></div><div><span>Module Total</span><strong data-money="counterTotal">$0</strong></div></div></section>`;drawPieces();$('#addPiece').onclick=()=>{state.pieces.push({name:`Piece ${state.pieces.length+1}`,surfaceType:"Horizontal",length:"",width:25.25,backsplash:false,backsplashHeight:4});save();drawModule()}}
function drawPieces(){const wrap=$('#pieceRows');state.pieces.forEach((p,i)=>{const row=document.createElement('div');row.className='surface-row';const horizontal=p.surfaceType!=="Vertical";row.innerHTML=`<input class="piece-name" value="${esc(p.name)}" placeholder="Piece name"><select class="surface-type"><option>Horizontal</option><option>Vertical</option></select><input class="surface-length" value="${p.length}" type="number" placeholder="Length"><input class="surface-width" value="${p.width}" type="number" placeholder="${horizontal?'25.25 depth':'Wall height / width'}"><div class="backsplash-cell">${horizontal?`<label class="checkline"><input class="backsplash-toggle" type="checkbox" ${p.backsplash?'checked':''}> Add</label><input class="backsplash-height" value="${p.backsplashHeight}" type="number" placeholder="Height" ${p.backsplash?'':'disabled'}>`:'<span class="note">Full wall / vertical</span>'}</div><button class="remove">×</button>`;$('.surface-type',row).value=p.surfaceType;$('.piece-name',row).oninput=e=>updatePiece(i,'name',e.target.value);$('.surface-length',row).oninput=e=>updatePiece(i,'length',e.target.value);$('.surface-width',row).oninput=e=>updatePiece(i,'width',e.target.value);$('.surface-type',row).onchange=e=>{const was=p.surfaceType;p.surfaceType=e.target.value;if(p.surfaceType==="Horizontal"&&was!=="Horizontal")p.width=25.25;if(p.surfaceType==="Vertical")p.backsplash=false;save();drawModule()};if(horizontal){$('.backsplash-toggle',row).onchange=e=>{p.backsplash=e.target.checked;save();drawModule()};$('.backsplash-height',row).oninput=e=>updatePiece(i,'backsplashHeight',e.target.value)}$('.remove',row).onclick=()=>{state.pieces.splice(i,1);if(!state.pieces.length)state.pieces.push({name:'Piece 1',surfaceType:'Horizontal',length:'',width:25.25,backsplash:false,backsplashHeight:4});save();drawModule()};wrap.appendChild(row)})}
function updatePiece(i,key,value){state.pieces[i][key]=value;save();updateBindings()}
function drawUniversal(host){const u=state.universal;host.innerHTML=`<section class="module-card"><h2>Universal / Specialty Estimator</h2><p>Use this for odd shapes, tabletops, river tables that need manual sq ft, customer-supplied wood, embedded items, or anything that does not fit the normal rows yet.</p><div class="inline-grid"><label class="checkline"><input id="universalEnabled" type="checkbox" ${u.enabled?'checked':''}> Include Universal / Specialty</label><label>Manual Sq Ft<input id="universalManualSqFt" type="number" step=".01" value="${u.manualSqFt}"></label><label>Labor Sq Ft / Units<input id="universalLaborSqFt" type="number" step=".01" value="${u.laborSqFt}"></label><label>Labor Rate<input id="universalLaborRate" type="number" step=".01" value="${u.laborRate}"></label><label>Material Allowance $<input id="universalMaterialAllowance" type="number" step=".01" value="${u.materialAllowance}"></label><label>Epoxy 2 Gal Kits<input id="universalEpoxyKits" type="number" min="0" step="1" value="${u.epoxyKits||0}"></label><label>Polykote Kits<input id="universalPolyKits" type="number" min="0" step="1" value="${u.polyKits||0}"></label><label>Top Coat Kits<input id="universalTopCoatKits" type="number" min="0" step="1" value="${u.topCoatKits||0}"></label><label>Extira Sheets<input id="universalSubstrateSheets" type="number" min="0" step="1" value="${u.substrateSheets||0}"></label><label class="checkline"><input id="universalCustomerSuppliedWood" type="checkbox" ${u.customerSuppliedWood?'checked':''}> Customer supplied wood</label><label class="checkline"><input id="universalEmbeddedItems" type="checkbox" ${u.embeddedItems?'checked':''}> Embedded items</label><label class="wide">Description / Scope<textarea id="universalDescription" placeholder="River table, odd shape, customer wood notes, embedded items, special build notes...">${esc(u.description)}</textarea></label></div><div class="metric-strip"><div><span>Manual Sq Ft</span><strong data-num="universalSqFt">0</strong></div><div><span>Materials</span><strong data-money="universalMaterials">$0</strong></div><div><span>Labor</span><strong data-money="universalLabor">$0</strong></div><div><span>Module Total</span><strong data-money="universalTotal">$0</strong></div></div></section>`;bindNested('universal',{universalEnabled:'enabled',universalManualSqFt:'manualSqFt',universalLaborSqFt:'laborSqFt',universalLaborRate:'laborRate',universalMaterialAllowance:'materialAllowance',universalEpoxyKits:'epoxyKits',universalPolyKits:'polyKits',universalTopCoatKits:'topCoatKits',universalSubstrateSheets:'substrateSheets',universalCustomerSuppliedWood:'customerSuppliedWood',universalEmbeddedItems:'embeddedItems',universalDescription:'description'})}
function drawDeep(host){const d=state.deep;host.innerHTML=`<section class="module-card"><h2>Deep Pour / River Estimator</h2><p>3-gallon kit, ${money(pricing.deepKit)}, ${pricing.deepOz} usable oz. Full kits round up.</p><div class="inline-grid"><label class="checkline"><input id="deepEnabled" type="checkbox" ${d.enabled?'checked':''}> Include Deep Pour / River</label><label>Shape<select id="deepType"><option>Straight</option><option>Circle</option><option>Manual</option></select></label><label>Thickness (in)<input id="deepThickness" type="number" step=".125" value="${d.thickness}"></label><label>Length (in)<input id="deepLength" type="number" value="${d.length}"></label><label>Average Width (in)<input id="deepWidth" type="number" value="${d.width}"></label><label>Circle Diameter (in)<input id="deepDiameter" type="number" value="${d.diameter}"></label><label>Manual Sq Ft<input id="deepManualSqFt" type="number" step=".01" value="${d.manualSqFt}"></label></div><div class="metric-strip"><div><span>Pour Sq Ft</span><strong data-num="deepSqFt">0</strong></div><div><span>Gallons</span><strong data-num="deepGallons">0</strong></div><div><span>3 Gal Kits</span><strong data-num="deepKits">0</strong></div><div><span>Module Total</span><strong data-money="deepTotal">$0</strong></div></div></section>`;$('#deepType').value=d.type;bindNested('deep',{deepEnabled:'enabled',deepType:'type',deepThickness:'thickness',deepLength:'length',deepWidth:'width',deepDiameter:'diameter',deepManualSqFt:'manualSqFt'})}
function drawBacklit(host){const b=state.backlit;host.innerHTML=`<section class="module-card"><h2>Backlit / LED + Fiber Estimator</h2><p>Lighting is an add-on to the parent project. Horizontal spacing defaults to 1&quot;; vertical to 3&quot;.</p><div class="inline-grid"><label class="checkline"><input id="backlitEnabled" type="checkbox" ${b.enabled?'checked':''}> Include Backlit / LED</label><label>Orientation<select id="backlitOrientation"><option>Vertical</option><option>Horizontal</option></select></label><label>LED Spacing (in)<input id="backlitSpacing" type="number" step=".5" value="${b.spacing}"></label><label>Length (in)<input id="backlitLength" type="number" value="${b.length}"></label><label>Height / Width (in)<input id="backlitHeight" type="number" value="${b.height}"></label><label>Acrylic Sheets<input id="backlitAcrylicSheets" type="number" value="${b.acrylicSheets}"></label><label>Controllers<input id="backlitControllerQty" type="number" value="${b.controllerQty}"></label><label>Power Supplies<input id="backlitPsuQty" type="number" value="${b.psuQty}"></label><label>Fiber Points<input id="backlitFiberPoints" type="number" value="${b.fiberPoints}"></label><label>Fiber Kit Cost<input id="backlitFiberKitCost" type="number" value="${b.fiberKitCost}"></label></div><div class="metric-strip"><div><span>LED Runs</span><strong data-num="runs">0</strong></div><div><span>LED Feet</span><strong data-num="totalLedFt">0</strong></div><div><span>16' Strips</span><strong data-num="ledStrips">0</strong></div><div><span>Module Total</span><strong data-money="backlitTotal">$0</strong></div></div><p class="note">Estimated LED count: <strong data-num="ledCount">0</strong>. LED and fiber labor use Pricing Control and labor discounts affect labor only.</p></section>`;$('#backlitOrientation').value=b.orientation;bindNested('backlit',{backlitEnabled:'enabled',backlitOrientation:'orientation',backlitSpacing:'spacing',backlitLength:'length',backlitHeight:'height',backlitAcrylicSheets:'acrylicSheets',backlitControllerQty:'controllerQty',backlitPsuQty:'psuQty',backlitFiberPoints:'fiberPoints',backlitFiberKitCost:'fiberKitCost'});$('#backlitOrientation').addEventListener('change',()=>{state.backlit.spacing=state.backlit.orientation==='Horizontal'?1:3;save();drawModule()})}
function bindNested(group,map){Object.entries(map).forEach(([id,key])=>{const el=$('#'+id);el.addEventListener('input',()=>{state[group][key]=el.type==='checkbox'?el.checked:el.type==='number'?+el.value:el.value;save();updateBindings()})})}
function drawPurchase(){const c=calc(),b=state.backlit;const items=[['Color coat epoxy kits',c.colorKits,'kits'],['Polykote kits',c.polyKits,'kits'],['Top coat kits',c.topCoatKits,'kits'],['Extira / substrate 4×8 sheets',c.substrateSheets,'sheets'],['Deep pour 3-gal kits',c.deepKits,'kits'],['16 ft LED strips',c.ledStrips,'strips'],['Acrylic sheets',b.enabled?+b.acrylicSheets||0:0,'sheets'],['Controllers',b.enabled?+b.controllerQty||0:0,'each'],['Power supplies',b.enabled?+b.psuQty||0:0,'each'],['Fiber kit / allowance',b.enabled&&+b.fiberKitCost>0?1:0,'job'],['Universal material allowance',state.universal?.enabled&&+state.universal.materialAllowance>0?1:0,'allowance']];$('#purchaseList').innerHTML=items.filter(i=>i[1]>0).map(i=>`<div class="purchase-item"><span>${i[0]}</span><strong>${i[1]}</strong><span>${i[2]}</span></div>`).join('')||'<p class="note">Add project measurements to build the purchase list.</p>'}

let cloudSaveTimer=null;
function queueCloudJobSave(){
 if(!state._jobId)return;
 clearTimeout(cloudSaveTimer);
 cloudSaveTimer=setTimeout(async()=>{
  const all=jobs(),id=state._jobId;
  const snap={id,updated:new Date().toISOString(),state:clone(state),total:calc().total};
  const ix=all.findIndex(j=>j.id===id);if(ix>=0)all[ix]=snap;else all.unshift(snap);
  saveJobs(all);
  try{await saveJobToCloud(snap)}catch(e){console.warn("Background cloud save failed:",e)}
 },650);
}
function newJob(){
 if(!confirm("Start a new job? Your saved jobs stay in Jobs."))return;
 state=clone(defaults);
 state._jobId="";
 save();
 render("customer");
}
async function saveCurrentJob(){let all=jobs(),id=state._jobId||crypto.randomUUID();state._jobId=id;const snap={id,updated:new Date().toISOString(),state:clone(state),total:calc().total};const ix=all.findIndex(j=>j.id===id);if(ix>=0)all[ix]=snap;else all.unshift(snap);saveJobs(all);save();drawSavedJobs();drawKanban();const btn=$('#saveJob');if(btn){btn.disabled=true;btn.textContent='Saving…'}try{await saveJobToCloud(snap);if(btn)btn.textContent='Cloud Saved ✓';for(const entry of (snap.state.timeEntries||[])){try{if(!entry.id)entry.id=crypto.randomUUID();entry.jobId=snap.id;await saveTimeEntryToCloud(entry)}catch(e){console.warn('Time sync pending:',e)}}}catch(e){console.warn(e);if(btn)btn.textContent='Cloud unavailable — saved on this device'}finally{setTimeout(()=>{if(btn){btn.disabled=false;btn.textContent='Save Current Job'}},1400)}}
function drawSavedJobs(){
 const all=jobs();
 const statuses=["Draft Quote","Approved","In Production","Complete"];
 $('#savedJobs').innerHTML=all.length?all.map(j=>{
  const s=j.state||{};
  const status=s.jobStatus||"Draft Quote";
  return `<div class="saved-job job-hub-card">
   <div class="job-hub-main">
    <strong>${esc(s.customerName||'New Customer')}</strong>
    <span>${esc(s.projectName||'New Project')}</span>
    <b>${money(j.total)}</b>
   </div>
   <div class="job-hub-actions">
    <select class="job-status" data-status="${j.id}" aria-label="Job status">
     ${statuses.map(x=>`<option ${x===status?'selected':''}>${x}</option>`).join('')}
    </select>
    <button class="secondary compact" data-load="${j.id}">Open</button>
    <button class="danger ghost compact" data-delete="${j.id}">Delete</button>
   </div>
  </div>`
 }).join(''):'<p class="note">No saved jobs yet. Tap + New Job to start one.</p>';
 $$('[data-load]').forEach(b=>b.onclick=()=>{const j=all.find(x=>x.id===b.dataset.load);state=clone(j.state);save();render('customer')});
 $$('[data-status]').forEach(sel=>sel.onchange=async()=>{
  const j=all.find(x=>x.id===sel.dataset.status);if(!j)return;
  j.state.jobStatus=sel.value;j.updated=new Date().toISOString();saveJobs(all);
  if(state._jobId===j.id){state.jobStatus=sel.value;save()}
  drawKanban();
  try{await saveJobToCloud(j)}catch(e){console.warn("Cloud status save failed:",e)}
 });
 $$('[data-delete]').forEach(b=>b.onclick=async()=>{if(confirm('Delete this saved job?')){const id=b.dataset.delete;saveJobs(all.filter(x=>x.id!==id));drawSavedJobs();drawKanban();try{await deleteJobFromCloud(id)}catch(e){console.warn("Cloud delete failed:",e)}}})
}
function drawKanban(){const cols=['Draft Quote','Quote Sent','Approved','In Production','Ready for Install','Completed'];const all=jobs();$('#kanban').innerHTML=cols.map(s=>`<div><h3>${s}</h3>${all.filter(j=>j.state.jobStatus===s).map(j=>`<div class="job-card"><strong>${esc(j.state.customerName||'New Customer')}</strong><br><span class="note">${esc(j.state.projectName||'New Project')} · ${money(j.total)}</span></div>`).join('')}</div>`).join('')}
function bindTimeClock(){updateTimerText();drawTimeEntries();$('#startWork').onclick=()=>{if(state.activeTimer){alert('Timer is already running. Stop it first.');return}state.activeTimer={start:new Date().toISOString(),worker:$('#timeWorker').value,type:$('#timeType').value,note:$('#timeNote').value};save();updateTimerText()};$('#stopWork').onclick=()=>{if(!state.activeTimer){alert('No active timer running.');return}const start=new Date(state.activeTimer.start),end=new Date(),hours=Math.round(((end-start)/36e5)*100)/100;state.timeEntries.unshift({id:Date.now().toString(),start:state.activeTimer.start,end:end.toISOString(),hours,worker:state.activeTimer.worker,type:state.activeTimer.type,note:state.activeTimer.note});state.activeTimer=null;save();drawTimeEntries();updateTimerText();updateBindings()};$('#addManualTime').onclick=()=>{const h=prompt('How many hours? Example: 2.5');if(h===null)return;const hours=+h;if(!hours||hours<0){alert('Enter a valid number of hours.');return}const note=prompt('Note for this time entry?','Manual entry')||'Manual entry';state.timeEntries.unshift({id:Date.now().toString(),start:new Date().toISOString(),end:new Date().toISOString(),hours,worker:$('#timeWorker').value,type:$('#timeType').value,note});save();drawTimeEntries();updateBindings()}}
function updateTimerText(){const t=$('#activeTimerText'),s=$('#activeTimerSub');if(!t)return;if(!state.activeTimer){t.textContent='Not running';s.textContent='Tap Start Work when you begin.';return}const start=new Date(state.activeTimer.start),hrs=(Date.now()-start)/36e5;t.textContent=`Running: ${hrs.toFixed(2)} hrs`;s.textContent=`${state.activeTimer.worker} · ${state.activeTimer.type} · started ${start.toLocaleString()}`}
function drawTimeEntries(){const host=$('#timeEntries');if(!host)return;host.innerHTML=(state.timeEntries||[]).length?state.timeEntries.map(e=>`<div class="time-entry"><div><strong>${esc(e.worker)} · ${esc(e.type)}</strong><span>${new Date(e.start).toLocaleString()} · ${e.hours} hrs</span><small>${esc(e.note||'')}</small></div><button class="danger ghost compact" data-del-time="${e.id}">Delete</button></div>`).join(''):'<p class="note">No time entries yet.</p>';$$('[data-del-time]').forEach(b=>b.onclick=()=>{if(confirm('Delete this time entry?')){state.timeEntries=state.timeEntries.filter(e=>e.id!==b.dataset.delTime);save();drawTimeEntries();updateBindings()}})}
setInterval(()=>{if(current==='time'&&state.activeTimer)updateTimerText()},30000);
function updateBindings(){const c=calc(),data={...state,...c};$$('[data-bind]').forEach(el=>el.textContent=data[el.dataset.bind]||({customerName:'New Customer',projectName:'New Project',estimateNo:'—'}[el.dataset.bind]||''));$$('[data-money]').forEach(el=>el.textContent=money(data[el.dataset.money]));$$('[data-num]').forEach(el=>el.textContent=num(data[el.dataset.num]));if($('#nextAction'))$('#nextAction').textContent=!state.customerName?'Enter customer info':c.topSqFt===0&&!state.deep.enabled&&!state.backlit.enabled?'Enter project pieces':'Review whole-job quote';$('#topStatus').textContent=state.jobStatus||'Draft Quote'}
function esc(v){return String(v??'').replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]))}
$$('.tabbar button').forEach(b=>b.onclick=()=>render(b.dataset.screen));render('mission');refreshCloudData();document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")refreshCloudData()});
window.addEventListener("focus",()=>refreshCloudData());
window.addEventListener("online",()=>refreshCloudData());
setInterval(()=>{if(document.visibilityState==="visible")refreshCloudData()},5000);
if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});


/* DCC TIME + MISSION BRIDGE v13 */
const DCC_TIME_KEY="dcc-os-time-log";
function dccTimeRows(){try{return JSON.parse(localStorage.getItem(DCC_TIME_KEY)||"[]")}catch(e){return []}}
function dccSaveTimeRows(rows){localStorage.setItem(DCC_TIME_KEY,JSON.stringify(rows||[]))}
async function dccCloudTimePull(){
  try{
    const r=await fetch(API_BASE+"/api/settings?ts="+Date.now(),{cache:"no-store"});
    if(!r.ok)return dccTimeRows();
    const data=await r.json();
    const cloud=Array.isArray(data?.dccTimeLog)?data.dccTimeLog:[];
    const merged=[...dccTimeRows()];
    const seen=new Set(merged.map(x=>x.id));
    cloud.forEach(x=>{if(x&&x.id&&!seen.has(x.id)){merged.push(x);seen.add(x.id)}});
    dccSaveTimeRows(merged);
    return merged;
  }catch(e){return dccTimeRows()}
}
async function dccCloudTimePush(){
  const rows=dccTimeRows();
  try{
    const r=await fetch(API_BASE+"/api/settings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({dccTimeLog:rows})});
    return r.ok;
  }catch(e){return false}
}
window.dccAddTime=async function(job,hours,note=""){
  const rows=dccTimeRows();
  rows.push({id:(crypto.randomUUID?crypto.randomUUID():Date.now()+"-"+Math.random()),job:String(job||"Unassigned"),hours:Number(hours)||0,note:String(note||""),createdAt:new Date().toISOString()});
  dccSaveTimeRows(rows);
  await dccCloudTimePush();
  return rows;
};
window.dccGetTime=async function(){return await dccCloudTimePull()};
window.dccMissionSnapshot=async function(){
  const rows=await dccCloudTimePull();
  const jobs=(typeof state!=="undefined"&&Array.isArray(state.jobs))?state.jobs:[];
  const totalHours=rows.reduce((a,x)=>a+(Number(x.hours)||0),0);
  return {activeJobs:jobs.length,timeEntries:rows.length,totalHours:Number(totalHours.toFixed(2))};
};
dccCloudTimePull();


/* DCC TIME TRACKING UI v14 */
function dccTimeCategories(){
  return ["Fabrication","Design / Estimate","Install","Customer Communication","Marketing / Social Media","Photography / Content","Ordering / Supplies","Loading / Unloading","Driving / Travel","Client Meetings","Quotes / Admin","Bookkeeping","Shop Support","Other DCC Work"];
}
function dccTimeCurrentJobs(){
  try{return (state.jobs||[]).map(j=>({id:j.id,name:(j.customer||"")+" • "+(j.project||j.projectName||"Job")}))}catch(e){return []}
}
async function dccRenderTimeTracking(){
  const host=document.getElementById("timeTracking");
  if(!host)return;
  const rows=await dccGetTime();
  const jobs=dccTimeCurrentJobs();
  const total=rows.reduce((a,x)=>a+(Number(x.hours)||0),0);
  const byCat={}; rows.forEach(x=>byCat[x.category||"Other DCC Work"]=(byCat[x.category||"Other DCC Work"]||0)+(Number(x.hours)||0));
  host.innerHTML=`<div class="dcc-time-shell">
    <div class="dcc-time-hero"><div><div class="eyebrow">DCC OS • TIME TRACKING</div><h2>Track the work nobody sees.</h2><p>Job labor and DCC business time in one place.</p></div><div class="time-total"><b>${total.toFixed(1)}</b><span>TOTAL HOURS</span></div></div>
    <div class="dcc-time-entry">
      <label>WHO<select id="dccTimeWho"><option>Shawn</option><option>Summer</option></select></label>
      <label>WORK TYPE<select id="dccTimeCategory">${dccTimeCategories().map(x=>`<option value="${x}">${x}</option>`).join("")}</select></label>
      <label>JOB / BUSINESS<select id="dccTimeJob"><option value="">General DCC Business</option>${jobs.map(j=>`<option value="${j.id}">${j.name}</option>`).join("")}</select></label>
      <label>HOURS<input id="dccTimeHours" type="number" min=".1" step=".25" inputmode="decimal" placeholder="0.0"></label>
      <div id="dccTimeSelection" class="dcc-time-selection"></div>
      <label class="time-note">NOTE<input id="dccTimeNote" type="text" placeholder="What did you work on?"></label>
      <button id="dccTimeSave" type="button">SAVE TIME</button>
      <div id="dccTimeStatus"></div>
    </div>
    <div class="dcc-time-summary"><h3>Where the time is going</h3>${Object.entries(byCat).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<div class="time-summary-row"><span>${k}</span><b>${v.toFixed(1)} hrs</b></div>`).join("")||"<p>No time logged yet.</p>"}</div>
    <div class="dcc-time-history"><h3>Recent time</h3>${rows.slice().sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,20).map(x=>`<div class="time-row"><div><b>${x.who||"DCC"} • ${x.category||"Other DCC Work"}</b><span>${x.jobName||x.job||"General DCC Business"}${x.note?" — "+x.note:""}</span></div><strong>${Number(x.hours||0).toFixed(2)} hrs</strong></div>`).join("")||"<p>No time logged yet.</p>"}</div>
  </div>`;

  const who=document.getElementById("dccTimeWho");
  const category=document.getElementById("dccTimeCategory");
  const jobSel=document.getElementById("dccTimeJob");
  const hours=document.getElementById("dccTimeHours");
  const selection=document.getElementById("dccTimeSelection");

  const updateSelection=()=>{
    const jobName=jobSel.options[jobSel.selectedIndex]?.text||"General DCC Business";
    const hrs=Number(hours.value||0);
    selection.innerHTML=`<span>CURRENT SELECTION</span><b>${who.value} • ${category.value}</b><strong>${jobName}${hrs>0?` • ${hrs.toFixed(2)} hrs`:""}</strong>`;
  };
  ["change","input"].forEach(evt=>{
    who.addEventListener(evt,updateSelection);
    category.addEventListener(evt,updateSelection);
    jobSel.addEventListener(evt,updateSelection);
    hours.addEventListener(evt,updateSelection);
  });
  updateSelection();

  document.getElementById("dccTimeSave").onclick=async()=>{
    const enteredHours=Number(hours.value);
    const status=document.getElementById("dccTimeStatus");
    if(!enteredHours||enteredHours<=0){status.textContent="Enter hours first.";return}
    const jobId=jobSel.value;
    const jobName=jobSel.options[jobSel.selectedIndex]?.text||"General DCC Business";
    const saved=dccTimeRows();
    saved.push({
      id:(crypto.randomUUID?crypto.randomUUID():Date.now()+"-"+Math.random()),
      who:who.value,
      category:category.value,
      job:jobId||"GENERAL_DCC",
      jobName:jobId?jobName:"General DCC Business",
      hours:enteredHours,
      note:document.getElementById("dccTimeNote").value.trim(),
      createdAt:new Date().toISOString()
    });
    dccSaveTimeRows(saved);
    status.textContent="Saving to cloud…";
    const ok=await dccCloudTimePush();
    await dccRenderTimeTracking();
    await dccRenderTimeSummary();
    const newStatus=document.getElementById("dccTimeStatus");
    if(newStatus)newStatus.textContent=ok?"Saved to cloud.":"Saved on this device; cloud retry needed.";
  };
}
window.dccRenderTimeTracking=dccRenderTimeTracking;


/* DCC MISSION CONTROL v16 */
async function dccRenderMissionControl(){const h=document.getElementById("missionControl");if(!h)return;const jobs=(typeof state!=="undefined"&&Array.isArray(state.jobs))?state.jobs:[],t=await dccGetTime(),active=jobs.filter(j=>!["complete","completed","closed"].includes(String(j.status||"").toLowerCase())),sum=a=>a.reduce((n,x)=>n+(Number(x.hours)||0),0),cats=t.reduce((o,x)=>{let k=x.category||"Other DCC Work";o[k]=(o[k]||0)+(Number(x.hours)||0);return o},{});h.innerHTML=`<div class="mc-shell"><div class="mc-hero"><div><div class="eyebrow">DCC OS • MISSION CONTROL</div><h2>The business at a glance.</h2><p>Jobs, labor, and the work behind DCC.</p></div><div class="mc-big"><b>${active.length}</b><span>ACTIVE JOBS</span></div></div><div class="mc-stats"><div class="mc-stat"><span>TOTAL DCC TIME</span><b>${sum(t).toFixed(1)} hrs</b></div><div class="mc-stat"><span>SHAWN</span><b>${sum(t.filter(x=>(x.who||"Shawn")==="Shawn")).toFixed(1)} hrs</b></div><div class="mc-stat"><span>SUMMER</span><b>${sum(t.filter(x=>x.who==="Summer")).toFixed(1)} hrs</b></div><div class="mc-stat"><span>GENERAL BUSINESS</span><b>${sum(t.filter(x=>x.job==="GENERAL_DCC"||!x.job)).toFixed(1)} hrs</b></div></div><div class="mc-grid"><section class="mc-card"><h3>Active Job Board</h3>${active.slice(0,6).map(j=>`<div class="mc-job"><div><b>${j.customer||"Customer"} • ${j.project||j.projectName||"Job"}</b><span>${j.status||"Active"}</span></div><strong>${j.nextAction||j.next||"Open job"}</strong></div>`).join("")||"<p>No active jobs yet.</p>"}</section><section class="mc-card"><h3>Where DCC Time Goes</h3>${Object.entries(cats).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([k,v])=>`<div class="mc-line"><span>${k}</span><b>${v.toFixed(1)} hrs</b></div>`).join("")||"<p>Start logging time to build the picture.</p>"}</section></div></div>`}window.dccRenderMissionControl=dccRenderMissionControl;


/* DCC CUSTOMER TIME SUMMARY v17 */
async function dccRenderTimeSummary(){
 const host=document.getElementById("dccTimeSummaryV17"); if(!host)return;
 const rows=await dccGetTime(), now=new Date(), job=(typeof state!=="undefined"?state.currentJob:null);
 const jid=job&&job.id, jname=job?((job.customer||"Customer")+" • "+(job.project||job.projectName||"Job")):"Current Job";
 const sum=a=>a.reduce((n,x)=>n+(Number(x.hours)||0),0);
 const startWeek=new Date(now); startWeek.setHours(0,0,0,0); startWeek.setDate(now.getDate()-now.getDay());
 const startMonth=new Date(now.getFullYear(),now.getMonth(),1), startYear=new Date(now.getFullYear(),0,1);
 const since=d=>rows.filter(x=>new Date(x.createdAt)>=d);
 const jr=jid?rows.filter(x=>x.job===jid):[];
 host.innerHTML=`<div class="v17-summary">
   <section class="v17-card v17-job"><span>CURRENT CUSTOMER / JOB</span><h3>${jname}</h3><b>${sum(jr).toFixed(1)} hrs</b><small>Total tracked time for this job</small></section>
   <section class="v17-periods">
    <div class="v17-card"><span>THIS WEEK</span><b>${sum(since(startWeek)).toFixed(1)} hrs</b></div>
    <div class="v17-card"><span>THIS MONTH</span><b>${sum(since(startMonth)).toFixed(1)} hrs</b></div>
    <div class="v17-card"><span>THIS YEAR</span><b>${sum(since(startYear)).toFixed(1)} hrs</b></div>
   </section>
 </div>`;
}
window.dccRenderTimeSummary=dccRenderTimeSummary;


/* DCC JOB TIME BREAKDOWN v19 */
async function dccRenderJobTimeBreakdown(){
 const host=document.getElementById("dccJobTimeBreakdownV19"); if(!host)return;
 const rows=await dccGetTime(), jobs=dccTimeCurrentJobs(), help=await dccHelpPull();
 const select=document.getElementById("dccJobTimeReportJob");
 if(!select)return;
 select.innerHTML=`<option value="">Select customer / job</option>${jobs.map(j=>`<option value="${j.id}">${j.name}</option>`).join("")}`;
 const render=()=>{
   const id=select.value;
   const jr=rows.filter(x=>String(x.job||"")===String(id)), hr=help.filter(x=>String(x.job||"")===String(id));
   const sum=a=>a.reduce((n,x)=>n+(Number(x.hours)||0),0);
   const byWho=jr.reduce((o,x)=>{const k=x.who||"DCC";o[k]=(o[k]||0)+(Number(x.hours)||0);return o},{});
   const byCat=jr.reduce((o,x)=>{const k=x.category||"Other DCC Work";o[k]=(o[k]||0)+(Number(x.hours)||0);return o},{});
   const body=document.getElementById("dccJobTimeReportBody");
   body.innerHTML=!id?`<p>Select a customer/job to see its labor history.</p>`:
   `<div class="v19-total"><span>TOTAL CUSTOMER / JOB TIME</span><b>${sum(jr).toFixed(2)} hrs</b><span>OUTSIDE LABOR PAID</span><b>$${hr.reduce((n,x)=>n+(Number(x.amount)||0),0).toFixed(2)}</b></div>
    <div class="v19-columns"><div><h4>By Person</h4>${Object.entries(byWho).map(([k,v])=>`<div class="v19-line"><span>${k}</span><b>${v.toFixed(2)} hrs</b></div>`).join("")||"<p>No time logged.</p>"}</div>
    <div><h4>By Work Type</h4>${Object.entries(byCat).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<div class="v19-line"><span>${k}</span><b>${v.toFixed(2)} hrs</b></div>`).join("")||"<p>No time logged.</p>"}</div></div>`;
 };
 select.onchange=render; render();
}
window.dccRenderJobTimeBreakdown=dccRenderJobTimeBreakdown;


/* DCC OUTSIDE HELP v20 */
const DCC_HELP_KEY="dcc-os-outside-help";
function dccHelpRows(){try{return JSON.parse(localStorage.getItem(DCC_HELP_KEY)||"[]")}catch(e){return []}}
function dccSaveHelpRows(r){localStorage.setItem(DCC_HELP_KEY,JSON.stringify(r||[]))}
async function dccHelpPull(){try{const r=await fetch(API_BASE+"/api/settings?ts="+Date.now(),{cache:"no-store"});if(!r.ok)return dccHelpRows();const d=await r.json(),cloud=Array.isArray(d?.dccOutsideHelp)?d.dccOutsideHelp:[],merged=[...dccHelpRows()],seen=new Set(merged.map(x=>x.id));cloud.forEach(x=>{if(x&&x.id&&!seen.has(x.id)){merged.push(x);seen.add(x.id)}});dccSaveHelpRows(merged);return merged}catch(e){return dccHelpRows()}}
async function dccHelpPush(){try{return (await fetch(API_BASE+"/api/settings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({dccOutsideHelp:dccHelpRows()})})).ok}catch(e){return false}}
function dccHelpWorkTypes(){return ["Install","Loading / Unloading","Moving / Flipping Large Pieces","Fabrication","Shop Support","Driving / Travel","Client Meetings","Marketing / Social Media","Mood Board / Facebook","Photography / Content","Ordering / Supplies","Other DCC Work"]}
async function dccRenderOutsideHelp(){
 const h=document.getElementById("dccOutsideHelpV20");if(!h)return;const rows=await dccHelpPull(),jobs=dccTimeCurrentJobs(),paid=rows.reduce((a,x)=>a+(Number(x.amount)||0),0);
 h.innerHTML=`<div class="v20-head"><div><span>DCC OS • OUTSIDE HELP</span><h3>Helper / Outside Labor</h3></div><b>$${paid.toFixed(2)} paid</b></div>
 <div class="v20-form"><label>PERSON<select id="v20Person"><option>Kai</option><option>Zoe</option><option>Outside Helper</option><option>Other</option></select></label><label>WORK TYPE<select id="v20Type">${dccHelpWorkTypes().map(x=>`<option>${x}</option>`).join("")}</select></label><label>JOB / BUSINESS<select id="v20Job"><option value="">General DCC Business</option>${jobs.map(j=>`<option value="${j.id}">${j.name}</option>`).join("")}</select></label><label>HOURS OPTIONAL<input id="v20Hours" type="number" min="0" step=".25" inputmode="decimal"></label><label>FLAT AMOUNT PAID<input id="v20Amount" type="number" min="0" step="1" inputmode="decimal"></label><label>NOTE<input id="v20Note" type="text" placeholder="What did they help with?"></label><button id="v20Save" type="button">SAVE OUTSIDE HELP</button><div id="v20Status"></div></div>
 <div class="v20-history">${rows.slice().sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,12).map(x=>`<div class="v20-row"><div><b>${x.person} • ${x.workType}</b><span>${x.jobName||"General DCC Business"}${x.note?" — "+x.note:""}</span></div><strong>${Number(x.hours||0)>0?Number(x.hours).toFixed(2)+" hrs • ":""}$${Number(x.amount||0).toFixed(2)}</strong></div>`).join("")||"<p>No outside help logged yet.</p>"}</div>`;
 document.getElementById("v20Save").onclick=async()=>{const amount=Number(document.getElementById("v20Amount").value||0),hours=Number(document.getElementById("v20Hours").value||0),job=document.getElementById("v20Job"),jobId=job.value,jobName=job.options[job.selectedIndex].text,status=document.getElementById("v20Status");if(amount<=0&&hours<=0){status.textContent="Enter hours or amount paid.";return}const r=dccHelpRows();r.push({id:(crypto.randomUUID?crypto.randomUUID():Date.now()+"-"+Math.random()),person:document.getElementById("v20Person").value,workType:document.getElementById("v20Type").value,job:jobId||"GENERAL_DCC",jobName:jobId?jobName:"General DCC Business",hours,amount,note:document.getElementById("v20Note").value.trim(),createdAt:new Date().toISOString()});dccSaveHelpRows(r);status.textContent="Saving to cloud…";await dccHelpPush();await dccRenderOutsideHelp();await dccRenderJobTimeBreakdown()}
}
window.dccRenderOutsideHelp=dccRenderOutsideHelp;


/* DCC JOB COMMAND v21 */
function dccJobStages(){return ["Lead / Inquiry","Client Meeting","Measure / Site Visit","Estimate / Quote","Waiting on Customer","Deposit / Approved","Design / Samples","Materials / Ordering","Fabrication","Ready to Install","Install Scheduled","Installed / Final Payment","Complete"]}
function dccRenderJobCommand(){
 const h=document.getElementById("dccJobCommandV21");if(!h)return;
 const jobs=(typeof state!=="undefined"&&Array.isArray(state.jobs))?state.jobs:[];
 const active=jobs.filter(j=>!["complete","completed","closed"].includes(String(j.status||"").toLowerCase()));
 const stages=dccJobStages();
 const counts=stages.map(s=>[s,active.filter(j=>(j.dccStage||j.status||"Lead / Inquiry")===s).length]).filter(x=>x[1]);
 h.innerHTML=`<div class="v21-hero"><div><span>DCC OS • JOB COMMAND</span><h2>What needs attention next?</h2></div><b>${active.length}<small> ACTIVE JOBS</small></b></div>
 <div class="v21-stagebar">${counts.map(([s,n])=>`<div><span>${s}</span><b>${n}</b></div>`).join("")||"<p>Jobs will group here as workflow stages are assigned.</p>"}</div>
 <div class="v21-list">${active.map(j=>`<article class="v21-job"><div><b>${j.customer||"Customer"}</b><span>${j.project||j.projectName||"Job"}</span></div><label>STAGE<select class="v21Stage" data-id="${j.id}">${stages.map(s=>`<option ${s===(j.dccStage||j.status||"Lead / Inquiry")?"selected":""}>${s}</option>`).join("")}</select></label><label>NEXT ACTION<input class="v21Next" data-id="${j.id}" value="${String(j.nextAction||j.next||"").replace(/"/g,"&quot;")}" placeholder="What happens next?"></label></article>`).join("")||"<p>No active jobs yet.</p>"}</div>`;
 h.querySelectorAll(".v21Stage").forEach(el=>el.onchange=async()=>{const j=jobs.find(x=>String(x.id)===String(el.dataset.id));if(!j)return;j.dccStage=el.value;j.status=el.value;await saveJobs();dccRenderJobCommand()});
 h.querySelectorAll(".v21Next").forEach(el=>el.onchange=async()=>{const j=jobs.find(x=>String(x.id)===String(el.dataset.id));if(!j)return;j.nextAction=el.value.trim();await saveJobs()});
}
window.dccRenderJobCommand=dccRenderJobCommand;


/* DCC OPERATIONS BUNDLE v22 */
function dccProductionSteps(){return ["Measure","Template","Samples","Client Approval","Materials","Build / Fabrication","Epoxy / Finish","Cure","Install Prep","Load","Install","Final Payment"]}
function dccEnsureOps(j){if(!j.dccProduction)j.dccProduction={};if(!j.dccMaterialStatus)j.dccMaterialStatus={};return j}
function dccRenderProductionV22(){
 const h=document.getElementById("dccProductionV22");if(!h)return;
 const jobs=(typeof state!=="undefined"&&Array.isArray(state.jobs))?state.jobs:[];
 h.innerHTML=`<div class="v22-head"><div><span>DCC OS • PRODUCTION</span><h2>Build Workflow</h2></div><select id="v22ProdJob"><option value="">Select customer / job</option>${jobs.map(j=>`<option value="${j.id}">${j.customer||"Customer"} • ${j.project||j.projectName||"Job"}</option>`).join("")}</select></div><div id="v22ProdBody"><p>Select a job to manage its production flow.</p></div>`;
 const sel=document.getElementById("v22ProdJob"),body=document.getElementById("v22ProdBody");
 const draw=()=>{const j=jobs.find(x=>String(x.id)===String(sel.value));if(!j){body.innerHTML="<p>Select a job to manage its production flow.</p>";return}dccEnsureOps(j);body.innerHTML=`<div class="v22-steps">${dccProductionSteps().map((s,i)=>`<label class="v22-step ${j.dccProduction[s]?"done":""}"><input type="checkbox" data-step="${s}" ${j.dccProduction[s]?"checked":""}><span>${i+1}</span><b>${s}</b></label>`).join("")}</div>`;body.querySelectorAll("input[data-step]").forEach(x=>x.onchange=async()=>{j.dccProduction[x.dataset.step]=x.checked;await saveJobs();draw()})};sel.onchange=draw;
}
function dccPrintQuoteV22(){window.print()}
window.dccRenderProductionV22=dccRenderProductionV22;window.dccPrintQuoteV22=dccPrintQuoteV22;


/* DCC MATERIALS CONTROL v23 */
const DCC_MAT_KEY="dcc-os-material-status";
function dccMatRows(){try{return JSON.parse(localStorage.getItem(DCC_MAT_KEY)||"{}")}catch(e){return {}}}
function dccSaveMatRows(x){localStorage.setItem(DCC_MAT_KEY,JSON.stringify(x||{}))}
async function dccMatPull(){try{const r=await fetch(API_BASE+"/api/settings?ts="+Date.now(),{cache:"no-store"});if(!r.ok)return dccMatRows();const d=await r.json(),local=dccMatRows(),cloud=(d&&d.dccMaterialStatus)||{};const merged={...local,...cloud};dccSaveMatRows(merged);return merged}catch(e){return dccMatRows()}}
async function dccMatPush(){try{return (await fetch(API_BASE+"/api/settings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({dccMaterialStatus:dccMatRows()})})).ok}catch(e){return false}}
function dccMaterialStages(){return ["Need","Ordered","Picked Up","In Shop"]}
function dccPurchaseRowsV23(){
 const table=document.querySelector("#purchaseTable tbody"); if(!table)return [];
 return [...table.querySelectorAll("tr")].map((tr,i)=>{const td=[...tr.querySelectorAll("td")];return {key:(td[0]?.textContent||"Item "+i).trim(),item:(td[0]?.textContent||"Item").trim(),qty:(td[1]?.textContent||"").trim()}}).filter(x=>x.item)
}
async function dccRenderMaterialsV23(){
 const h=document.getElementById("dccMaterialsV23");if(!h)return;
 const job=(typeof state!=="undefined"?state.currentJob:null), jid=job?.id||"NO_JOB", rows=dccPurchaseRowsV23(), all=await dccMatPull(), status=all[jid]||{};
 h.innerHTML=`<div class="v23-head"><div><span>DCC OS • MATERIALS CONTROL</span><h3>Purchase Status</h3></div><div id="v23Cloud"></div></div>
 <div class="v23-grid">${rows.map((r,i)=>`<div class="v23-row"><div><b>${r.item}</b><span>${r.qty}</span></div><select data-key="${encodeURIComponent(r.key)}">${dccMaterialStages().map(s=>`<option ${status[r.key]===s?"selected":""}>${s}</option>`).join("")}</select></div>`).join("")||"<p>Purchase items for the current job will appear here.</p>"}</div>`;
 h.querySelectorAll("select[data-key]").forEach(el=>el.onchange=async()=>{const current=dccMatRows();current[jid]=current[jid]||{};current[jid][decodeURIComponent(el.dataset.key)]=el.value;dccSaveMatRows(current);document.getElementById("v23Cloud").textContent="Saving…";const ok=await dccMatPush();document.getElementById("v23Cloud").textContent=ok?"Saved to cloud":"Saved on device"});
}
window.dccRenderMaterialsV23=dccRenderMaterialsV23;


/* DCC INVENTORY + PURCHASE RECONCILIATION v24 */
const DCC_INV_KEY="dcc-os-inventory-v24";
function dccInvRows(){try{return JSON.parse(localStorage.getItem(DCC_INV_KEY)||"[]")}catch(e){return []}}
function dccSaveInvRows(r){localStorage.setItem(DCC_INV_KEY,JSON.stringify(r||[]))}
async function dccInvPull(){try{const r=await fetch(API_BASE+"/api/settings?ts="+Date.now(),{cache:"no-store"});if(!r.ok)return dccInvRows();const d=await r.json(),cloud=Array.isArray(d?.dccInventory)?d.dccInventory:[],local=dccInvRows(),m=new Map(local.map(x=>[x.item,x]));cloud.forEach(x=>{if(x&&x.item)m.set(x.item,x)});const rows=[...m.values()];dccSaveInvRows(rows);return rows}catch(e){return dccInvRows()}}
async function dccInvPush(){try{return (await fetch(API_BASE+"/api/settings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({dccInventory:dccInvRows()})})).ok}catch(e){return false}}
function dccQtyNumber(s){const m=String(s||"").match(/-?\d+(\.\d+)?/);return m?Number(m[0]):0}
async function dccRenderInventoryV24(){
 const h=document.getElementById("dccInventoryV24");if(!h)return;const rows=await dccInvPull();
 h.innerHTML=`<div class="v24-head"><div><span>DCC OS • SHOP INVENTORY</span><h2>Current Inventory</h2></div><b>${rows.length} ITEMS</b></div>
 <div class="v24-add"><input id="v24Item" placeholder="Item"><input id="v24OnHand" type="number" step=".01" inputmode="decimal" placeholder="On hand"><input id="v24Unit" placeholder="Unit (kits, sheets, ft)"><input id="v24Min" type="number" step=".01" inputmode="decimal" placeholder="Restock level"><input id="v24Loc" placeholder="Location"><button id="v24Add" type="button">ADD / UPDATE ITEM</button><div id="v24Status"></div></div>
 <div class="v24-list">${rows.sort((a,b)=>a.item.localeCompare(b.item)).map(x=>`<div class="v24-row"><div><b>${x.item}</b><span>${x.location||"Location not set"} • updated ${x.updatedAt?new Date(x.updatedAt).toLocaleDateString():"—"}</span></div><label>ON HAND<input class="v24Qty" data-item="${encodeURIComponent(x.item)}" type="number" step=".01" value="${Number(x.onHand||0)}"></label><strong>${x.unit||"units"}</strong><em>${Number(x.onHand||0)<=Number(x.min||0)?"RESTOCK":"OK"}</em></div>`).join("")||"<p>No inventory entered yet.</p>"}</div>`;
 document.getElementById("v24Add").onclick=async()=>{const item=document.getElementById("v24Item").value.trim(),status=document.getElementById("v24Status");if(!item){status.textContent="Enter an item.";return}const r=dccInvRows(),i=r.findIndex(x=>x.item.toLowerCase()===item.toLowerCase()),row={item,onHand:Number(document.getElementById("v24OnHand").value||0),unit:document.getElementById("v24Unit").value.trim()||"units",min:Number(document.getElementById("v24Min").value||0),location:document.getElementById("v24Loc").value.trim(),updatedAt:new Date().toISOString()};if(i>=0)r[i]={...r[i],...row};else r.push(row);dccSaveInvRows(r);status.textContent="Saving…";await dccInvPush();await dccRenderInventoryV24()};
 h.querySelectorAll(".v24Qty").forEach(el=>el.onchange=async()=>{const r=dccInvRows(),item=decodeURIComponent(el.dataset.item),x=r.find(y=>y.item===item);if(x){x.onHand=Number(el.value||0);x.updatedAt=new Date().toISOString();dccSaveInvRows(r);await dccInvPush();await dccRenderInventoryV24()}});
}
async function dccRenderPurchaseReconcileV24(){
 const h=document.getElementById("dccPurchaseReconcileV24");if(!h)return;const purchase=dccPurchaseRowsV23(),inv=await dccInvPull();
 const rows=purchase.map(p=>{const stock=inv.find(x=>x.item.toLowerCase()===p.item.toLowerCase()),need=dccQtyNumber(p.qty),on=Number(stock?.onHand||0),buy=Math.max(0,need-on);return {...p,need,on,buy,unit:stock?.unit||""}});
 h.innerHTML=`<div class="v24-rec-head"><div><span>DCC OS • PURCHASE RECONCILIATION</span><h3>Job Need vs. Shop Inventory</h3></div></div><div class="v24-rec">${rows.map(x=>`<div class="v24-rec-row"><b>${x.item}</b><span>Job needs ${x.need}</span><span>On hand ${x.on}</span><strong>BUY ${x.buy}${x.unit?" "+x.unit:""}</strong></div>`).join("")||"<p>Current job purchase items will reconcile here.</p>"}</div>`;
}
window.dccRenderInventoryV24=dccRenderInventoryV24;window.dccRenderPurchaseReconcileV24=dccRenderPurchaseReconcileV24;


/* DCC OPERATIONAL BACKBONE v25 */
function dccCurrentJob(){
  if(typeof state==="undefined")return null;
  return state.currentJob || state.job || state.activeJob || null;
}
function dccBackboneStages(){
  return ["Lead / Inquiry","Client Meeting","Measure / Site Visit","Estimate / Quote","Waiting on Customer","Deposit / Approved","Design / Samples","Materials / Ordering","Fabrication","Ready to Install","Install Scheduled","Installed / Final Payment","Complete"];
}
function dccBackboneSteps(){
  return ["Customer Info Complete","Measurements Entered","Quote Reviewed","Purchase Reviewed","Materials Status Checked","Time Tracking Ready","Production Workflow Started"];
}
async function dccSaveBackboneJob(job){
  if(!job)return false;
  const jobsArr=(typeof state!=="undefined"&&Array.isArray(state.jobs))?state.jobs:[];
  const i=jobsArr.findIndex(x=>String(x.id)===String(job.id));
  if(i>=0)jobsArr[i]=job;
  if(typeof saveJobs==="function"){await saveJobs();return true}
  return false;
}
function dccBuildCustomerQuoteV25(){
  const job=dccCurrentJob()||{};
  const totals=(typeof calcBase==="function")?calcBase():{};
  const money=n=>"$"+(Number(n||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}));
  const total=Number(totals.total||totals.grandTotal||totals.projectTotal||job.total||0);
  const deposit=Number(totals.deposit||job.deposit||total*.5||0);
  const balance=Number(totals.balance||Math.max(0,total-deposit));
  return `<div class="v25-quote-paper">
    <div class="v25-quote-head"><div><h1>Davis Custom Counter Tops & More</h1><p>Customer Quote</p></div><div><b>${job.estimate||job.estimateNo||"DCC Estimate"}</b><span>${new Date().toLocaleDateString()}</span></div></div>
    <section class="v25-quote-info"><div><span>Prepared For</span><b>${job.customer||job.name||""}</b></div><div><span>Project</span><b>${job.project||job.projectName||""}</b></div><div><span>Phone</span><b>${job.phone||""}</b></div><div><span>Email</span><b>${job.email||""}</b></div></section>
    <table class="v25-quote-table"><tbody>
      <tr><th>Description</th><th>Amount</th></tr>
      <tr><td>Materials, coatings, fabrication, labor, and selected project modules</td><td>${money(total)}</td></tr>
      <tr><td>Deposit Due</td><td>${money(deposit)}</td></tr>
      <tr><td>Balance Due at Completion</td><td>${money(balance)}</td></tr>
    </tbody></table>
    <section class="v25-terms"><h3>Terms</h3><p>Estimate is based on measurements and options entered at the time of quote. Changes to layout, material, finish, edge treatment, cutouts, repairs, or installation conditions may change final pricing. Materials and fabrication extras are not discounted; labor discounts apply to labor only.</p></section>
    <div class="v25-signature"><span>Customer Signature ______________________________</span><span>Date ____________</span></div>
  </div>`;
}
function dccRenderBackboneV25(){
  const h=document.getElementById("dccBackboneV25"); if(!h)return;
  const job=dccCurrentJob();
  if(!job){h.innerHTML=`<div class="v25-card"><h2>Operational Backbone</h2><p>Select or create a customer/job first. This screen ties Customer Info → Quote → Purchase → Production together.</p></div>`;return}
  job.dccBackbone=job.dccBackbone||{};
  const stage=job.dccStage||job.status||"Lead / Inquiry";
  h.innerHTML=`<div class="v25-shell">
    <div class="v25-hero"><div><span>DCC OS • OPERATIONAL BACKBONE</span><h2>${job.customer||"Customer"} • ${job.project||job.projectName||"Job"}</h2><p>Customer Info → Quote → Purchase → Production</p></div><select id="v25Stage">${dccBackboneStages().map(s=>`<option ${s===stage?"selected":""}>${s}</option>`).join("")}</select></div>
    <div class="v25-checks">${dccBackboneSteps().map(s=>`<label class="${job.dccBackbone[s]?"done":""}"><input type="checkbox" data-step="${s}" ${job.dccBackbone[s]?"checked":""}><b>${s}</b></label>`).join("")}</div>
    <div class="v25-actions"><button id="v25ReviewQuote" type="button">Review Paper-Friendly Quote</button><button id="v25PrintQuote" type="button">Print / Save Quote</button><button id="v25SaveJob" type="button">Save Operational Status</button><div id="v25Status"></div></div>
    <div id="v25QuotePreview" class="v25-quote-preview"></div>
  </div>`;
  document.getElementById("v25Stage").onchange=async e=>{job.dccStage=e.target.value;job.status=e.target.value;await dccSaveBackboneJob(job);document.getElementById("v25Status").textContent="Stage saved."};
  h.querySelectorAll("input[data-step]").forEach(x=>x.onchange=async()=>{job.dccBackbone[x.dataset.step]=x.checked;await dccSaveBackboneJob(job);dccRenderBackboneV25()});
  document.getElementById("v25ReviewQuote").onclick=()=>{document.getElementById("v25QuotePreview").innerHTML=dccBuildCustomerQuoteV25()};
  document.getElementById("v25PrintQuote").onclick=()=>{document.getElementById("v25QuotePreview").innerHTML=dccBuildCustomerQuoteV25();setTimeout(()=>window.print(),100)};
  document.getElementById("v25SaveJob").onclick=async()=>{await dccSaveBackboneJob(job);document.getElementById("v25Status").textContent="Operational backbone saved to cloud."};
}
window.dccRenderBackboneV25=dccRenderBackboneV25;


/* DCC PRODUCTION CANDIDATE v26 — REPORTING + FOLLOW-UP */
function dccMoneyV26(n){return "$"+Number(n||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
async function dccRenderBusinessReportV26(){
 const h=document.getElementById("dccBusinessReportV26");if(!h)return;
 const jobs=(typeof state!=="undefined"&&Array.isArray(state.jobs))?state.jobs:[];
 const time=await dccGetTime(), help=await dccHelpPull();
 const now=new Date(), starts={Week:new Date(now),Month:new Date(now.getFullYear(),now.getMonth(),1),Year:new Date(now.getFullYear(),0,1)};
 starts.Week.setHours(0,0,0,0);starts.Week.setDate(now.getDate()-now.getDay());
 const sum=a=>a.reduce((n,x)=>n+(Number(x.hours)||0),0);
 const totalJobHours=sum(time.filter(x=>x.job&&x.job!=="GENERAL_DCC")), businessHours=sum(time.filter(x=>!x.job||x.job==="GENERAL_DCC"));
 const outsidePaid=help.reduce((n,x)=>n+(Number(x.amount)||0),0);
 const period=Object.entries(starts).map(([k,d])=>[k,sum(time.filter(x=>new Date(x.createdAt)>=d))]);
 const completed=jobs.filter(j=>["complete","completed","closed"].includes(String(j.status||"").toLowerCase())).length;
 h.innerHTML=`<div class="v26-report-head"><div><span>DCC OS • BUSINESS REPORTING</span><h2>Business Snapshot</h2></div><b>${jobs.length} JOBS TRACKED</b></div>
 <div class="v26-stats"><div><span>JOB LABOR</span><b>${totalJobHours.toFixed(1)} hrs</b></div><div><span>GENERAL DCC</span><b>${businessHours.toFixed(1)} hrs</b></div><div><span>OUTSIDE LABOR PAID</span><b>${dccMoneyV26(outsidePaid)}</b></div><div><span>COMPLETED JOBS</span><b>${completed}</b></div></div>
 <div class="v26-periods">${period.map(([k,v])=>`<div><span>THIS ${k.toUpperCase()}</span><b>${v.toFixed(1)} hrs</b></div>`).join("")}</div>
 <p class="v26-note">Profitability will become more accurate automatically as real DCC time, helper pay, inventory, and completed jobs accumulate.</p>`;
}
function dccFollowupItemsV26(){
 const jobs=(typeof state!=="undefined"&&Array.isArray(state.jobs))?state.jobs:[];
 return jobs.filter(j=>!["complete","completed","closed"].includes(String(j.status||"").toLowerCase())).map(j=>{
   const stage=j.dccStage||j.status||"Lead / Inquiry", next=j.nextAction||j.next||"";
   let priority=next?1:2;
   if(["Waiting on Customer","Estimate / Quote","Ready to Install","Installed / Final Payment"].includes(stage))priority=3;
   return {j,stage,next,priority};
 }).sort((a,b)=>b.priority-a.priority);
}
function dccRenderFollowupsV26(){
 const h=document.getElementById("dccFollowupsV26");if(!h)return;const items=dccFollowupItemsV26();
 h.innerHTML=`<div class="v26-follow-head"><div><span>DCC OS • FOLLOW-UP</span><h2>Needs Attention</h2></div><b>${items.length} OPEN</b></div>
 <div class="v26-follow-list">${items.slice(0,12).map(x=>`<div class="v26-follow"><div><b>${x.j.customer||"Customer"} • ${x.j.project||x.j.projectName||"Job"}</b><span>${x.stage}</span></div><strong>${x.next||"NEXT ACTION NOT SET"}</strong></div>`).join("")||"<p>No open jobs need attention.</p>"}</div>`;
}
window.dccRenderBusinessReportV26=dccRenderBusinessReportV26;window.dccRenderFollowupsV26=dccRenderFollowupsV26;


/* DCC CONTROLLED FRESH START v28 */
async function dccFreshStartV28(){
 const btn=document.getElementById("dccFreshStartBtnV28"),status=document.getElementById("dccFreshStartStatusV28");
 if(!confirm("Erase ALL current DCC test/sample jobs, time, outside help, inventory, and material-status data? Pricing and app setup will be preserved."))return;
 if(btn)btn.disabled=true;if(status)status.textContent="Clearing test data…";
 try{
   const localJobs=jobs();
   let cloudJobs=[];
   try{
     const r=await fetchJobCloud(["/api/jobs","/jobs"]);
     const raw=await r.json(); cloudJobs=Array.isArray(raw)?raw:(raw.jobs||raw.results||raw.data||[]);
   }catch(e){}
   const ids=[...new Set([...localJobs.map(x=>x.id),...cloudJobs.map(x=>x.id)].filter(Boolean).map(String))];
   for(const id of ids){try{await deleteJobFromCloud(id)}catch(e){}}
   saveJobs([]);
   localStorage.removeItem("dcc-os-state");
   localStorage.removeItem("dcc-os-time-log");
   localStorage.removeItem("dcc-os-outside-help");
   localStorage.removeItem("dcc-os-material-status");
   localStorage.removeItem("dcc-os-inventory-v24");
   await fetch(apiUrl("/api/settings"),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({dccTimeLog:[],dccOutsideHelp:[],dccMaterialStatus:{},dccInventory:[]})});
   if(status)status.textContent="Fresh start complete. Reloading DCC OS…";
   localStorage.setItem("dcc-os-fresh-start-complete-v28",new Date().toISOString());
   setTimeout(()=>location.reload(),900);
 }catch(e){
   if(status)status.textContent="Fresh start failed. Nothing else will be changed until retried.";
   if(btn)btn.disabled=false;
 }
}
function dccRenderFreshStartV28(){
 const h=document.getElementById("dccFreshStartV28");if(!h)return;
 if(localStorage.getItem("dcc-os-fresh-start-complete-v28")){h.remove();return}
 h.innerHTML=`<div class="v28-fresh"><div><span>DCC OS • PRODUCTION START</span><h2>Ready for a clean DCC start.</h2><p>This clears test/sample business data while preserving pricing and the app system.</p></div><button id="dccFreshStartBtnV28" type="button">START DCC FRESH</button><strong id="dccFreshStartStatusV28"></strong></div>`;
 document.getElementById("dccFreshStartBtnV28").onclick=dccFreshStartV28;
}
window.dccFreshStartV28=dccFreshStartV28;window.dccRenderFreshStartV28=dccRenderFreshStartV28;


/* DCC AUTO ESTIMATE NUMBER v29 */
function dccEstimateNumbersV29(){
 const arr=(typeof state!=="undefined"&&Array.isArray(state.jobs))?state.jobs:[];
 return arr.map(j=>String(j.estimate||j.estimateNo||""))
   .map(s=>{const m=s.match(/DCC-(\d+)/i);return m?Number(m[1]):0})
   .filter(Boolean);
}
function dccNextEstimateV29(){
 const nums=dccEstimateNumbersV29();
 return "DCC-"+String((nums.length?Math.max(...nums):0)+1).padStart(4,"0");
}
function dccAssignEstimateV29(job){
 if(!job)return job;
 if(!job.estimate&&!job.estimateNo){
   const n=dccNextEstimateV29();
   job.estimate=n;
   job.estimateNo=n;
 }
 return job;
}
async function dccEnsureCurrentEstimateV29(){
 const job=(typeof dccCurrentJob==="function")?dccCurrentJob():null;
 if(!job||job.estimate||job.estimateNo)return;
 dccAssignEstimateV29(job);
 if(typeof saveJobs==="function")await saveJobs();
}
window.dccNextEstimateV29=dccNextEstimateV29;
window.dccAssignEstimateV29=dccAssignEstimateV29;


/* v29 save guard: assign estimate numbers before cloud save */
if(typeof saveJobs==="function"){
 const dccOriginalSaveJobsV29=saveJobs;
 saveJobs=async function(){
   const arr=(typeof state!=="undefined"&&Array.isArray(state.jobs))?state.jobs:[];
   arr.forEach(dccAssignEstimateV29);
   return await dccOriginalSaveJobsV29.apply(this,arguments);
 };
}
document.addEventListener("DOMContentLoaded",()=>setTimeout(dccEnsureCurrentEstimateV29,900));


/* DCC AUTO MILEAGE v30
Shop origin: 213 Claremont Ave, East Peoria, IL
Charge: $0.68 per mile beyond 30 one-way miles.
Default visit plan: 3 round trips = estimate, sample/template, install.
Formula: max(oneWay-30,0) * 2 * roundTrips * rate
*/
const DCC_SHOP_ADDRESS_V30="213 Claremont Ave, East Peoria, IL 61611";
async function dccGeocodeV30(q){
 const u="https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q="+encodeURIComponent(q);
 const r=await fetch(u,{headers:{"Accept":"application/json"}});if(!r.ok)throw new Error("Address lookup failed");
 const a=await r.json();if(!a.length)throw new Error("Address not found");return {lat:+a[0].lat,lon:+a[0].lon}
}
async function dccRoadMilesV30(from,to){
 const a=await dccGeocodeV30(from),b=await dccGeocodeV30(to);
 const u=`https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=false`;
 const r=await fetch(u);if(!r.ok)throw new Error("Mileage route failed");const d=await r.json();
 if(!d.routes||!d.routes.length)throw new Error("No driving route found");return d.routes[0].distance/1609.344
}
function dccMileageChargeV30(){
 const miles=Number(state.oneWayMiles||0),trips=Number(state.roundTrips||3),free=Number(pricing.freeOneWayMiles||30),rate=Number(pricing.mileageRate||.68);
 const billableOneWay=Math.max(0,miles-free),billableMiles=billableOneWay*2*trips;
 return {oneWayMiles:miles,roundTrips:trips,billableMiles,mileageCharge:billableMiles*rate}
}
async function dccCalculateMileageV30(force=false){
 const address=String(state.address||"").trim(),status=document.getElementById("dccMileageStatusV30");
 if(!address)return false;
 if(!force&&state.mileageLastAddress===address&&Number(state.oneWayMiles)>=0)return true;
 if(status)status.textContent="Calculating driving mileage…";
 try{
   const miles=await dccRoadMilesV30(DCC_SHOP_ADDRESS_V30,address);
   state.oneWayMiles=Math.round(miles*10)/10;state.roundTrips=Number(state.roundTrips||3);state.mileageLastAddress=address;save();updateBindings();
   if(status){const m=dccMileageChargeV30();status.textContent=`${m.oneWayMiles.toFixed(1)} miles one way • ${m.roundTrips} round trips • ${dccMoneyV26?dccMoneyV26(m.mileageCharge):"$"+m.mileageCharge.toFixed(2)} travel charge`}
   return true;
 }catch(e){if(status)status.textContent="Mileage could not be calculated. Check the full customer address.";return false}
}
function dccBindMileageV30(){
 const address=document.getElementById("address");
 if(address){
   address.addEventListener("change",()=>setTimeout(()=>dccCalculateMileageV30(true),0));
   address.addEventListener("blur",()=>{if(String(state.address||"").trim()&&state.mileageLastAddress!==String(state.address||"").trim())setTimeout(()=>dccCalculateMileageV30(true),0)});
 }
}
window.dccCalculateMileageV30=dccCalculateMileageV30;
