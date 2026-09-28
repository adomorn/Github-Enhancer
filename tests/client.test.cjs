const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname,'../src/shared/client.js'),'utf8');

function requestClient(sendMessage) {
  const context = vm.createContext({GHE:{},chrome:{runtime:{sendMessage}}});
  vm.runInContext(source,context);
  return context.GHE.request;
}

test('missing or malformed worker replies explain how to reconnect instead of returning unusable state',async()=>{
  for(const response of [undefined,null,{},[],{ok:'true',state:{}},{ok:true},{ok:true,state:null},{ok:true,state:[]}]) {
    const request=requestClient(async()=>response);
    await assert.rejects(request({type:'CREATE_TEMPLATE'}),error=>{
      assert.match(error.message,/Extension did not respond/);
      assert.match(error.message,/Reload GitHub Enhancer in chrome:\/\/extensions, then reload this GitHub page/);
      return true;
    });
  }
});

test('worker validation errors remain distinct from transport and missing-response failures',async()=>{
  const request=requestClient(async()=>({ok:false,error:'Template limit reached.'}));
  await assert.rejects(request({type:'CREATE_TEMPLATE'}),/Template limit reached\./);
  const disconnected=requestClient(async()=>{throw new Error('Runtime unavailable');});
  await assert.rejects(disconnected({type:'GET_STATE'}),/Extension connection lost\. Reload this page and try again\./);
  const state={items:[],templates:[]};
  assert.equal(await requestClient(async()=>({ok:true,state}))({type:'GET_STATE'}),state);
});

function setup() {
  const data = {};
  // Chrome shares exclusive Web Locks across extension surfaces. Keep that
  // boundary explicit: Node 22 has navigator, but does not have navigator.locks.
  const queues = new Map();
  const locks = {
    request(name, operation) {
      const result = (queues.get(name) || Promise.resolve()).then(operation);
      queues.set(name, result.catch(() => {}));
      return result;
    }
  };
  const session = {
    async get(keys) {
      const snapshot = keys === null ? {...data} : Object.fromEntries((Array.isArray(keys)?keys:[keys]).filter(key=>Object.hasOwn(data,key)).map(key=>[key,data[key]]));
      await new Promise(resolve=>setTimeout(resolve,5));
      return snapshot;
    },
    async set(values) {Object.assign(data,values);},
    async remove(key) {delete data[key];}
  };
  function client() {
    const context = vm.createContext({GHE:{},navigator:{locks},chrome:{storage:{session}}});
    vm.runInContext(source,context);
    return context.GHE.draftOptions;
  }
  return [client(),client()];
}

test('a delayed save acknowledgement cannot delete a newer draft from another surface', async () => {
  const [panel,popup] = setup();
  const url = 'https://github.com/o/r/issues/1';
  await panel.saveDraft(url,'A');
  await popup.saveDraft(url,'B');
  await panel.deleteDraft(url,'A');
  const drafts = await popup.loadDrafts();
  assert.equal(drafts.length,1);
  assert.equal(drafts[0][1],'B');
  await popup.deleteDraft(url,'B');
  assert.equal((await panel.loadDrafts()).length,0);
});

test('checking and removing an old draft is atomic with a concurrent newer draft save', async () => {
  const [panel,popup] = setup();
  const url = 'https://github.com/o/r/issues/2';
  await panel.saveDraft(url,'A');
  await Promise.all([panel.deleteDraft(url,'A'),popup.saveDraft(url,'B')]);
  const drafts = await popup.loadDrafts();
  assert.equal(drafts.length,1);
  assert.equal(drafts[0][1],'B');
});

test('toolkit recovery is isolated from page notes and protects newer cross-surface edits',async()=>{
 const [panel,popup]=setup();const key='note:workspace1';
 await panel.saveToolDraft('workspaces',key,{note:'A'});
 await popup.saveToolDraft('workspaces',key,{note:'B'});
 await panel.deleteToolDraft('workspaces',key,{note:'A'});
 assert.equal((await panel.loadDrafts()).length,0);
 assert.equal((await panel.loadToolDrafts('review')).length,0);
 assert.equal((await panel.loadToolDrafts('workspaces'))[0][1].note,'B');
 await popup.deleteToolDraft('workspaces',key,{note:'B'});
 assert.equal((await panel.loadToolDrafts('workspaces')).length,0);
});
test('toolkit recovery snapshots input before async storage and rejects oversized drafts',async()=>{
 const [panel]=setup();const draft={note:'initial'};const saved=panel.saveToolDraft('review','file',draft);draft.note='mutated';await saved;
 assert.equal((await panel.loadToolDrafts('review'))[0][1].note,'initial');
 await assert.rejects(async()=>panel.saveToolDraft('review','file',{note:'x'.repeat(23000)}),/too large/);
});

test('composer drafts share the session boundary without leaking into page or review drafts',async()=>{
 const [panel,popup]=setup(),key='https://github.com/o/r/pull/1';
 await panel.saveToolDraft('composer',key,{body:'First draft'});await popup.saveToolDraft('composer',key,{body:'Newer draft'});await panel.deleteToolDraft('composer',key,{body:'First draft'});
 assert.equal((await popup.loadToolDrafts('composer'))[0][1].body,'Newer draft');assert.equal((await popup.loadDrafts()).length,0);assert.equal((await popup.loadToolDrafts('review')).length,0);
});

