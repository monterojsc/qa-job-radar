const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const els = {
  jobs: $('#jobs'), empty: $('#empty'), notice: $('#notice'), lastUpdate: $('#lastUpdate'), profileGroups: $('#profileGroups'), marketSkills: $('#marketSkills'), marketInsight: $('#marketInsight'), marketInsightTitle: $('#marketInsightTitle'), pipeline: $('#pipeline'),
  search: $('#searchInput'), modality: $('#modalityFilter'), score: $('#scoreFilter'), salary: $('#salaryFilter'), language: $('#languageFilter'), status: $('#statusFilter'), sort: $('#sortFilter'),
  total: $('#statTotal'), high: $('#statHigh'), remote: $('#statRemote'), fresh: $('#statFresh'), applied: $('#statApplied'), interview: $('#statInterview'), resultCount: $('#resultCount'),
  refresh: $('#refreshBtn'), install: $('#installBtn'), template: $('#jobTemplate'), compareOpen: $('#compareOpenBtn'), compareDialog: $('#compareDialog'), compareTable: $('#compareTableWrap'),
  profileBtn: $('#profileBtn'), profileDialog: $('#profileDialog'), profileAccountTitle: $('#profileAccountTitle'), profileAccountCopy: $('#profileAccountCopy'), googleLoginBtn: $('#googleLoginBtn'), cvInput: $('#cvInput'), cvStatus: $('#cvStatus'), profileName: $('#profileName'), profileSalary: $('#profileSalary'), profileRemoteCountry: $('#profileRemoteCountry'), profileLocation: $('#profileLocation'), prefRemote: $('#prefRemote'), prefHybrid: $('#prefHybrid'), prefOnsite: $('#prefOnsite'), profileSkills: $('#profileSkills'), saveProfileBtn: $('#saveProfileBtn'), resetProfileBtn: $('#resetProfileBtn'),
  dataBtn: $('#dataBtn'), dataDialog: $('#dataDialog'), exportBtn: $('#exportBtn'), importInput: $('#importInput'), syncBtn: $('#syncBtn'), syncDialog: $('#syncDialog'), syncUnavailable: $('#syncUnavailable'), syncAuth: $('#syncAuth'), syncEmail: $('#syncEmail'), syncPassword: $('#syncPassword'), syncStatus: $('#syncStatus'), loginBtn: $('#loginBtn'), signupBtn: $('#signupBtn'), logoutBtn: $('#logoutBtn'), syncGoogleBtn: $('#syncGoogleBtn'),
  quickAll: $('#quickAll'), quickPriority: $('#quickPriority'), quickNew: $('#quickNew'), quickSalary: $('#quickSalary'), quickSafe: $('#quickSafe')
};

const STATE_KEY='qaJobRadar.states.v6';
const LEGACY_KEYS=['qaJobRadar.states.v5','qaJobRadar.states.v4','qaJobRadar.states.v3'];
const HISTORY_KEY='qaJobRadar.history.v6';
const LEGACY_HISTORY_KEYS=['qaJobRadar.history.v5','qaJobRadar.appliedHistory.v4'];
const SEEN_KEY='qaJobRadar.seen.v6';
const CACHE_KEY='qaJobRadar.cache.v6';
const LAST_VISIT_KEY='qaJobRadar.lastVisit.v6';
const AUTH_KEY='qaJobRadar.syncAuth.v6';
const PROFILE_KEY='qaJobRadar.profile.v6';
const TRACKED_STATUSES=['priority','saved','applied','interview','rejected','offer'];
const APPLIED_STATUSES=['applied','interview','rejected','offer'];
const STATUS_LABELS={active:'Pendiente',priority:'Prioritaria',saved:'Guardada',applied:'Aplicada',interview:'Entrevista',rejected:'Rechazada',offer:'Oferta recibida',discarded:'Descartada'};
let config=null, jobs=[], allJobs=[], deferredInstall=null, quickMode='all', selectedCompare=new Set(), syncConfig={enabled:false}, syncTimer=null, supabaseClient=null;
const sessionStart=Date.now();
const previousVisit=Number(localStorage.getItem(LAST_VISIT_KEY)||0);
localStorage.setItem(LAST_VISIT_KEY,String(sessionStart));

