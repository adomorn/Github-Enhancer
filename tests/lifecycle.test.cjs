const {test}=require('node:test');const assert=require('node:assert/strict');const {JSDOM}=require('jsdom');const fs=require('node:fs');
const flush=()=>new Promise(r=>setTimeout(r,70));
function setup(){
  const dom=new JSDOM('<!doctype html><html data-color-mode="dark"><body><main class="repository-content"><relative-time datetime="2024-01-01T00:00:00Z">last year</relative-time></main></body></html>',{url:'https://github.com/owner/repo',runScripts:'outside-only',pretendToBeVisual:true});const win=dom.window;
  const listeners=[];const readingCalls=[];let settings={enabled:true,exactDates:true,theme:'auto',shortcut:true};
  win.chrome={runtime:{id:'test',getURL:p=>`chrome-extension://test/${p}`,sendMessage:async()=>({ok:true,state:{settings,items:[]}}),onMessage:{addListener:()=>{}}},storage:{onChanged:{addListener:f=>listeners.push(f)}}};
  win.GHE={parseContext:(url,title)=>({url,repo:new URL(url).pathname.split('/').slice(1,3).join('/'),type:'repository',title}),createReadingEnhancer:()=>({apply:(...args)=>readingCalls.push(args),destroy:()=>{}})};
  const loadingTimers=new Map();let nextTimer=100000;const nativeTimeout=win.setTimeout.bind(win),nativeClear=win.clearTimeout.bind(win);
  win.setTimeout=(fn,delay,...args)=>{if(delay===8000){const id=nextTimer++;loadingTimers.set(id,()=>fn(...args));return id;}return nativeTimeout(fn,delay,...args);};
  win.clearTimeout=id=>{loadingTimers.delete(id);nativeClear(id);};
  win.eval(fs.readFileSync('src/content/main.js','utf8'));return{dom,win,listeners,readingCalls,loadingTimers,setSettings:s=>settings={...settings,...s}};
}
test('runtime mounts only one launcher, opens isolated panel and follows SPA context',async()=>{
 const x=setup();await flush();assert.equal(x.win.document.querySelectorAll('[data-ghe-host]').length,1);
 const host=x.win.document.querySelector('[data-ghe-host]');const root=host.shadowRoot;assert.ok(root.querySelector('button'));
 root.querySelector('button').click();const iframe=root.querySelector('iframe');assert.ok(iframe);assert.equal(iframe.title,'GitHub Enhancer workspace');
 assert.equal(new URL(iframe.src).searchParams.get('url'),'https://github.com/owner/repo');
 x.win.history.pushState({},'', '/owner/second');x.win.document.body.append(x.win.document.createElement('div'));await flush();
 assert.equal(x.win.document.querySelectorAll('[data-ghe-host]').length,1);
 x.win.eval(fs.readFileSync('src/content/main.js','utf8'));await flush();assert.equal(x.win.document.querySelectorAll('[data-ghe-host]').length,1);x.dom.window.close();
});
test('disabling hides UI and re-enabling does not duplicate it',async()=>{
 const x=setup();await flush();x.setSettings({enabled:false});x.listeners[0]({},'local');await flush();
 assert.equal(x.win.document.querySelector('[data-ghe-host]').hidden,true);
 x.setSettings({enabled:true});x.listeners[0]({},'local');await flush();assert.equal(x.win.document.querySelector('[data-ghe-host]').hidden,false);assert.equal(x.win.document.querySelectorAll('[data-ghe-host]').length,1);x.dom.window.close();
});

test('datetime-only mutations refresh reading enhancements',async()=>{
 const x=setup();await flush();const count=x.readingCalls.length;
 x.win.document.querySelector('relative-time').setAttribute('datetime','2025-02-01T00:00:00Z');await flush();
 assert.ok(x.readingCalls.length>count,'attribute changes must schedule an update');x.dom.window.close();
});

