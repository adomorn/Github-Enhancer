const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
for (const file of ['../src/shared/model.js','../src/background/store.js']) {
  const full = require('node:path').join(__dirname, file);
  if (fs.existsSync(full)) require(full);
}

// Only the external Chrome storage boundary is replaced; all mutation logic is real.
function area(initial = {}) {
  let data = structuredClone(initial);
  return {
    fail: false,
    async get(keys) { await new Promise(resolve=>setImmediate(resolve)); return keys == null ? structuredClone(data) : Object.fromEntries((Array.isArray(keys)?keys:[keys]).filter(key=>Object.hasOwn(data,key)).map(key=>[key,structuredClone(data[key])])); },
    async set(values) { if(this.fail) throw new Error('Disk full'); await new Promise(resolve=>setImmediate(resolve)); Object.assign(data, structuredClone(values)); },
    async remove(keys) { if(this.fail) throw new Error('Disk full'); for(const key of Array.isArray(keys)?keys:[keys]) delete data[key]; }
  };
}
function factory(local = area(), sync = area()) {
  assert.equal(typeof globalThis.GHE?.createStore, 'function');
  return globalThis.GHE.createStore(local, sync);
}
const context = {url:'https://github.com/Owner/Repo/issues/3?utm_source=hi',title:'Fix login',repo:'untrusted/repo',type:'repository'};

test('state migrates relevant sync settings once and retains local settings on restart', async () => {
  const local = area(); const sync = area({github_enhancer_settings:{enhanceDateTimes:false,locale:'tr-TR',enableThemeEnhancements:true}});
  const store = factory(local,sync);
  const state = await store.dispatch({type:'GET_STATE'});
  assert.equal(state.settings.exactDates,false);
  assert.equal(state.settings.locale,'tr-TR');
  assert.deepEqual(state.items,[]);
  await store.dispatch({type:'SET_SETTINGS',patch:{exactDates:true}});
  assert.equal((await factory(local,sync).dispatch({type:'GET_STATE'})).settings.exactDates,true);
});

test('concurrent saves serialize without losing items or overwriting notes on duplicate save', async () => {
  const local = area(); const store = factory(local);
  await Promise.all([store.dispatch({type:'SAVE_ITEM',context,note:'Keep this'}), store.dispatch({type:'SAVE_ITEM',context:{url:'https://github.com/other/project',title:'Other'}})]);
  let state = await store.dispatch({type:'SAVE_ITEM',context:{...context,title:'Updated title'}});
  assert.equal(state.items.length,2);
  const item = state.items.find(item=>item.repo==='owner/repo');
  assert.equal(item.note,'Keep this'); assert.equal(item.type,'issue');
  state = await factory(local).dispatch({type:'GET_STATE'});
  assert.equal(state.items.length,2);
});

test('update refuses missing items; remove and restore preserve a record', async () => {
  const store = factory();
  await assert.rejects(store.dispatch({type:'UPDATE_ITEM',url:context.url,note:'Lost'}), /not found|no longer/i);
  const saved = await store.dispatch({type:'SAVE_ITEM',context,note:'Draft'});
  const item = saved.items[0];
  const removed = await store.dispatch({type:'REMOVE_ITEM',url:item.url});
  assert.equal(removed.items.length,0);
  const restored = await store.dispatch({type:'RESTORE_ITEM',item});
  assert.equal(restored.items[0].note,'Draft');
  assert.equal(restored.items[0].createdAt,item.createdAt);
});

test('failed write never becomes committed state and does not poison mutation queue', async () => {
  const local = area(); const store = factory(local);
  await store.dispatch({type:'GET_STATE'});
  local.fail = true;
  await assert.rejects(store.dispatch({type:'SAVE_ITEM',context,note:'Unsaved'}), /Disk full/);
  local.fail = false;
  assert.equal((await store.dispatch({type:'GET_STATE'})).items.length,0);
  assert.equal((await store.dispatch({type:'SAVE_ITEM',context})).items.length,1);
});

