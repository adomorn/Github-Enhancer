const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');

// Replace only Chrome's external persistence boundary. Validation, serialized
// mutations, view controllers, and Markdown generation are the production code.
function storageArea(){
  let values={};
  return{
    async get(keys){await new Promise(resolve=>setImmediate(resolve));return keys==null?structuredClone(values):Object.fromEntries((Array.isArray(keys)?keys:[keys]).filter(key=>Object.hasOwn(values,key)).map(key=>[key,structuredClone(values[key])]));},
    async set(next){await new Promise(resolve=>setImmediate(resolve));Object.assign(values,structuredClone(next));},
    async remove(keys){await new Promise(resolve=>setImmediate(resolve));for(const key of Array.isArray(keys)?keys:[keys])delete values[key];}
  };
}
const firstCode={path:'src/first.js',text:'const label = "first";\nexport { label };',language:'javascript',lineCount:2,bytes:40,truncated:false,selection:{start:1,end:2},url:'https://github.com/owner/repo/blob/main/src/first.js'};
const secondCode={...firstCode,path:'src/second.js',text:'export const second = 2;',lineCount:1,selection:{start:1,end:1},url:'https://github.com/owner/repo/blob/main/src/second.js'};
async function setup(local=storageArea(),code=firstCode){
  const dom=new JSDOM('<main id="app"></main>',{url:'https://extension.test',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window;w.TextEncoder=TextEncoder;
  for(const file of ['src/shared/model.js','src/background/store.js','src/shared/basket.js','src/shared/review.js','src/shared/workspaces.js','src/shared/conversation.js','src/shared/composer.js','src/shared/ui.js'])w.eval(fs.readFileSync(file,'utf8'));
  const store=w.GHE.createStore(local,storageArea());const copies=[],actions=[],pending=new Set();
  const request=message=>{const operation=store.dispatch(message);pending.add(operation);operation.then(()=>pending.delete(operation),()=>pending.delete(operation));return operation;};
  const context=code?w.GHE.parseContext(code.url,'Example source'):null;
  const ui=w.GHE.mountWorkbench(w.document.querySelector('#app'),{context,pageData:code?{code}:{},request,copy:async text=>copies.push(text),openOptions(){},pageAction:async action=>{actions.push(action);return true;},openPages:async()=>{}});
  await ui.ready;
  async function settle(){for(let i=0;i<12;i++){await Promise.allSettled([...pending]);await new Promise(resolve=>setImmediate(resolve));if(!pending.size){await new Promise(resolve=>setImmediate(resolve));if(!pending.size)return;}}throw new Error('UI storage actions did not settle');}
  return{dom,w,doc:w.document,ui,local,store,copies,actions,settle};
}
function click(x,selector){const element=x.doc.querySelector(selector);assert.ok(element,`Control exists: ${selector}`);element.click();}
function change(x,selector,value,event='input'){const element=x.doc.querySelector(selector);assert.ok(element,`Field exists: ${selector}`);element.value=value;element.dispatchEvent(new x.w.Event(event,{bubbles:true}));return element;}

test('real basket, workspace, and storage modules complete a multi-file export and remount without data loss',async()=>{
  const x=await setup();
  assert.equal(x.ui.hasDrafts(),false,'mounting the toolkit must not manufacture unsaved edits');
  click(x,'[data-action="view:basket"]');change(x,'[data-basket-field="title"]','First evidence');change(x,'[data-basket-field="note"]','Check first allocation');
  click(x,'[data-basket-action="save-excerpt"]');await x.settle();assert.equal(x.ui.getState().snippets.length,1);
  const firstId=x.ui.getState().snippets[0].id;
  x.ui.setContext(x.w.GHE.parseContext(secondCode.url,'Second source'),{code:secondCode});
  assert.equal(x.doc.querySelector('[data-basket-preview]').textContent,'export const second = 2;');
  change(x,'[data-basket-field="title"]','Second evidence');click(x,'[data-basket-action="save-excerpt"]');await x.settle();
  assert.equal(x.ui.getState().snippets.length,2);const secondId=x.ui.getState().snippets.find(s=>s.id!==firstId).id;
  click(x,'[data-action="view:workspaces"]');change(x,'[aria-label="New workspace name"]','Allocation investigation');click(x,'[data-ws="create"]');await x.settle();
  assert.equal(x.ui.getState().workspaces.length,1);const workspaceId=x.ui.getState().workspaces[0].id;
  click(x,'[data-ws="add-current"]');await x.settle();
  for(const id of [firstId,secondId]){change(x,'[aria-label="Add a saved snippet"]',id,'change');click(x,'[data-ws="add-snippet"]');await x.settle();}
  change(x,'[aria-label="Workspace note"]','Compare both allocation paths.');click(x,'[data-ws="save-note"]');await x.settle();
  assert.equal(x.ui.hasDrafts(),false,'successful saves clear the drafts reported by the main workbench');
  click(x,'[data-ws="copy"]');await x.settle();
  const markdown=x.copies.at(-1);assert.match(markdown,/Allocation investigation/);assert.match(markdown,/src\/first\\\.js/);assert.match(markdown,/src\/second\\\.js/);assert.match(markdown,/Check first allocation/);assert.match(markdown,/Compare both allocation paths/);assert.match(markdown,/#L1-L2/);
  const persisted=x.ui.getState();assert.equal(persisted.items.length,1);assert.equal(persisted.workspaces[0].itemUrls[0],secondCode.url);assert.equal(persisted.workspaces[0].snippetIds.length,2);
  x.dom.window.close();const reopened=await setup(x.local,null);assert.equal(reopened.ui.getState().snippets.length,2);
  click(reopened,'[data-action="view:workspaces"]');change(reopened,'[aria-label="Choose workspace"]',workspaceId,'change');click(reopened,'[data-ws="copy"]');await reopened.settle();
  assert.equal(reopened.copies.at(-1),markdown);reopened.dom.window.close();
});

test('context navigation keeps basket edits while real review notes and revision markers persist independently',async()=>{
  const x=await setup();click(x,'[data-action="view:basket"]');click(x,'[data-basket-action="save-excerpt"]');await x.settle();
  click(x,'[data-basket-action="edit-snippet"]');change(x,'[data-basket-edit="note"]','Unsaved basket context');
  assert.equal(x.ui.hasDrafts(),true,'the main workbench detects a child basket draft');
  const prUrl='https://github.com/owner/repo/pull/7';const revision='a'.repeat(40);
  const review={revision,files:[{id:'diff-first',path:'src/first.js',group:'source',folder:'src',viewedKnown:true,viewed:false}],truncated:false};
  x.ui.setContext(x.w.GHE.parseContext(prUrl+'/files','Review allocation'),{review});click(x,'[data-action="view:tools"]');
  assert.equal(x.doc.querySelector('[data-basket-edit="note"]').value,'Unsaved basket context');
  assert.match(x.doc.querySelector('[data-basket-composer]').textContent,/Open a code file/);
  change(x,'[aria-label="Private file note"]','Check the null branch');click(x,'[data-review-action="save-note"]');await x.settle();
  const checkbox=x.doc.querySelector('.review-check input');checkbox.checked=true;checkbox.dispatchEvent(new x.w.Event('change',{bubbles:true}));await x.settle();
  let record=x.ui.getState().reviews[0];assert.equal(record.files[0].note,'Check the null branch');assert.equal(record.files[0].reviewedRevision,revision);assert.match(x.doc.querySelector('.review-mark-status').textContent,/Verified/);
  click(x,'[data-review-action="jump"]');await x.settle();assert.equal(x.ui.getState().reviews[0].lastFile,'src/first.js');assert.equal(x.actions.at(-1).type,'review-jump');
  assert.equal(x.ui.getState().snippets[0].note,'','unsaved basket note is not silently committed by a review write');
  click(x,'[data-action="view:basket"]');assert.equal(x.doc.querySelector('[data-basket-edit="note"]').value,'Unsaved basket context');click(x,'[data-basket-action="save-snippet"]');await x.settle();
  assert.equal(x.ui.getState().snippets[0].note,'Unsaved basket context');
  assert.equal(x.ui.hasDrafts(),false);
  x.ui.setContext(x.w.GHE.parseContext(prUrl+'/files'),{review:{...review,revision:'b'.repeat(40)}});click(x,'[data-action="view:tools"]');assert.match(x.doc.querySelector('.review-mark-status').textContent,/Revision changed/);
  x.dom.window.close();const reopened=await setup(x.local,null);record=reopened.ui.getState().reviews[0];assert.equal(record.files[0].reviewedRevision,revision);assert.equal(record.lastFile,'src/first.js');assert.equal(reopened.ui.getState().snippets[0].note,'Unsaved basket context');reopened.dom.window.close();
});

test('important conversation evidence becomes a workspace source and survives reopen',async()=>{
 const x=await setup(),url='https://github.com/owner/repo/issues/12',comment={id:'issuecomment-123',url:url+'#issuecomment-123',author:'maintainer',body:'The root cause is a stale callback.',kind:'comment'};
 x.ui.setContext(x.w.GHE.parseContext(url,'Investigate callback'),{conversation:{comments:[comment],loadedOnly:true,truncated:false}});
 click(x,'[data-action="view:tools"]');click(x,'[data-conversation="save"]');await x.settle();
 assert.equal(x.ui.getState().items[0].url,comment.url);
 click(x,'[data-action="view:workspaces"]');change(x,'[aria-label="New workspace name"]','Callback investigation');click(x,'[data-ws="create"]');await x.settle();
 change(x,'[aria-label="Add a saved page"]',comment.url,'change');click(x,'[data-ws="add-page"]');await x.settle();
 click(x,'[data-ws="copy"]');await x.settle();assert.match(x.copies.at(-1),/#issuecomment-123/);assert.match(x.copies.at(-1),/stale callback/);
 const id=x.ui.getState().workspaces[0].id;x.dom.window.close();const y=await setup(x.local,null);assert.equal(y.ui.getState().workspaces.find(w=>w.id===id).itemUrls[0],comment.url);y.dom.window.close();
});

test('command search retrieves private workspace intent, code evidence and PR notes',async()=>{
 const x=await setup();await x.store.dispatch({type:'CREATE_WORKSPACE',title:'Callback investigation'});let next=await x.store.dispatch({type:'GET_STATE'});const id=next.workspaces[0].id;
 await x.store.dispatch({type:'UPDATE_WORKSPACE',id,patch:{note:'Investigate the midnight regression'}});
 await x.ui.refresh();x.ui.openPalette();change(x,'[aria-label="Search commands and saved pages"]','midnight');
 const option=x.doc.querySelector('.command-option');assert.ok(option);assert.match(option.textContent,/Callback investigation/);option.click();assert.equal(x.doc.querySelector('[aria-label="Choose workspace"]').value,id);
 click(x,'[data-action="view:basket"]');change(x,'[data-basket-field="note"]','Evidence of allocator mismatch');click(x,'[data-basket-action="save-excerpt"]');await x.settle();
 x.ui.openPalette();change(x,'[aria-label="Search commands and saved pages"]','allocator mismatch');assert.match(x.doc.querySelector('.command-option').textContent,/Code excerpt/);x.doc.querySelector('.command-option').click();assert.equal(x.doc.querySelector('#app').dataset.view,'basket');
 await x.store.dispatch({type:'UPDATE_REVIEW_FILE',prUrl:'https://github.com/owner/repo/pull/9',path:'src/pool.js',revision:null,patch:{note:'An allocation survives cancellation'}});await x.ui.refresh();x.ui.openPalette();change(x,'[aria-label="Search commands and saved pages"]','survives cancellation');assert.match(x.doc.querySelector('.command-option').textContent,/Private PR note/);assert.equal(x.doc.querySelector('.command-option').href,'https://github.com/owner/repo/pull/9/files');
 x.dom.window.close();
});

test('Write templates use real persistence, remain private, and are restored by backups',async()=>{
 const x=await setup();click(x,'[data-action="view:write"]');change(x,'[aria-label="Markdown draft"]','Please include a minimal reproduction.');change(x,'[aria-label="New template name"]','Reproduction request');click(x,'[data-composer-action="create-template"]');await x.settle();assert.equal(x.ui.getState().templates.length,1);
 click(x,'[data-composer-action="copy"]');await x.settle();assert.equal(x.copies.at(-1),'Please include a minimal reproduction.');assert.equal(x.actions.length,0,'drafting does not touch the host page');
 const backup=x.w.GHE.exportBackup(x.ui.getState());assert.equal(JSON.parse(backup).templates[0].title,'Reproduction request');
 x.dom.window.close();const y=await setup(x.local,null);assert.equal(y.ui.getState().templates[0].body,'Please include a minimal reproduction.');y.dom.window.close();
});

test('whole-workbench refresh preserves conversation search focus and selection',async()=>{
 const x=await setup(),url='https://github.com/owner/repo/issues/12';x.ui.setContext(x.w.GHE.parseContext(url),{conversation:{comments:[{id:'issuecomment-1',url:url+'#issuecomment-1',author:'alice',body:'hello world',kind:'comment'}],loadedOnly:true,truncated:false}});
 click(x,'[data-action="view:tools"]');const input=change(x,'[aria-label="Search loaded comments"]','hello');input.focus();input.setSelectionRange(1,4);await x.ui.refresh();const current=x.doc.activeElement;assert.equal(current.getAttribute('aria-label'),'Search loaded comments');assert.equal(current.selectionStart,1);assert.equal(current.selectionEnd,4);x.dom.window.close();
});
