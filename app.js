import {initializeApp} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {getAuth,onAuthStateChanged,signInWithEmailAndPassword,createUserWithEmailAndPassword,signOut} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {getFirestore,collection,doc,setDoc,updateDoc,onSnapshot,query,orderBy,increment} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {getFunctions,httpsCallable} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";
import {firebaseConfig,ADMIN_EMAIL,EMAILJS,AI_ENABLED} from "./firebase-config.js";

const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app);
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let pick=null,user=null,isAdmin=false,reports=[],tab='report',map=null,first=true,filter='All',unsub=null,authMsg='';
let form={blob:null,url:'',lat:'',lng:'',sev:'Medium',desc:'',msg:'',cls:'',busy:false};

const toast=t=>{const e=$('#toast');e.textContent=t;e.style.display='block';setTimeout(()=>e.style.display='none',4500)};
const dist=(a,b,c,d)=>{const R=6371000,r=x=>x*Math.PI/180,h=Math.sin(r(c-a)/2)**2+Math.cos(r(a))*Math.cos(r(c))*Math.sin(r(d-b)/2)**2;return 2*R*Math.asin(Math.sqrt(h))};

// ---------- auth + live data ----------
onAuthStateChanged(auth,u=>{
  user=u;isAdmin=!!u&&u.email===ADMIN_EMAIL;
  $('#nav').hidden=!u;$('#out').hidden=!u;$('#adminTab').hidden=!isAdmin;
  unsub&&unsub();first=true;reports=[];
  if(u)unsub=onSnapshot(query(collection(db,'reports'),orderBy('ts','desc')),s=>{
    if(!first&&isAdmin)s.docChanges().forEach(c=>c.type==='added'&&!c.doc.metadata.hasPendingWrites&&notify(c.doc.data()));
    first=false;reports=s.docs.map(d=>({id:d.id,...d.data()}));render();
  },e=>toast('Database error: '+e.code));
  render();
});
$('#out').onclick=()=>signOut(auth);
document.querySelectorAll('#nav button').forEach(b=>b.onclick=()=>{tab=b.dataset.t;document.querySelectorAll('#nav button').forEach(x=>x.classList.toggle('on',x===b));document.title='RoadWatch – Pothole Reporter';render()});

function notify(r){
  const t=`New ${r.severity} pothole report`+(r.dupOf?' (duplicate)':'');
  toast('🔔 '+t);document.title='(!) '+t;
  try{if(Notification.permission==='granted')new Notification('RoadWatch',{body:t})}catch(e){}
}
async function emailAdmin(r){
  if(!EMAILJS.serviceId)return;
  fetch('https://api.emailjs.com/api/v1.0/email/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
    service_id:EMAILJS.serviceId,template_id:EMAILJS.templateId,user_id:EMAILJS.publicKey,
    template_params:{severity:r.severity,description:r.desc||'-',map_link:`https://maps.google.com/?q=${r.lat},${r.lng}`}})}).catch(()=>{});
}