test('import preserves newer local edits, merges settings and validates all records first', async () => {
  const store = factory();
  await store.dispatch({type:'SAVE_ITEM',context,note:'Newer local note'});
  const text = JSON.stringify({version:1,items:[{...context,note:'Stale import',createdAt:1,updatedAt:2},{url:'https://github.com/fresh/repo',title:'New',note:'Imported',createdAt:1,updatedAt:2}],settings:{wide:true}});
  const result = await store.dispatch({type:'IMPORT_ITEMS',text});
  assert.equal(result.items.length,2);
  assert.equal(result.items.find(item=>item.repo==='owner/repo').note,'Newer local note');
  assert.equal(result.settings.wide,true);
  await assert.rejects(store.dispatch({type:'IMPORT_ITEMS',text:JSON.stringify({items:[{url:'https://evil.test/a/b'}]})}));
  assert.equal((await store.dispatch({type:'GET_STATE'})).items.length,2);
  await assert.rejects(store.dispatch({type:'SET_SETTINGS',patch:{enabled:'false'}}), /setting/i);
  await assert.rejects(store.dispatch({type:'SAVE_ITEM',context,note:'x'.repeat(10001)}), /note/i);
  await assert.rejects(store.dispatch({type:'UNKNOWN'}), /message|operation/i);
});