test('panel stays hidden until a matching readiness reply from its extension frame',async()=>{
 const x=setup();await flush();const root=x.win.document.querySelector('[data-ghe-host]').shadowRoot;root.querySelector('button').click();const frame=root.querySelector('iframe');
 assert.equal(frame.hidden,true);assert.equal(root.querySelector('[data-ghe-panel-status]')?.dataset.state,'loading');
 // jsdom does not create browsing contexts for frames inside a shadow root.
 const sent=[];Object.defineProperty(frame,'contentWindow',{value:{postMessage:message=>sent.push(message)}});frame.dispatchEvent(new x.win.Event('load'));
 assert.equal(sent.length,0,'load alone does not prove the extension document is the recipient');
 x.win.dispatchEvent(new x.win.MessageEvent('message',{origin:'chrome-extension://test',source:frame.contentWindow,data:{source:'ghe-panel',type:'HELLO'}}));
 const ping=sent.find(message=>message.type==='PING');assert.ok(ping?.requestId);
 function ready(origin,source,requestId){x.win.dispatchEvent(new x.win.MessageEvent('message',{origin,source,data:{source:'ghe-panel',type:'READY',requestId}}));}
 ready('https://github.com',frame.contentWindow,ping.requestId);assert.equal(frame.hidden,true);
 ready('chrome-extension://test',x.win,ping.requestId);assert.equal(frame.hidden,true);
 ready('chrome-extension://test',frame.contentWindow,'old-request');assert.equal(frame.hidden,true);
 ready('chrome-extension://test',frame.contentWindow,ping.requestId);assert.equal(frame.hidden,false);assert.equal(root.querySelector('[data-ghe-panel-status]').hidden,true);assert.equal(x.loadingTimers.size,0);
 root.querySelector('button').click();root.querySelector('button').click();assert.equal(frame.hidden,true,'reopening must verify the current document is ready');x.dom.window.close();
});

test('host never messages initial about blank or a frame invalidated by srcdoc navigation',async()=>{
 const x=setup();await flush();const root=x.win.document.querySelector('[data-ghe-host]').shadowRoot;
 const create=x.win.document.createElement.bind(x.win.document);let frame,allowed=false,sent=0;
 x.win.document.createElement=(tag,...args)=>{const el=create(tag,...args);if(tag==='iframe'){frame=el;Object.defineProperty(el,'contentWindow',{value:{postMessage(){assert.equal(allowed,true,'message sent before authenticated HELLO');sent++;}}});}return el;};
 root.querySelector('button').click();assert.equal(sent,0);
 x.win.history.pushState({},'', '/owner/changed');x.win.document.body.append(create('div'));await flush();assert.equal(sent,0,'context updates wait for HELLO too');
 frame.dispatchEvent(new x.win.Event('load'));assert.equal(sent,0);
 allowed=true;x.win.dispatchEvent(new x.win.MessageEvent('message',{origin:'chrome-extension://test',source:frame.contentWindow,data:{source:'ghe-panel',type:'HELLO'}}));assert.equal(sent,1);
 allowed=false;frame.setAttribute('srcdoc','');frame.dispatchEvent(new x.win.Event('load'));await flush();
 const before=sent;x.win.history.pushState({},'', '/owner/again');x.win.document.body.append(create('div'));await flush();assert.equal(sent,before);assert.equal(frame.getAttribute('srcdoc'),'');x.dom.window.close();
});

test('blocked panel loads have a bounded error state and preserve externally set srcdoc',async()=>{
 const x=setup();await flush();const root=x.win.document.querySelector('[data-ghe-host]').shadowRoot;root.querySelector('button').click();const frame=root.querySelector('iframe');frame.setAttribute('srcdoc','');const src=frame.src;
 frame.dispatchEvent(new x.win.Event('load'));
 assert.equal(x.loadingTimers.size,1);
 for(const run of [...x.loadingTimers.values()])run();
 const status=root.querySelector('[data-ghe-panel-status]');assert.equal(status?.dataset.state,'error');assert.match(status.textContent,/Panel could not load/);assert.match(status.textContent,/Chrome toolbar/);
 assert.equal(frame.hidden,true);assert.equal(frame.getAttribute('srcdoc'),'');assert.equal(frame.src,src);x.dom.window.close();
});

test('reloading the extension leaves a clear page-reload action instead of an uncaught stale-context error',async()=>{
 const x=setup();await flush();const errors=[];x.win.addEventListener('error',e=>{errors.push(e.error);e.preventDefault();});
 x.win.chrome.runtime.getURL=()=>{throw new Error('Extension context invalidated.');};
 const root=x.win.document.querySelector('[data-ghe-host]').shadowRoot;root.querySelector('button').click();
 assert.equal(errors.length,0);assert.equal(root.querySelector('[data-ghe-panel-status]').hidden,false);assert.match(root.querySelector('[data-ghe-panel-status]').textContent,/Reload this GitHub page/);assert.equal(root.querySelector('iframe'),null);x.dom.window.close();
});
