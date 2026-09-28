/* Read only the source GitHub has already rendered. Never fetch private code. */
(() => {
  const G=globalThis.GHE=globalThis.GHE||{};
  const languages={js:'javascript',jsx:'jsx',ts:'typescript',tsx:'tsx',py:'python',rb:'ruby',go:'go',rs:'rust',java:'java',kt:'kotlin',swift:'swift',cs:'csharp',cpp:'cpp',c:'c',h:'c',html:'html',css:'css',scss:'scss',json:'json',yaml:'yaml',yml:'yaml',md:'markdown',sh:'bash',sql:'sql',vue:'vue',svelte:'svelte',toml:'toml',xml:'xml'};
  function sourcePage(document){return /^\/[^/]+\/[^/]+\/blob\//.test(document.location.pathname);}
  function collectCode(document){
    if(!sourcePage(document))return null;
    const area=document.querySelector('#read-only-cursor-text-area');
    const legacy=[...document.querySelectorAll('td.blob-code')];
    if(!area&&!legacy.length)return null;
    const full=area?area.value:legacy.map(n=>n.textContent).join('\n');
    const text=full.slice(0,300000),lines=text.split('\n'),truncated=full.length>text.length;
    const completeLineCount=truncated?lines.length-1:lines.length;
    const crumbs=[...document.querySelectorAll('#repos-header-breadcrumb--wide a')].slice(1).map(a=>a.textContent.trim());
    const filename=document.querySelector('#file-name-id-wide')?.textContent.trim()||decodeURIComponent(document.location.pathname.split('/').pop());
    const path=[...crumbs,filename].join('/');
    const match=document.location.hash.match(/^#L(\d+)(?:-L?(\d+))?$/);
    let start=match?Number(match[1]):1,end=match?Number(match[2]||match[1]):Math.max(1,Math.min(12,completeLineCount));
    if(!match&&area&&area.selectionEnd>area.selectionStart){start=full.slice(0,area.selectionStart).split('\n').length;end=full.slice(0,area.selectionEnd).replace(/\n$/,'').split('\n').length;}
    const validSelection=Number.isSafeInteger(start)&&Number.isSafeInteger(end)&&start>=1&&end>=start&&end<=completeLineCount;
    const selectionError=validSelection?null:(completeLineCount?`Selected lines are not fully available in this loaded snapshot. Choose lines 1 to ${completeLineCount.toLocaleString()} or use GitHub’s native source view for this range.`:'No complete source lines are available in this loaded snapshot. Use GitHub’s native source view.');
    return {path,text,language:languages[filename.split('.').pop().toLowerCase()]||'',lineCount:completeLineCount,bytes:new TextEncoder().encode(full).length,truncated,selection:{start,end},selectionError,url:document.location.href.split('#')[0]};
  }
  function codeAction(document,action){
    if(!sourcePage(document)||action.type!=='code-jump'||!Number.isInteger(action.line)||action.line<1||action.line>1000000)return false;
    const target=document.querySelector(`[data-line-number="${action.line}"],#L${action.line}`);if(!target)return false;
    document.location.hash=`L${action.line}`;target.scrollIntoView?.({block:'center',behavior:'auto'});return true;
  }
  Object.assign(G,{collectCode,codeAction});
})();