test('worker rejects foreign senders and unknown messages and returns structured mutation errors', async () => {
  const vm = require('node:vm');
  const path = require('node:path');
  let listener;
  const runtime = {id:'our-extension',onMessage:{addListener(fn){listener=fn;}},onInstalled:{addListener(){}}};
  const sandbox = vm.createContext({URL,TextEncoder,console:{log(){},warn(){},error(){}},chrome:{runtime,storage:{local:area(),sync:area()}}});
  sandbox.importScripts = (...files) => files.forEach(file=>vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/background',file),'utf8'),sandbox));
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/background/service-worker.js'),'utf8'),sandbox);
  assert.equal(listener({type:'GET_STATE'},{id:'another-extension'},()=>{}),false);
  assert.equal(listener({type:'UNKNOWN'},{id:'our-extension'},()=>{}),false);
  let response;
  await new Promise(resolve=>{
    assert.equal(listener({type:'UPDATE_ITEM',url:context.url,note:'Missing'},{id:'our-extension'},value=>{response=value;resolve();}),true);
  });
  assert.equal(response.ok,false);
  assert.match(response.error,/not found/i);
});

const sampleSnippet = (id) => ({...(id?{id}:{}),url:'https://github.com/o/r/blob/main/src/a.js#L1-L2',title:'A.js',path:'src/a.js',language:'javascript',lineStart:1,lineEnd:2,code:'one();\ntwo();',note:'Initial',revision:null});
const fullSnippet = id => ({...sampleSnippet(id),repo:'o/r',createdAt:1,updatedAt:2});

test('schema upgrade adds empty collections without losing existing saved pages or notes', async()=>{
  const oldItem={url:'https://github.com/o/r',title:'Original',note:'Keep forever',createdAt:1,updatedAt:2};
  const local=area({'ghe:schemaVersion':1,'ghe:settings':{enabled:false},['ghe:item:'+encodeURIComponent(oldItem.url)]:oldItem});
  const state=await factory(local).dispatch({type:'GET_STATE'});
  assert.deepEqual(state.snippets,[]);assert.deepEqual(state.workspaces,[]);assert.deepEqual(state.reviews,[]);
  assert.equal(state.items[0].note,'Keep forever');assert.equal(state.settings.enabled,false);
});

test('snippet metadata patches serialize and captured source is immutable across surfaces',async()=>{
  const local=area(),store=factory(local);
  let state=await store.dispatch({type:'SAVE_SNIPPET',snippet:sampleSnippet()});const id=state.snippets[0].id;
  await Promise.all([store.dispatch({type:'UPDATE_SNIPPET',id,patch:{title:'Renamed'}}),store.dispatch({type:'UPDATE_SNIPPET',id,patch:{note:'Updated'}})]);
  state=await factory(local).dispatch({type:'GET_STATE'});
  assert.equal(state.snippets[0].title,'Renamed');assert.equal(state.snippets[0].note,'Updated');assert.equal(state.snippets[0].code,'one();\ntwo();');
  await assert.rejects(store.dispatch({type:'UPDATE_SNIPPET',id,patch:{code:'replace source'}}),/patch|field/i);
  const snippet=state.snippets[0];await store.dispatch({type:'REMOVE_SNIPPET',id});
  await assert.rejects(store.dispatch({type:'UPDATE_SNIPPET',id,patch:{note:'Missing'}}),/not found/i);
  state=await store.dispatch({type:'RESTORE_SNIPPET',snippet});assert.equal(state.snippets[0].note,'Updated');
});

test('workspace links and notes merge independently and deletion with undo preserves membership',async()=>{
  const store=factory();let state=await store.dispatch({type:'CREATE_WORKSPACE',title:'Release',note:'Plan'});const id=state.workspaces[0].id;
  await store.dispatch({type:'SAVE_ITEM',context});state=await store.dispatch({type:'SAVE_SNIPPET',snippet:sampleSnippet()});const snippet=state.snippets[0];
  await Promise.all([store.dispatch({type:'LINK_WORKSPACE_ITEM',id,url:context.url}),store.dispatch({type:'LINK_WORKSPACE_SNIPPET',id,snippetId:snippet.id}),store.dispatch({type:'UPDATE_WORKSPACE',id,patch:{note:'Next'}})]);
  state=await store.dispatch({type:'GET_STATE'});const workspace=state.workspaces[0];
  assert.deepEqual(workspace.itemUrls,['https://github.com/owner/repo/issues/3']);assert.deepEqual(workspace.snippetIds,[snippet.id]);assert.equal(workspace.note,'Next');
  await store.dispatch({type:'REMOVE_SNIPPET',id:snippet.id});state=await store.dispatch({type:'RESTORE_SNIPPET',snippet});assert.deepEqual(state.workspaces[0].snippetIds,[snippet.id]);
  await store.dispatch({type:'REMOVE_WORKSPACE',id});state=await store.dispatch({type:'RESTORE_WORKSPACE',workspace});assert.equal(state.workspaces[0].note,'Next');assert.equal(state.items.length,1);
  state=await store.dispatch({type:'UNLINK_WORKSPACE_ITEM',id,url:context.url});assert.deepEqual(state.workspaces[0].itemUrls,[]);
  await assert.rejects(store.dispatch({type:'LINK_WORKSPACE_SNIPPET',id,snippetId:'missing'}),/not found/i);
});

test('review notes do not renew markers and changed or unknown revisions require reconfirmation',async()=>{
  const store=factory(),prUrl='https://github.com/O/R/pull/5/changes',revision='a'.repeat(40);
  await Promise.all([store.dispatch({type:'UPDATE_REVIEW_FILE',prUrl,path:'a.js',revision,patch:{reviewed:true}}),store.dispatch({type:'UPDATE_REVIEW_FILE',prUrl,path:'b.js',revision:null,patch:{note:'Check this',reviewed:true}})]);
  const before=(await store.dispatch({type:'GET_STATE'})).reviews[0].files.find(file=>file.path==='a.js');
  let state=await store.dispatch({type:'UPDATE_REVIEW_FILE',prUrl,path:'a.js',revision:'b'.repeat(40),patch:{note:'New note'}});
  let review=state.reviews[0];assert.equal(review.prUrl,'https://github.com/o/r/pull/5');assert.equal(review.files.length,2);
  let file=review.files.find(file=>file.path==='a.js');assert.equal(file.reviewedRevision,revision);assert.equal(globalThis.GHE.reviewStatus(file,'b'.repeat(40)),'changed');
  assert.equal(file.reviewedAt,before.reviewedAt);assert.ok(file.updatedAt>before.updatedAt);
  assert.equal(globalThis.GHE.reviewStatus(review.files.find(file=>file.path==='b.js'),revision),'unverified');
  state=await store.dispatch({type:'UPDATE_REVIEW_FILE',prUrl,path:'a.js',revision:'b'.repeat(40),patch:{reviewed:true}});file=state.reviews[0].files.find(file=>file.path==='a.js');assert.equal(globalThis.GHE.reviewStatus(file,'b'.repeat(40)),'verified');
  state=await store.dispatch({type:'SET_REVIEW_LAST_FILE',prUrl,path:'b.js'});assert.equal(state.reviews[0].lastFile,'b.js');
});

test('v2 merge retains newer local records and independent review-file notes while v1 leaves extensions intact',async()=>{
  const store=factory(),prUrl='https://github.com/o/r/pull/5';
  await store.dispatch({type:'SAVE_SNIPPET',snippet:sampleSnippet('snippet-a')});
  await store.dispatch({type:'UPDATE_REVIEW_FILE',prUrl,path:'local.js',revision:null,patch:{note:'Local'}});
  const review={prUrl,files:[{path:'imported.js',note:'Imported',reviewed:false,reviewedRevision:null,reviewedAt:null,updatedAt:2}],lastFile:'imported.js',createdAt:1,updatedAt:2};
  let state=await store.dispatch({type:'IMPORT_ITEMS',text:JSON.stringify({version:2,items:[],snippets:[{...fullSnippet('snippet-a'),note:'Stale'}],reviews:[review]})});
  assert.equal(state.snippets[0].note,'Initial');assert.deepEqual(state.reviews[0].files.map(file=>file.path).sort(),['imported.js','local.js']);
  state=await store.dispatch({type:'IMPORT_ITEMS',text:JSON.stringify({version:1,items:[]})});assert.equal(state.snippets.length,1);assert.equal(state.reviews.length,1);
});

test('collection caps and storage failures reject whole mutations without dropping existing content',async()=>{
  const local=area(),store=factory(local);
  const snippets=Array.from({length:100},(_,i)=>fullSnippet('s-'+i));
  await store.dispatch({type:'IMPORT_ITEMS',text:JSON.stringify({version:2,items:[],snippets})});
  await assert.rejects(store.dispatch({type:'SAVE_SNIPPET',snippet:sampleSnippet()}),/100/);
  await assert.rejects(store.dispatch({type:'IMPORT_ITEMS',text:JSON.stringify({version:2,items:[],snippets:[fullSnippet('overflow')]})}),/100/);
  local.fail=true;await assert.rejects(store.dispatch({type:'UPDATE_SNIPPET',id:'s-0',patch:{note:'Unsaved'}}),/Disk full/);local.fail=false;
  const state=await store.dispatch({type:'GET_STATE'});assert.equal(state.snippets.length,100);assert.equal(state.snippets.find(item=>item.id==='s-0').note,'Initial');
});

test('workspace and review union limits reject imports without partial writes',async()=>{
  const store=factory();
  const workspaces=Array.from({length:40},(_,i)=>({id:'w-'+i,title:'Workspace '+i,note:'',itemUrls:[],snippetIds:[],createdAt:1,updatedAt:2}));
  const files=Array.from({length:500},(_,i)=>({path:`file-${i}.js`,note:'',reviewed:false,reviewedRevision:null,reviewedAt:null,updatedAt:2}));
  const reviews=Array.from({length:50},(_,i)=>({prUrl:`https://github.com/o/r/pull/${i+1}`,files:i===0?files:[],lastFile:null,createdAt:1,updatedAt:2}));
  await store.dispatch({type:'IMPORT_ITEMS',text:JSON.stringify({version:2,items:[],workspaces,reviews})});
  await assert.rejects(store.dispatch({type:'CREATE_WORKSPACE',title:'Overflow'}),/40/);
  await assert.rejects(store.dispatch({type:'SET_REVIEW_LAST_FILE',prUrl:'https://github.com/o/r/pull/51',path:'a.js'}),/50/);
  const newFile={...files[0],path:'extra.js'};
  await assert.rejects(store.dispatch({type:'IMPORT_ITEMS',text:JSON.stringify({version:2,items:[],snippets:[fullSnippet('partial-write')],reviews:[{...reviews[0],files:[newFile]}]})}),/500/);
  const state=await store.dispatch({type:'GET_STATE'});assert.equal(state.snippets.length,0);assert.equal(state.reviews.find(review=>review.prUrl.endsWith('/1')).files.length,500);
});

const fullTemplate=id=>({id,title:'Question',body:'Could you explain this?',createdAt:1,updatedAt:2});
test('templates use serialized independent patches and survive removal, undo and restart',async()=>{
 const local=area({'ghe:schemaVersion':2}),store=factory(local);
 assert.deepEqual((await store.dispatch({type:'GET_STATE'})).templates,[]);
 let state=await store.dispatch({type:'CREATE_TEMPLATE',title:'Question',body:'Initial body'});const initial=state.templates[0],id=initial.id;
 await Promise.all([store.dispatch({type:'UPDATE_TEMPLATE',id,patch:{title:'Updated title'}}),store.dispatch({type:'UPDATE_TEMPLATE',id,patch:{body:'Updated body'}})]);
 state=await factory(local).dispatch({type:'GET_STATE'});const template=state.templates[0];assert.equal(template.title,'Updated title');assert.equal(template.body,'Updated body');assert.equal(template.createdAt,initial.createdAt);assert.ok(template.updatedAt>initial.updatedAt);
 await assert.rejects(store.dispatch({type:'UPDATE_TEMPLATE',id,patch:{createdAt:1}}),/patch|field/);
 await store.dispatch({type:'REMOVE_TEMPLATE',id});await assert.rejects(store.dispatch({type:'UPDATE_TEMPLATE',id,patch:{title:'No recreation'}}),/not found/);
 state=await store.dispatch({type:'RESTORE_TEMPLATE',template});assert.deepEqual(state.templates[0],template);
 await store.dispatch({type:'RESTORE_TEMPLATE',template:initial});assert.deepEqual((await store.dispatch({type:'GET_STATE'})).templates[0],template);
 assert.ok(Object.hasOwn(await local.get(null),'ghe:template:'+id));
});
test('template imports merge newest edits and older backups leave local templates intact',async()=>{
 const store=factory();let state=await store.dispatch({type:'CREATE_TEMPLATE',title:'Local',body:'New local body'});const local=state.templates[0];
 state=await store.dispatch({type:'IMPORT_ITEMS',text:JSON.stringify({version:2,items:[],templates:[{...fullTemplate(local.id),body:'Stale'},fullTemplate('imported')]})});
 assert.equal(state.templates.find(t=>t.id===local.id).body,'New local body');assert.equal(state.templates.length,2);
 for(const version of [1,2]){state=await store.dispatch({type:'IMPORT_ITEMS',text:JSON.stringify({version,items:[]})});assert.equal(state.templates.length,2);}
 state=await store.dispatch({type:'IMPORT_ITEMS',text:JSON.stringify({version:2,items:[],templates:[{...local,body:'New import',updatedAt:local.updatedAt+1}]})});assert.equal(state.templates.find(t=>t.id===local.id).body,'New import');
});
test('template capacity, invalid content and storage failures never commit partial changes',async()=>{
 const local=area(),store=factory(local),templates=Array.from({length:40},(_,i)=>fullTemplate('t'+i));
 await store.dispatch({type:'IMPORT_ITEMS',text:JSON.stringify({version:2,items:[],templates})});
 await assert.rejects(store.dispatch({type:'CREATE_TEMPLATE',title:'Overflow',body:'Body'}),/40/);
 await assert.rejects(store.dispatch({type:'IMPORT_ITEMS',text:JSON.stringify({version:2,items:[],templates:[fullTemplate('extra')],settings:{wide:true}})}),/40/);
 await assert.rejects(store.dispatch({type:'IMPORT_ITEMS',text:JSON.stringify({version:2,items:[],templates:[{...fullTemplate('t0'),body:'  '}],settings:{wide:true}})}));
 local.fail=true;await assert.rejects(store.dispatch({type:'UPDATE_TEMPLATE',id:'t0',patch:{body:'Unsaved'}}),/Disk full/);local.fail=false;
 const state=await store.dispatch({type:'GET_STATE'});assert.equal(state.templates.length,40);assert.equal(state.templates.find(t=>t.id==='t0').body,'Could you explain this?');assert.equal(state.settings.wide,false);
 assert.equal((await store.dispatch({type:'UPDATE_TEMPLATE',id:'t0',patch:{body:'Works again'}})).templates.find(t=>t.id==='t0').body,'Works again');
});
