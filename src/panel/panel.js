(() => {
  document.documentElement.dataset.gheBuild='hello-v2';document.documentElement.dataset.gheEvent='script';
  const G=globalThis.GHE, params=new URLSearchParams(location.search);
  const context=G.parseContext(params.get('url'),params.get('title')||'');
  const pending=new Map();let sequence=0;
  const pageAction=action=>new Promise((resolve,reject)=>{const requestId=String(++sequence);const timeout=setTimeout(()=>{pending.delete(requestId);reject(new Error('Page action timed out. Refresh the GitHub page.'));},5000);pending.set(requestId,{resolve,reject,timeout});parent.postMessage({source:'ghe-panel',type:'PAGE_ACTION',requestId,action},'https://github.com');});
  const refreshPage=()=>{parent.postMessage({source:'ghe-panel',type:'REQUEST_CONTEXT'},'https://github.com');return null;};
  const ui=G.mountWorkbench(document.querySelector('#app'),{...G.draftOptions,request:G.request,context,copy:G.copy,pageAction,refreshPage,openPages:G.openPages,openOptions:()=>chrome.runtime.openOptionsPage(),close:()=>parent.postMessage({source:'ghe-panel',type:'CLOSE'},'https://github.com')});
  let pageTheme=params.get('theme')||'dark';
  async function syncTheme(){await ui.ready;const setting=ui.getState().settings.theme;document.querySelector('#app').dataset.theme=setting==='auto'?pageTheme:setting;}
  window.addEventListener('message',event=>{
    if(event.source!==parent||event.origin!=='https://github.com'||event.data?.source!=='ghe-host')return;
    if(event.data.type==='PING'&&typeof event.data.requestId==='string'){
      document.documentElement.dataset.gheEvent='ping-received';document.documentElement.dataset.gheRequestId=event.data.requestId;
      const requestId=event.data.requestId;
      ui.ready.then(()=>{document.documentElement.dataset.gheEvent='ready-sent';parent.postMessage({source:'ghe-panel',type:'READY',requestId},'https://github.com');});
    }
    else if(event.data.type==='CONTEXT'){ui.setContext(G.parseContext(event.data.url,event.data.title),event.data.pageData||{});pageTheme=event.data.theme==='light'?'light':'dark';syncTheme();}
    else if(event.data.type==='ACTION_RESULT'){const p=pending.get(event.data.requestId);if(p){clearTimeout(p.timeout);pending.delete(event.data.requestId);if(event.data.ok)p.resolve(true);else p.reject(new Error('This part of the page is no longer loaded. Refresh page data.'));}}
    else if(event.data.type==='COMMANDS')ui.openPalette();
  });
  chrome.storage.onChanged.addListener(async(_changes,area)=>{if(area==='local'){await ui.refresh();syncTheme();}});
  window.addEventListener('beforeunload',event=>{if(G.hasUnprotectedDrafts()){event.preventDefault();event.returnValue='';}});
  window.addEventListener('keydown',event=>{if(event.key==='Escape'&&!event.defaultPrevented&&!document.querySelector('.command-overlay'))parent.postMessage({source:'ghe-panel',type:'CLOSE'},'https://github.com');});
  syncTheme();
  // The frame's load event invalidates the host connection. Announce on the next
  // task so the parent has processed that event before authenticating this document.
  const announce=()=>{document.documentElement.dataset.gheEvent='load';setTimeout(()=>{document.documentElement.dataset.gheEvent='hello-sent';parent.postMessage({source:'ghe-panel',type:'HELLO'},'https://github.com');},0);};
  if(document.readyState==='complete')announce();else window.addEventListener('load',announce,{once:true});
})();