// ---------- rendering ----------
function render(){
  const v=$('#view');
  if(pick){pick.remove();pick=null}
  if(!user)return renderAuth(v);
  if(map&&tab!=='map'){map.remove();map=null}
  ({report:renderForm,mine:v=>renderList(v,reports.filter(r=>r.by===user.uid),false),all:v=>renderList(v,reports,false),map:renderMap,admin:renderAdmin}[tab]||renderForm)(v);
}
function renderAuth(v){
  v.innerHTML=`<div class="card"><b>Login or create an account</b>
  <label>Email</label><input id="em" type="email"><label>Password (min 6 chars)</label><input id="pw" type="password">
  <div class="row" style="margin-top:12px"><button class="p" id="li">Login</button><button id="su">Sign up</button></div>
  ${authMsg?`<div class="msg err">${esc(authMsg)}</div>`:''}</div>`;
  const go=fn=>async()=>{try{await fn(auth,$('#em').value.trim(),$('#pw').value)}catch(e){authMsg=e.code.replace('auth/','').replace(/-/g,' ');renderAuth(v)}};
  $('#li').onclick=go(signInWithEmailAndPassword);$('#su').onclick=go(createUserWithEmailAndPassword);
}
function renderForm(v){
  v.innerHTML=`<div class="card"><b>Report a pothole</b>
  <label>1. Take or choose a photo</label><input type="file" id="f" accept="image/*" capture="environment">
  ${form.url?`<img class="ph" src="${form.url}">`:''}
  <label>2. Location</label><div class="row"><input id="lat" placeholder="Latitude" value="${esc(form.lat)}"><input id="lng" placeholder="Longitude" value="${esc(form.lng)}"></div>
  <button id="gps" style="margin-top:6px;width:100%">📍 Use my current location</button>
  <div class="row" style="margin-top:8px"><input id="sq" placeholder="Search a place, e.g. Lonavala market road" value="${esc(form.q||'')}"><button id="sb" style="flex:0 0 auto">🔍 Search</button></div>
  ${(form.res||[]).map((r,i)=>`<button class="rs" data-i="${i}" style="width:100%;text-align:left;margin-top:4px">📍 ${esc(r.label)}</button>`).join('')}
  <div id="pick" style="height:260px;border-radius:10px;margin-top:8px;border:1px solid var(--bd)"></div>
  <div class="mu">Tap the map or drag the pin to the exact pothole location.</div>
  <label>3. Severity</label><select id="sev">${['Low','Medium','High'].map(s=>`<option ${s===form.sev?'selected':''}>${s}</option>`).join('')}</select>
  <label>4. Description (optional)</label><textarea id="desc" rows="2">${esc(form.desc)}</textarea>
  <button class="p" id="go" style="width:100%;margin-top:12px" ${form.busy?'disabled':''}>${form.busy?'Submitting…':'Submit report'}</button>
  ${form.msg?`<div class="msg ${form.cls}">${esc(form.msg)}</div>`:''}</div>`;
  $('#f').onchange=async e=>{
    const f=e.target.files[0];if(!f)return;keep();
    const g=await exifr.gps(f).catch(()=>null);
    form.blob=await shrink(f);form.url=await toURL(form.blob);
    if(g&&g.latitude){form.lat=g.latitude.toFixed(6);form.lng=g.longitude.toFixed(6);form.msg='Location read from the photo ✓ Drag the pin if it is not exact.';form.cls='good';render()}
    else if(Date.now()-f.lastModified<180000)getGPS();
    else{form.lat='';form.lng='';form.msg='This photo has no location data and was not taken just now, so the app cannot know where it was taken. Search the place above or tap the map to set it.';form.cls='err';render()}
  };
  $('#gps').onclick=()=>{keep();getGPS()};$('#go').onclick=submit;
  ['lat','lng'].forEach(i=>$('#'+i).onchange=()=>{keep();render()});
  $('#sq').onkeydown=e=>{if(e.key==='Enter')$('#sb').click()};
  $('#sb').onclick=async()=>{
    keep();const q=$('#sq').value.trim();form.q=q;form.res=[];if(!q)return;
    const m=q.match(/(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/);
    if(m){form.lat=m[1];form.lng=m[2];form.msg='Coordinates set. Check the pin and adjust if needed.';form.cls='good';return render()}
    try{
      const r=await (await fetch('https://photon.komoot.io/api/?limit=6&bbox=68,6,98,36&q='+encodeURIComponent(q))).json();
      form.res=(r.features||[]).map(f=>{const p=f.properties;return{lat:f.geometry.coordinates[1],lng:f.geometry.coordinates[0],label:[p.name,p.street,p.district,p.city,p.state].filter(Boolean).join(', ')}});
      form.msg=form.res.length?'Pick the matching result above the map, or tap the map.':'No match. Try a nearby landmark or town name, or tap the map. Tip: in Google Maps, right-click the spot, click the coordinates to copy them, and paste them into the search box.';
      form.cls=form.res.length?'good':'err';render();
    }catch(e){form.msg='Search failed. Check your internet and try again.';form.cls='err';render()}
  };
  document.querySelectorAll('.rs').forEach(b=>b.onclick=()=>{const r=form.res[b.dataset.i];form.lat=r.lat.toFixed(6);form.lng=r.lng.toFixed(6);form.res=[];form.msg='Location selected. Tap the exact spot on the map if needed.';form.cls='good';render()});
  initPick();
}
function initPick(){
  const la=parseFloat(form.lat),ln=parseFloat(form.lng),has=!isNaN(la)&&!isNaN(ln);
  pick=L.map('pick').setView(has?[la,ln]:[20.59,78.96],has?17:5);
  const osm=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'});
  const sat=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'Esri'});
  osm.addTo(pick);L.control.layers({'Street':osm,'Satellite':sat}).addTo(pick);
  let mk=null;
  const set=p=>{form.lat=p.lat.toFixed(6);form.lng=p.lng.toFixed(6);$('#lat').value=form.lat;$('#lng').value=form.lng};
  const make=ll=>{mk=L.marker(ll,{draggable:true}).addTo(pick);mk.on('dragend',()=>set(mk.getLatLng()))};
  if(has)make([la,ln]);
  pick.on('click',e=>{if(mk)mk.setLatLng(e.latlng);else make(e.latlng);set(e.latlng)});
}
const keep=()=>{if(!$('#lat'))return;Object.assign(form,{lat:$('#lat').value,lng:$('#lng').value,sev:$('#sev').value,desc:$('#desc').value})};
function getGPS(){
  form.msg='Getting location…';form.cls='';render();
  if(!navigator.geolocation){form.msg='GPS unavailable. Enter coordinates manually.';form.cls='err';return render()}
  navigator.geolocation.getCurrentPosition(p=>{form.lat=p.coords.latitude.toFixed(6);form.lng=p.coords.longitude.toFixed(6);const ac=Math.round(p.coords.accuracy);form.msg=`Device location used (accuracy ±${ac} m). `+(ac>200?'This is a rough estimate, so please search the place or tap the map to set the exact spot.':'If the pothole is somewhere else, search a place or tap the map.');form.cls=ac>200?'err':'good';render()},
    ()=>{form.msg='Could not get GPS. Allow location access or type coordinates.';form.cls='err';render()},{enableHighAccuracy:true,timeout:15000});
}
const shrink=f=>new Promise(res=>{const i=new Image();i.onload=()=>{const k=Math.min(1,800/Math.max(i.width,i.height)),c=document.createElement('canvas');c.width=i.width*k;c.height=i.height*k;c.getContext('2d').drawImage(i,0,0,c.width,c.height);c.toBlob(res,'image/jpeg',.6)};i.src=URL.createObjectURL(f)});
const toURL=b=>new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result);f.readAsDataURL(b)});