function norm(s=''){return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();}
function cleanHtml(s=''){const el=document.createElement('div');el.innerHTML=String(s||'');return (el.textContent||'').replace(/\s+/g,' ').trim();}
function uniq(a){return [...new Set((a||[]).filter(Boolean))];}
function safeNum(v){const x=Number(v);return Number.isFinite(x)?x:null;}
const scriptLoads=new Map();
function loadScript(src,ready){if(ready?.())return Promise.resolve();if(scriptLoads.has(src))return scriptLoads.get(src);const promise=new Promise((resolve,reject)=>{const el=document.createElement('script');el.src=src;el.async=true;el.onload=()=>ready&&!ready()?reject(new Error('La librería no se inicializó correctamente')):resolve();el.onerror=()=>reject(new Error(`No se pudo cargar ${src}`));document.head.appendChild(el);});scriptLoads.set(src,promise);return promise;}
async function ensureSupabaseLib(){await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',()=>!!window.supabase?.createClient);}
async function ensurePdfLib(){await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',()=>!!window.pdfjsLib);window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';}
async function ensureMammothLib(){await loadScript('https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js',()=>!!window.mammoth);}
function readLocal(k,fallback={}){try{return JSON.parse(localStorage.getItem(k)||JSON.stringify(fallback));}catch{return fallback;}}
function writeLocal(k,v){localStorage.setItem(k,JSON.stringify(v));}
function baseProfile(){
  const d=config?.default_preferences||{};
  return {
    name:'QA / Test Engineer',
    skills:(config?.profile_skills||[]).map(x=>x.label),
    salaryMin:Number(d.salary_min_eur||config?.salary_min_eur||32000),
    remoteCountry:d.remote_country||'España',
    location:d.hybrid_location||'Madrid',
    allowRemote:d.allow_remote!==false,
    allowHybrid:d.allow_hybrid!==false,
    allowOnsite:d.allow_onsite!==false,
    source:'base',
    cvFileName:null,
    languages:[],
    updatedAt:0
  };
}
function getProfile(){const saved=readLocal(PROFILE_KEY,null);return saved&&Array.isArray(saved.skills)?{...baseProfile(),...saved}:baseProfile();}
function setProfile(profile,{sync=true}={}){writeLocal(PROFILE_KEY,{...profile,updatedAt:Date.now()});if(sync){scheduleProfileSync();scheduleSync();}if(config){renderProfile();updateProfileUI();if(allJobs.length){applyActiveProfile();render();}}}
function splitSkills(value=''){return uniq(String(value).split(/[,;\n]/).map(x=>x.trim()).filter(Boolean));}
function profileSkillSet(){return new Set(getProfile().skills.map(norm));}
function locationMatchesPreference(j,profile=getProfile()){
  const loc=norm(j.location||'');
  const desc=norm((j.description||'').slice(0,1200));
  if(j.modality==='remote'){
    if(!profile.allowRemote)return false;
    const country=norm(profile.remoteCountry||'espana');
    const spainTerms=(config?.spain_terms||['spain','espana']).map(norm);
    if(country==='espana'||country==='spain'){if(j.spainEligible||norm(j.country)==='es')return true;return spainTerms.some(x=>loc.includes(x)||desc.includes(x));}
    return loc.includes(country)||desc.includes(country);
  }
  if(j.modality==='hybrid'&&!profile.allowHybrid)return false;
  if(j.modality==='onsite'&&!profile.allowOnsite)return false;
  const wanted=norm(profile.location||'madrid');
  if(wanted==='madrid')return (config?.madrid_area_terms||['madrid']).some(x=>loc.includes(norm(x))||desc.includes(norm(x)));
  return !!wanted&&(loc.includes(wanted)||desc.includes(wanted));
}
function salaryMatchesPreference(j,profile=getProfile()){
  const min=Number(profile.salaryMin||0);if(!min||!j.salary||j.salary.currency!=='EUR')return true;
  const top=Number(j.salary.max||j.salary.min||0);return !top||top>=min;
}
function knownSkillDefs(){return [...(config?.profile_skills||[]),...(config?.market_skills||[])];}
function aliasesForSkill(label){const n=norm(label);const def=knownSkillDefs().find(x=>norm(x.label)===n);return uniq([label,...(def?.aliases||[])]);}
function languageLevelValue(v=''){const n=norm(v);if(/c2|nativo|native|bilingual|bilingue/.test(n))return 5;if(/c1|avanzado|advanced/.test(n))return 4;if(/b2|fluido|fluent/.test(n))return 3;if(/b1|intermedio|intermediate/.test(n))return 2;if(/a1|a2|basico|basic/.test(n))return 1;return 0;}
function profileLanguageRisk(j,p){const req=j.languages||[];if(!req.length)return null;for(const r of req){const nr=norm(r);const lang=nr.includes('ingles')?'ingles':nr.includes('frances')?'frances':nr.includes('aleman')?'aleman':nr.includes('portugues')?'portugues':nr.includes('italiano')?'italiano':nr.includes('espanol')?'espanol':null;if(!lang)continue;const own=(p.languages||[]).find(x=>norm(x).includes(lang));if(!own)return `${r} solicitado · no detectado en el CV`;const need=languageLevelValue(r),have=languageLevelValue(own);if(need&&have&&have<need)return `${r} solicitado · el CV parece indicar un nivel inferior`;}
  return null;}
function personalizeJob(raw){
  const p=getProfile();const j={...raw};
  if(p.source==='base')return j;
  const text=norm(`${j.title||''} ${j.description||''} ${(j.tags||[]).join(' ')} ${(j.requestedSkills||[]).join(' ')}`);
  const matched=[];let weighted=0;
  for(const skill of p.skills||[]){
    const aliases=aliasesForSkill(skill);if(aliases.some(a=>text.includes(norm(a)))){matched.push(skill);const d=knownSkillDefs().find(x=>norm(x.label)===norm(skill));weighted+=Number(d?.weight||2.5);}
  }
  const requested=uniq(j.requestedSkills||[]);
  const pset=new Set((p.skills||[]).map(norm));
  const missing=requested.filter(x=>!pset.has(norm(x))).slice(0,8);
  const title=norm(j.title||'');const nameTokens=norm(p.name||'').split(/[^a-z0-9+#.]+/).filter(x=>x.length>2);
  let role=nameTokens.some(t=>title.includes(t))?24:/\b(qa|quality|test|testing|validation|verification)\b/.test(title)?20:Math.min(18,Number(j.scoreBreakdown?.role||12));
  const profileScore=Math.min(45,weighted);
  const exp=Number(j.scoreBreakdown?.experience??8);
  const mode=5;
  const dynamicLanguageRisk=profileLanguageRisk(j,p);const lang=dynamicLanguageRisk?1:5;
  let salary=3;if(j.salary?.currency==='EUR'){const floor=Number(j.salary.min||0),ceil=Number(j.salary.max||0);salary=floor>=Number(p.salaryMin||0)?5:(ceil>=Number(p.salaryMin||0)?2:0);}
  const score=Math.max(0,Math.min(100,Math.round(role+profileScore+exp+mode+lang+salary)));
  return {...j,score,matchedSkills:uniq(matched).slice(0,16),missingSkills:missing,languageRisk:dynamicLanguageRisk,scoreBreakdown:{role,profile:Math.round(profileScore*10)/10,experience:exp,modality:mode,language:lang,salary}};
}
function analyzeCvText(text,fileName='CV'){
  const nt=norm(text);const found=[];
  for(const def of knownSkillDefs()){
    let hits=0;for(const a of (def.aliases||[def.label])){const needle=norm(a);if(!needle||needle.length<2)continue;let pos=0;while((pos=nt.indexOf(needle,pos))>=0){hits++;pos+=needle.length;}}
    if(hits)found.push({label:def.label,hits,weight:Number(def.weight||1)});
  }
  found.sort((a,b)=>(b.hits*b.weight)-(a.hits*a.weight));
  const skills=uniq(found.map(x=>x.label)).slice(0,45);
  const langs=[];
  for(const [label,pat] of [['Inglés',/\b(english|ingles)\b/],['Francés',/\b(french|frances)\b/],['Alemán',/\b(german|aleman)\b/],['Portugués',/\b(portuguese|portugues)\b/],['Español',/\b(spanish|espanol)\b/]]){const m=nt.match(pat);if(!m)continue;const i=m.index||0,w=nt.slice(Math.max(0,i-80),i+120);let level='';if(/\bc2\b|nativo|native|bilingual|bilingue/.test(w))level=' C2/nativo';else if(/\bc1\b|avanzado|advanced/.test(w))level=' C1';else if(/\bb2\b|fluido|fluent/.test(w))level=' B2';else if(/\bb1\b|intermedio|intermediate/.test(w))level=' B1';else if(/\ba1\b|\ba2\b|basico|basic/.test(w))level=' básico';langs.push(label+level);}
  let name='Perfil profesional';
  if(/\b(qa|quality assurance|test engineer|testing engineer|tester)\b/.test(nt))name='QA / Test Engineer';
  if(/\b(firmware|cpe|router|telecom|telecommunications)\b/.test(nt)&&/\b(qa|test|testing|validation)\b/.test(nt))name='QA / Test Engineer · Firmware / Telecom';
  else if(/\b(data engineer|data analyst|big data)\b/.test(nt))name='Data / Big Data';
  else if(/\b(devops|cloud engineer|site reliability)\b/.test(nt))name='DevOps / Cloud';
  else if(/\b(frontend|front-end|react developer)\b/.test(nt))name='Frontend Engineer';
  else if(/\b(backend|back-end|java developer|python developer)\b/.test(nt))name='Backend Engineer';
  return {name,skills,languages,source:'cv',cvFileName:fileName,analysisAt:new Date().toISOString()};
}
async function extractCvText(file){
  const ext=(file.name.split('.').pop()||'').toLowerCase();
  if(ext==='txt')return await file.text();
  if(ext==='pdf'){
    await ensurePdfLib();
    const doc=await window.pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise;let out='';
    for(let i=1;i<=doc.numPages;i++){const page=await doc.getPage(i),content=await page.getTextContent();out+=' '+content.items.map(x=>x.str).join(' ');}
    return out;
  }
  if(ext==='docx'){
    await ensureMammothLib();
    const r=await window.mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()});return r.value||'';
  }
  throw new Error('Formato no soportado. Usa PDF, DOCX o TXT.');
}
function getStates(){return readLocal(STATE_KEY,{});}
function setStates(v){writeLocal(STATE_KEY,v);scheduleSync();}
function getHistory(){return readLocal(HISTORY_KEY,{});}
function setHistory(v){writeLocal(HISTORY_KEY,v);scheduleSync();}
function getSeen(){return readLocal(SEEN_KEY,{});}
function setSeen(v){writeLocal(SEEN_KEY,v);}
function canonicalTitle(v=''){return norm(v).replace(/\b(senior|sr\.?|junior|jr\.?|all genders|m\/f\/d|h\/m\/x|f\/m\/d)\b/g,' ').replace(/[^a-z0-9+.# ]/g,' ').replace(/\s+/g,' ').trim();}
function canonicalCompany(v=''){return norm(v).replace(/\b(s\.?l\.?u?|s\.?a\.?u?|inc\.?|ltd\.?|llc|gmbh)\b/g,' ').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();}
function canonicalJobKey(j){return `job:${canonicalCompany(j.company)}|${canonicalTitle(j.title)}`;}
function titleTokens(v=''){const stop=new Set(['senior','sr','junior','jr','all','genders','m','f','d','h']);return canonicalTitle(v).split(' ').filter(x=>x.length>1&&!stop.has(x));}
function titleSimilarity(a,b){const A=new Set(titleTokens(a)),B=new Set(titleTokens(b));if(!A.size||!B.size)return 0;let inter=0;for(const x of A)if(B.has(x))inter++;return inter/Math.max(A.size,B.size);}
function sameVacancy(a,b,threshold=.76){return canonicalCompany(a.company)===canonicalCompany(b.company)&&titleSimilarity(a.title,b.title)>=threshold;}
function normalizeStateRecord(v,key=''){if(typeof v==='string')return {status:v,updatedAt:0,title:key.split('|')[1]||'',company:key.split('|')[0]||''};return {...v,status:v?.status||'active'};}
function findStateRecord(j){const states=getStates(),key=canonicalJobKey(j);if(states[key])return {key,record:normalizeStateRecord(states[key],key)};for(const [k,v] of Object.entries(states)){const r=normalizeStateRecord(v,k);if(r.company&&r.title&&canonicalCompany(r.company)===canonicalCompany(j.company)&&titleSimilarity(r.title,j.title)>=.76)return {key:k,record:r};}return {key,record:{status:'active',title:j.title,company:j.company,updatedAt:0}};}
function getStatus(j){return findStateRecord(j).record.status||'active';}
function migrateLegacy(){const current=getStates();let changed=false;for(const legacyKey of LEGACY_KEYS){const legacy=readLocal(legacyKey,{});for(const [k,v] of Object.entries(legacy)){const status=typeof v==='string'?v:v?.status;if(!status)continue;const raw=k.replace(/^job:/,'');const parts=raw.split('|');const title=parts[1]||'',company=parts[0]||'';if(!current[k]){current[k]={status,title,company,updatedAt:Date.now()};changed=true;}}}
  const hist=getHistory();for(const hk of LEGACY_HISTORY_KEYS){const oldHistory=readLocal(hk,{});for(const [k,v] of Object.entries(oldHistory)){if(!hist[k]){hist[k]={...v,status:v.status||'applied',appliedAt:v.appliedAt||new Date().toISOString()};changed=true;}}}
  if(changed){writeLocal(STATE_KEY,current);writeLocal(HISTORY_KEY,hist);}
}
function snapshotHistory(j,status){if(!TRACKED_STATUSES.includes(status))return;const h=getHistory(),key=canonicalJobKey(j),old=h[key]||{};h[key]={...old,...j,status,trackedAt:old.trackedAt||new Date().toISOString(),updatedAt:new Date().toISOString(),appliedAt:APPLIED_STATUSES.includes(status)?(old.appliedAt||new Date().toISOString()):old.appliedAt};setHistory(h);}
function removeHistoryIfUntracked(j,status){if(TRACKED_STATUSES.includes(status))return;const h=getHistory();for(const [k,v] of Object.entries(h)){if(k===canonicalJobKey(j)||sameVacancy(v,j)){delete h[k];}}setHistory(h);}
function setStatus(j,status){const states=getStates();const found=findStateRecord(j);if(found.key!==canonicalJobKey(j)&&states[found.key])delete states[found.key];const key=canonicalJobKey(j);const old=found.record||{};states[key]={...old,status,title:j.title,company:j.company,updatedAt:Date.now(),appliedAt:APPLIED_STATUSES.includes(status)?(old.appliedAt||Date.now()):old.appliedAt};setStates(states);if(TRACKED_STATUSES.includes(status))snapshotHistory(j,status);else removeHistoryIfUntracked(j,status);if(status==='applied')flashNotice('Marcada como aplicada. Si reaparece desde otra fuente seguirá oculta de Pendientes.');else if(status==='discarded')flashNotice('Oferta descartada. No volverá a aparecer entre Pendientes.');else if(status==='interview')flashNotice('Estado actualizado a Entrevista.');else if(status==='offer')flashNotice('Estado actualizado a Oferta recibida.');else flashNotice('Estado actualizado.');render();}
function publishedTime(v){if(v===null||v===undefined||v==='')return NaN;let raw=v;if(typeof raw==='string'&&/^\d+(?:\.\d+)?$/.test(raw.trim()))raw=Number(raw);if(typeof raw==='number'&&Number.isFinite(raw)){if(raw<1e11)raw*=1000;return raw;}const t=new Date(raw).getTime();return Number.isFinite(t)?t:NaN;}
function ageHours(v){const t=publishedTime(v);return Number.isFinite(t)?Math.max(0,(Date.now()-t)/36e5):9999;}
function fmtDate(v){const t=publishedTime(v);if(!Number.isFinite(t))return 'No indicada';return new Intl.DateTimeFormat('es-ES',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(t));}
function withinFourWeeks(v){const t=publishedTime(v);return Number.isFinite(t)&&t<=Date.now()+12*36e5&&t>=Date.now()-28*24*36e5;}
function initials(company=''){return String(company).trim().split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]?.toUpperCase()).join('')||'QA';}
function salaryText(s){if(!s)return 'No publicado';const f=n=>n?new Intl.NumberFormat('es-ES',{maximumFractionDigits:0}).format(n):null;const cur=s.currency==='EUR'?'€':(s.currency||'');if(s.min&&s.max)return `${f(s.min)}–${f(s.max)} ${cur}/año`;if(s.min)return `Desde ${f(s.min)} ${cur}/año`;if(s.max)return `Hasta ${f(s.max)} ${cur}/año`;return 'No publicado';}
function salarySourceText(s){if(!s)return 'La empresa no muestra una cifra';return s.estimated?'Detectado en el texto de la oferta':'Dato estructurado de la publicación';}
function salaryComparable(j){if(!j.salary)return 0;return Number(j.salary.max||j.salary.min||0);}
function modalityLabel(v){const p=getProfile();return v==='remote'?`100% remoto · ${p.remoteCountry||'España'}`:v==='hybrid'?`Híbrido · ${p.location||'Madrid'}`:`Presencial · ${p.location||'Madrid'}`;}
function statusLabel(s){return STATUS_LABELS[s]||s;}
function statusClass(s){return `state-${s||'active'}`;}
function experienceYears(j){return Number(String(j.experience||'').match(/\d+/)?.[0]||0);}
function severeBlockers(j){const out=[];if(j.geoRisk)out.push(j.geoRisk);if(j.salaryRisk&&/debajo/.test(norm(j.salaryRisk)))out.push(j.salaryRisk);if(j.languageRisk&&/c1|c2|nativo|avanzado/.test(norm(j.languageRisk)))out.push(j.languageRisk);if(experienceYears(j)>=7)out.push(`${j.experience} solicitados`);return out;}
function warningsFor(j){return uniq([j.languageRisk,j.salaryRisk,j.geoRisk,j.education,!j.salary?'Salario no publicado':null,(j.employment||'').includes('no indicada')?'Jornada no confirmada en la publicación':null]).filter(Boolean);}
function opportunityPriority(j){const hard=severeBlockers(j).length;return j.score>=82&&hard===0;}
function reasonFor(j){const p=getProfile(),skills=(j.matchedSkills||[]).slice(0,5);let base=skills.length?`Encaje fuerte en ${skills.join(', ')}.`:`El puesto encaja con el perfil profesional configurado.`;if(j.modality==='remote')base+=` Es 100% remoto y compatible con ${p.remoteCountry||'España'}.`;else if(j.modality==='hybrid')base+=` La modalidad híbrida encaja con ${p.location||'tu ubicación'}.`;else base+=` Es presencial en ${p.location||'tu ubicación'} y tiene la misma prioridad que remoto e híbrido.`;if(j.salary&&j.salary.currency==='EUR'&&salaryComparable(j)>=Number(p.salaryMin||0))base+=` La banda publicada alcanza tu mínimo de ${Math.round(Number(p.salaryMin||0)/1000)}k.`;const blockers=severeBlockers(j);if(!blockers.length)base+=' No se detectan bloqueadores graves.';else base+=` Conviene revisar: ${blockers[0]}.`;return base;}
function scoreBreakdownText(j){const b=j.scoreBreakdown||{};const rows=[['Rol',b.role],['Skills',b.profile],['Experiencia',b.experience],['Modalidad',b.modality],['Idioma',b.language],['Salario',b.salary]];return rows.filter(([,v])=>v!==undefined&&v!==null).map(([k,v])=>`<span><b>${k}</b><i>${Number(v)>=0?'+':''}${v}</i></span>`).join('')||`<p>Score compuesto por rol, coincidencia técnica, experiencia, modalidad, idioma y salario.</p>`;}

function renderProfile(){els.profileGroups.innerHTML='';const p=getProfile();const groups=p.source==='base'?(config.profile_groups||[]): [{name:p.name||'Perfil actual',skills:(p.skills||[]).slice(0,50)}];for(const g of groups){const sec=document.createElement('section');sec.className='profile-group';const h=document.createElement('h3');h.textContent=g.name;sec.appendChild(h);const chips=document.createElement('div');chips.className='profile-chips';(g.skills||[]).forEach(x=>{const sp=document.createElement('span');sp.textContent=x;chips.appendChild(sp);});sec.appendChild(chips);els.profileGroups.appendChild(sec);}}
function renderMarket(){const counts=new Map();for(const j of jobs){for(const s of uniq(j.requestedSkills||[]))counts.set(s,(counts.get(s)||0)+1);}const top=[...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,10);const profileLabels=new Set((getProfile().skills||[]).map(norm));els.marketSkills.innerHTML='';const max=Math.max(1,...top.map(x=>x[1]));for(const [skill,count] of top){const row=document.createElement('div');row.className='market-row';const own=profileLabels.has(norm(skill));row.innerHTML=`<div class="market-row-top"><strong>${skill}</strong><span>${count} ofertas · ${own?'En tu CV':'Oportunidad'}</span></div><div class="market-bar"><i style="width:${Math.round(count/max*100)}%"></i></div>`;if(!own)row.classList.add('market-gap');els.marketSkills.appendChild(row);}const gap=top.find(([s])=>!profileLabels.has(norm(s)));if(gap){els.marketInsightTitle.textContent=`Mayor oportunidad detectada: ${gap[0]}`;els.marketInsight.textContent=`Aparece en ${gap[1]} de las ofertas actuales y no figura explícitamente en tu CV. Úsalo como señal de mercado, no como requisito automático para aplicar.`;}else{els.marketInsightTitle.textContent='Tu perfil cubre las skills más repetidas';els.marketInsight.textContent='Las tecnologías con más presencia en el feed actual ya aparecen en tu perfil base.';}}
function pipelineCounts(){const states=getStates(),counts={active:0,priority:0,saved:0,applied:0,interview:0,rejected:0,offer:0,discarded:0};for(const v of Object.values(states)){const s=normalizeStateRecord(v).status||'active';if(counts[s]!==undefined)counts[s]++;}return counts;}
function renderPipeline(){const c=pipelineCounts();const defs=[['priority','Prioritarias'],['saved','Guardadas'],['applied','Aplicadas'],['interview','Entrevistas'],['rejected','Rechazadas'],['offer','Oferta recibida']];els.pipeline.innerHTML='';for(const [status,label] of defs){const b=document.createElement('button');b.className=`pipeline-step ${statusClass(status)}`;b.innerHTML=`<span>${label}</span><strong>${c[status]||0}</strong>`;b.addEventListener('click',()=>{els.status.value=status;quickMode='all';setQuickActive();render();document.querySelector('.filter-panel')?.scrollIntoView({behavior:'smooth',block:'start'});});els.pipeline.appendChild(b);}els.applied.textContent=(c.applied||0)+(c.interview||0)+(c.rejected||0)+(c.offer||0);els.interview.textContent=c.interview||0;}

function normalizeBrowserJob(raw,source){
  const title=raw.jobTitle??raw.title??raw.position??raw.name??'';
  const company=raw.companyName??raw.company_name??raw.company??'';
  const location=raw.jobGeo??raw.candidate_required_location??raw.location??raw.city??'Remote / no indicada';
  const description=cleanHtml(raw.jobDescription??raw.description??raw.contents??raw.jobExcerpt??raw.excerpt??'');
  const url=raw.url??raw.jobUrl??raw.apply_url??raw.applicationLink??'';
  const published=raw.pubDate??raw.posted_at??raw.created_at??raw.publication_date??raw.published??raw.date??raw.epoch??raw.first_seen_at??null;
  const tags=uniq([...(Array.isArray(raw.tags)?raw.tags:[]),...(Array.isArray(raw.jobIndustry)?raw.jobIndustry:[raw.jobIndustry]),...(Array.isArray(raw.categories)?raw.categories:[]),raw.category]);
  const text=norm(`${title} ${description} ${tags.join(' ')}`);
  const rf=norm(raw.remote);
  const modality=raw.modality||((rf==='remote'||raw.remote===true||source==='Jobicy'||source==='Himalayas'||source==='Remotive'||source==='Remote OK'||/\b(remote|remoto|100% remote|fully remote)\b/.test(norm(`${location} ${description}`)))?'remote':(rf==='hybrid'||/\b(hybrid|hibrid[oa])\b/.test(norm(`${location} ${description}`)))?'hybrid':'onsite');
  const country=String(raw.country??raw.country_code??'');
  const locNorm=norm(location);
  const madridArea=(config.madrid_area_terms||[]).some(x=>locNorm.includes(norm(x))||norm(description.slice(0,900)).includes(norm(x)));
  const spainEligible=raw._spain_remote===true||norm(country)==='es'||(config.spain_terms||['spain','espana']).some(x=>locNorm.includes(norm(x))||norm(description.slice(0,900)).includes(norm(x)));
  const matched=[];let weight=0;for(const skill of (config.profile_skills||[])){if((skill.aliases||[]).some(a=>text.includes(norm(a)))){matched.push(skill.label);weight+=Number(skill.weight||1);}}
  let role=0;const nt=norm(title);if((config.target_roles||[]).some(r=>nt.includes(norm(r))))role=25;else if(/\b(qa|quality assurance|test|tester|testing|validation|verification)\b/.test(nt))role=21;else if(/\b(firmware|network|telecom|iot|system|embedded|wireless|device|automation|devops|cloud|data)\b/.test(nt))role=12;
  const profile=Math.min(40,weight),mode=5;const score=Math.min(100,Math.round(role+profile+mode+16));
  let salary=raw.salary&&typeof raw.salary==='object'?raw.salary:null;
  if(!salary&&(raw.salaryMin||raw.salaryMax||raw.salary_min_annual_eur||raw.salary_max_annual_eur))salary={min:safeNum(raw.salaryMin??raw.salary_min_annual_eur),max:safeNum(raw.salaryMax??raw.salary_max_annual_eur),currency:String(raw.salaryCurrency||raw.currency||(raw.salary_min_annual_eur||raw.salary_max_annual_eur?'EUR':'')).toUpperCase(),period:'yearly',estimated:false};
  const requested=[];for(const skill of (config.market_skills||[])){if((skill.aliases||[]).some(a=>text.includes(norm(a))))requested.push(skill.label);}
  const profileNorm=new Set(matched.map(norm));const missing=uniq(requested).filter(x=>!profileNorm.has(norm(x))).slice(0,8);
  const activeVerified=raw.activeVerified??raw.active_verified??(source==='Job Opportunities API'?norm(raw.status||'live')==='live'&&!!url:['Himalayas','Arbeitnow','Remotive','Remote OK'].includes(source));
  const expiresAt=raw.expiresAt??raw.expiryDate??raw.expiry_date??raw.valid_through??raw.expires_at??null;
  return {id:String(raw.id??raw.guid??raw.slug??url??`${title}-${company}`),source,title,company,location,description,tags,url,published,modality,salary,score,scoreBreakdown:{role,profile,experience:8,modality:mode,language:5,salary:3},matchedSkills:uniq(matched).slice(0,14),requestedSkills:uniq([...requested,...matched]).slice(0,16),missingSkills:missing,languages:[],experience:'No indicada',employment:raw.employmentType??raw.employment_type??raw.jobType??'Jornada no indicada · validar',contract:'No indicado',workPattern:modality==='remote'?'100% remoto':null,education:null,languageRisk:null,salaryRisk:null,geoRisk:null,madridArea,spainEligible,country,activeVerified,expiresAt};
}

function hydrateJob(raw){const j={...raw};j.description=cleanHtml(j.description||'');j.tags=Array.isArray(j.tags)?j.tags:[];j.matchedSkills=Array.isArray(j.matchedSkills)?j.matchedSkills:[];j.requestedSkills=Array.isArray(j.requestedSkills)?j.requestedSkills:[];j.missingSkills=Array.isArray(j.missingSkills)?j.missingSkills:[];j.languages=Array.isArray(j.languages)?j.languages:[];j.experience=j.experience||'No indicada';j.employment=j.employment||'Jornada no indicada · validar';j.contract=j.contract||'No indicado';j.workPattern=j.workPattern||j.work_pattern||null;j.score=Number(j.score||0);j.sources=uniq(j.sources||[j.source]);j.activeVerified=j.activeVerified===true;j.spainEligible=!!j.spainEligible||norm(j.country)==='es';return j;}
function validBrowserJob(j){if(!j.title||!j.company||!j.url)return false;if(!withinFourWeeks(j.published))return false;if(j.activeVerified!==true)return false;if(j.expiresAt&&publishedTime(j.expiresAt)<=Date.now())return false;const t=norm(`${j.title} ${j.description.slice(0,1000)}`);if((config.exclude||[]).some(x=>t.includes(norm(x)))||norm(j.title).includes('junior'))return false;if(!salaryMatchesPreference(j))return false;if(!locationMatchesPreference(j))return false;return j.score>=Number(config.min_feed_score||10);}
function applyActiveProfile(){jobs=allJobs.map(personalizeJob).filter(validBrowserJob);}
function dedupe(list){const out=[];for(const raw of list){const j=hydrateJob(raw);const idx=out.findIndex(x=>sameVacancy(x,j,.78));if(idx<0){out.push(j);continue;}const p=out[idx];const winner=(j.score>p.score||(publishedTime(j.published)>publishedTime(p.published)))?j:p;winner.sources=uniq([...(p.sources||[p.source]),...(j.sources||[j.source])]);if(!winner.salary)winner.salary=p.salary||j.salary;if((winner.languages||[]).length===0)winner.languages=(p.languages||[]).length?p.languages:j.languages;out[idx]=winner;}return out;}
function sortJobs(list,mode='match'){const mod={remote:3,hybrid:2,onsite:1};if(mode==='recent')return [...list].sort((a,b)=>publishedTime(b.published)-publishedTime(a.published)||b.score-a.score);if(mode==='remote')return [...list].sort((a,b)=>mod[b.modality]-mod[a.modality]||b.score-a.score);if(mode==='salary')return [...list].sort((a,b)=>salaryComparable(b)-salaryComparable(a)||b.score-a.score);return [...list].sort((a,b)=>b.score-a.score||publishedTime(b.published)-publishedTime(a.published));}
function updateSeen(list){const seen=getSeen(),now=Date.now();for(const j of list){let key=canonicalJobKey(j);let existing=seen[key];if(!existing){for(const [k,v] of Object.entries(seen)){if(v.company&&v.title&&sameVacancy(v,j,.78)){key=k;existing=v;break;}}}seen[key]={...(existing||{}),title:j.title,company:j.company,firstSeen:existing?.firstSeen||now,lastSeen:now,sources:uniq([...(existing?.sources||[]),...(j.sources||[j.source])])};}setSeen(seen);}
function isNewSinceVisit(j){if(!previousVisit)return ageHours(j.published)<=48;const seen=getSeen();const direct=seen[canonicalJobKey(j)];const first=direct?.firstSeen||0;const pub=publishedTime(j.published);return first>previousVisit||pub>previousVisit;}
async function fetchJson(url){const r=await fetch(url,{headers:{Accept:'application/json'},cache:'no-store'});if(!r.ok)throw new Error(`${r.status} ${url}`);return r.json();}
async function loadSeed(){const d=await fetchJson(`data/jobs.json?v=${Date.now()}`);return {jobs:(d.jobs||[]).map(hydrateJob),updatedAt:d.updated_at?new Date(d.updated_at).getTime():Date.now(),sources:d.sources||[]};}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function fetchJobOpportunities(){
  const out=[],errors=[];let rawCount=0;
  const cutoff=new Date(Date.now()-28*864e5).toISOString().slice(0,10);
  const terms=['qa','quality','test','testing','validation','verification','firmware','network','telecom','systems','embedded','wireless','wifi','iot','automation','integration','device','connectivity','broadband','devops'];
  for(const term of terms){
    const qs=new URLSearchParams({country:'ES',title:term,posted_after:cutoff,include_description:'true',limit:'50'});
    try{
      const d=await fetchJson(`https://api.jobopportunitiesapi.org/public/jobs?${qs}`),rows=d.data||[];rawCount+=rows.length;
      for(const raw of rows){
        raw._spain_remote=true;
        const r=norm(raw.remote);raw.modality=r==='remote'?'remote':r==='hybrid'?'hybrid':'onsite';
        raw.jobGeo=raw.location||raw.city||'España';raw.jobType=raw.employment_type;raw.pubDate=raw.posted_at||raw.first_seen_at;raw.jobDescription=raw.description||'';raw.jobUrl=raw.apply_url;
        // /public/jobs serves live rows by default. Require an application URL as the final guard.
        raw.active_verified=!!raw.apply_url&&norm(raw.status||'live')==='live'&&!raw.closed_at;
        const j=normalizeBrowserJob(raw,'Job Opportunities API');if(validBrowserJob(j))out.push(j);
      }
    }catch(e){errors.push(`${term}: ${e.message}`);console.warn('Job Opportunities API',term,e);}
    await sleep(650);
  }
  return {source:'JOA',jobs:out,raw:rawCount,errors};
}
async function fetchHimalayas(){
  const out=[],errors=[];let rawCount=0;
  const terms=['qa','test','validation','firmware','network','telecom','iot','automation','systems'];
  for(const term of terms){
    for(let page=1;page<=4;page++){
      const qs=new URLSearchParams({q:term,country:'Spain',exclude_worldwide:'true',employment_type:'Full Time',sort:'recent',page:String(page)});
      try{
        const d=await fetchJson(`https://himalayas.app/jobs/api/search?${qs}`),rows=d.jobs||d.data||[];rawCount+=rows.length;if(!rows.length)break;
        let recent=false;
        for(const raw of rows){
          if(withinFourWeeks(raw.pubDate))recent=true;
          raw.remote=true;raw._spain_remote=true;raw.active_verified=true;
          raw.jobGeo=(raw.locationRestrictions||[]).map(x=>typeof x==='string'?x:(x?.name||x?.alpha2||x?.slug||'')).filter(Boolean).join(', ')||'España';
          raw.jobUrl=raw.applicationLink;raw.jobDescription=raw.description||raw.excerpt||'';
          const j=normalizeBrowserJob(raw,'Himalayas');if(validBrowserJob(j))out.push(j);
        }
        if(!recent)break;
      }catch(e){errors.push(`${term}/p${page}: ${e.message}`);console.warn('Himalayas',term,e);break;}
      await sleep(220);
    }
  }
  return {source:'Himalayas',jobs:out,raw:rawCount,errors};
}
async function fetchJobicy(){
  const out=[],errors=[];let rawCount=0;
  try{
    const d=await fetchJson('https://jobicy.com/api/v2/remote-jobs?count=200&geo=spain&industry=qa-testing'),rows=d.jobs||[];rawCount=rows.length;
    for(const raw of rows){raw.remote=true;raw._spain_remote=true;raw.active_verified=true;raw.jobGeo=raw.jobGeo||'Spain';const j=normalizeBrowserJob(raw,'Jobicy');if(validBrowserJob(j))out.push(j);}
  }catch(e){errors.push(e.message);console.warn('Jobicy',e);}
  return {source:'Jobicy',jobs:out,raw:rawCount,errors};
}
async function fetchArbeitnow(){
  const out=[],errors=[];let rawCount=0;
  for(let page=1;page<=12;page++){
    try{
      const d=await fetchJson(`https://www.arbeitnow.com/api/job-board-api?page=${page}`),rows=d.data||[];rawCount+=rows.length;if(!rows.length)break;
      let recent=false;
      for(const raw of rows){if(withinFourWeeks(raw.created_at))recent=true;raw.active_verified=true;const j=normalizeBrowserJob(raw,'Arbeitnow');if(validBrowserJob(j))out.push(j);}
      if(!recent)break;
    }catch(e){errors.push(`p${page}: ${e.message}`);console.warn('Arbeitnow',e);break;}
    await sleep(180);
  }
  return {source:'Arbeitnow',jobs:out,raw:rawCount,errors};
}
async function refreshJobs(force=false){
  els.refresh.disabled=true;els.refresh.textContent='Actualizando…';hideNotice();
  try{
    const seed=await loadSeed();let merged=[...seed.jobs];allJobs=dedupe(merged);applyActiveProfile();
    const seedAge=Date.now()-Number(seed.updatedAt||0);const needLive=force||jobs.length<25||seedAge>3*3600e3;const diag=[];
    if(needLive){
      showNotice('Buscando ofertas activas de España/Madrid publicadas en las últimas 4 semanas…');
      // Fuente principal primero: es CORS-friendly, devuelve vacantes live y enlaces de aplicación.
      const primary=await fetchJobOpportunities();diag.push(`${primary.source} ${primary.jobs.length}/${primary.raw}`);merged.push(...primary.jobs);allJobs=dedupe(merged);applyActiveProfile();render();
      // Fuentes secundarias después; si una falla no bloquea la principal.
      const secondary=await Promise.allSettled([fetchHimalayas(),fetchJobicy(),fetchArbeitnow()]);
      for(const item of secondary){if(item.status==='fulfilled'){const r=item.value;diag.push(`${r.source} ${r.jobs.length}/${r.raw}`);merged.push(...r.jobs);}else diag.push('fuente secundaria error');}
      allJobs=dedupe(merged);applyActiveProfile();
      if(!jobs.length){const errors=[...primary.errors,...secondary.flatMap(x=>x.status==='fulfilled'?(x.value.errors||[]):[String(x.reason||'error')])];showNotice(`No han quedado ofertas válidas. Diagnóstico: ${diag.join(' · ')}${errors.length?' · '+errors.slice(0,2).join(' | '):''}`);}else hideNotice();
    }
    updateSeen(jobs);writeLocal(CACHE_KEY,{time:Date.now(),jobs:allJobs});render();const sources=uniq(allJobs.map(j=>j.source));setUpdated(needLive?Date.now():seed.updatedAt,`${diag.length?diag.join(' · '):sources.length+' fuentes'} · ${jobs.length} ofertas válidas`);
  }catch(e){
    console.error('refreshJobs',e);const c=readLocal(CACHE_KEY,null);
    if(c?.jobs?.length){allJobs=c.jobs.map(hydrateJob);applyActiveProfile();updateSeen(jobs);render();setUpdated(c.time,'última copia disponible');showNotice(`No se pudo refrescar ahora: ${e.message}. Se muestra la última copia válida.`);}
    else{jobs=[];render();showNotice(`No se pudo cargar ninguna fuente: ${e.message}`);}
  }finally{els.refresh.disabled=false;els.refresh.textContent='Actualizar ofertas';}
}
function setUpdated(ts,source){els.lastUpdate.textContent=`Última actualización: ${new Intl.DateTimeFormat('es-ES',{dateStyle:'short',timeStyle:'short'}).format(new Date(ts))} · ${source}`;}
function showNotice(t){els.notice.textContent=t;els.notice.classList.remove('hidden');}
function hideNotice(){els.notice.classList.add('hidden');}
let noticeTimer=null;function flashNotice(t){showNotice(t);clearTimeout(noticeTimer);noticeTimer=setTimeout(hideNotice,4300);}
function linkedInSearch(j){const p=new URLSearchParams(),profile=getProfile();p.set('keywords',`"${j.title}" "${j.company}"`);p.set('location',j.modality==='remote'?(profile.remoteCountry||'España'):`${profile.location||'Madrid'}, España`);p.set('f_JT','F');p.set('f_TPR','r604800');if(j.modality==='remote')p.set('f_WT','2');return `https://www.linkedin.com/jobs/search/?${p}`;}
function canonicalLinkedInUrl(url=''){try{const u=new URL(url,location.href);if(!/linkedin\.com$/i.test(u.hostname)&&!/\.linkedin\.com$/i.test(u.hostname))return null;const m=u.pathname.match(/\/jobs\/view\/(?:[^/]*-)?(\d+)(?:\/|$)/i)||u.pathname.match(/\/jobs\/view\/(\d+)/i);return m?`https://www.linkedin.com/jobs/view/${m[1]}/`:`https://www.linkedin.com${u.pathname}${u.search}`;}catch{return null;}}
function openLinkedInOffer(url){const canonical=canonicalLinkedInUrl(url)||url;window.location.assign(canonical);}

function recommendation(j){const severe=severeBlockers(j).length;if(j.score>=88&&severe===0)return {text:'APLICAR',cls:'apply-now'};if(j.score>=80&&severe<=1)return {text:'MUY INTERESANTE',cls:'apply-now'};if(j.score>=70)return {text:'INTERESANTE',cls:'review'};return {text:'REVISAR',cls:'review'};}
function addTags(container,items,cls,emptyText){container.innerHTML='';for(const x of uniq(items).slice(0,14)){const s=document.createElement('span');s.className=`tag ${cls}`;s.textContent=x;container.appendChild(s);}if(!container.children.length&&emptyText){const s=document.createElement('span');s.className='tag neutral';s.textContent=emptyText;container.appendChild(s);}}
function languageFilterOk(j,mode){const l=norm((j.languages||[]).join(' '));if(mode==='all')return true;if(mode==='safe')return !j.languageRisk||(!/b2|c1|c2|avanzado|fluido|nativo/.test(l)&&!/idioma adicional/.test(norm(j.languageRisk)));if(mode==='englishHigh')return /ingles.*(b2|c1|c2|avanzado|fluido|nativo)/.test(l);if(mode==='other')return /frances|aleman|portugues|italiano/.test(l);return true;}
function salaryFilterOk(j,mode){if(mode==='all')return true;if(mode==='published')return !!j.salary;if(mode==='unknown')return !j.salary;if(mode==='40k')return !!j.salary&&salaryComparable(j)>=40000;if(mode==='45k')return !!j.salary&&salaryComparable(j)>=45000;return true;}
function quickOk(j){if(quickMode==='all')return true;if(quickMode==='priority')return opportunityPriority(j);if(quickMode==='new')return isNewSinceVisit(j);if(quickMode==='salary')return !!j.salary;if(quickMode==='safe')return severeBlockers(j).length===0;return true;}
function setQuickActive(){for(const b of $$('.quick-btn'))b.classList.toggle('active',b.dataset.quick===quickMode);}
function currentAndHistoryPool(){const pool=[...jobs],current=jobs;const history=Object.values(getHistory()).map(hydrateJob);for(const j of history){if(!current.some(x=>sameVacancy(x,j,.78)))pool.push({...j,archivedApplication:true});}return pool;}
function statusOk(j,filter){const s=getStatus(j);if(filter==='all')return true;if(filter==='tracked')return TRACKED_STATUSES.includes(s);if(filter==='active')return ['active','priority','saved'].includes(s);return s===filter;}
function renderQuickCounts(){const pending=jobs.filter(j=>!APPLIED_STATUSES.includes(getStatus(j))&&getStatus(j)!=='discarded');els.quickAll.textContent=pending.length;els.quickPriority.textContent=pending.filter(opportunityPriority).length;els.quickNew.textContent=pending.filter(isNewSinceVisit).length;els.quickSalary.textContent=pending.filter(j=>!!j.salary).length;els.quickSafe.textContent=pending.filter(j=>severeBlockers(j).length===0).length;}
function toggleCompare(j,checked){const key=canonicalJobKey(j);if(checked){if(selectedCompare.size>=4){flashNotice('Puedes comparar hasta 4 ofertas a la vez.');return false;}selectedCompare.add(key);}else selectedCompare.delete(key);updateCompareButton();return true;}
function updateCompareButton(){els.compareOpen.disabled=selectedCompare.size<2;els.compareOpen.textContent=`Comparar (${selectedCompare.size})`;}
function renderCompare(){const pool=currentAndHistoryPool();const selected=[...selectedCompare].map(k=>pool.find(j=>canonicalJobKey(j)===k)||pool.find(j=>sameVacancy(j,{company:k.split('|')[0],title:k.split('|')[1]},.75))).filter(Boolean).slice(0,4);if(selected.length<2){flashNotice('Selecciona al menos 2 ofertas.');return;}const rows=[['Match',j=>`${j.score}/100`],['Modalidad',j=>modalityLabel(j.modality)],['Salario',j=>salaryText(j.salary)],['Idiomas',j=>(j.languages||[]).join(' · ')||'No indicado'],['Experiencia',j=>j.experience],['Coincidencias',j=>(j.matchedSkills||[]).slice(0,5).join(', ')||'—'],['Brechas',j=>(j.missingSkills||[]).slice(0,4).join(', ')||'Sin brechas claras'],['Bloqueadores',j=>severeBlockers(j).join(' · ')||'Ninguno grave'],['Estado',j=>statusLabel(getStatus(j))]];let html='<table class="compare-table"><thead><tr><th>Criterio</th>'+selected.map(j=>`<th>${j.title}<small>${j.company}</small></th>`).join('')+'</tr></thead><tbody>';for(const [label,fn] of rows)html+=`<tr><th>${label}</th>${selected.map(j=>`<td>${fn(j)}</td>`).join('')}</tr>`;html+='</tbody></table>';els.compareTable.innerHTML=html;els.compareDialog.showModal();}

function render(){renderMarket();renderPipeline();renderQuickCounts();const q=norm(els.search.value),min=Number(els.score.value),mod=els.modality.value,st=els.status.value;let pool=(st==='active'&&quickMode!=='all')?[...jobs]:currentAndHistoryPool();let visible=pool.filter(j=>{const text=norm(`${j.title} ${j.company} ${j.location} ${(j.tags||[]).join(' ')} ${j.description} ${(j.matchedSkills||[]).join(' ')} ${(j.requestedSkills||[]).join(' ')}`);return statusOk(j,st)&&quickOk(j)&&j.score>=min&&(mod==='all'||j.modality===mod)&&salaryFilterOk(j,els.salary.value)&&languageFilterOk(j,els.language.value)&&(!q||text.includes(q));});visible=sortJobs(visible,els.sort.value);els.jobs.innerHTML='';for(const j of visible){const node=els.template.content.cloneNode(true),card=node.querySelector('.job-card'),status=getStatus(j);node.querySelector('.company-avatar').textContent=initials(j.company);node.querySelector('.score-pill').textContent=`${j.score}/100`;node.querySelector('.modality-pill').textContent=modalityLabel(j.modality);node.querySelector('.source-pill').textContent=(j.sources||[j.source]).join(' + ');node.querySelector('.fresh-pill').textContent=isNewSinceVisit(j)?'Nueva desde tu visita':ageHours(j.published)<=48?'Nueva · <48 h':fmtDate(j.published);const activePill=node.querySelector('.active-pill');if(activePill&&j.activeVerified!==false){activePill.classList.remove('hidden');activePill.textContent='Activa';}const statePill=node.querySelector('.state-pill');if(status!=='active'){statePill.classList.remove('hidden');statePill.textContent=statusLabel(status);statePill.classList.add(statusClass(status));}if(j.archivedApplication)node.querySelector('.archived-pill').classList.remove('hidden');node.querySelector('.title').textContent=j.title;node.querySelector('.company').textContent=j.company;node.querySelector('.location').textContent=j.location;node.querySelector('.score-number')?.replaceChildren(String(j.score));node.querySelector('.salary').textContent=salaryText(j.salary);node.querySelector('.salary-source').textContent=salarySourceText(j.salary);node.querySelector('.languages').textContent=(j.languages||[]).length?j.languages.join(' · '):'No indicado';node.querySelector('.experience').textContent=j.experience||'No indicada';node.querySelector('.employment').textContent=j.employment||'No indicada';node.querySelector('.contract').textContent=j.contract&&j.contract!=='No indicado'?j.contract:'';node.querySelector('.work-pattern').textContent=j.workPattern||(j.modality==='remote'?'100% remoto':j.modality==='hybrid'?'Híbrido · detalle no indicado':'Presencial');node.querySelector('.published').textContent=fmtDate(j.published);node.querySelector('.summary').textContent=j.description.slice(0,500)+(j.description.length>500?'…':'');node.querySelector('.reason').textContent=reasonFor(j);node.querySelector('.full-description').textContent=j.description.slice(0,6000)+(j.description.length>6000?'…':'');addTags(node.querySelector('.matches'),j.matchedSkills,'match','QA / testing');addTags(node.querySelector('.requested'),j.requestedSkills,'ask','No se ha podido extraer el stack');addTags(node.querySelector('.gaps'),j.missingSkills,'gap','Sin brechas técnicas claras detectadas');if(!(j.missingSkills||[]).length)node.querySelector('.gaps-section').classList.add('soft-success');const rec=recommendation(j),recEl=node.querySelector('.recommendation');recEl.textContent=rec.text;recEl.classList.add(rec.cls);addTags(node.querySelector('.warnings'),warningsFor(j),'warn','Sin alertas principales');node.querySelector('.score-breakdown').innerHTML=scoreBreakdownText(j);const eduRow=node.querySelector('.education-row');if(j.education){eduRow.classList.remove('hidden');node.querySelector('.education').textContent=j.education;}const apply=node.querySelector('.apply');const linkedinUrl=canonicalLinkedInUrl(j.url);if(linkedinUrl){apply.href=linkedinUrl;apply.removeAttribute('target');apply.textContent='Abrir oferta en LinkedIn';apply.addEventListener('click',e=>{e.preventDefault();openLinkedInOffer(linkedinUrl);});}else{apply.href=j.url;apply.target='_blank';apply.rel='noopener';apply.textContent='Ver oferta y aplicar';}const li=node.querySelector('.linkedin-job');if(linkedinUrl)li.classList.add('hidden');else{li.href=linkedInSearch(j);li.removeAttribute('target');li.addEventListener('click',e=>{e.preventDefault();window.location.assign(li.href);});}
    const priority=node.querySelector('.priority'),save=node.querySelector('.save'),applied=node.querySelector('.applied'),discard=node.querySelector('.discard'),post=node.querySelector('.post-apply-actions'),interview=node.querySelector('.interview'),rejected=node.querySelector('.rejected'),offer=node.querySelector('.offer');priority.classList.toggle('active',status==='priority');save.classList.toggle('active',status==='saved');applied.classList.toggle('active',APPLIED_STATUSES.includes(status));discard.classList.toggle('active',status==='discarded');if(APPLIED_STATUSES.includes(status)){card.classList.add('is-applied');post.classList.remove('hidden');}priority.textContent=status==='priority'?'★ Prioritaria ✓':'★ Prioritaria';save.textContent=status==='saved'?'Guardada ✓':'Guardar';applied.textContent=APPLIED_STATUSES.includes(status)?`${statusLabel(status)} ✓`:'✓ Ya he aplicado';discard.textContent=status==='discarded'?'Restaurar':'Descartar';priority.addEventListener('click',()=>setStatus(j,status==='priority'?'active':'priority'));save.addEventListener('click',()=>setStatus(j,status==='saved'?'active':'saved'));applied.addEventListener('click',()=>setStatus(j,APPLIED_STATUSES.includes(status)?'active':'applied'));discard.addEventListener('click',()=>setStatus(j,status==='discarded'?'active':'discarded'));interview.addEventListener('click',()=>setStatus(j,'interview'));rejected.addEventListener('click',()=>setStatus(j,'rejected'));offer.addEventListener('click',()=>setStatus(j,'offer'));const check=node.querySelector('.compare-check');check.checked=selectedCompare.has(canonicalJobKey(j));check.addEventListener('change',e=>{if(!toggleCompare(j,e.target.checked))e.target.checked=false;});els.jobs.appendChild(node);}
  els.empty.classList.toggle('hidden',visible.length!==0);els.resultCount.textContent=`${visible.length} ${visible.length===1?'resultado':'resultados'}`;els.total.textContent=jobs.length;els.high.textContent=jobs.filter(j=>j.score>=80).length;els.remote.textContent=jobs.filter(j=>j.modality==='remote').length;els.fresh.textContent=jobs.filter(isNewSinceVisit).length;updateCompareButton();}

function exportData(){const payload={version:6,profile:getProfile(),exportedAt:new Date().toISOString(),states:getStates(),history:getHistory(),seen:getSeen(),lastVisit:localStorage.getItem(LAST_VISIT_KEY)};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`QA_Job_Radar_backup_${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),500);}
async function importData(file){try{const d=JSON.parse(await file.text());if(!d.states||typeof d.states!=='object')throw new Error('Formato no válido');writeLocal(STATE_KEY,d.states);if(d.history)writeLocal(HISTORY_KEY,d.history);if(d.seen)writeLocal(SEEN_KEY,d.seen);if(d.lastVisit)localStorage.setItem(LAST_VISIT_KEY,String(d.lastVisit));if(d.profile)setProfile(d.profile,{sync:false});flashNotice('Copia importada correctamente.');render();scheduleSync();}catch(e){flashNotice('No se pudo importar la copia: archivo no válido.');}}

function updateProfileUI(){
  if(!config||!els.profileName)return;const p=getProfile(),a=getAuth();
  els.profileName.value=p.name||'';els.profileSalary.value=Number(p.salaryMin||32000);els.profileRemoteCountry.value=p.remoteCountry||'España';els.profileLocation.value=p.location||'Madrid';els.prefRemote.checked=p.allowRemote!==false;els.prefHybrid.checked=p.allowHybrid!==false;els.prefOnsite.checked=p.allowOnsite!==false;els.profileSkills.value=(p.skills||[]).join(', ');
  els.cvStatus.textContent=p.cvFileName?`CV analizado: ${p.cvFileName} · ${(p.skills||[]).length} skills detectadas.`:'Todavía no has analizado un CV en este dispositivo.';
  els.profileAccountTitle.textContent=a?.user?.email?`Cuenta: ${a.user.email}`:'Perfil local';
  els.profileAccountCopy.textContent=a?.user?.email?'Tu perfil y candidaturas pueden sincronizarse entre dispositivos.':'Puedes usar la app sin cuenta. Con Supabase configurado podrás iniciar sesión con Google y sincronizar tu perfil.';
  els.googleLoginBtn.classList.toggle('hidden',!supabaseClient||!!a?.access_token);
}
function saveProfileFromForm(){const old=getProfile();const p={...old,name:els.profileName.value.trim()||'Perfil profesional',salaryMin:Number(els.profileSalary.value||0),remoteCountry:els.profileRemoteCountry.value.trim()||'España',location:els.profileLocation.value.trim()||'Madrid',allowRemote:els.prefRemote.checked,allowHybrid:els.prefHybrid.checked,allowOnsite:els.prefOnsite.checked,skills:splitSkills(els.profileSkills.value),source:old.source==='cv'?'cv':'custom'};setProfile(p);applyActiveProfile();render();flashNotice('Perfil actualizado. El ranking se ha recalculado.');}
async function handleCvUpload(file){if(!file)return;els.cvStatus.textContent='Analizando CV…';try{const text=await extractCvText(file);if(text.trim().length<40)throw new Error('No se ha podido extraer suficiente texto del CV');const analysis=analyzeCvText(text,file.name),current=getProfile();const p={...current,...analysis,salaryMin:current.salaryMin||32000,remoteCountry:current.remoteCountry||'España',location:current.location||'Madrid',allowRemote:current.allowRemote!==false,allowHybrid:current.allowHybrid!==false,allowOnsite:current.allowOnsite!==false};setProfile(p,{sync:false});updateProfileUI();applyActiveProfile();render();if(supabaseClient&&getAuth()?.user?.id){try{const path=await uploadCvToCloud(file);setProfile({...getProfile(),cvPath:path},{sync:false});await saveProfileRemote();}catch(e){console.warn('CV cloud upload',e);}}else scheduleProfileSync();flashNotice(`CV analizado: ${analysis.skills.length} skills detectadas.`);}catch(e){els.cvStatus.textContent=`No se pudo analizar: ${e.message}`;}}
async function uploadCvToCloud(file){const a=getAuth();if(!supabaseClient||!a?.user?.id)throw new Error('Inicia sesión para guardar el CV');const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_'),path=`${a.user.id}/${Date.now()}-${safe}`;const {error}=await supabaseClient.storage.from('cvs').upload(path,file,{upsert:true,contentType:file.type||undefined});if(error)throw error;return path;}
async function saveProfileRemote(){const a=getAuth();if(!supabaseClient||!a?.user?.id)return;const p=getProfile();const {error}=await supabaseClient.from('job_radar_profiles').upsert({user_id:a.user.id,profile:p,cv_path:p.cvPath||null,updated_at:new Date().toISOString()},{onConflict:'user_id'});if(error)throw error;}
async function loadProfileRemote(){const a=getAuth();if(!supabaseClient||!a?.user?.id)return;const {data,error}=await supabaseClient.from('job_radar_profiles').select('profile,cv_path,updated_at').eq('user_id',a.user.id).maybeSingle();if(error){console.warn('Profile load',error);return;}if(data?.profile){const local=getProfile(),remote={...data.profile,cvPath:data.cv_path||data.profile.cvPath};if(Number(remote.updatedAt||0)>=Number(local.updatedAt||0)||local.source==='base')setProfile(remote,{sync:false});else await saveProfileRemote();}}
let profileSyncTimer=null;function scheduleProfileSync(){if(!supabaseClient||!getAuth()?.access_token)return;clearTimeout(profileSyncTimer);profileSyncTimer=setTimeout(()=>saveProfileRemote().catch(e=>console.warn('Profile sync',e)),900);}

async function loadSyncConfig(){
  try{const r=await fetch('sync-config.json',{cache:'no-store'});if(r.ok)syncConfig=await r.json();}catch{}
  const ready=!!(syncConfig.enabled&&syncConfig.url&&syncConfig.anon_key&&!String(syncConfig.url).includes('YOUR_'));
  els.syncUnavailable.classList.toggle('hidden',ready);els.syncAuth.classList.toggle('hidden',!ready);
  if(ready){
    try{await ensureSupabaseLib();}catch(e){console.warn('Supabase library',e);updateSyncUI();updateProfileUI();return false;}
    supabaseClient=window.supabase.createClient(syncConfig.url,syncConfig.anon_key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    const {data}=await supabaseClient.auth.getSession();if(data?.session)setAuth(data.session);
    supabaseClient.auth.onAuthStateChange((_event,session)=>{setAuth(session||null);if(session)setTimeout(()=>{loadProfileRemote();syncNow();},0);updateProfileUI();});
  }
  updateSyncUI();updateProfileUI();return ready;
}
function getAuth(){return readLocal(AUTH_KEY,null);}
function setAuth(v){if(v)writeLocal(AUTH_KEY,v);else localStorage.removeItem(AUTH_KEY);updateSyncUI();updateProfileUI();}
function updateSyncUI(){const a=getAuth();if(!els.syncStatus)return;const logged=!!a?.access_token;els.logoutBtn.classList.toggle('hidden',!logged);els.loginBtn.classList.toggle('hidden',logged);els.signupBtn.classList.toggle('hidden',logged);els.syncGoogleBtn?.classList.toggle('hidden',logged);els.syncEmail.disabled=logged;els.syncPassword.disabled=logged;els.syncStatus.textContent=logged?`Sesión iniciada${a.user?.email?' como '+a.user.email:''}. Perfil y candidaturas se sincronizan automáticamente.`:'Sin sesión iniciada.';}
async function googleLogin(){if(!supabaseClient){flashNotice('Configura Supabase antes de activar Google.');return;}const redirectTo=`${location.origin}${location.pathname}`;const {error}=await supabaseClient.auth.signInWithOAuth({provider:'google',options:{redirectTo}});if(error)flashNotice(`No se pudo iniciar Google: ${error.message}`);}
async function login(){try{if(!supabaseClient)throw new Error('Supabase no está configurado');const {data,error}=await supabaseClient.auth.signInWithPassword({email:els.syncEmail.value.trim(),password:els.syncPassword.value});if(error)throw error;if(!data.session)throw new Error('No se recibió sesión');setAuth(data.session);await loadProfileRemote();await syncNow();flashNotice('Sesión iniciada y datos sincronizados.');}catch(e){els.syncStatus.textContent=e.message;}}
async function signup(){try{if(!supabaseClient)throw new Error('Supabase no está configurado');const {data,error}=await supabaseClient.auth.signUp({email:els.syncEmail.value.trim(),password:els.syncPassword.value,options:{emailRedirectTo:`${location.origin}${location.pathname}`}});if(error)throw error;if(data.session){setAuth(data.session);await saveProfileRemote();await syncNow();flashNotice('Cuenta creada y sincronizada.');}else els.syncStatus.textContent='Cuenta creada. Revisa tu correo para confirmar y después inicia sesión.';}catch(e){els.syncStatus.textContent=e.message;}}
function mergeStateMaps(local,remote){const out={...remote};for(const [k,v] of Object.entries(local)){const lv=normalizeStateRecord(v,k),rv=normalizeStateRecord(out[k],k);if(!out[k]||Number(lv.updatedAt||0)>=Number(rv.updatedAt||0))out[k]=lv;}return out;}
function mergeHistory(local,remote){const out={...remote};for(const [k,v] of Object.entries(local)){const r=out[k];if(!r||new Date(v.updatedAt||v.trackedAt||0)>=new Date(r.updatedAt||r.trackedAt||0))out[k]=v;}return out;}
async function syncNow(){const auth=getAuth();if(!syncConfig.enabled||!auth?.access_token||!auth?.user?.id)return;try{const headers={apikey:syncConfig.anon_key,Authorization:`Bearer ${auth.access_token}`,'Content-Type':'application/json'};const r=await fetch(`${syncConfig.url}/rest/v1/job_radar_state?user_id=eq.${encodeURIComponent(auth.user.id)}&select=payload,updated_at`,{headers});if(r.status===401){setAuth(null);return;}if(!r.ok)throw new Error('No se pudo leer la sincronización');const rows=await r.json(),remote=rows[0]?.payload||{};const mergedStates=mergeStateMaps(getStates(),remote.states||{}),mergedHistory=mergeHistory(getHistory(),remote.history||{});writeLocal(STATE_KEY,mergedStates);writeLocal(HISTORY_KEY,mergedHistory);const payload={states:mergedStates,history:mergedHistory};const up=await fetch(`${syncConfig.url}/rest/v1/job_radar_state?on_conflict=user_id`,{method:'POST',headers:{...headers,Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({user_id:auth.user.id,payload,updated_at:new Date().toISOString()})});if(!up.ok)throw new Error('No se pudo guardar la sincronización');render();updateSyncUI();}catch(e){console.warn('Sync',e);if(els.syncStatus)els.syncStatus.textContent=`Sincronización pendiente: ${e.message}`;}}
function scheduleSync(){if(!syncConfig.enabled||!getAuth()?.access_token)return;clearTimeout(syncTimer);syncTimer=setTimeout(syncNow,800);}

async function init(){
  migrateLegacy();
  try{config=await (await fetch('config.json',{cache:'no-store'})).json();}catch{showNotice('No se pudo cargar la configuración.');return;}
  renderProfile();updateProfileUI();
  await loadSyncConfig();
  if(getAuth()?.access_token){await loadProfileRemote();syncNow();}
  els.search.addEventListener('input',render);
  [els.modality,els.score,els.salary,els.language,els.status,els.sort].forEach(el=>el.addEventListener('change',()=>{quickMode='all';setQuickActive();render();}));
  for(const b of $$('.quick-btn'))b.addEventListener('click',()=>{quickMode=b.dataset.quick;setQuickActive();render();});
  els.refresh.addEventListener('click',()=>refreshJobs(true));
  els.compareOpen.addEventListener('click',renderCompare);
  els.profileBtn.addEventListener('click',()=>{updateProfileUI();els.profileDialog.showModal();});
  els.dataBtn.addEventListener('click',()=>els.dataDialog.showModal());
  els.syncBtn.addEventListener('click',()=>els.syncDialog.showModal());
  $$('[data-close-dialog]').forEach(b=>b.addEventListener('click',()=>document.getElementById(b.dataset.closeDialog)?.close()));
  els.exportBtn.addEventListener('click',exportData);
  els.importInput.addEventListener('change',e=>{const f=e.target.files?.[0];if(f)importData(f);e.target.value='';});
  els.cvInput.addEventListener('change',async e=>{const f=e.target.files?.[0];if(f)await handleCvUpload(f);e.target.value='';});
  els.saveProfileBtn.addEventListener('click',saveProfileFromForm);
  els.resetProfileBtn.addEventListener('click',()=>{localStorage.removeItem(PROFILE_KEY);renderProfile();updateProfileUI();if(allJobs.length){applyActiveProfile();render();}scheduleProfileSync();flashNotice('Perfil base restaurado.');});
  els.googleLoginBtn.addEventListener('click',googleLogin);els.syncGoogleBtn?.addEventListener('click',googleLogin);
  els.loginBtn.addEventListener('click',login);els.signupBtn.addEventListener('click',signup);
  els.logoutBtn.addEventListener('click',async()=>{try{if(supabaseClient)await supabaseClient.auth.signOut();}catch{}setAuth(null);flashNotice('Sesión cerrada.');});
  if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstall=e;els.install.classList.remove('hidden');});
  els.install.addEventListener('click',async()=>{if(deferredInstall){deferredInstall.prompt();await deferredInstall.userChoice;deferredInstall=null;els.install.classList.add('hidden');return;}const ios=/iphone|ipad|ipod/i.test(navigator.userAgent);if(ios)flashNotice('En iPhone: abre esta web en Safari → Compartir → Añadir a pantalla de inicio.');});
  await refreshJobs(false);
}
init();
