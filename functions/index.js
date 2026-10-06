// Optional AI pothole check. Needs Firebase Blaze plan + an Anthropic API key (kept server-side, never in the browser).
const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {defineSecret}=require('firebase-functions/params');
const key=defineSecret('ANTHROPIC_API_KEY');

exports.analyzePhoto=onCall({secrets:[key]},async req=>{
  if(!req.auth)throw new HttpsError('unauthenticated','Login required');
  const data=String(req.data.image||'').split(',')[1];
  if(!data)throw new HttpsError('invalid-argument','No image');
  const r=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',
    headers:{'x-api-key':key.value(),'anthropic-version':'2023-06-01','content-type':'application/json'},
    body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:200,messages:[{role:'user',content:[
      {type:'image',source:{type:'base64',media_type:'image/jpeg',data}},
      {type:'text',text:'Does this photo clearly show a pothole or damaged road surface? Reply ONLY with JSON: {"pothole":true|false,"severity":"Low|Medium|High","reason":"short"}'}]}]})});
  const j=await r.json();
  return JSON.parse((j.content?.[0]?.text||'{}').replace(/```json|```/g,'').trim());
});