async function submit(){
  keep();const lat=parseFloat(form.lat),lng=parseFloat(form.lng);
  const fail=m=>{form.msg=m;form.cls='err';form.busy=false;render()};
  if(!form.url)return fail('Please add a photo.');
  if(isNaN(lat)||isNaN(lng))return fail('Location is required.');
  form.busy=true;form.msg='';render();
  let ai='unverified',sev=form.sev;
  if(AI_ENABLED){
    try{
      const {data}=await httpsCallable(getFunctions(app),'analyzePhoto')({image:form.url});
      if(!data.pothole)return fail('AI check: no pothole detected ('+(data.reason||'')+'). Please retake the photo.');
      ai='verified';sev=data.severity||sev;
    }catch(e){ai='unverified'}
  }
  const dup=reports.find(r=>r.status!=='Fixed'&&!r.dupOf&&dist(lat,lng,r.lat,r.lng)<30);
  const id='r'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);
  const rep={ts:Date.now(),lat,lng,severity:sev,desc:form.desc.trim(),photo:form.url,status:'Pending',by:user.uid,ai,dupOf:dup?dup.id:'',votes:0};
  try{
    await setDoc(doc(db,'reports',id),rep);
    if(dup)await updateDoc(doc(db,'reports',dup.id),{votes:increment(1)}).catch(()=>{});
    emailAdmin(rep);
  }catch(e){return fail('Could not save: '+(e.code||e.message))}
  form={blob:null,url:'',lat:'',lng:'',sev:'Medium',desc:'',busy:false,cls:'good',
    msg:(dup?'Submitted. A report already exists within 30 m, so yours was linked as a duplicate. ':'Report submitted! ')+(ai==='verified'?`AI verified a pothole (severity: ${sev}).`:'')};
  render();
}

