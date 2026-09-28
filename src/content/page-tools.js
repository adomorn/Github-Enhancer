/* One bounded snapshot per explicit request or page-context change. */
(() => {
 const G=globalThis.GHE;
 G.collectPageData=(document,context)=>({code:G.collectCode?.(document,context)||null,review:G.collectReview?.(document,context)||null,conversation:G.collectConversation?.(document,context)||null});
 G.applyPageAction=(document,action)=>{
  if(!action||typeof action.type!=='string')return false;
  if(action.type==='conversation-jump')return G.conversationAction?.(document,action)||false;
  if(action.type==='code-jump')return G.codeAction?.(document,action)||false;
  if(action.type.startsWith('review-'))return G.reviewAction?.(document,action)||false;
  return false;
 };
})();
