/* Local navigation over the bounded snapshot; GitHub's conversation is untouched. */
(() => {
 const G=globalThis.GHE;
 const node=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el;};
 const button=(text,action,id)=>{const el=node('button','button compact',text);el.type='button';el.dataset.conversation=action;el.dataset.id=id;return el;};
 G.mountConversation=(root,options)=>{
  let query='',author='',onlySaved=false,busy=false,lastThread='';
  const expanded=new Set();
  const snapshot=()=>options.getPageData()?.conversation;
  const comments=()=>snapshot()?.comments||[];
  const saved=url=>(options.getState().items||[]).some(item=>item.url===url);
  function rememberExpanded(){for(const details of root.querySelectorAll('details[data-comment-id]')){if(details.open)expanded.add(details.dataset.commentId);else expanded.delete(details.dataset.commentId);}}
  function matchSummary(text,q){
   const index=q?text.toLowerCase().indexOf(q):-1,start=index>140?Math.max(0,index-70):0,end=Math.min(text.length,Math.max(start+200,index<0?0:index+q.length+70));
   const summary=node('summary');
   if(start)summary.append(document.createTextNode('…'));
   if(index>=start&&index<end){summary.append(document.createTextNode(text.slice(start,index)),node('mark','',text.slice(index,index+q.length)),document.createTextNode(text.slice(index+q.length,end)));}
   else summary.append(document.createTextNode(text.slice(start,end)));
   if(end<text.length)summary.append(document.createTextNode('…'));
   return summary;
  }
  function captureFocus(){
   const active=root.contains(document.activeElement)?document.activeElement:null;
   return active?{label:active.getAttribute('aria-label'),action:active.dataset.conversation,id:active.dataset.id,cursor:active.selectionStart,cursorEnd:active.selectionEnd}:null;
  }
  function restoreFocus(focus){
   if(!focus)return;let next;
   if(focus.action){const controls=[...root.querySelectorAll('[data-conversation]')].filter(el=>el.dataset.id===focus.id);next=controls.find(el=>el.dataset.conversation===focus.action&&!el.disabled);if(!next&&focus.action==='save')next=controls.find(el=>el.dataset.conversation==='jump'&&!el.disabled);}
   else if(focus.label)next=[...root.querySelectorAll('[aria-label]')].find(el=>el.getAttribute('aria-label')===focus.label);
   next?.focus({preventScroll:true});if(next?.type==='search'&&focus.cursor!=null)next.setSelectionRange(focus.cursor,focus.cursorEnd??focus.cursor);
  }
  function render(){
   const focus=captureFocus(),previousThread=lastThread;
   rememberExpanded();
   const thread=(options.getContext()?.url||'').split('#')[0];if(lastThread!==thread){query='';author='';onlySaved=false;lastThread=thread;expanded.clear();}
   root.replaceChildren();if(!snapshot())return;root.className='conversation-section tool-section';
   root.append(node('h2','','Conversation navigator'),node('p','muted small',`${comments().length} loaded comments · Only loaded content is searched. Load more on GitHub, then refresh page data.`));
   if(snapshot().truncated)root.append(node('p','conversation-limit','Snapshot limit reached. Some loaded text or comments are omitted.'));
   const controls=node('div','conversation-controls'),search=node('input');search.type='search';search.placeholder='Find a decision, error or author…';search.setAttribute('aria-label','Search loaded comments');search.value=query;
   search.addEventListener('input',()=>{query=search.value;renderResults();});
   const authors=node('select');authors.setAttribute('aria-label','Filter comment author');const all=node('option','','All authors');all.value='';authors.append(all);
   for(const name of [...new Set(comments().map(c=>c.author))].sort()){const option=node('option','',name||'Unknown author');option.value=name;authors.append(option);}if(author&&![...authors.options].some(o=>o.value===author))author='';authors.value=author;authors.addEventListener('change',()=>{author=authors.value;renderResults();});
   const savedLabel=node('label','conversation-saved'),check=node('input');check.type='checkbox';check.checked=onlySaved;check.setAttribute('aria-label','Only saved comments');check.addEventListener('change',()=>{onlySaved=check.checked;renderResults();});savedLabel.append(check,document.createTextNode('Saved only'));controls.append(search,authors,savedLabel);root.append(controls,node('p','muted small','Save important comments to Saved, then add them to a workspace.'));
   root.append(node('p','conversation-count'),node('div','conversation-results'));renderResults();
   if(previousThread===lastThread)restoreFocus(focus);
  }
  function renderResults(){
   const list=root.querySelector('.conversation-results');if(!list)return;const focus=captureFocus();rememberExpanded();list.replaceChildren();const q=query.trim().toLowerCase(),all=comments(),matches=all.filter(c=>(!author||c.author===author)&&(!onlySaved||saved(c.url))&&(!q||`${c.author}\n${c.body}`.toLowerCase().includes(q)));
   root.querySelector('.conversation-count').textContent=`${matches.length} of ${all.length} loaded comments`;
   if(!matches.length){list.append(node('p','muted',all.length?'No matches in this loaded snapshot. Try another filter or load more on GitHub.':'No readable comments in this snapshot. Load the conversation on GitHub, then refresh page data.'));return;}
   for(const comment of matches){const card=node('article','conversation-card');card.append(node('h3','',`${comment.author||'Unknown author'} · ${comment.kind}`));const body=node('details','conversation-text');body.dataset.commentId=comment.id;body.open=expanded.has(comment.id);body.append(matchSummary(comment.body,q),node('pre','',comment.body));body.addEventListener('toggle',()=>{if(!root.contains(body))return;if(body.open)expanded.add(comment.id);else expanded.delete(comment.id);});card.append(body);const actions=node('div','tool-actions'),jump=button('Jump to comment','jump',comment.id),save=button(saved(comment.url)?'Saved':'Save important','save',comment.id);jump.disabled=busy;save.disabled=busy||saved(comment.url);const link=node('a','text-button','Source');link.href=comment.url;link.target='_blank';link.rel='noopener noreferrer';actions.append(jump,save,link);card.append(actions);list.append(card);}
   restoreFocus(focus);
  }
  root.addEventListener('click',async event=>{
   const target=event.target.closest('[data-conversation]');if(!target||busy)return;const comment=comments().find(c=>c.id===target.dataset.id);if(!comment)return;const action=target.dataset.conversation,thread=lastThread;busy=true;renderResults();
   try{if(target.dataset.conversation==='jump'){const result=await options.pageAction({type:'conversation-jump',id:comment.id});if(result===false)throw Error('Comment is no longer loaded. Refresh page data.');options.notify('Jumped to comment');}
   else if(target.dataset.conversation==='save'){const context=G.parseContext(comment.url,`${comment.author||'Comment'}: ${comment.body.replace(/\s+/g,' ').slice(0,240)}`);if(!context)throw Error('This comment has no supported GitHub source.');options.onState(await options.request({type:'SAVE_ITEM',context}));options.notify('Important comment saved. Add it to a workspace from Workspaces.');}}
   catch(error){options.notify(error.message||'Could not complete the action.',true);}finally{busy=false;renderResults();if(action==='save'&&lastThread===thread){const controls=[...root.querySelectorAll('[data-conversation]')].filter(el=>el.dataset.id===comment.id);const next=controls.find(el=>el.dataset.conversation==='save'&&!el.disabled)||controls.find(el=>el.dataset.conversation==='jump'&&!el.disabled);next?.focus({preventScroll:true});}}
  });
  return {render,focusSearch(){root.querySelector('[aria-label="Search loaded comments"]')?.focus();}};
 };
})();
