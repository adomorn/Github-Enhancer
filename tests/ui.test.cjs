const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const fs = require('node:fs');
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
function setup({ fail = false, draftStore = {} } = {}) {
  const dom = new JSDOM('<main id="app"></main>', { url: 'https://extension.test', runScripts: 'outside-only', pretendToBeVisual: true });
  const win = dom.window;
  const state = { settings: { enabled: true, shortcut: true, exactDates: true, wide: false, focus: false, theme: 'auto' }, items: [] };
  const api = async message => {
    if (fail && message.type !== 'GET_STATE') throw new Error('Storage is full');
    if (message.type === 'SAVE_ITEM') state.items = [{ ...message.context, note: message.note || '', createdAt: 1, updatedAt: 1 }];
    if (message.type === 'UPDATE_ITEM') state.items[0].note = message.note;
    if (message.type === 'REMOVE_ITEM') state.items = [];
    return structuredClone(state);
  };
  win.GHE = { filterItems: (items,q) => items.filter(i=>`${i.title} ${i.note}`.toLowerCase().includes(q.toLowerCase())), markdownLink: c => `[${c.title}](${c.url})`, DEFAULT_SETTINGS:state.settings };
  const file = 'src/shared/ui.js';
  if (fs.existsSync(file)) win.eval(fs.readFileSync(file,'utf8'));
  assert.equal(typeof win.GHE.mountWorkbench, 'function', 'workbench must be implemented');
  const context = { url:'https://github.com/octocat/Hello-World',repo:'octocat/Hello-World',owner:'octocat',name:'Hello-World',type:'repository',title:'Hello-World' };
  const ui = win.GHE.mountWorkbench(win.document.querySelector('#app'), { request:api, context, copy: async()=>{}, openOptions:()=>{}, close:()=>{}, loadDrafts:async()=>Object.entries(draftStore), saveDraft:async(url,note)=>{draftStore[url]=note;}, deleteDraft:async(url)=>{delete draftStore[url];} });
  return { dom,win,state,ui,context, doc:win.document };
}
test('saving a page exposes one searchable saved item and safe title text', async()=>{
  const x=setup(); await x.ui.ready;
  x.doc.querySelector('[data-action="save"]').click(); await flush();
  assert.equal(x.doc.querySelectorAll('[data-saved-item]').length,1);
  x.ui.setContext({...x.context,title:'<img src=x onerror=alert(1)>'});
  assert.equal(x.doc.querySelectorAll('img').length,0);
  assert.match(x.doc.querySelector('[data-context-title]').textContent,/<img/);
  const search=x.doc.querySelector('[aria-label="Search saved pages"]');search.value='missing';search.dispatchEvent(new x.win.Event('input'));
  assert.equal(x.doc.querySelectorAll('[data-saved-item]').length,0);
  assert.match(x.doc.body.textContent,/No matching pages/);x.dom.window.close();
});
test('repository headings shorten native descriptions without changing saved titles or search', async()=>{
  const x=setup();await x.ui.ready;
  const full='OctoCat/Hello-World: A useful repository description';
  x.ui.setContext({...x.context,repo:'octocat/hello-world',title:full});
  const heading=x.doc.querySelector('[data-context-title]');
  assert.equal(heading.textContent,'OctoCat/Hello-World');
  assert.equal(heading.title,full);
  x.doc.querySelector('[data-action="save"]').click();await flush();
  assert.equal(x.state.items[0].title,full);
  const saved=x.doc.querySelector('.saved-title');
  assert.equal(saved.textContent,'OctoCat/Hello-World');
  assert.equal(saved.title,full);
  const search=x.doc.querySelector('[aria-label="Search saved pages"]');
  search.value='useful repository description';search.dispatchEvent(new x.win.Event('input'));
  assert.equal(x.doc.querySelectorAll('[data-saved-item]').length,1);
  x.dom.window.close();
});
test('unrelated repository titles and issue titles remain complete',async()=>{
  const x=setup();await x.ui.ready;
  for(const context of [
    {...x.context,title:'Release notes: a custom title'},
    {...x.context,title:'octocat/Hello-World: investigate a bug',type:'issue'},
    {...x.context,title:'other/Hello-World: a different repository'},
  ]){x.ui.setContext(context);assert.equal(x.doc.querySelector('[data-context-title]').textContent,context.title);}
  x.dom.window.close();
});
test('note drafts survive context changes and save only to the original page',async()=>{
  const x=setup();await x.ui.ready;
  x.doc.querySelector('[data-action="note"]').click();
  const note=x.doc.querySelector('[aria-label="Private note"]');note.value='Investigate edge cases';note.dispatchEvent(new x.win.Event('input'));
  x.ui.setContext({...x.context,url:'https://github.com/octocat/Other',repo:'octocat/Other',title:'Other'});
  x.ui.setContext(x.context);
  assert.equal(x.doc.querySelector('[aria-label="Private note"]').value,'Investigate edge cases');
  x.doc.querySelector('[data-action="save-note"]').click();await flush();
  assert.equal(x.state.items[0].url,x.context.url);assert.equal(x.state.items[0].note,'Investigate edge cases');x.dom.window.close();
});
test('failed persistence keeps the draft and never announces success',async()=>{
  const x=setup({fail:true});await x.ui.ready;x.doc.querySelector('[data-action="note"]').click();
  const note=x.doc.querySelector('[aria-label="Private note"]');note.value='Keep this';note.dispatchEvent(new x.win.Event('input'));
  x.doc.querySelector('[data-action="save-note"]').click();await flush();
  assert.equal(x.doc.querySelector('[aria-label="Private note"]').value,'Keep this');
  assert.match(x.doc.querySelector('[role="status"]').textContent,/Storage is full/);
  assert.equal(x.doc.querySelectorAll('[data-saved-item]').length,0);x.dom.window.close();
});
test('opening and escaping command search restores keyboard focus',async()=>{
  const x=setup();await x.ui.ready;const launch=x.doc.querySelector('[data-action="commands"]');launch.focus();launch.click();
  assert.equal(x.doc.activeElement.getAttribute('aria-label'),'Search commands and saved pages');
  x.doc.activeElement.dispatchEvent(new x.win.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  assert.equal(x.doc.activeElement,launch);x.dom.window.close();
});

test('Escape in command search is marked handled before reaching the frame close handler',async()=>{
 const x=setup();await x.ui.ready;x.ui.openPalette();const event=new x.win.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true});x.doc.activeElement.dispatchEvent(event);assert.equal(event.defaultPrevented,true);x.dom.window.close();
});