function recoveryClient() {
 const data={},writes=[];
 const session={get:async key=>key===null?{...data}:{[key]:data[key]},remove:async key=>{delete data[key];},set:values=>new Promise((resolve,reject)=>writes.push({resolve:()=>{Object.assign(data,values);resolve();},reject}))};
 const context=vm.createContext({GHE:{},navigator:{locks:{request:(_name,fn)=>fn()}},chrome:{storage:{session}}});vm.runInContext(source,context);
 return {G:context.GHE,writes,data};
}
test('only pending or failed session writes guard navigation, never recovered drafts',async()=>{
 const {G,writes,data}=recoveryClient();data['ghe:draft:'+encodeURIComponent('https://github.com/o/r/issues/1')]='Recovered note';
 await G.draftOptions.loadDrafts();assert.equal(G.hasUnprotectedDrafts(),false);
 const saved=G.draftOptions.saveDraft('https://github.com/o/r/issues/2','New note');assert.equal(G.hasUnprotectedDrafts(),true);
 writes.shift().resolve();await saved;assert.equal(G.hasUnprotectedDrafts(),false);
 const failed=G.draftOptions.saveToolDraft('composer','global',{body:'Unsaved draft'});writes.shift().reject(new Error('Quota exceeded'));await assert.rejects(failed,/Quota/);assert.equal(G.hasUnprotectedDrafts(),true);
 const retry=G.draftOptions.saveToolDraft('composer','global',{body:'Unsaved draft'});writes.shift().resolve();await retry;assert.equal(G.hasUnprotectedDrafts(),false);
});
test('older successful recovery cannot clear a newer pending or failed edit',async()=>{
 const {G,writes}=recoveryClient();const drafts=G.draftOptions;
 const old=drafts.saveToolDraft('basket','same',{note:'old'}),newer=drafts.saveToolDraft('basket','same',{note:'new'});
 writes[0].resolve();await old;assert.equal(G.hasUnprotectedDrafts(),true);
 writes[1].reject(new Error('Disk'));await assert.rejects(newer,/Disk/);assert.equal(G.hasUnprotectedDrafts(),true);
 const oldAgain=drafts.saveDraft('url','old'),newAgain=drafts.saveDraft('url','new');
 writes[3].reject(new Error('New failed'));await assert.rejects(newAgain,/New failed/);writes[2].resolve();await oldAgain;assert.equal(G.hasUnprotectedDrafts(),true);
});
test('expected deletion clears matching failed recovery but preserves newer or other-key edits',async()=>{
 const {G,writes}=recoveryClient();const d=G.draftOptions;
 const failed=d.saveDraft('url','latest');writes.shift().reject(new Error('Storage'));await assert.rejects(failed);
 await d.deleteDraft('url','stale');assert.equal(G.hasUnprotectedDrafts(),true);
 await d.deleteDraft('url','latest');assert.equal(G.hasUnprotectedDrafts(),false);
 const first=d.saveToolDraft('review','file',{note:'A'});const second=d.saveToolDraft('review','file',{note:'B'});
 await d.deleteToolDraft('review','file',{note:'A'});assert.equal(G.hasUnprotectedDrafts(),true);
 writes[0].resolve();await first;writes[1].reject(new Error('Storage'));await assert.rejects(second);
 await d.deleteToolDraft('review','file',{note:'B'});assert.equal(G.hasUnprotectedDrafts(),false);
});
test('a stale recovery failure cannot reinstate a warning after the newer snapshot succeeds',async()=>{
 const {G,writes}=recoveryClient();const old=G.draftOptions.saveDraft('url','old'),latest=G.draftOptions.saveDraft('url','latest');
 writes[1].resolve();await latest;assert.equal(G.hasUnprotectedDrafts(),false);
 writes[0].reject(new Error('Old failure'));await assert.rejects(old);assert.equal(G.hasUnprotectedDrafts(),false);
});
test('oversized recovery snapshots remain protected until a valid retry succeeds',async()=>{
 const {G,writes}=recoveryClient();assert.throws(()=>G.draftOptions.saveToolDraft('composer','global',{body:'x'.repeat(23000)}),/too large/);assert.equal(G.hasUnprotectedDrafts(),true);
 const retry=G.draftOptions.saveToolDraft('composer','global',{body:'shorter'});writes.shift().resolve();await retry;assert.equal(G.hasUnprotectedDrafts(),false);
});
test('clearing one recovery key never releases another failed edit',async()=>{
 const {G,writes}=recoveryClient();const a=G.draftOptions.saveDraft('a','A'),b=G.draftOptions.saveDraft('b','B');
 writes[0].reject(new Error('A failed'));writes[1].reject(new Error('B failed'));await Promise.allSettled([a,b]);
 await G.draftOptions.deleteDraft('a','A');assert.equal(G.hasUnprotectedDrafts(),true);
 await G.draftOptions.deleteDraft('b','B');assert.equal(G.hasUnprotectedDrafts(),false);
});
