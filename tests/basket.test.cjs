const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const source={url:'https://github.com/owner/repo/blob/main/src/app.js',path:'src/app.js',text:'const one = 1;\nconst two = 2;\nconst three = 3;',language:'javascript',lineCount:3,bytes:49,truncated:false,selection:{start:2,end:3}};
const saved={id:'snippet-1',url:source.url,title:'Investigate parser',path:source.path,language:'javascript',lineStart:2,lineEnd:3,code:'const two = 2;\nconst three = 3;',note:'Saved note',revision:null,createdAt:1,updatedAt:1};
function setup({items=[],page=source,fail=false,draftOptions={},beforeRequest}={}){
  const dom=new JSDOM('<main id="basket"></main>',{url:'https://extension.test',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window;w.TextEncoder=TextEncoder;
  for(const file of ['src/shared/model.js','src/shared/basket.js'])if(fs.existsSync(file))w.eval(fs.readFileSync(file,'utf8'));
  assert.equal(typeof w.GHE.mountBasket,'function','basket controller must exist');
  let state={snippets:structuredClone(items),workspaces:[]};let pageData=page?{code:page}:{};const messages=[],copies=[],notices=[];
  const ui=w.GHE.mountBasket(w.document.querySelector('#basket'),{
    ...draftOptions,
    getState:()=>state,getContext:()=>page?{url:page.url,type:'code'}:null,getPageData:()=>pageData,
    copy:async text=>copies.push(text),notify:(...args)=>notices.push(args),onState:next=>{state=next;ui.render();},
    request:async message=>{messages.push(structuredClone(message));if(beforeRequest)await beforeRequest(message);if(fail)throw new Error('Storage is full');
      if(message.type==='SAVE_SNIPPET')state.snippets.push({...message.snippet,id:'new-snippet',createdAt:1,updatedAt:1});
      if(message.type==='UPDATE_SNIPPET')Object.assign(state.snippets.find(item=>item.id===message.id),message.patch);
      if(message.type==='REMOVE_SNIPPET')state.snippets=state.snippets.filter(item=>item.id!==message.id);
      if(message.type==='RESTORE_SNIPPET')state.snippets.push(message.snippet);
      return structuredClone(state);
    }
  });ui.render();
  return{dom,w,doc:w.document,ui,messages,copies,notices,get state(){return state},setPage:next=>{pageData=next?{code:next}:{};}};
}
function input(x,selector,value){const el=x.doc.querySelector(selector);assert.ok(el,selector);el.value=value;el.dispatchEvent(new x.w.Event('input',{bubbles:true}));return el;}

test('Markdown keeps source code inside a longer fence and escapes title path and note HTML',()=>{
  const x=setup();const text=x.w.GHE.snippetMarkdown({...saved,title:'<img> [title]',path:'src/<script>.js',code:'```js\nalert(1)\n```\n`````',note:'<script>secret</script>\n# Heading'});
  assert.match(text,/^## &lt;img&gt; \\\[title\\\]/);
  assert.ok(text.includes('``````javascript\n```js\nalert(1)\n```\n`````\n``````'));
  assert.ok(text.includes('src/&lt;script&gt;\\.js'));
  assert.ok(text.includes('> &lt;script&gt;secret&lt;/script&gt;'));
  assert.match(text,/blob\/main\/src\/app\.js#L2-L3/);
  assert.match(text,/branch or tag/i);x.dom.window.close();
});

test('Markdown distinguishes a commit permalink from a mutable source and rejects unsafe URLs',()=>{
  const x=setup();const revision='a'.repeat(40);const permalink={...saved,url:`https://github.com/owner/repo/blob/${revision}/src/app.js`,revision};
  assert.match(x.w.GHE.snippetMarkdown(permalink),/Commit permalink/);
  assert.match(x.w.GHE.snippetMarkdown({...saved,revision}),/branch or tag/i);
  assert.throws(()=>x.w.GHE.snippetMarkdown({...saved,url:'javascript:alert(1)'}),/GitHub|source/i);
  const bundle=x.w.GHE.basketMarkdown([saved,permalink],'<Workspace>');
  assert.ok(bundle.startsWith('# &lt;Workspace&gt;\n'));assert.equal((bundle.match(/^## /gm)||[]).length,2);x.dom.window.close();
});

test('composer saves precisely the chosen rendered lines and can copy an excerpt before saving',async()=>{
  const x=setup();assert.equal(x.doc.querySelector('[data-basket-field="start"]').value,'2');
  assert.equal(x.doc.querySelector('[data-basket-preview]').textContent,'const two = 2;\nconst three = 3;');
  input(x,'[data-basket-field="title"]','Two lines');input(x,'[data-basket-field="note"]','Check allocation');
  x.doc.querySelector('[data-basket-action="copy-excerpt"]').click();await tick();assert.match(x.copies[0],/Check allocation/);
  x.doc.querySelector('[data-basket-action="save-excerpt"]').click();await tick();
  const message=x.messages.find(m=>m.type==='SAVE_SNIPPET');assert.equal(message.snippet.code,'const two = 2;\nconst three = 3;');assert.equal(message.snippet.lineStart,2);assert.equal(message.snippet.lineEnd,3);assert.equal(message.snippet.note,'Check allocation');assert.equal(message.snippet.revision,null);
  assert.equal(x.doc.querySelectorAll('[data-basket-snippet]').length,1);x.dom.window.close();
});

test('invalid or oversized ranges cannot silently save a truncated excerpt',()=>{
  const x=setup({page:{...source,text:'x'.repeat(20001),lineCount:1,selection:{start:1,end:1}}});
  assert.equal(x.doc.querySelector('[data-basket-action="save-excerpt"]').disabled,true);
  assert.match(x.doc.querySelector('[data-basket-range-status]').textContent,/20,000|20000/);
  x.setPage(source);x.ui.render();input(x,'[data-basket-field="start"]','0');
  assert.equal(x.doc.querySelector('[data-basket-action="save-excerpt"]').disabled,true);assert.equal(x.messages.length,0);x.dom.window.close();
});

test('a source truncated midway through a line never saves that partial line as a complete excerpt',async()=>{
  const x=setup({page:{...source,text:'complete line\npart of next line',truncated:true,lineCount:2,selection:{start:1,end:2}}});
  assert.equal(x.doc.querySelector('[data-basket-action="save-excerpt"]').disabled,true);
  assert.equal(x.doc.querySelector('[data-basket-field="end"]').value,'2');
  assert.match(x.doc.querySelector('[data-basket-range-status]').textContent,/loaded|available/i);
  input(x,'[data-basket-field="end"]','1');
  x.doc.querySelector('[data-basket-action="save-excerpt"]').click();await tick();
  assert.equal(x.messages[0].snippet.code,'complete line');assert.equal(x.messages[0].snippet.lineEnd,1);x.dom.window.close();
});

test('editing notes survives root refresh and failed writes without announcing success',async()=>{
  const x=setup({items:[saved],fail:true});x.doc.querySelector('[data-basket-action="edit-snippet"]').click();
  input(x,'[data-basket-edit="note"]','Unsaved investigation');x.ui.render();
  assert.equal(x.doc.querySelector('[data-basket-edit="note"]').value,'Unsaved investigation');
  x.doc.querySelector('[data-basket-action="save-snippet"]').click();await tick();
  assert.equal(x.doc.querySelector('[data-basket-edit="note"]').value,'Unsaved investigation');assert.equal(x.state.snippets[0].note,'Saved note');
  assert.ok(x.notices.some(([message,error])=>error&&/Storage is full/.test(message)));x.dom.window.close();
});

test('saved note updates use the snippet ID and remove offers a working undo',async()=>{
  const x=setup({items:[saved]});x.doc.querySelector('[data-basket-action="edit-snippet"]').click();
  input(x,'[data-basket-edit="note"]','Updated');x.doc.querySelector('[data-basket-action="save-snippet"]').click();await tick();
  assert.equal(x.messages[0].type,'UPDATE_SNIPPET');assert.equal(x.messages[0].id,'snippet-1');assert.equal(x.state.snippets[0].note,'Updated');
  x.doc.querySelector('[data-basket-action="remove-snippet"]').click();await tick();assert.equal(x.state.snippets.length,0);
  x.doc.querySelector('[data-basket-action="undo-remove"]').click();await tick();assert.equal(x.state.snippets[0].note,'Updated');x.dom.window.close();
});

test('basket export uses committed snippets and starts a Markdown download',async()=>{
  const x=setup({items:[saved],page:null});let blob,download;
  x.w.URL.createObjectURL=value=>{blob=value;return'blob:export'};x.w.URL.revokeObjectURL=()=>{};
  x.doc.addEventListener('click',event=>{if(event.target.matches('a[download]')){download=event.target.download;event.preventDefault();}});
  x.doc.querySelector('[data-basket-action="copy-basket"]').click();await tick();assert.match(x.copies[0],/Investigate parser/);
  x.doc.querySelector('[data-basket-action="download-basket"]').click();await tick();
  assert.ok(blob);assert.match(download,/\.md$/);const text=await new Promise(resolve=>{const reader=new x.w.FileReader();reader.onload=()=>resolve(reader.result);reader.readAsText(blob)});assert.match(text,/Saved note/);
  assert.match(x.doc.querySelector('[data-basket-composer]').textContent,/Open a code file/i);x.dom.window.close();
});

test('draft tracking ignores untouched editors and clears only edits actually saved',async()=>{
  const x=setup({items:[saved]});assert.equal(typeof x.ui.hasDrafts,'function');assert.equal(x.ui.hasDrafts(),false);
  x.doc.querySelector('[data-basket-action="edit-snippet"]').click();assert.equal(x.ui.hasDrafts(),false);
  input(x,'[data-basket-edit="note"]','Changed note');assert.equal(x.ui.hasDrafts(),true);
  x.doc.querySelector('[data-basket-action="save-snippet"]').click();await tick();assert.equal(x.ui.hasDrafts(),false);
  input(x,'[data-basket-field="note"]','Composer draft');assert.equal(x.ui.hasDrafts(),true);
  x.doc.querySelector('[data-basket-action="save-excerpt"]').click();await tick();assert.equal(x.ui.hasDrafts(),false);
  input(x,'[data-basket-field="title"]','A new label');assert.equal(x.ui.hasDrafts(),true);
  x.ui.render();assert.equal(x.ui.hasDrafts(),true);x.dom.window.close();
});

function draftStorage(initial=[]){
  const values=new Map(initial);const writes=[];
  return{values,writes,options:{
    loadToolDrafts:async kind=>{assert.equal(kind,'basket');return structuredClone([...values]);},
    saveToolDraft:async(kind,key,value)=>{assert.equal(kind,'basket');const snapshot=structuredClone(value);writes.push(snapshot);values.set(key,snapshot);},
    deleteToolDraft:async(kind,key,expected)=>{assert.equal(kind,'basket');if(JSON.stringify(values.get(key))===JSON.stringify(expected))values.delete(key);}
  }};
}

test('session recovery restores composer fields and saved snippet edits without storing source code',async()=>{
  const drafts=draftStorage();const x=setup({items:[saved],draftOptions:drafts.options});await x.ui.ready;
  input(x,'[data-basket-field="start"]','1');input(x,'[data-basket-field="title"]','Recovered title');input(x,'[data-basket-field="note"]','Composer thought');
  x.doc.querySelector('[data-basket-action="edit-snippet"]').click();input(x,'[data-basket-edit="note"]','Unsaved saved-excerpt note');await tick();
  assert.equal(drafts.values.size,2);assert.ok(drafts.writes.every(value=>!('code' in value)&&!('text' in value)&&!('path' in value)));
  x.dom.window.close();const reopened=setup({items:[saved],draftOptions:drafts.options});await reopened.ui.ready;
  assert.equal(reopened.doc.querySelector('[data-basket-field="start"]').value,'1');assert.equal(reopened.doc.querySelector('[data-basket-field="note"]').value,'Composer thought');
  assert.equal(reopened.doc.querySelector('[data-basket-edit="note"]').value,'Unsaved saved-excerpt note');assert.equal(reopened.ui.hasDrafts(),true);
  reopened.doc.querySelector('[data-basket-action="cancel-edit"]').click();await tick();assert.equal(drafts.values.has('snippet:'+saved.id),false);
  reopened.doc.querySelector('[data-basket-action="save-excerpt"]').click();await tick();assert.equal(drafts.values.has('composer:'+source.url),false);reopened.dom.window.close();
});

test('late recovery cannot overwrite a key edited or canceled during loading',async()=>{
  let resolve;const load=new Promise(done=>resolve=done);const drafts=draftStorage();
  const x=setup({items:[saved],draftOptions:{...drafts.options,loadToolDrafts:()=>load}});
  input(x,'[data-basket-field="note"]','New local thought');x.doc.querySelector('[data-basket-action="edit-snippet"]').click();input(x,'[data-basket-edit="note"]','Then cancel');
  x.doc.querySelector('[data-basket-action="cancel-edit"]').click();
  resolve([['composer:'+source.url,{start:'2',end:'3',title:'Old',note:'Old composer'}],['snippet:'+saved.id,{title:saved.title,note:'Old snippet'}]]);await x.ui.ready;
  assert.equal(x.doc.querySelector('[data-basket-field="note"]').value,'New local thought');assert.equal(x.doc.querySelector('[data-basket-edit="note"]'),null);x.dom.window.close();
});

test('saving an older editor cannot clear a newer session draft from another surface',async()=>{
  const key='snippet:'+saved.id;const drafts=draftStorage();let release;const pending=new Promise(resolve=>release=resolve);
  const x=setup({items:[saved],draftOptions:drafts.options,beforeRequest:message=>message.type==='UPDATE_SNIPPET'?pending:undefined});await x.ui.ready;
  x.doc.querySelector('[data-basket-action="edit-snippet"]').click();input(x,'[data-basket-edit="note"]','Submitted A');await tick();
  x.doc.querySelector('[data-basket-action="save-snippet"]').click();await tick();
  drafts.values.set(key,{title:saved.title,note:'Newer B'});release();await tick();
  assert.equal(x.state.snippets[0].note,'Submitted A');assert.equal(drafts.values.get(key).note,'Newer B');x.dom.window.close();
  const reopened=setup({items:[{...saved,note:'Submitted A'}],draftOptions:drafts.options});await reopened.ui.ready;
  assert.equal(reopened.doc.querySelector('[data-basket-edit="note"]').value,'Newer B');reopened.dom.window.close();
});

test('draft recovery failures are visible while the basket remains usable',async()=>{
  const x=setup({draftOptions:{loadToolDrafts:async()=>{throw new Error('session unavailable')},saveToolDraft:async()=>{throw new Error('session full')}}});await x.ui.ready;
  assert.ok(x.notices.some(([message,error])=>error&&/recover|recovery/i.test(message)));
  input(x,'[data-basket-field="note"]','Keep local');await tick();assert.equal(x.ui.hasDrafts(),true);assert.ok(x.notices.some(([message,error])=>error&&/Save.*before closing/i.test(message)));
  assert.equal(x.doc.querySelector('[data-basket-action="save-excerpt"]').disabled,false);x.dom.window.close();
});

test('an unavailable GitHub selection is never silently replaced and manual valid edits can recover',async()=>{
 const x=setup({page:{...source,selection:{start:90,end:91},selectionError:'Selected lines are not fully available in the loaded snapshot. Choose lines 1 to 3.'}});assert.equal(x.doc.querySelector('[data-basket-field="start"]').value,'90');assert.equal(x.doc.querySelector('[data-basket-field="end"]').value,'91');assert.equal(x.doc.querySelector('[data-basket-action="save-excerpt"]').disabled,true);assert.match(x.doc.querySelector('[data-basket-range-status]').textContent,/loaded snapshot/);input(x,'[data-basket-field="start"]','1');input(x,'[data-basket-field="end"]','2');assert.equal(x.doc.querySelector('[data-basket-action="save-excerpt"]').disabled,false);x.doc.querySelector('[data-basket-action="copy-excerpt"]').click();await tick();assert.match(x.copies[0],/#L1-L2/);x.doc.querySelector('[data-basket-action="use-selection"]').click();assert.equal(x.doc.querySelector('[data-basket-field="end"]').value,'91');assert.equal(x.doc.querySelector('[data-basket-action="save-excerpt"]').disabled,true);assert.equal(x.messages.length,0);x.dom.window.close();
});
test('reveal locates a saved excerpt even when current search excludes it',()=>{
 const x=setup({items:[saved]});input(x,'[aria-label="Search code basket"]','no match');assert.equal(x.ui.reveal(saved.id),true);const card=x.doc.querySelector('[data-basket-snippet]');assert.equal(card.dataset.basketSnippet,saved.id);assert.equal(x.doc.activeElement,card);assert.equal(x.ui.reveal('missing'),false);x.dom.window.close();
});

test('basket export warns about unsaved annotations and copies only committed notes',async()=>{
 const x=setup({items:[saved]});await x.ui.ready;x.doc.querySelector('[data-basket-action="edit-snippet"]').click();input(x,'[data-basket-edit="note"]','Still drafting');const cue=x.doc.querySelector('[data-basket-export-notice]');assert.equal(cue.hidden,false);assert.match(cue.textContent,/Export uses saved notes/);x.doc.querySelector('[data-basket-action="copy-basket"]').click();await tick();assert.match(x.copies[0],/Saved note/);assert.doesNotMatch(x.copies[0],/Still drafting/);assert.equal(x.messages.length,0);x.doc.querySelector('[data-basket-action="cancel-edit"]').click();assert.equal(x.doc.querySelector('[data-basket-export-notice]').hidden,true);x.dom.window.close();
});