test('the command shortcut works inside a focused note and restores it without duplicating the palette',async()=>{
 const x=setup();await x.ui.ready;x.doc.querySelector('[data-action="note"]').click();
 const note=x.doc.querySelector('textarea');note.value='Keep this draft';note.dispatchEvent(new x.win.Event('input'));note.focus();
 let propagated=0;x.win.addEventListener('keydown',()=>propagated++);
 const shortcut=()=>new x.win.KeyboardEvent('keydown',{key:'K',code:'KeyK',altKey:true,shiftKey:true,bubbles:true,cancelable:true});
 const event=shortcut();note.dispatchEvent(event);
 assert.equal(x.doc.activeElement.getAttribute('aria-label'),'Search commands and saved pages');
 assert.equal(event.defaultPrevented,true);assert.equal(propagated,0);
 x.doc.activeElement.value='clone';x.doc.activeElement.dispatchEvent(new x.win.Event('input'));
 x.doc.activeElement.dispatchEvent(shortcut());
 assert.equal(x.doc.querySelectorAll('.command-overlay').length,1);assert.equal(x.doc.activeElement.value,'clone');
 x.doc.activeElement.dispatchEvent(new x.win.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
 assert.equal(x.doc.activeElement,note);assert.equal(note.value,'Keep this draft');x.dom.window.close();
});

test('the command shortcut honors refreshed enablement settings',async()=>{
 const x=setup();await x.ui.ready;const launch=x.doc.querySelector('[data-action="commands"]');
 for(const settings of [{enabled:true,shortcut:false},{enabled:false,shortcut:true}]){
   Object.assign(x.state.settings,settings);await x.ui.refresh();launch.focus();
   const event=new x.win.KeyboardEvent('keydown',{code:'KeyK',altKey:true,shiftKey:true,bubbles:true,cancelable:true});launch.dispatchEvent(event);
   assert.equal(x.doc.querySelector('.command-overlay'),null);assert.equal(event.defaultPrevented,false);
 }
 Object.assign(x.state.settings,{enabled:true,shortcut:true});await x.ui.refresh();
 launch.dispatchEvent(new x.win.KeyboardEvent('keydown',{code:'KeyK',altKey:true,shiftKey:true,bubbles:true,cancelable:true}));
 assert.ok(x.doc.querySelector('.command-overlay'));x.dom.window.close();
});

test('ordinary typing and other modifier combinations remain unhandled',async()=>{
 const x=setup();await x.ui.ready;x.doc.querySelector('[data-action="note"]').click();const note=x.doc.querySelector('textarea');
 for(const init of [{key:'k',code:'KeyK'},{code:'KeyK',altKey:true},{code:'KeyK',shiftKey:true},{code:'KeyK',altKey:true,shiftKey:true,ctrlKey:true},{code:'KeyK',altKey:true,shiftKey:true,metaKey:true},{code:'KeyJ',altKey:true,shiftKey:true}]){
   const event=new x.win.KeyboardEvent('keydown',{...init,bubbles:true,cancelable:true});note.dispatchEvent(event);
   assert.equal(event.defaultPrevented,false);assert.equal(x.doc.querySelector('.command-overlay'),null);
 }
 x.dom.window.close();
});

test('an unsaved note is recovered after the extension UI is closed and reopened',async()=>{
 const draftStore={};const x=setup({draftStore});await x.ui.ready;x.doc.querySelector('[data-action="note"]').click();const note=x.doc.querySelector('textarea');note.value='Recover this research';note.dispatchEvent(new x.win.Event('input'));await flush();x.dom.window.close();
 const next=setup({draftStore});await next.ui.ready;assert.equal(next.doc.querySelector('textarea')?.value,'Recover this research');
 next.doc.querySelector('[data-action="save-note"]').click();await flush();assert.equal(next.state.items[0].note,'Recover this research');assert.deepEqual(draftStore,{});next.dom.window.close();
});
