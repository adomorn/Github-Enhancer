(() => {
 const G=globalThis.GHE;
 const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
 const btn=(text,action)=>{const b=el('button','button compact',text);b.type='button';b.dataset.ws=action;return b;};
 const safeText=text=>String(text||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/([\\`*_{}\[\]()#+.!|~-])/g,'\\$1');
 function linkedReviewNotes(workspace,state){
  const linked=new Set();
  for(const url of workspace.itemUrls){try{linked.add(G.canonicalPrUrl(url));}catch{}}
  const notes=new Map();
  for(const review of state.reviews||[]){let prUrl;try{prUrl=G.canonicalPrUrl(review.prUrl);}catch{continue;}if(!linked.has(prUrl))continue;
   for(const file of review.files||[])if(typeof file.note==='string'&&file.note.trim())notes.set(prUrl+'\n'+file.path,{prUrl,path:file.path,note:file.note});
  }
  return [...notes.values()];
 }
 G.workspaceMarkdown=(workspace,state,options={})=>{
  const pages=workspace.itemUrls.map(url=>state.items.find(i=>i.url===url)||{url,title:'Saved page removed',note:''});
  const snippets=workspace.snippetIds.map(id=>state.snippets.find(s=>s.id===id)).filter(Boolean);
  const missingSnippets=workspace.snippetIds.length-snippets.length;
  const reviewNotes=options.includeReviewNotes?linkedReviewNotes(workspace,state):[];
  return [`# ${safeText(workspace.title)}`,workspace.note?`## Notes\n\n${workspace.note.split('\n').map(line=>'> '+safeText(line)).join('\n')}`:'',pages.length?'## Pages':'',...pages.map(p=>`${G.markdownLink(p)}${p.note?'\n\n'+p.note.split('\n').map(line=>'> '+safeText(line)).join('\n'):''}`),workspace.snippetIds.length?'## Code':'',missingSnippets?`> ${missingSnippets} linked code excerpt${missingSnippets===1?' is':'s are'} unavailable because the saved excerpt was removed. The remaining evidence follows.`:'',...snippets.map(s=>G.snippetMarkdown(s)),reviewNotes.length?'## Saved private PR file notes':'',...reviewNotes.map(file=>`### ${safeText(file.path)}\n\n${G.markdownLink({url:file.prUrl,title:'Source pull request'})}\n\n${file.note.split('\n').map(line=>'> '+safeText(line)).join('\n')}`)].filter(Boolean).join('\n\n')+'\n';
 };
 G.mountWorkspaces=(root,o)=>{
  let selected=null,busy=false,undo=null,createDraft='';const drafts=new Map(),renameDrafts=new Map(),touched=new Set(),reviewExports=new Set();
  const state=()=>o.getState(),workspace=()=>state().workspaces?.find(w=>w.id===selected);
  function persist(key,value){touched.add(key);try{Promise.resolve(o.saveToolDraft?.('workspaces',key,value)).catch(()=>o.notify('Draft recovery unavailable. Save your workspace changes before closing.',true));}catch{o.notify('Draft recovery unavailable. Save your workspace changes before closing.',true);}}
  async function clearRecovered(key,value){touched.add(key);try{await o.deleteToolDraft?.('workspaces',key,value);return true;}catch{return false;}}
  function updateExportNotice(){const w=workspace(),cue=root.querySelector('[data-workspace-export-notice]');if(cue)cue.hidden=!w||!((drafts.has(w.id)&&drafts.get(w.id)!==w.note)||(renameDrafts.has(w.id)&&renameDrafts.get(w.id)!==w.title));}
  function editRename(id,title){renameDrafts.set(id,title);persist('rename:'+id,{title});updateExportNotice();}
  function picker(label,items){const s=el('select','tool-select');s.setAttribute('aria-label',label);const empty=el('option','','Choose…');empty.value='';s.append(empty);for(const item of items){const option=el('option','',item.label);option.value=item.value;s.append(option);}return s;}
  async function mutate(message){if(busy)return false;busy=true;try{const next=await o.request(message);o.onState(next);return next;}catch(e){o.notify(e.message||'Could not save this workspace.',true);return false;}finally{busy=false;}}
  function linkedRow(title,detail,href,action,id){const row=el('div','workspace-row');const info=el('div','workspace-row-info');const a=el('a','',title);a.href=href;a.target='_blank';a.rel='noopener noreferrer';info.append(a,el('small','muted',detail));const remove=btn('Remove',action);remove.dataset.id=id;row.append(info,remove);return row;}
  function render(){
   const active=document.activeElement;const field=root.contains(active)?active?.getAttribute('aria-label'):null,cursor=active?.selectionStart,end=active?.selectionEnd;
   function restoreFocus(){if(!field||root.contains(active))return;const restore=[...root.querySelectorAll('[aria-label]')].find(n=>n.getAttribute('aria-label')===field);if(restore){restore.focus();if(typeof cursor==='number'&&typeof restore.setSelectionRange==='function')restore.setSelectionRange(cursor,typeof end==='number'?end:cursor);}}
   root.replaceChildren();root.className='tool-section workspaces';const all=state().workspaces||[];
   const heading=el('div','tool-heading');heading.append(el('h2','','Workspaces'),el('span','count',String(all.length)));root.append(heading,el('p','muted tool-intro','Keep the pages, code and notes for one investigation together.'));
   const creation=el('form','workspace-create');const name=el('input','tool-input');name.placeholder='e.g. Checkout performance';name.maxLength=100;name.value=createDraft;name.addEventListener('input',()=>{createDraft=name.value;persist('create',{title:createDraft});});name.setAttribute('aria-label','New workspace name');creation.append(name,btn('Create','create'));creation.addEventListener('submit',e=>{e.preventDefault();creation.querySelector('button').click();});root.append(creation);
   if(all.length){const switcher=picker('Choose workspace',all.map(w=>({value:w.id,label:w.title})));switcher.value=selected||'';switcher.addEventListener('change',()=>{selected=switcher.value||null;undo=null;render();});root.append(switcher);}
   const w=workspace();
   if(!w){root.append(el('p','empty-state',all.length?'Choose a workspace to resume its context.':'Create your first workspace, then add a page or a code excerpt.'));if(undo)root.append(btn('Undo removal','undo'));restoreFocus();return;}
   const top=el('div','tool-heading workspace-title');top.append(el('h3','',w.title),btn('Rename','rename'),btn('Delete','delete'));root.append(top);if(renameDrafts.has(w.id)){const input=el('input','tool-input');input.value=renameDrafts.get(w.id);input.maxLength=100;input.setAttribute('aria-label','Rename workspace');input.addEventListener('input',()=>editRename(w.id,input.value));top.querySelector('[data-ws=rename]').replaceWith(input,btn('Save name','save-name'));}
   const note=el('textarea');note.rows=3;note.maxLength=10000;note.placeholder='Goals, findings, next steps…';note.setAttribute('aria-label','Workspace note');note.value=drafts.get(w.id)??w.note;const noteStatus=el('p','muted small',drafts.has(w.id)&&drafts.get(w.id)!==w.note?'Unsaved changes':'Stored only in this browser');noteStatus.dataset.workspaceNoteStatus='';const discard=btn('Discard changes','discard-note');discard.disabled=!drafts.has(w.id);note.addEventListener('input',()=>{drafts.set(w.id,note.value);persist('note:'+w.id,{note:note.value});noteStatus.textContent=note.value===w.note?'No unsaved changes':'Unsaved changes';discard.disabled=false;updateExportNotice();});root.append(note,noteStatus,btn('Save note','save-note'),discard);
   const pageHeading=el('div','tool-heading');pageHeading.append(el('h3','',`Pages · ${w.itemUrls.length}`));if(o.getContext())pageHeading.append(btn('Add current page','add-current'));root.append(pageHeading);
   const pagePicker=picker('Add a saved page',(state().items||[]).filter(p=>!w.itemUrls.includes(p.url)).map(p=>({value:p.url,label:p.title||p.repo})));const pageAdd=el('div','workspace-create');pageAdd.append(pagePicker,btn('Add','add-page'));root.append(pageAdd);
   for(const url of w.itemUrls){const item=state().items.find(p=>p.url===url);root.append(linkedRow(item?.title||'Page removed from saved pages',item?.repo||url,url,'unlink-page',url));}
   const snippetHeading=el('div','tool-heading');snippetHeading.append(el('h3','',`Code excerpts · ${w.snippetIds.length}`));root.append(snippetHeading);
   const snippetPicker=picker('Add a saved snippet',(state().snippets||[]).filter(s=>!w.snippetIds.includes(s.id)).map(s=>({value:s.id,label:s.title||s.path})));const snippetAdd=el('div','workspace-create');snippetAdd.append(snippetPicker,btn('Add','add-snippet'));root.append(snippetAdd);
   for(const id of w.snippetIds){const s=state().snippets?.find(s=>s.id===id);if(s)root.append(linkedRow(s.title||s.path,s.path,`${s.url.split('#')[0]}#L${s.lineStart}${s.lineEnd!==s.lineStart?'-L'+s.lineEnd:''}`,'unlink-snippet',id));else{const missing=el('div','workspace-row');const b=btn('Remove reference','unlink-snippet');b.dataset.id=id;missing.append(el('span','muted','Excerpt removed from basket'),b);root.append(missing);}}
   const reviewNotes=linkedReviewNotes(w,state());
   if(reviewNotes.length){const label=el('label','muted small'),check=el('input');check.type='checkbox';check.dataset.workspaceReviewExport='';check.checked=reviewExports.has(w.id);check.addEventListener('change',()=>{if(check.checked)reviewExports.add(w.id);else reviewExports.delete(w.id);});label.append(check,document.createTextNode(` Include ${reviewNotes.length} saved private PR file note${reviewNotes.length===1?'':'s'} in Markdown`));root.append(label);}
   const exportNotice=el('p','muted small','Export uses saved notes and titles. Save your edits to include them.');exportNotice.dataset.workspaceExportNotice='';root.append(exportNotice);updateExportNotice();
   const actions=el('div','tool-actions');actions.append(btn('Copy Markdown','copy'),btn('Download .md','download'));if(w.itemUrls.length&&o.openPages)actions.append(btn(`Open ${Math.min(w.itemUrls.length,10)} ${w.itemUrls.length===1?'page':'pages'}${w.itemUrls.length>10?' (first 10)':''}`,'open'));root.append(actions);
   if(undo)root.append(btn('Undo removal','undo'));
   restoreFocus();
  }
  root.addEventListener('click',async e=>{
   const b=e.target.closest('[data-ws]');if(!b||busy)return;const action=b.dataset.ws,w=workspace();
   if(action==='create'){const input=root.querySelector('[aria-label="New workspace name"]');const submitted=input.value,title=submitted.trim();touched.add('create');if(!title){o.notify('Give this workspace a name.',true);input.focus();return;}const previous=new Set((state().workspaces||[]).map(w=>w.id));const next=await mutate({type:'CREATE_WORKSPACE',title});if(next){if(createDraft===submitted)createDraft='';const cleared=await clearRecovered('create',{title:submitted});selected=next.workspaces.find(w=>!previous.has(w.id))?.id;render();o.notify(cleared?'Workspace created':'Workspace created. The recovery draft could not be cleared.',!cleared);}return;}
   if(action==='undo'&&undo){const pending=undo;if(await mutate(pending.message)){undo=null;if(pending.selected)selected=pending.selected;render();o.notify('Restored');}return;}
   if(!w)return;
   if(action==='save-note'){const value=root.querySelector('[aria-label="Workspace note"]').value;touched.add('note:'+w.id);if(await mutate({type:'UPDATE_WORKSPACE',id:w.id,patch:{note:value}})){if(drafts.get(w.id)===value)drafts.delete(w.id);const cleared=await clearRecovered('note:'+w.id,{note:value});render();o.notify(cleared?'Workspace note saved':'Workspace note saved. The recovery draft could not be cleared.',!cleared);}}
   else if(action==='discard-note'){const value=drafts.get(w.id);drafts.delete(w.id);const cleared=await clearRecovered('note:'+w.id,{note:value});if(!cleared&&!drafts.has(w.id))drafts.set(w.id,value);render();o.notify(cleared?'Workspace note changes discarded':'Draft could not be cleared. Please try again.',!cleared);}
   else if(action==='rename'){touched.add('rename:'+w.id);renameDrafts.set(w.id,w.title);const input=el('input','tool-input');input.value=w.title;input.maxLength=100;input.addEventListener('input',()=>editRename(w.id,input.value));input.setAttribute('aria-label','Rename workspace');const save=btn('Save name','save-name');b.replaceWith(input,save);input.focus();}
   else if(action==='save-name'){const submitted=root.querySelector('[aria-label="Rename workspace"]').value,title=submitted.trim();touched.add('rename:'+w.id);if(title&&await mutate({type:'UPDATE_WORKSPACE',id:w.id,patch:{title}})){if(renameDrafts.get(w.id)===submitted)renameDrafts.delete(w.id);const cleared=await clearRecovered('rename:'+w.id,{title:submitted});render();o.notify(cleared?'Workspace renamed':'Workspace renamed. The recovery draft could not be cleared.',!cleared);}}
   else if(action==='delete'){if(await mutate({type:'REMOVE_WORKSPACE',id:w.id})){undo={message:{type:'RESTORE_WORKSPACE',workspace:w},selected:w.id};selected=null;render();o.notify('Workspace removed. Saved pages and excerpts remain.');}}
   else if(action==='add-current'){const context=o.getContext();if(!context)return;if(!state().items.some(i=>i.url===context.url)&&!await mutate({type:'SAVE_ITEM',context}))return;if(await mutate({type:'LINK_WORKSPACE_ITEM',id:w.id,url:context.url}))o.notify('Page added to workspace');}
   else if(action==='add-page'){const url=root.querySelector('[aria-label="Add a saved page"]').value;if(url&&await mutate({type:'LINK_WORKSPACE_ITEM',id:w.id,url}))o.notify('Page added to workspace');}
   else if(action==='add-snippet'){const snippetId=root.querySelector('[aria-label="Add a saved snippet"]').value;if(snippetId&&await mutate({type:'LINK_WORKSPACE_SNIPPET',id:w.id,snippetId}))o.notify('Excerpt added to workspace');}
   else if(action==='unlink-page'||action==='unlink-snippet'){const page=action==='unlink-page';const message={type:page?'UNLINK_WORKSPACE_ITEM':'UNLINK_WORKSPACE_SNIPPET',id:w.id,[page?'url':'snippetId']:b.dataset.id};if(await mutate(message)){undo=(page?state().items.some(p=>p.url===b.dataset.id):state().snippets.some(s=>s.id===b.dataset.id))?{message:{...message,type:page?'LINK_WORKSPACE_ITEM':'LINK_WORKSPACE_SNIPPET'}}:null;render();o.notify('Removed from this workspace');}}
   else if(action==='copy'||action==='download'){const markdown=G.workspaceMarkdown(w,{...state(),snippets:state().snippets||[]},{includeReviewNotes:reviewExports.has(w.id)});try{if(action==='copy')await o.copy(markdown);else{const url=URL.createObjectURL(new Blob([markdown],{type:'text/markdown;charset=utf-8'}));const a=el('a');a.href=url;a.download=w.title.replace(/[^a-z0-9-]/gi,'-').slice(0,70)+'.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}o.notify(action==='copy'?'Workspace Markdown copied':'Workspace download started');}catch{o.notify('Export unavailable. Try the toolbar popup.',true);}}
   else if(action==='open'){try{await o.openPages(w.itemUrls.slice(0,10));o.notify('Workspace pages opened');}catch{o.notify('Could not open all pages. Use the source links below.',true);}}
  });
  const ready=Promise.resolve().then(()=>o.loadToolDrafts?.('workspaces')||[]).then(entries=>{
   for(const [key,value] of entries){if(typeof key!=='string'||touched.has(key)||!value||typeof value!=='object')continue;
    if(key==='create'&&typeof value.title==='string'&&value.title.length<=100)createDraft=value.title;
    else if(key.startsWith('note:')&&typeof value.note==='string'&&value.note.length<=10000)drafts.set(key.slice(5),value.note);
    else if(key.startsWith('rename:')&&typeof value.title==='string'&&value.title.length<=100)renameDrafts.set(key.slice(7),value.title);
   }render();
  }).catch(()=>o.notify('Workspace draft recovery unavailable. Save your changes before closing.',true));
  return {render,ready,select(id){if(!(state().workspaces||[]).some(w=>w.id===id))return false;selected=id;undo=null;render();return true;},hasDrafts:()=>Boolean(createDraft.trim())||(state().workspaces||[]).some(w=>(drafts.has(w.id)&&drafts.get(w.id)!==w.note)||(renameDrafts.has(w.id)&&renameDrafts.get(w.id)!==w.title))};
 };
})();
