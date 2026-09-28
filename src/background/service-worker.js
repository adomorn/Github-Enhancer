/* No network access: this worker only owns local workspace mutations. */
importScripts('../shared/model.js','store.js');

const workspaceStore = GHE.createStore(chrome.storage.local,chrome.storage.sync);
const allowedMessages = new Set(GHE.MESSAGE_TYPES);

chrome.runtime.onInstalled.addListener(() => {
  workspaceStore.dispatch({type:'GET_STATE'}).catch(error=>console.error('Workspace initialization failed:',error.message));
});

chrome.runtime.onMessage.addListener((message,sender,sendResponse) => {
  if (sender.id !== chrome.runtime.id || !allowedMessages.has(message?.type)) return false;
  workspaceStore.dispatch(message).then(
    state=>sendResponse({ok:true,state}),
    error=>sendResponse({ok:false,error:error.message || 'The workspace could not be saved.'})
  );
  return true;
});
