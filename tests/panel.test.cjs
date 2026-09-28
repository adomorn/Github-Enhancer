const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const {JSDOM}=require('jsdom');
test('panel acknowledges only parent probes after the workspace is ready',async()=>{
 const dom=new JSDOM('<main id="app"></main>',{url:'https://extension.test/?url=https://github.com/owner/repo',runScripts:'outside-only'});const w=dom.window;const messages=[];let finish;
 const ready=new Promise(r=>finish=r);w.postMessage=(message,origin)=>messages.push({message,origin});
 w.GHE={parseContext:()=>({}),draftOptions:{},mountWorkbench:()=>({ready,getState:()=>({settings:{theme:'auto'}}),setContext:()=>{},hasDrafts:()=>false})};w.chrome={storage:{onChanged:{addListener:()=>{}}}};
 w.eval(fs.readFileSync('src/panel/panel.js','utf8'));
 const ping=(origin,source,id)=>w.dispatchEvent(new w.MessageEvent('message',{origin,source,data:{source:'ghe-host',type:'PING',requestId:id}}));
 ping('https://evil.test',w,'bad');ping('https://github.com',null,'wrong-source');ping('https://github.com',w,'probe-1');await Promise.resolve();assert.equal(messages.length,0);
 finish();await new Promise(r=>setTimeout(r,0));assert.deepEqual(JSON.parse(JSON.stringify(messages.filter(entry=>entry.message.type==='READY'))),[{message:{source:'ghe-panel',type:'READY',requestId:'probe-1'},origin:'https://github.com'}]);dom.window.close();
});

test('panel announces its extension document only on a task after window load',async()=>{
 const dom=new JSDOM('<main id="app"></main>',{url:'https://extension.test/',runScripts:'outside-only'});const w=dom.window;const messages=[],pending=[];
 w.postMessage=(message,origin)=>messages.push({message,origin});w.setTimeout=fn=>pending.push(fn);
 w.GHE={parseContext:()=>({}),draftOptions:{},mountWorkbench:()=>({ready:Promise.resolve(),getState:()=>({settings:{theme:'auto'}}),setContext:()=>{},hasDrafts:()=>false})};w.chrome={storage:{onChanged:{addListener:()=>{}}}};
 w.eval(fs.readFileSync('src/panel/panel.js','utf8'));assert.equal(messages.length,0);assert.equal(pending.length,0);
 w.dispatchEvent(new w.Event('load'));assert.equal(messages.length,0,'HELLO must not race the containing iframe load event');assert.equal(pending.length,1);pending.shift()();
 assert.deepEqual(JSON.parse(JSON.stringify(messages)),[{message:{source:'ghe-panel',type:'HELLO'},origin:'https://github.com'}]);await new Promise(resolve=>setImmediate(resolve));dom.window.close();
});

for(const surface of ['panel','popup'])test(`${surface} allows recovered drafts and guards only unprotected recovery writes`,async()=>{
 const dom=new JSDOM('<main id="app"></main>',{url:'https://extension.test/',runScripts:'outside-only'}),w=dom.window;let unsafe=false;
 w.postMessage=()=>{};w.GHE={parseContext:()=>null,draftOptions:{},hasUnprotectedDrafts:()=>unsafe,mountWorkbench:()=>({ready:Promise.resolve(),getState:()=>({settings:{theme:'auto'}}),hasDrafts:()=>true})};
 w.chrome={tabs:{query:async()=>[]},storage:{onChanged:{addListener:()=>{}}}};w.eval(fs.readFileSync(`src/${surface}/${surface}.js`,'utf8'));await new Promise(r=>setImmediate(r));
 const safe=new w.Event('beforeunload',{cancelable:true});w.dispatchEvent(safe);assert.equal(safe.defaultPrevented,false,'recovered drafts must not prompt');
 unsafe=true;const pending=new w.Event('beforeunload',{cancelable:true});w.dispatchEvent(pending);assert.equal(pending.defaultPrevented,true);
 unsafe=false;const written=new w.Event('beforeunload',{cancelable:true});w.dispatchEvent(written);assert.equal(written.defaultPrevented,false);dom.window.close();
});
