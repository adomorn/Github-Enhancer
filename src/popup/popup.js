(async()=>{
  const G=globalThis.GHE;
  let context=null,pageData={},tabId=null;
  async function refreshPage(){if(tabId===null)throw new Error('Open a GitHub repository first.');try{return await chrome.tabs.sendMessage(tabId,{type:'GET_CONTEXT'});}catch{throw new Error('Reload the GitHub page to enable page tools.');}}
  try{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});context=G.parseContext(tab?.url,tab?.title);tabId=tab?.id??null;if(context){const data=await refreshPage();context=data.context||context;pageData=data.pageData||{};}}
  catch{/* Saved pages remain usable when there is no supported active tab. */}
  const pageAction=async action=>{const result=await chrome.tabs.sendMessage(tabId,{type:'PAGE_ACTION',action});if(!result?.ok)throw new Error('This part of the page is no longer loaded. Refresh page data.');return true;};
  const ui=G.mountWorkbench(document.querySelector('#app'),{...G.draftOptions,request:G.request,context,pageData,pageAction,refreshPage,openPages:G.openPages,copy:G.copy,openOptions:()=>chrome.runtime.openOptionsPage()});
  chrome.storage.onChanged.addListener((_changes,area)=>{if(area==='local')ui.refresh();});
  window.addEventListener('beforeunload',event=>{if(G.hasUnprotectedDrafts()){event.preventDefault();event.returnValue='';}});
})();
