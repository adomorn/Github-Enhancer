(() => {
  async function request(message) {
    let response;
    try { response = await chrome.runtime.sendMessage(message); }
    catch { throw new Error('Extension connection lost. Reload this page and try again.'); }
    if (response?.ok === false && typeof response.error === 'string' && response.error.trim()) throw new Error(response.error);
    if (response?.ok !== true || !response.state || typeof response.state !== 'object' || Array.isArray(response.state)) {
      throw new Error('Extension did not respond. Reload GitHub Enhancer in chrome://extensions, then reload this GitHub page.');
    }
    return response.state;
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const input=document.createElement('textarea');input.value=text;input.style.position='fixed';input.style.opacity='0';document.body.append(input);input.select();
      const ok=document.execCommand('copy');input.remove();if(!ok)throw new Error('Clipboard unavailable');
    }
  }
  const prefix='ghe:draft:';
  // All extension surfaces share this origin-wide lock, including popup and panel.
  const withDraftLock=operation=>navigator.locks.request('ghe-drafts',operation);
  // Recovery copies are already safe to leave behind. Warn only while the
  // latest edit in this surface has not reached session storage successfully.
  const unprotectedDrafts=new Map();let draftVersion=0;
  const hasUnprotectedDrafts=()=>unprotectedDrafts.size>0;
  function saveRecovery(key,value){
    const write={version:++draftVersion,value};unprotectedDrafts.set(key,write);
    return (async()=>{
      await withDraftLock(()=>chrome.storage.session.set({[key]:value}));
      if(unprotectedDrafts.get(key)===write)unprotectedDrafts.delete(key);
    })();
  }
  function deleteRecovery(key,expected){
    const write=unprotectedDrafts.get(key);
    return withDraftLock(async()=>{
      const data=await chrome.storage.session.get(key);
      if(data[key]===expected)await chrome.storage.session.remove(key);
      // Saving permanently or explicitly discarding an edit also makes it safe
      // to leave. A newer queued edit must retain its own protection.
      if(write?.value===expected&&unprotectedDrafts.get(key)===write)unprotectedDrafts.delete(key);
    });
  }
  function toolPrefix(kind){if(!['basket','review','workspaces','composer'].includes(kind))throw new Error('Unknown draft kind');return 'ghe:tool-draft:'+kind+':';}
  function toolKey(kind,key){if(typeof key!=='string'||key.length>3000)throw new Error('Invalid draft key');return toolPrefix(kind)+encodeURIComponent(key);}
  function draftJSON(value){if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid draft');const text=JSON.stringify(Object.fromEntries(Object.keys(value).sort().map(key=>[key,value[key]])));if(text.length>22000)throw new Error('Draft is too large');return text;}
  const draftOptions={
    loadToolDrafts:kind=>withDraftLock(async()=>{const prefix=toolPrefix(kind),data=await chrome.storage.session.get(null),result=[];for(const [key,value] of Object.entries(data)){if(!key.startsWith(prefix)||typeof value!=='string'||value.length>22000)continue;try{const parsed=JSON.parse(value);draftJSON(parsed);result.push([decodeURIComponent(key.slice(prefix.length)),parsed]);}catch{}}return result;}),
    saveToolDraft:(kind,key,value)=>{const id=toolKey(kind,key);let text;try{text=draftJSON(value);}catch(error){unprotectedDrafts.set(id,{version:++draftVersion,value:undefined});throw error;}return saveRecovery(id,text);},
    deleteToolDraft:(kind,key,expected)=>{const id=toolKey(kind,key),text=draftJSON(expected);return deleteRecovery(id,text);},
    loadDrafts:()=>withDraftLock(async()=>{const data=await chrome.storage.session.get(null);return Object.entries(data).filter(([key,value])=>key.startsWith(prefix)&&typeof value==='string'&&value.length<=10000).map(([key,value])=>[decodeURIComponent(key.slice(prefix.length)),value]);}),
    saveDraft:(url,note)=>saveRecovery(prefix+encodeURIComponent(url),note),
    deleteDraft:(url,expectedNote)=>deleteRecovery(prefix+encodeURIComponent(url),expectedNote)
  };
  async function openPages(urls){for(const value of urls.slice(0,10)){const context=globalThis.GHE.parseContext(value);if(!context)throw new Error('Unsupported workspace URL');await chrome.tabs.create({url:context.url,active:false});}}
  Object.assign(globalThis.GHE, {request,copy,draftOptions,openPages,hasUnprotectedDrafts});
})();
