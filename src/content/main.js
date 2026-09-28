/* One lifecycle owner in the isolated content-script world. */
(() => {
  const G=globalThis.GHE;
  if(G.runtime)return;
  G.runtime=true;
  const reading=G.createReadingEnhancer(document);
  const host=document.createElement('div');host.dataset.gheHost='';host.id='ghe-workbench-host';
  host.dataset.gheBuild='hello-v2';host.dataset.gheConnection='awaiting-hello';host.dataset.gheEvent='create';host.dataset.gheFrameLoads='0';
  const shadow=host.attachShadow({mode:'open'});
  const style=document.createElement('style');style.textContent=`
    :host{all:initial;position:fixed;right:20px;bottom:20px;z-index:80;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color-scheme:light dark}
    :host([hidden]){display:none!important}button{font:600 12px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#1f6feb;color:white;border:1px solid #388bfd;border-radius:8px;padding:10px 13px;cursor:pointer;display:flex;align-items:center;gap:9px;box-shadow:0 2px 6px #0003}button:hover{background:#1158c7}button:focus-visible{outline:3px solid #79c0ff;outline-offset:3px}button span:first-child{font-size:16px;letter-spacing:-1px}iframe{position:absolute;right:0;bottom:48px;width:400px;height:min(690px,calc(100dvh - 96px));border:1px solid #59636e;border-radius:12px;background:#0d1117;display:block;color-scheme:normal}iframe[hidden]{display:none}button[aria-expanded="true"]{background:#30363d;border-color:#59636e}
    @media(max-width:480px){:host{right:12px;bottom:12px}iframe{width:calc(100vw - 24px);height:calc(100dvh - 84px)}}
    @media(print){:host{display:none}}
    .panel-status{position:absolute;right:0;bottom:48px;box-sizing:border-box;width:400px;min-height:180px;padding:28px;border:1px solid #30363d;border-radius:12px;background:#0d1117;color:#f0f6fc;box-shadow:0 8px 32px #0003;font-size:13px;line-height:1.6}.panel-status[hidden]{display:none}.panel-status strong{display:block;font-size:15px;margin-bottom:8px}.panel-status p{margin:0;color:#9198a1}:host([data-theme="light"]) .panel-status{background:#fff;color:#1f2328;border-color:#d1d9e0}:host([data-theme="light"]) .panel-status p{color:#59636e}@media(max-width:480px){.panel-status{width:calc(100vw - 24px)}}
  `;
  const launcher=document.createElement('button');launcher.type='button';launcher.setAttribute('aria-label','Open GitHub Enhancer');launcher.setAttribute('aria-expanded','false');launcher.title='GitHub Enhancer · Alt+Shift+K';
  const symbol=document.createElement('span');symbol.textContent='g+';symbol.setAttribute('aria-hidden','true');const label=document.createElement('span');label.textContent='Enhancer';launcher.append(symbol,label);shadow.append(style,launcher);
  const panelStatus=document.createElement('section');panelStatus.className='panel-status';panelStatus.dataset.ghePanelStatus='';panelStatus.hidden=true;panelStatus.setAttribute('role','status');panelStatus.setAttribute('aria-live','polite');
  const statusTitle=document.createElement('strong'),statusDetail=document.createElement('p');panelStatus.append(statusTitle,statusDetail);shadow.append(panelStatus);
  let settings=null,context=null,iframe=null,open=false,timer=null,lastContext='',pendingCommands=false,disposed=false,loadingTimer=null,requestId='',requestSequence=0,connected=false,frameURL='',frameObserver=null;
  function theme(){const html=document.documentElement;const mode=html.dataset.colorMode;if(mode==='light')return'light';if(mode==='dark')return'dark';return matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}
  function pageContext(){return G.parseContext(location.href,document.title);}
  function eligibleFrame(){return iframe?.isConnected&&!iframe.hasAttribute('srcdoc')&&iframe.src===frameURL;}
  function trace(stage){host.dataset.gheEvent=stage;host.dataset.gheConnection=connected?'connected':'awaiting-hello';host.dataset.gheFrameConnected=String(Boolean(iframe?.isConnected));host.dataset.gheSrcEqual=String(Boolean(iframe&&iframe.src===frameURL));host.dataset.gheHasSrcdoc=String(Boolean(iframe?.hasAttribute('srcdoc')));host.dataset.gheRequestId=requestId;}
  function post(message){if(connected&&eligibleFrame()){if(message.type==='PING')trace('probe');iframe.contentWindow?.postMessage(message,`chrome-extension://${chrome.runtime.id}`);}}
  function pageSnapshot(){const current=pageContext();return {context:current,pageData:G.collectPageData?.(document,current)||{}};}
  function sendContext(){if(!connected||!eligibleFrame())return;post({source:'ghe-host',type:'CONTEXT',url:context?.url||location.href,title:context?.title||document.title,theme:theme(),pageData:pageSnapshot().pageData});}
  function close(){open=false;clearTimeout(loadingTimer);loadingTimer=null;requestId='';pendingCommands=false;panelStatus.hidden=true;if(iframe)iframe.hidden=true;launcher.setAttribute('aria-expanded','false');launcher.setAttribute('aria-label','Open GitHub Enhancer');launcher.focus();trace('closed');}
  function beginLoading(){
    if(!open||!iframe)return;
    clearTimeout(loadingTimer);iframe.hidden=true;panelStatus.hidden=false;panelStatus.dataset.state='loading';statusTitle.textContent='Opening your workspace';statusDetail.textContent='Connecting to GitHub Enhancer…';
    requestId=String(++requestSequence);
    loadingTimer=setTimeout(()=>{
      loadingTimer=null;if(!open)return;requestId='';panelStatus.dataset.state='error';statusTitle.textContent='Panel could not load.';statusDetail.textContent='Reload this GitHub page or open GitHub Enhancer from the Chrome toolbar.';trace('timeout');
    },8000);
    post({source:'ghe-host',type:'PING',requestId});
  }
  function show(commands=false){if(!settings?.enabled)return;let panelURL;try{if(!chrome.runtime.id)throw new Error('Stale extension context');panelURL=chrome.runtime.getURL('src/panel/panel.html');}catch{open=true;connected=false;requestId='';clearTimeout(loadingTimer);loadingTimer=null;if(iframe)iframe.hidden=true;panelStatus.hidden=false;panelStatus.dataset.state='error';statusTitle.textContent='Reload this GitHub page';statusDetail.textContent='GitHub Enhancer was updated. Reload the page to connect to the new version.';launcher.setAttribute('aria-expanded','true');launcher.setAttribute('aria-label','Close GitHub Enhancer');return;}open=true;pendingCommands=commands;launcher.setAttribute('aria-expanded','true');launcher.setAttribute('aria-label','Close GitHub Enhancer');trace('open');
    if(!iframe){
      iframe=document.createElement('iframe');iframe.hidden=true;iframe.title='GitHub Enhancer workspace';iframe.setAttribute('allow','clipboard-write');
      const invalidate=event=>{connected=false;requestId='';const reason=event?.type==='load'?'load':event?.[0]?.attributeName||'src-change';host.dataset.gheInvalidatedBy=reason;if(reason==='load')host.dataset.gheFrameLoads=String(Number(host.dataset.gheFrameLoads)+1);trace(reason==='load'?'load':'src-change');host.dataset.gheConnection='disconnected';if(open&&panelStatus.dataset.state!=='error')beginLoading();};
      iframe.addEventListener('load',invalidate);
      const params=new URLSearchParams({url:context?.url||location.href,title:context?.title||document.title,theme:theme()});frameURL=panelURL+'?'+params;iframe.src=frameURL;
      frameObserver=new MutationObserver(invalidate);frameObserver.observe(iframe,{attributes:true,attributeFilter:['src','srcdoc','sandbox']});
      shadow.append(iframe);
    }
    beginLoading();
  }
  launcher.addEventListener('click',()=>open?close():show());
  function update(){timer=null;if(disposed||!settings)return;const reattached=!host.isConnected;if(reattached){connected=false;document.documentElement.append(host);host.dataset.gheInvalidatedBy='reattach';trace('reattach');host.dataset.gheConnection='disconnected';}context=pageContext();host.hidden=!settings.enabled;host.dataset.theme=settings.theme==='auto'?theme():settings.theme;reading.apply(settings,context);const next=JSON.stringify([context?.url,context?.title,theme()]);if(next!==lastContext){G.resetReviewTools?.(document);lastContext=next;sendContext();}if(!settings.enabled){G.resetReviewTools?.(document);if(open)close();}else if(reattached&&open)beginLoading();}
  function schedule(){if(!timer)timer=setTimeout(update,40);}
  const observer=new MutationObserver(records=>{if(records.some(record=>!host.contains(record.target)&&(record.type==='attributes'||![...record.addedNodes,...record.removedNodes].every(n=>n.nodeType===1&&n.hasAttribute?.('data-ghe-date')))))schedule();});
  observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['datetime','data-color-mode','data-dark-theme','data-light-theme']});
  for(const event of ['turbo:load','turbo:render','pjax:end'])document.addEventListener(event,schedule);
  for(const event of ['popstate','hashchange','pageshow'])window.addEventListener(event,schedule);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule();});
  window.addEventListener('keydown',event=>{
    if(settings?.enabled&&settings.shortcut&&event.altKey&&event.shiftKey&&!event.ctrlKey&&!event.metaKey&&event.code==='KeyK'){event.preventDefault();show(true);}
    else if(event.key==='Escape'&&open){close();}
  });
  window.addEventListener('message',event=>{
    if(event.data?.source==='ghe-panel'&&['HELLO','READY','CLOSE'].includes(event.data.type)){host.dataset.gheLastReceived=event.data.type;host.dataset.gheRejected=!eligibleFrame()?'eligible':event.source!==iframe.contentWindow?'source':event.origin!==`chrome-extension://${chrome.runtime.id}`?'origin':event.data.type==='READY'&&event.data.requestId!==requestId?'request':'';}
    if(!eligibleFrame()||event.source!==iframe.contentWindow||event.origin!==`chrome-extension://${chrome.runtime.id}`||event.data?.source!=='ghe-panel')return;
    if(event.data.type==='HELLO'){connected=true;trace('hello');if(open&&requestId)post({source:'ghe-host',type:'PING',requestId});}
    else if(event.data.type==='REQUEST_CONTEXT')sendContext();
    else if(event.data.type==='PAGE_ACTION'&&connected){const ok=G.applyPageAction?.(document,event.data.action)||false;post({source:'ghe-host',type:'ACTION_RESULT',requestId:event.data.requestId,ok});}
    else if(event.data.type==='CLOSE')close();else if(event.data.type==='READY'&&connected&&open&&requestId&&event.data.requestId===requestId){clearTimeout(loadingTimer);loadingTimer=null;requestId='';panelStatus.hidden=true;panelStatus.dataset.state='ready';iframe.hidden=false;sendContext();if(pendingCommands){post({source:'ghe-host',type:'COMMANDS'});pendingCommands=false;}iframe.focus();trace('ready');}
  });
  let generation=0;
  async function load(){const current=++generation;try{const response=await chrome.runtime.sendMessage({type:'GET_STATE'});if(response?.ok&&current===generation){settings=response.state.settings;update();}}catch{if(iframe)close();host.hidden=true;reading.destroy();}}
  chrome.storage.onChanged.addListener((_changes,area)=>{if(area==='local')load();});
  chrome.runtime.onMessage.addListener((message,sender,respond)=>{if(sender.id&&sender.id!==chrome.runtime.id)return;if(message.type==='GET_CONTEXT')respond(pageSnapshot());else if(message.type==='PAGE_ACTION')respond({ok:settings?.enabled&&(G.applyPageAction?.(document,message.action)||false)});});
  window.addEventListener('pagehide',event=>{if(!event.persisted){disposed=true;G.resetReviewTools?.(document);observer.disconnect();frameObserver?.disconnect();clearTimeout(timer);clearTimeout(loadingTimer);}});
  document.documentElement.append(host);load();
})();