function card(r,admin){
  return `<div class="card"><span class="tag ${r.severity}">${esc(r.severity)}</span> <b>${esc(r.status)}</b>${r.votes?` · +${r.votes} duplicate reports`:''}${r.dupOf?' · duplicate':''}${r.ai==='verified'?' · ✅ AI verified':''}
  <img class="ph" src="${esc(r.photo)}" loading="lazy">
  <div class="mu" style="margin-top:6px">${new Date(r.ts).toLocaleString()} · <a href="https://www.openstreetmap.org/?mlat=${r.lat}&mlon=${r.lng}#map=18/${r.lat}/${r.lng}" target="_blank" rel="noopener">${Number(r.lat).toFixed(5)}, ${Number(r.lng).toFixed(5)}</a></div>
  ${r.desc?`<div>${esc(r.desc)}</div>`:''}
  ${admin?`<div class="row" style="margin-top:8px"><select data-id="${r.id}" class="st">${['Pending','In Progress','Fixed'].map(s=>`<option ${s===r.status?'selected':''}>${s}</option>`).join('')}</select></div>`:''}</div>`;
}
function renderList(v,list,admin){
  v.innerHTML=list.length?list.map(r=>card(r,admin)).join(''):'<div class="msg">No reports yet.</div>';
  v.querySelectorAll('.st').forEach(s=>s.onchange=()=>updateDoc(doc(db,'reports',s.dataset.id),{status:s.value}).catch(()=>toast('Update failed')));
}
function renderMap(v){
  v.innerHTML='<div id="map"></div><div class="mu" style="margin-top:6px">🔴 High · 🟠 Medium · 🟢 Low · tap a dot for the photo</div>';
  map=L.map('map').setView([20.59,78.96],5);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
  const col={High:'#c92a2a',Medium:'#e67700',Low:'#2b8a3e'},pts=[];
  reports.filter(r=>r.status!=='Fixed').forEach(r=>{
    pts.push([r.lat,r.lng]);
    L.circleMarker([r.lat,r.lng],{radius:9,color:'#fff',weight:2,fillColor:col[r.severity],fillOpacity:.9}).addTo(map)
      .bindPopup(`<b>${esc(r.severity)} · ${esc(r.status)}</b><br><img src="${esc(r.photo)}" style="width:160px;border-radius:6px"><br>${esc(r.desc)}`);
  });
  if(pts.length)map.fitBounds(pts,{padding:[30,30],maxZoom:16});
}
function renderAdmin(v){
  const c=s=>reports.filter(r=>r.status===s).length,list=filter==='All'?reports:reports.filter(r=>r.status===filter);
  v.innerHTML=`<div class="card stats"><div><b>${reports.length}</b><span class="mu">Total</span></div><div><b>${c('Pending')}</b><span class="mu">Pending</span></div><div><b>${c('In Progress')}</b><span class="mu">Working</span></div><div><b>${c('Fixed')}</b><span class="mu">Fixed</span></div></div>
  <div class="card"><div class="row"><select id="flt">${['All','Pending','In Progress','Fixed'].map(s=>`<option ${s===filter?'selected':''}>${s}</option>`).join('')}</select><button id="csv">⬇ CSV</button><button id="pdf">⬇ PDF</button></div>
  <div class="row" style="margin-top:8px"><button id="mail">✉ Email municipal office</button><button id="al">🔔 Enable alerts</button></div></div><div id="l"></div>`;
  renderList($('#l'),list,true);
  $('#flt').onchange=e=>{filter=e.target.value;renderAdmin(v)};
  $('#csv').onclick=()=>exportCSV(list);$('#pdf').onclick=()=>exportPDF(list);
  $('#mail').onclick=()=>{const b=list.map((r,i)=>`${i+1}. ${r.severity} | ${r.status} | https://maps.google.com/?q=${r.lat},${r.lng} | ${r.desc||''}`).join('\n');
    location.href='mailto:?subject='+encodeURIComponent('Pothole report – '+list.length+' locations')+'&body='+encodeURIComponent(b.slice(0,1800))};
  $('#al').onclick=async()=>{try{toast((await Notification.requestPermission())==='granted'?'Alerts enabled':'Alerts blocked')}catch(e){toast('Not supported in this browser')}};
}

// ---------- exports ----------
function download(name,data,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([data],{type}));a.download=name;a.click()}
function exportCSV(list){
  const q=s=>'"'+String(s??'').replace(/"/g,'""')+'"';
  const rows=[['ID','Date','Latitude','Longitude','Map link','Severity','Status','Duplicates','Duplicate of','Description']].concat(
    list.map(r=>[r.id,new Date(r.ts).toISOString(),r.lat,r.lng,`https://maps.google.com/?q=${r.lat},${r.lng}`,r.severity,r.status,r.votes||0,r.dupOf,r.desc]));
  download('potholes.csv',rows.map(r=>r.map(q).join(',')).join('\n'),'text/csv');
}
function exportPDF(list){
  const d=new window.jspdf.jsPDF();let y=20;
  d.setFontSize(16);d.text('Pothole Report – Municipal Corporation',14,y);y+=7;
  d.setFontSize(10);d.text(`Generated ${new Date().toLocaleString()} · ${list.length} reports`,14,y);y+=8;
  list.forEach((r,i)=>{
    if(y>235){d.addPage();y=20}
    d.setFontSize(11);d.text(`${i+1}. ${r.severity} severity · ${r.status}${r.votes?` · +${r.votes} duplicates`:''}`,14,y);y+=5;
    d.setFontSize(9);d.text(`${new Date(r.ts).toLocaleString()} · ${r.lat}, ${r.lng}`,14,y);y+=5;
    d.text(`Map: https://maps.google.com/?q=${r.lat},${r.lng}`,14,y);y+=5;
    if(r.desc){d.text(d.splitTextToSize(r.desc,180),14,y);y+=5}
    try{d.addImage(r.photo,'JPEG',14,y,60,45)}catch(e){}
    y+=52;
  });
  d.save('potholes.pdf');
}