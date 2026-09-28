const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const template={id:'template-1',title:'Release check',body:'## Check\n\n- [ ] Verify the release',createdAt:1,updatedAt:1};
const issue='https://github.com/owner/repo/issues/12';
function setup({templates=[],draftOptions={},beforeRequest,context=issue}={}){
  const dom=new JSDOM('<main id="composer"></main>',{url:'https://extension.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;w.TextEncoder=TextEncoder;
  for(const file of ['src/shared/model.js','src/shared/composer.js'])if(fs.existsSync(file))w.eval(fs.readFileSync(file,'utf8'));
  assert.equal(typeof w.GHE.mountComposer,'function','composer controller must exist');
  let state={templates:structuredClone(templates)},current=context?w.GHE.parseContext(context,'Example thread'):null;const messages=[],copies=[],notices=[];
  const ui=w.GHE.mountComposer(w.document.querySelector('#composer'),{
    ...draftOptions,getState:()=>state,getContext:()=>current,onState:next=>{state=next;ui.render()},notify:(...args)=>notices.push(args),copy:async text=>copies.push(text),
    request:async message=>{messages.push(structuredClone(message));await beforeRequest?.(message);
      if(message.type==='CREATE_TEMPLATE')state.templates.push({id:'created-template',title:message.title,body:message.body,createdAt:2,updatedAt:2});
      if(message.type==='UPDATE_TEMPLATE')Object.assign(state.templates.find(item=>item.id===message.id),message.patch);
      if(message.type==='REMOVE_TEMPLATE')state.templates=state.templates.filter(item=>item.id!==message.id);
      if(message.type==='RESTORE_TEMPLATE')state.templates.push(message.template);
      return structuredClone(state);
    }
  });
  return{dom,w,doc:w.document,ui,messages,copies,notices,get state(){return state},context(url){current=url?w.GHE.parseContext(url,'Next thread'):null;ui.render();}};
}
function change(x,label,value,event='input'){const input=x.doc.querySelector(`[aria-label="${label}"]`);assert.ok(input,label);input.value=value;input.dispatchEvent(new x.w.Event(event,{bubbles:true}));return input;}
function click(x,action){const button=x.doc.querySelector(`[data-composer-action="${action}"]`);assert.ok(button,action);button.click();}
function recovery(initial=[]){const values=new Map(initial);return{values,options:{loadToolDrafts:async kind=>{assert.equal(kind,'composer');return structuredClone([...values])},saveToolDraft:async(kind,key,value)=>{assert.equal(kind,'composer');values.set(key,structuredClone(value));},deleteToolDraft:async(kind,key,value)=>{assert.equal(kind,'composer');if(JSON.stringify(values.get(key))===JSON.stringify(value))values.delete(key);}}};}

test('drafts use canonical thread keys and remain independent across navigation',async()=>{
  const x=setup({context:'https://github.com/Owner/Repo/pull/7/files#diff-1'});await x.ui.ready;assert.equal(x.ui.hasDrafts(),false);
  change(x,'Markdown draft','PR feedback');x.context('https://github.com/owner/repo/pull/7/commits#comment');assert.equal(x.doc.querySelector('[aria-label="Markdown draft"]').value,'PR feedback');
  assert.equal(x.doc.querySelector('[data-composer-context-link]').href,'https://github.com/owner/repo/pull/7');
  x.context(issue+'#issuecomment-2');assert.equal(x.doc.querySelector('[aria-label="Markdown draft"]').value,'');change(x,'Markdown draft','Issue investigation');
  x.context('https://github.com/owner/repo');change(x,'Markdown draft','General thought');x.context(null);assert.equal(x.doc.querySelector('[aria-label="Markdown draft"]').value,'General thought');
  x.context(issue);assert.equal(x.doc.querySelector('[aria-label="Markdown draft"]').value,'Issue investigation');assert.equal(x.ui.hasDrafts(),true);x.dom.window.close();
});

test('choosing a template does not touch text until the explicit replacement action',async()=>{
  const x=setup({templates:[template]});await x.ui.ready;change(x,'Markdown draft','My existing draft');
  change(x,'Choose a template','saved:template-1','change');assert.equal(x.doc.querySelector('[aria-label="Markdown draft"]').value,'My existing draft');
  assert.match(x.doc.querySelector('[data-composer-action="use-template"]').textContent,/Replace draft with template/);
  click(x,'use-template');assert.equal(x.doc.querySelector('[aria-label="Markdown draft"]').value,template.body);assert.equal(x.doc.activeElement.getAttribute('aria-label'),'Markdown draft');
  assert.equal(x.messages.length,0);x.dom.window.close();
});

test('copy keeps a private draft and page/template strings never become HTML',async()=>{
  const payload='<img src=x onerror=alert(1)>\n\n**My Markdown**';const x=setup({templates:[{...template,title:'<script>bad</script>',body:payload}]});await x.ui.ready;
  change(x,'Choose a template','saved:template-1','change');click(x,'use-template');click(x,'copy');await tick();
  assert.equal(x.copies[0],payload);assert.equal(x.doc.querySelector('img,script'),null);assert.equal(x.doc.querySelector('[data-composer-preview]').textContent,payload);
  assert.equal(x.ui.hasDrafts(),true);assert.equal(x.messages.length,0);x.dom.window.close();
});

test('templates can be created, edited, removed and restored through the persistence API',async()=>{
  const x=setup();await x.ui.ready;change(x,'Markdown draft','Reusable response');change(x,'New template name','Follow-up');click(x,'create-template');await tick();
  assert.equal(x.messages[0].type,'CREATE_TEMPLATE');assert.equal(x.state.templates[0].body,'Reusable response');
  change(x,'Choose a template','saved:created-template','change');click(x,'edit-template');change(x,'Template name','Updated follow-up');change(x,'Template body','Updated reusable text');x.ui.render();
  assert.equal(x.doc.querySelector('[aria-label="Template body"]').value,'Updated reusable text');click(x,'save-template');await tick();assert.equal(x.state.templates[0].title,'Updated follow-up');
  assert.equal(x.doc.querySelector('[aria-label="Markdown draft"]').value,'Reusable response','editing the template must not replace the current draft');
  click(x,'remove-template');await tick();assert.equal(x.state.templates.length,0);click(x,'undo-template');await tick();assert.equal(x.state.templates[0].body,'Updated reusable text');x.dom.window.close();
});

test('drafts recover after remount and discard clears only the matching context snapshot',async()=>{
  const drafts=recovery();const x=setup({draftOptions:drafts.options});await x.ui.ready;change(x,'Markdown draft','Remember this');await tick();
  assert.deepEqual(drafts.values.get(issue),{body:'Remember this'});x.dom.window.close();
  const y=setup({draftOptions:drafts.options});await y.ui.ready;assert.equal(y.doc.querySelector('[aria-label="Markdown draft"]').value,'Remember this');
  drafts.values.set(issue,{body:'Newer other window'});click(y,'discard');await tick();assert.equal(y.doc.querySelector('[aria-label="Markdown draft"]').value,'');assert.equal(drafts.values.get(issue).body,'Newer other window');
  assert.equal(y.ui.hasDrafts(),false);y.dom.window.close();
});

test('late recovery does not overwrite fresh edits or restore a discarded draft',async()=>{
  let resolve;const load=new Promise(done=>resolve=done);const drafts=recovery();const x=setup({draftOptions:{...drafts.options,loadToolDrafts:()=>load}});
  change(x,'Markdown draft','Typed before recovery');x.context('https://github.com/owner/repo/pull/7');change(x,'Markdown draft','Discard me');click(x,'discard');
  resolve([[issue,{body:'Old issue'}],['https://github.com/owner/repo/pull/7',{body:'Old PR'}]]);await x.ui.ready;
  assert.equal(x.doc.querySelector('[aria-label="Markdown draft"]').value,'');x.context(issue);assert.equal(x.doc.querySelector('[aria-label="Markdown draft"]').value,'Typed before recovery');x.dom.window.close();
});

test('failed template saves preserve editing and draft recovery failures remain visible',async()=>{
  const x=setup({templates:[template],beforeRequest:async()=>{throw new Error('Storage is full')},draftOptions:{loadToolDrafts:async()=>{throw new Error('Session unavailable')},saveToolDraft:async()=>{throw new Error('Session unavailable')}}});await x.ui.ready;
  change(x,'Choose a template','saved:template-1','change');click(x,'edit-template');change(x,'Template body','Keep this unsaved edit');click(x,'save-template');await tick();
  assert.equal(x.doc.querySelector('[aria-label="Template body"]').value,'Keep this unsaved edit');assert.equal(x.state.templates[0].body,template.body);
  change(x,'Markdown draft','Keep local too');await tick();assert.ok(x.notices.some(([text,error])=>error&&/Storage is full/.test(text)));assert.ok(x.notices.some(([text,error])=>error&&/recovery/i.test(text)));
  const area=x.doc.querySelector('[aria-label="Markdown draft"]');area.focus();area.setSelectionRange(2,7);x.ui.render();assert.equal(x.doc.activeElement.getAttribute('aria-label'),'Markdown draft');assert.equal(x.doc.activeElement.selectionStart,2);assert.equal(x.doc.activeElement.selectionEnd,7);x.dom.window.close();
});

test('template title/body edits and creation name recover after closing the surface',async()=>{
 const drafts=recovery(),x=setup({templates:[template],draftOptions:drafts.options});await x.ui.ready;
 change(x,'Choose a template','saved:template-1','change');click(x,'edit-template');change(x,'Template name','Improved release check');change(x,'Template body','Keep this revised template');change(x,'New template name','Next template');await tick();x.dom.window.close();
 const y=setup({templates:[template],draftOptions:drafts.options});await y.ui.ready;assert.equal(y.doc.querySelector('[aria-label="New template name"]').value,'Next template');change(y,'Choose a template','saved:template-1','change');
 assert.equal(y.doc.querySelector('[aria-label="Template name"]').value,'Improved release check');assert.equal(y.doc.querySelector('[aria-label="Template body"]').value,'Keep this revised template');assert.equal(y.ui.hasDrafts(),true);
 click(y,'save-template');await tick();assert.equal(y.state.templates[0].body,'Keep this revised template');assert.equal(drafts.values.has('templateedit:template-1'),false);assert.deepEqual(drafts.values.get('newtemplate'),{title:'Next template'});
 change(y,'Markdown draft','New template body');click(y,'create-template');await tick();assert.equal(drafts.values.has('newtemplate'),false);y.dom.window.close();
});
test('late template recovery cannot overwrite current edits or canceled edits',async()=>{
 let release;const pending=new Promise(resolve=>release=resolve),drafts=recovery(),x=setup({templates:[template],draftOptions:{...drafts.options,loadToolDrafts:()=>pending}});
 change(x,'Choose a template','saved:template-1','change');click(x,'edit-template');change(x,'Template body','Current body');click(x,'cancel-template');change(x,'New template name','Current name');
 release([['templateedit:template-1',{title:'Old recovered title',body:'Old recovered body'}],['newtemplate',{title:'Old creation name'}]]);await x.ui.ready;click(x,'edit-template');
 assert.equal(x.doc.querySelector('[aria-label="Template body"]').value,template.body);assert.equal(x.doc.querySelector('[aria-label="New template name"]').value,'Current name');x.dom.window.close();
});
test('template commit and cancel do not clear a newer edit from another surface',async()=>{
 let release;const pending=new Promise(resolve=>release=resolve),drafts=recovery(),x=setup({templates:[template],draftOptions:drafts.options,beforeRequest:()=>pending});await x.ui.ready;
 change(x,'Choose a template','saved:template-1','change');click(x,'edit-template');change(x,'Template body','Submitted text');click(x,'save-template');change(x,'Template body','Newer local edit');await tick();drafts.values.set('templateedit:template-1',{title:template.title,body:'Other surface edit'});release();await tick();
 assert.equal(x.state.templates[0].body,'Submitted text');assert.equal(x.doc.querySelector('[aria-label="Template body"]').value,'Newer local edit');assert.equal(drafts.values.get('templateedit:template-1').body,'Other surface edit');click(x,'cancel-template');await tick();assert.equal(drafts.values.get('templateedit:template-1').body,'Other surface edit');x.dom.window.close();
});
test('failed template commit retains recovery and ignores damaged template metadata',async()=>{
 const drafts=recovery([['newtemplate',{title:8}],['templateedit:template-1',{title:'Bad',body:99}],['templateedit:unknown',{title:'No record',body:'Orphan'}]]),x=setup({templates:[template],draftOptions:drafts.options,beforeRequest:()=>{throw Error('Storage full')}});await x.ui.ready;
 assert.equal(x.doc.querySelector('[aria-label="New template name"]').value,'');change(x,'Choose a template','saved:template-1','change');click(x,'edit-template');assert.equal(x.doc.querySelector('[aria-label="Template body"]').value,template.body);change(x,'Template body','Retain until saved');click(x,'save-template');await tick();assert.equal(drafts.values.get('templateedit:template-1').body,'Retain until saved');assert.equal(x.doc.querySelector('[aria-label="Template body"]').value,'Retain until saved');x.dom.window.close();
});
test('template recovery waits safely for the shared state to arrive later',async()=>{
 const drafts=recovery([['templateedit:template-1',{title:'Recovered name',body:'Recovered body'}]]),x=setup({draftOptions:drafts.options});await x.ui.ready;
 x.state.templates.push(structuredClone(template));x.ui.render();change(x,'Choose a template','saved:template-1','change');assert.equal(x.doc.querySelector('[aria-label="Template body"]').value,'Recovered body');assert.equal(x.doc.querySelector('[aria-label="Template name"]').value,'Recovered name');x.dom.window.close();
});
