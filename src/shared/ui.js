/* Shared extension-origin workbench. Page-derived content is always text. */
(() => {
  const G = globalThis.GHE;
  const icons = {
    mark: '<path d="M5 3h10v14l-5-3-5 3z"/>', search: '<circle cx="8.5" cy="8.5" r="5.5"/><path d="m13 13 4 4"/>',
    close: '<path d="m5 5 10 10M15 5 5 15"/>', settings: '<path d="M3 6h14M3 14h14"/><circle cx="7" cy="6" r="2"/><circle cx="13" cy="14" r="2"/>',
    note: '<path d="M5 3h7l4 4v10H5zM12 3v5h4M8 11h5M8 14h4"/>', copy: '<rect x="7" y="7" width="10" height="10" rx="2"/><path d="M12 4V3H3v9h1"/>',
    arrow: '<path d="M5 15 15 5M6 5h9v9"/>', repo:'<path d="M5 3h11v14H5a2 2 0 0 1 0-4h11M5 3a2 2 0 0 0-2 2v10M7 6h5"/>',
    issue:'<circle cx="10" cy="10" r="7"/><circle cx="10" cy="10" r="1"/>', pull:'<circle cx="5" cy="4" r="2"/><circle cx="5" cy="16" r="2"/><circle cx="15" cy="16" r="2"/><path d="M5 6v8M11 4h1a3 3 0 0 1 3 3v7M13 2l-2 2 2 2"/>',
    code:'<path d="m6 5-4 5 4 5m8-10 4 5-4 5M12 3 8 17"/>', check:'<path d="m4 10 4 4 8-9"/>', trash:'<path d="M3 5h14M7 5V3h6v2M5 5l1 12h8l1-12M8 8v6M12 8v6"/>',
    bolt:'<path d="m11 2-7 9h5l-1 7 8-10h-6z"/>', chevron:'<path d="m7 4 6 6-6 6"/>', back:'<path d="m8 5-5 5 5 5M3 10h14"/>', lock:'<rect x="4" y="9" width="12" height="8" rx="2"/><path d="M6 9V6a4 4 0 0 1 8 0v3"/>'
  };
  function icon(name) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    el.setAttribute('viewBox', '0 0 20 20'); el.setAttribute('aria-hidden', 'true');
    el.setAttribute('fill','none');el.setAttribute('stroke','currentColor');el.setAttribute('stroke-width','1.5');el.setAttribute('stroke-linecap','round');el.setAttribute('stroke-linejoin','round');
    el.innerHTML = icons[name] || icons.repo; // Only static, bundled SVG paths.
    return el;
  }
  function node(tag, cls, text) { const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n; }
  function button(label, action, glyph, cls='button') {
    const b=node('button',cls);b.type='button';b.dataset.action=action;
    if(glyph)b.append(icon(glyph));if(label)b.append(node('span','',label));return b;
  }
  function iconButton(label,action,glyph) {const b=button('',action,glyph,'icon-button');b.setAttribute('aria-label',label);b.title=label;return b;}
  function kind(type) {return {repository:'Repository',issue:'Issue',pull:'Pull request',code:'Code',commit:'Commit',discussion:'Discussion'}[type]||'Page';}
  function typeIcon(type) {return {repository:'repo',issue:'issue',pull:'pull',code:'code',commit:'code',discussion:'note'}[type]||'repo';}
  function displayTitle(context) {
    const title=context.title||context.repo||'';
    const colon=title.indexOf(':');
    if(context.type==='repository'&&colon>0&&title.slice(0,colon).toLowerCase()===context.repo?.toLowerCase())return title.slice(0,colon);
    return title;
  }
  function mountWorkbench(root, options) {
    let context=options.context||null, state={settings:G.DEFAULT_SETTINGS,items:[],snippets:[],workspaces:[],reviews:[],templates:[]}, query='', filter='all', busy=false, editing=null;
    const drafts=new Map();let noteOpen=false, undoItem=null, palette=null;
    let pageData=options.pageData||{}, activeView=G.mountWorkspaces?'tools':'saved';const modules=[];
    const request=options.request;
    root.classList.add('workbench');
    const header=node('header','app-header');
    const brand=node('div','brand');brand.append(node('span','brand-symbol','g+'),node('div','brand-name','GitHub Enhancer'));
    const tools=node('div','header-tools');tools.append(iconButton('Search commands','commands','search'),iconButton('Settings','settings','settings'));
    if(options.close)tools.append(iconButton('Close workbench','close','close'));
    header.append(brand,tools);
    const body=node('div','workbench-body'), current=node('section','current-section');
    const saved=node('section','saved-section');const savedHeading=node('div','section-heading');
    const title=node('h2','','Saved pages');const count=node('span','count','0');title.append(count);savedHeading.append(title);
    const searchWrap=node('div','search-field');searchWrap.append(icon('search'));const search=node('input');search.type='search';search.placeholder='Find a page or a note…';search.setAttribute('aria-label','Search saved pages');searchWrap.append(search);
    const filters=node('div','filters');filters.setAttribute('aria-label','Filter saved pages');
    for(const [value,label] of [['all','All'],['repository','Repos'],['issue','Issues'],['pull','PRs'],['code','Code']]) {const b=button(label,`filter:${value}`,null,'filter');b.setAttribute('aria-pressed',String(value==='all'));filters.append(b);}
    const list=node('div','saved-list');saved.append(savedHeading,searchWrap,filters,list);
    const nav=node('nav','workspace-tabs');nav.setAttribute('aria-label','Workbench sections');
    const toolPane=node('section','tool-pane'),basketPane=node('section','basket-pane'),workspacePane=node('section','workspace-pane'),composerPane=node('section','composer-pane');
    if(G.mountWorkspaces){for(const [id,label] of [['tools','Tools'],['basket','Code basket'],['workspaces','Workspaces'],['write','Write'],['saved','Saved']]){const b=button(label,`view:${id}`,null,'workspace-tab');nav.append(b);}}
    body.append(current,toolPane,basketPane,workspacePane,composerPane,saved);
    const status=node('div','status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    const footer=node('footer','app-footer');const privacy=node('span','privacy');privacy.append(icon('lock'),document.createTextNode('Only on this device'));footer.append(privacy,button('Commands','commands',null,'text-button'));
    root.replaceChildren(header,nav,body,status,footer);
    const moduleOptions={...options,getState:()=>state,getContext:()=>context,getPageData:()=>pageData,request,onState:setState,notify,pageAction:async action=>{if(!options.pageAction)throw new Error('Open this tool on a GitHub page.');return options.pageAction(action);}};
    const basketUI=G.mountBasket?.(basketPane,moduleOptions);const workspacesUI=G.mountWorkspaces?.(workspacePane,moduleOptions);const reviewRoot=node('div');
    const reviewUI=G.mountReview?.(reviewRoot,moduleOptions),conversationRoot=node('div'),conversationUI=G.mountConversation?.(conversationRoot,moduleOptions),composerUI=G.mountComposer?.(composerPane,moduleOptions);modules.push(...[basketUI,workspacesUI,reviewUI,conversationUI,composerUI].filter(Boolean));
    function switchView(view){activeView=view;root.dataset.view=view;current.hidden=!['tools','saved'].includes(view);toolPane.hidden=view!=='tools';basketPane.hidden=view!=='basket';workspacePane.hidden=view!=='workspaces';composerPane.hidden=view!=='write';saved.hidden=view!=='saved';for(const b of nav.children)b.setAttribute('aria-current',b.dataset.action===`view:${view}`?'page':'false');renderTools();for(const module of modules)module.render();}
    function renderTools(){
      if(!G.mountWorkspaces){toolPane.replaceChildren();return;}
      for(const child of [...toolPane.children])if(child!==reviewRoot&&child!==conversationRoot)child.remove();
      if(!pageData.review)reviewRoot.remove();if(!pageData.conversation)conversationRoot.remove();
      const section=node('div','tool-section');const heading=node('div','tool-heading');heading.append(node('h2','','Your page tools'));const refresh=button('Refresh page data','refresh-page',null,'text-button');heading.append(refresh);section.append(heading);
      toolPane.prepend(section);
      if(pageData.review){if(reviewRoot.parentElement!==toolPane)toolPane.append(reviewRoot);reviewUI?.render();}
      if(pageData.code){const c=pageData.code;section.append(node('p','tool-filepath',c.path),node('p','muted small',`${c.lineCount} ${c.truncated?'loaded ':''}lines · ${(c.bytes/1024).toFixed(1)} KB`),node('p','tool-intro','Collect a line range with its source, then combine excerpts from other files.'),button('Collect a code excerpt','view:basket','code','button primary'));}
      else if(!pageData.review&&!pageData.conversation){section.append(node('p','muted tool-intro','A workspace for the investigation, a basket for the evidence. Open a code file or PR changes to unlock its page tools.'));const choices=node('div','tool-choices');choices.append(button('Build a code basket','view:basket','code'),button('Resume a workspace','view:workspaces','repo'));section.append(choices);}
      if(pageData.conversation){if(conversationRoot.parentElement!==toolPane)toolPane.append(conversationRoot);conversationUI?.render();}
      if(context){const box=node('section','tool-section repo-toolbox');box.append(node('h2','','Repository toolbox'));const clone=node('div','tool-actions');clone.append(button('HTTPS clone','tool-clone-https',null),button('SSH clone','tool-clone-ssh',null),button('GitHub CLI','tool-clone-cli',null));box.append(clone);const links=node('div','tool-links');for(const [label,path] of [['Recent commits','/commits'],['Compare changes','/compare'],['Your pull requests','/pulls?q=is%3Apr+author%3A%40me'],['Issues assigned to you','/issues?q=is%3Aissue+assignee%3A%40me'],['Actions','/actions'],['Releases','/releases']]){const a=node('a','',label);a.href=`https://github.com/${context.repo}${path}`;a.target='_blank';a.rel='noopener noreferrer';links.append(a);}const editor=node('a','','Open browser editor');editor.href=`https://github.dev/${context.repo}`;editor.target='_blank';editor.rel='noopener noreferrer';links.append(editor);box.append(links);toolPane.append(box);}
    }
    function notify(text,error=false) { status.replaceChildren(node('span','',text));status.classList.toggle('error',error); }
    function savedItem(url) {return state.items.find(i=>i.url===url);}
    function target() {return editing||context;}
    function setState(next) {state=next;root.dataset.theme=state.settings.theme||'auto';renderCurrent();renderList();renderTools();for(const module of modules)module.render();}
    async function run(message,success) {
      if(busy)return false;busy=true;root.setAttribute('aria-busy','true');
      try{const next=await request(message);setState(next);if(success)notify(success);return true;}
      catch(error){notify(error.message||'Could not save. Please try again.',true);return false;}
      finally{busy=false;root.removeAttribute('aria-busy');}
    }
    function renderCurrent() {
      const previous=current.querySelector('textarea');const focused=previous===document.activeElement;const cursor=previous?.selectionStart;
      current.replaceChildren();const c=target();
      if(!c){const welcome=node('div','welcome');welcome.append(node('h1','','Keep your place.'),node('p','muted','Open a repository, issue, or pull request to save it here with a private note.'));const a=node('a','button primary','Explore GitHub');a.href='https://github.com';a.target='_blank';a.rel='noopener noreferrer';welcome.append(a);current.append(welcome);return;}
      const item=savedItem(c.url), top=node('div','context-kicker');
      top.append(node('span','context-label',editing?'Editing saved page':'On this page'),node('span',`type-badge type-${c.type}`,kind(c.type)));
      if(editing)top.prepend(iconButton('Back to current page','back','back'));
      const name=node('h1','context-title',displayTitle(c));name.dataset.contextTitle='';name.title=c.title||c.repo;
      const repo=node('div','repo-name',c.repo);repo.title=c.url;
      const actions=node('div','current-actions');const save=button(item?'Saved':'Save page','save',item?'check':'mark',`button ${item?'saved-button':'primary'}`);save.disabled=Boolean(item);actions.append(save,button(item?.note?'Edit note':'Add note','note','note'));
      const menu=node('details','copy-menu');const summary=node('summary','button');summary.append(icon('copy'),document.createTextNode('Copy'));const menuItems=node('div','menu-items');menuItems.append(button('Page URL','copy-url',null,'menu-item'),button('Markdown link','copy-markdown',null,'menu-item'),button('Clone command','copy-clone',null,'menu-item'));menu.append(summary,menuItems);actions.append(menu);
      current.append(top,name,repo,actions);
      if(noteOpen||drafts.has(c.url)){
        const wrap=node('div','note-editor');const label=node('label','note-label','Private note');label.htmlFor='private-note';
        const note=node('textarea');note.id='private-note';note.rows=3;note.maxLength=10000;note.placeholder='What do you want to remember?';note.setAttribute('aria-label','Private note');note.value=drafts.has(c.url)?drafts.get(c.url):item?.note||'';
        note.addEventListener('input',()=>{drafts.set(c.url,note.value);noteState.textContent='Unsaved changes';options.saveDraft?.(c.url,note.value).catch(()=>notify('Draft recovery unavailable. Save your note before closing.',true));});
        const bottom=node('div','note-actions');const noteState=node('span','muted small',drafts.has(c.url)?'Unsaved changes':'Stored only in this browser');bottom.append(noteState,button('Discard','discard-draft',null,'text-button'),button('Save note','save-note',null,'button compact primary'));wrap.append(label,note,bottom);current.append(wrap);
        if(focused){note.focus();note.setSelectionRange(cursor,cursor);}
      }
      const links=node('nav','repo-links');links.setAttribute('aria-label','Repository shortcuts');
      for(const [label,path] of [['Code',''],['Issues','/issues'],['Pull requests','/pulls'],['Releases','/releases']]){const a=node('a','',label);a.href=`https://github.com/${c.repo}${path}`;a.target='_blank';a.rel='noopener noreferrer';links.append(a);}
      current.append(links);
    }
    function renderList() {
      count.textContent=state.items.length;list.replaceChildren();
      const items=G.filterItems(state.items,query).filter(i=>filter==='all'||i.type===filter||(filter==='code'&&i.type==='commit'));
      if(!items.length){const empty=node('div','empty-state');empty.append(icon(query?'search':'mark'),node('h3','',state.items.length?'No matching pages':'A little context goes a long way.'),node('p','muted',state.items.length?'Try a different search or filter.':'Save a page you want to return to. Add a note so you remember why.'));if(state.items.length)empty.append(button('Clear filters','clear-filters',null,'text-button'));list.append(empty);return;}
      for(const item of items){const row=node('article','saved-row');row.dataset.savedItem=item.url;const glyph=node('span',`item-icon type-${item.type}`);glyph.append(icon(typeIcon(item.type)));const info=node('div','saved-info');
        const a=node('a','saved-title',displayTitle(item));a.href=item.url;a.target='_blank';a.rel='noopener noreferrer';a.title=item.title||item.url;
        const meta=node('div','saved-meta',item.repo);info.append(a,meta);if(item.note)info.append(node('p','note-preview',item.note));
        const edit=iconButton(`Edit note for ${item.title}`,'edit-item','note');edit.dataset.url=item.url;const remove=iconButton(`Remove ${item.title}`,'remove-item','trash');remove.dataset.url=item.url;
        const rowTools=node('div','row-tools');rowTools.append(edit,remove);row.append(glyph,info,rowTools);list.append(row);
      }
    }
    async function copy(text,label){try{await options.copy(text);notify(`${label} copied`);}catch{notify('Clipboard unavailable. Try opening the extension from the toolbar.',true);}current.querySelector('details')?.removeAttribute('open');}
    function closePalette(){if(!palette)return;const focus=palette.focus;palette.el.remove();palette=null;focus?.focus();}
    function openPalette() {
      if(palette)return;const focus=document.activeElement;const overlay=node('section','command-overlay');overlay.setAttribute('role','dialog');overlay.setAttribute('aria-modal','true');overlay.setAttribute('aria-label','Enhancer commands');
      const heading=node('div','command-heading');heading.append(node('h2','','Jump back in'),iconButton('Close commands','close-commands','close'));
      const input=node('input','command-input');input.placeholder='Search commands, notes and collected work…';input.setAttribute('aria-label','Search commands and saved pages');input.setAttribute('role','combobox');input.setAttribute('aria-controls','command-results');input.setAttribute('aria-expanded','true');input.setAttribute('aria-autocomplete','list');
      const results=node('div','command-results');results.id='command-results';results.setAttribute('role','listbox');
      const hint=node('div','command-hint','↑ ↓ to move · Enter to run · Esc to close');overlay.append(heading,input,results,hint);root.append(overlay);palette={el:overlay,focus,index:0,actions:[]};
      function render(){if(!palette)return;const q=input.value.trim().toLowerCase(), c=target();let actions=[];
        if(c)actions.push({label:savedItem(c.url)?'Edit private note':'Save this page',detail:c.repo,run:()=>{closePalette();root.querySelector(`[data-action="${savedItem(c.url)?'note':'save'}"]`)?.click();}}, {label:'Copy Markdown link',detail:c.repo,run:()=>{closePalette();copy(G.markdownLink(c),'Markdown link');}},{label:'Copy clone command',detail:c.repo,run:()=>{closePalette();copy(`git clone https://github.com/${c.repo}.git`,'Clone command');}});
        if(G.mountWorkspaces)for(const [view,label] of [['tools','Open page tools'],['basket','Open code basket'],['workspaces','Open workspaces'],['write','Write a reply draft'],['saved','Search saved pages']])actions.push({label,detail:context?.repo||'Local workbench',run:()=>{closePalette();switchView(view);if(view==='saved')search.focus();}});
        if(pageData.conversation)actions.push({label:'Search loaded comments',detail:context?.repo||'Conversation',run:()=>{closePalette();switchView('tools');conversationUI?.focusSearch();}});
        for(const [key,label] of [['exactDates','Exact dates'],['wide','Wide layout'],['focus','Focus mode']])actions.push({label:`${state.settings[key]?'Turn off':'Turn on'} ${label.toLowerCase()}`,detail:'Reading preference',run:()=>{closePalette();run({type:'SET_SETTINGS',patch:{[key]:!state.settings[key]}},`${label} updated`);}});
        actions=actions.filter(a=>`${a.label} ${a.detail}`.toLowerCase().includes(q));
        const matches=text=>text.toLowerCase().includes(q);
        for(const workspace of (state.workspaces||[]).filter(w=>matches(`${w.title} ${w.note}`)).slice(0,8))actions.push({label:workspace.title,detail:'Workspace · '+(workspace.note||'Resume this investigation').slice(0,100),run:()=>{closePalette();switchView('workspaces');workspacesUI?.select?.(workspace.id);}});
        for(const snippet of (state.snippets||[]).filter(s=>matches(`${s.title} ${s.path} ${s.note} ${s.code}`)).slice(0,8))actions.push({label:snippet.title||snippet.path,detail:'Code excerpt · '+snippet.path,run:()=>{closePalette();switchView('basket');basketUI?.reveal?.(snippet.id);}});
        if(q)for(const review of state.reviews||[])for(const file of review.files||[]){if(file.note&&matches(`${review.prUrl} ${file.path} ${file.note}`))actions.push({label:file.path,detail:'Private PR note · '+file.note.slice(0,120),href:review.prUrl+'/files'});}
        actions.push(...G.filterItems(state.items,q).map(item=>({label:item.title,detail:item.repo,href:item.url})));
        palette.actions=actions.slice(0,30);palette.index=0;results.replaceChildren();
        palette.actions.forEach((action,i)=>{const b=node(action.href?'a':'button','command-option');if(action.href){b.href=action.href;b.target='_blank';b.rel='noopener noreferrer';}else b.type='button';b.id=`command-${i}`;b.setAttribute('role','option');b.tabIndex=-1;b.append(node('span','',action.label),node('small','muted',action.detail));b.addEventListener('click',()=>{if(action.run)action.run();else closePalette();});results.append(b);});
        if(!actions.length)results.append(node('p','empty-state','No matching commands or pages.'));select();
      }
      function select(){if(!palette)return;[...results.querySelectorAll('[role="option"]')].forEach((b,i)=>b.setAttribute('aria-selected',String(i===palette.index)));if(palette.actions.length)input.setAttribute('aria-activedescendant',`command-${palette.index}`);else input.removeAttribute('aria-activedescendant');}
      input.addEventListener('input',render);overlay.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();closePalette();}else if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();const n=palette.actions.length;palette.index=n?(palette.index+(event.key==='ArrowDown'?1:n-1))%n:0;select();results.children[palette.index]?.scrollIntoView?.({block:'nearest'});}else if(event.key==='Enter'&&document.activeElement===input){event.preventDefault();results.querySelectorAll('[role="option"]')[palette.index]?.click();}else if(event.key==='Tab'){event.preventDefault();if(document.activeElement===input)overlay.querySelector('button').focus();else input.focus();}});
      render();input.focus();
    }
    root.addEventListener('keydown',event=>{
      if(!event.defaultPrevented&&state.settings.enabled&&state.settings.shortcut&&event.altKey&&event.shiftKey&&!event.ctrlKey&&!event.metaKey&&event.code==='KeyK'){
        event.preventDefault();event.stopPropagation();openPalette();
      }
    });
    root.addEventListener('click',async event=>{
      const b=event.target.closest('[data-action]');if(!b)return;const action=b.dataset.action,c=target();
      if(action.startsWith('view:')){switchView(action.slice(5));return;}
      if(action==='refresh-page'){try{const data=await options.refreshPage?.();if(data){pageData=data.pageData||{};if(context?.url!==data.context?.url){editing=null;noteOpen=false;}context=data.context||null;renderCurrent();renderTools();for(const module of modules)module.render();notify('Loaded page data refreshed');}else if(options.refreshPage)notify('Refreshing loaded page data…');else notify('Reload the GitHub page to enable page tools.',true);}catch(e){notify(e.message||'Page tools unavailable. Reload GitHub.',true);}return;}
      if(action.startsWith('tool-clone-')&&context){const command=action==='tool-clone-ssh'?`git clone git@github.com:${context.repo}.git`:action==='tool-clone-cli'?`gh repo clone ${context.repo}`:`git clone https://github.com/${context.repo}.git`;copy(command,'Clone command');return;}
      if(action.startsWith('filter:')){filter=action.slice(7);for(const f of filters.children)f.setAttribute('aria-pressed',String(f===b));renderList();return;}
      if(action==='settings')options.openOptions();
      else if(action==='close')options.close?.();
      else if(action==='commands')openPalette();
      else if(action==='close-commands')closePalette();
      else if(action==='clear-filters'){query='';filter='all';search.value='';for(const f of filters.children)f.setAttribute('aria-pressed',String(f.dataset.action==='filter:all'));renderList();}
      else if(action==='back'){editing=null;noteOpen=false;renderCurrent();}
      else if(action==='note'){if(current.hidden)switchView('saved');noteOpen=!noteOpen;renderCurrent();current.querySelector('textarea')?.focus();}
      else if(action==='save'&&c){await run({type:'SAVE_ITEM',context:c},'Page saved to Saved pages');}
      else if(action==='save-note'&&c){const value=current.querySelector('textarea').value;const ok=await run(savedItem(c.url)?{type:'UPDATE_ITEM',url:c.url,note:value}:{type:'SAVE_ITEM',context:c,note:value},'Private note saved');if(ok){if(drafts.get(c.url)===value){drafts.delete(c.url);try{await options.deleteDraft?.(c.url,value);}catch{notify('Note saved, but the temporary draft could not be cleared.',true);}}renderCurrent();}}
      else if(action==='discard-draft'&&c){const expected=drafts.get(c.url);drafts.delete(c.url);try{await options.deleteDraft?.(c.url,expected);notify('Draft discarded');}catch{notify('Draft could not be cleared. Please try again.',true);}renderCurrent();}
      else if(action==='copy-url'&&c)copy(c.url,'Page URL');
      else if(action==='copy-markdown'&&c)copy(G.markdownLink(c),'Markdown link');
      else if(action==='copy-clone'&&c)copy(`git clone https://github.com/${c.repo}.git`,'Clone command');
      else if(action==='edit-item'){switchView('saved');editing=savedItem(b.dataset.url);noteOpen=true;renderCurrent();current.querySelector('textarea')?.focus();current.scrollIntoView?.({block:'start'});}
      else if(action==='remove-item'){const removed=savedItem(b.dataset.url);if(await run({type:'REMOVE_ITEM',url:removed.url},'Page removed')){undoItem=removed;if(editing?.url===removed.url)editing=null;const expected=drafts.get(removed.url);drafts.delete(removed.url);try{await options.deleteDraft?.(removed.url,expected);}catch{notify('Page removed. Temporary draft could not be cleared.',true);}renderCurrent();status.append(button('Undo','undo',null,'text-button'));}}
      else if(action==='undo'&&undoItem){if(await run({type:'RESTORE_ITEM',item:undoItem},'Page restored'))undoItem=null;}
    });
    search.addEventListener('input',()=>{query=search.value;renderList();});
    renderCurrent();switchView(activeView);list.append(node('p','loading','Loading your workspace…'));
    const ready=Promise.all([request({type:'GET_STATE'}),options.loadDrafts?options.loadDrafts():Promise.resolve([])]).then(([next,recovered])=>{for(const [url,note] of recovered){if(!drafts.has(url))drafts.set(url,note);}setState(next);return Promise.all(modules.map(module=>module.ready));}).catch(error=>{list.replaceChildren(node('p','empty-state','Your workspace could not be loaded. Reopen the extension to try again.'));notify(error.message,true);});
    return {ready, setContext(next,data){if(context?.url!==next?.url){editing=null;noteOpen=false;}context=next;if(data)pageData=data;renderCurrent();renderTools();for(const module of modules)module.render();},refresh:async()=>{try{setState(await request({type:'GET_STATE'}));}catch(e){notify(e.message,true);}},openPalette,hasDrafts:()=>drafts.size>0||modules.some(m=>m.hasDrafts?.()),notify,getState:()=>state};
  }
  Object.assign(G,{mountWorkbench,uiNode:node,uiButton:button,uiIcon:icon});
})();
