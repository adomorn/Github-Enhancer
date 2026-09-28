/* Shared, dependency-free data rules for extension pages and the worker. */
(() => {
  'use strict';
  const DEFAULT_SETTINGS = Object.freeze({enabled:true, exactDates:true, wide:false, focus:false, theme:'auto', locale:'auto', timeZone:'local', shortcut:true});
  const LIMITS = Object.freeze({items:500, note:10000, title:300, importBytes:32*1024*1024,snippets:100,code:20000,workspaces:40,workspaceTitle:100,reviews:50,reviewFiles:500,path:1000,templates:40,templateTitle:100,templateBody:10000});
  const reserved = new Set(['about','account','apps','blog','business','codespaces','collections','contact','copilot','customer-stories','dashboard','discussions','enterprise','events','explore','features','gist','issues','join','login','logout','marketplace','new','notifications','organizations','orgs','password_reset','pricing','pulls','readme','resources','search','security','sessions','settings','site','sponsors','stars','topics','trending','users']);
  const repositorySections = new Set(['issues','pulls','discussions','actions','projects','releases','tags','branches','wiki','security','pulse','network','graphs','settings','commits','compare']);
  const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const cleanTitle = value => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g,' ').trim().slice(0,LIMITS.title) : '';

  function parseContext(value, title = '') {
    if (typeof value !== 'string' || value.length > 4096 || /[\u0000-\u0020\u007f\\]/.test(value)) return null;
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.port || url.username || url.password) return null;
      const parts = url.pathname.replace(/\/+$/, '').split('/').slice(1);
      if (parts.length < 2 || parts.some(part => !part)) return null;
      const decoded = parts.map(decodeURIComponent);
      if (decoded.some(part => /[\\\u0000-\u001f\u007f]/.test(part)) || decoded.slice(0,2).some(part=>part.includes('/'))) return null;
      const owner = decoded[0].toLowerCase();
      const name = decoded[1].toLowerCase();
      if (reserved.has(owner) || !/^[a-z0-9][a-z0-9-]{0,38}$/.test(owner) || !/^[a-z0-9._-]{1,100}$/.test(name) || /^\.{1,2}$/.test(name)) return null;
      const section = decoded[2];
      let type = 'repository';
      if (section === 'blob' || section === 'tree') {
        if (!decoded[3] || (section === 'blob' && !decoded[4])) return null;
        type = 'code';
      } else if (section === 'issues' && decoded[3]) {
        if (!/^\d+$/.test(decoded[3]) || decoded.length !== 4) return null;
        type = 'issue';
      } else if (section === 'pull' && decoded[3]) {
        const commitChanges = decoded.length === 6 && decoded[4] === 'changes' && /^[a-f0-9]{40}$/i.test(decoded[5]);
        if (!/^\d+$/.test(decoded[3]) || (decoded.length > 5 && !commitChanges) || (decoded[4] && !['files','changes','commits','checks'].includes(decoded[4]))) return null;
        type = 'pull';
      } else if (section === 'discussions' && decoded[3]) {
        if (!/^\d+$/.test(decoded[3]) || decoded.length !== 4) return null;
        type = 'discussion';
      } else if (section === 'commit' && decoded[3]) {
        if (!/^[a-f0-9]{6,40}$/i.test(decoded[3]) || decoded.length !== 4) return null;
        type = 'commit';
      } else if (section && !repositorySections.has(section)) return null;
      url.pathname = '/' + [owner,name,...parts.slice(2)].join('/');
      const ref = type === 'code' ? url.searchParams.get('ref') : null;
      url.search = '';
      if (ref) url.searchParams.set('ref',ref);
      if (url.hash === '#') url.hash = '';
      return {url:url.href, repo:`${owner}/${name}`, owner, name, type, title:cleanTitle(title) || `${owner}/${name}`};
    } catch { return null; }
  }

  function normalizeSettings(input, legacy) {
    const result = {...DEFAULT_SETTINGS};
    if (isObject(legacy)) {
      if (typeof legacy.enhanceDateTimes === 'boolean') result.exactDates = legacy.enhanceDateTimes;
      if (['auto','en-US','tr-TR'].includes(legacy.locale)) result.locale = legacy.locale;
    }
    if (!isObject(input)) return result;
    for (const key of ['enabled','exactDates','wide','focus','shortcut']) if (typeof input[key] === 'boolean') result[key] = input[key];
    for (const [key, values] of Object.entries({theme:['auto','light','dark'],locale:['auto','en-US','tr-TR'],timeZone:['local','UTC']})) {
      if (values.includes(input[key])) result[key] = input[key];
    }
    return result;
  }

  function validateSettingsPatch(input) {
    if (!isObject(input)) throw new Error('Settings must be an object.');
    const normalized = normalizeSettings(input);
    for (const [key,value] of Object.entries(input)) {
      if (!Object.hasOwn(DEFAULT_SETTINGS,key) || normalized[key] !== value) throw new Error(`Invalid setting: ${key}.`);
    }
    return {...input};
  }

  function validateItem(input) {
    if (!isObject(input)) throw new Error('Each saved item must be an object.');
    if (typeof input.title !== 'string' || input.title.length > LIMITS.title) throw new Error(`Titles must be at most ${LIMITS.title} characters.`);
    if (typeof input.note !== 'string' || input.note.length > LIMITS.note) throw new Error(`Notes must be at most ${LIMITS.note} characters.`);
    const context = parseContext(input.url,input.title);
    if (!context) throw new Error('Saved items must use a supported GitHub URL.');
    for (const key of ['createdAt','updatedAt']) {
      if (!Number.isSafeInteger(input[key]) || input[key] < 0 || input[key] > Date.now()+86400000) throw new Error('Saved item timestamps are invalid.');
    }
    if (input.updatedAt < input.createdAt) throw new Error('A saved item cannot be updated before it was created.');
    return {...context,note:input.note,createdAt:input.createdAt,updatedAt:input.updatedAt};
  }

  function boundedText(value, label, max, allowEmpty = true) {
    if (typeof value !== 'string' || value.length > max || (!allowEmpty && !value.trim())) throw new Error(`${label} must be ${allowEmpty?'at most':'between 1 and'} ${max} characters.`);
    return value;
  }
  function validateId(value) {
    if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(value)) throw new Error('Invalid record ID.');
    return value;
  }
  function validateRevision(value) {
    if (value === null) return null;
    if (typeof value !== 'string' || !/^[a-f0-9]{40}$/i.test(value)) throw new Error('Revision must be a full commit SHA or explicitly unknown.');
    return value.toLowerCase();
  }
  function validatePath(value, allowEmpty = false) {
    boundedText(value,'File path',LIMITS.path,allowEmpty);
    if (/[\u0000-\u001f\u007f]/.test(value) || value.startsWith('/') || value.split('/').some(part=>part==='..')) throw new Error('Invalid file path.');
    return value;
  }
  function validateTimestamp(value) {
    if (!Number.isSafeInteger(value) || value < 0 || value > Date.now()+86400000) throw new Error('Record timestamps are invalid.');
    return value;
  }
  function recordTimes(input) {
    const createdAt=validateTimestamp(input.createdAt),updatedAt=validateTimestamp(input.updatedAt);
    if(updatedAt<createdAt)throw new Error('A record cannot be updated before it was created.');
    return {createdAt,updatedAt};
  }
  function validateSnippet(input) {
    if(!isObject(input))throw new Error('A snippet must be an object.');
    const context=parseContext(input.url,input.title);
    if(!context||context.type!=='code'||!/^\/[^/]+\/[^/]+\/blob\//.test(new URL(context.url).pathname))throw new Error('Snippets must cite a GitHub code file URL.');
    const revision=new URL(context.url).pathname.match(/^\/[^/]+\/[^/]+\/blob\/([a-f0-9]{40})\//i)?.[1]?.toLowerCase()||null;
    const claimedRevision=validateRevision(input.revision);
    if(claimedRevision!==null&&claimedRevision!==revision)throw new Error('Snippet revision must match its source URL.');
    boundedText(input.title,'Snippet title',LIMITS.title);
    const language=boundedText(input.language,'Language',40);
    if(!/^[a-zA-Z0-9_+-]*$/.test(language))throw new Error('Invalid code language.');
    const start=input.lineStart,end=input.lineEnd;
    if (!(Number.isSafeInteger(start)&&start>=1&&Number.isSafeInteger(end)&&end>=start&&end<=10000000)) throw new Error('Invalid snippet line range.');
    return {id:validateId(input.id),url:context.url,repo:context.repo,title:cleanTitle(input.title)||cleanTitle(input.path)||context.title,path:validatePath(input.path,true),language,lineStart:start,lineEnd:end,code:boundedText(input.code,'Code',LIMITS.code,false),note:boundedText(input.note,'Note',LIMITS.note),revision,...recordTimes(input)};
  }
  function validateWorkspace(input) {
    if(!isObject(input))throw new Error('A workspace must be an object.');
    boundedText(input.title,'Workspace title',LIMITS.workspaceTitle,false);
    if(!Array.isArray(input.itemUrls)||input.itemUrls.length>LIMITS.items||!Array.isArray(input.snippetIds)||input.snippetIds.length>LIMITS.snippets)throw new Error('Workspace references exceed the allowed limit.');
    const itemUrls=input.itemUrls.map(url=>{const context=parseContext(url);if(!context)throw new Error('Workspace links must use supported GitHub URLs.');return context.url;});
    return {id:validateId(input.id),title:cleanTitle(input.title),note:boundedText(input.note,'Note',LIMITS.note),itemUrls:[...new Set(itemUrls)],snippetIds:[...new Set(input.snippetIds.map(validateId))],...recordTimes(input)};
  }
  function validateTemplate(input) {
    if(!isObject(input))throw new Error('A template must be an object.');
    boundedText(input.title,'Template title',LIMITS.templateTitle,false);
    const title=cleanTitle(input.title);
    if(!title)throw new Error('Template title must not be empty.');
    return {id:validateId(input.id),title,body:boundedText(input.body,'Template body',LIMITS.templateBody,false),...recordTimes(input)};
  }
  function canonicalPrUrl(value) {
    const context=parseContext(value);
    if(context?.type!=='pull')throw new Error('Review sessions require a GitHub pull request URL.');
    const number=new URL(context.url).pathname.split('/')[4];
    return `https://github.com/${context.repo}/pull/${number}`;
  }
  function validateReviewFile(input) {
    if(!isObject(input)||typeof input.reviewed!=='boolean')throw new Error('Invalid review file marker.');
    const updatedAt=validateTimestamp(input.updatedAt),revision=validateRevision(input.reviewedRevision);
    const reviewedAt=input.reviewedAt===null?null:validateTimestamp(input.reviewedAt);
    if((input.reviewed&&reviewedAt===null)||(!input.reviewed&&(reviewedAt!==null||revision!==null))||(reviewedAt!==null&&reviewedAt>updatedAt))throw new Error('Review marker timestamps are invalid.');
    return {path:validatePath(input.path),note:boundedText(input.note,'File note',LIMITS.note),reviewed:input.reviewed,reviewedRevision:revision,reviewedAt,updatedAt};
  }
  function validateReview(input) {
    if(!isObject(input)||!Array.isArray(input.files)||input.files.length>LIMITS.reviewFiles)throw new Error(`A review can contain at most ${LIMITS.reviewFiles} file records.`);
    const prUrl=canonicalPrUrl(input.prUrl),files=input.files.map(validateReviewFile),times=recordTimes(input);
    if(new Set(files.map(file=>file.path)).size!==files.length)throw new Error('A review cannot contain duplicate file paths.');
    if(files.some(file=>file.updatedAt>times.updatedAt))throw new Error('Review file is newer than its session.');
    return {prUrl,repo:parseContext(prUrl).repo,files,lastFile:input.lastFile===null?null:validatePath(input.lastFile),...times};
  }
  function reviewStatus(file,revision) {
    if(!file?.reviewed)return 'unreviewed';
    if(!/^[a-f0-9]{40}$/i.test(revision||'')||!/^[a-f0-9]{40}$/i.test(file.reviewedRevision||''))return 'unverified';
    return revision.toLowerCase()===file.reviewedRevision.toLowerCase()?'verified':'changed';
  }

  function validateImport(text) {
    if (typeof text !== 'string' || new TextEncoder().encode(text).length > LIMITS.importBytes) throw new Error('Choose a JSON backup no larger than 32 MB.');
    let value;
    try { value = JSON.parse(text); } catch { throw new Error('This file is not valid JSON.'); }
    if (!isObject(value) || (value.version !== undefined && ![1,2].includes(value.version)) || !Array.isArray(value.items)) throw new Error('This is not a supported GitHub Enhancer backup.');
    if (value.items.length > LIMITS.items) throw new Error(`A backup can contain at most ${LIMITS.items} items.`);
    const result = {items:value.items.map(validateItem),snippets:[],workspaces:[],reviews:[],templates:[]};
    if(value.version===2){
      for(const [key,validator] of [['snippets',validateSnippet],['workspaces',validateWorkspace],['reviews',validateReview],['templates',validateTemplate]]){
        const records=value[key]??[];
        if(!Array.isArray(records)||records.length>LIMITS[key])throw new Error(`A backup can contain at most ${LIMITS[key]} ${key}.`);
        result[key]=records.map(validator);
      }
    }
    if (value.settings !== undefined) result.settings = validateSettingsPatch(value.settings);
    return result;
  }

  function exportBackup(state) {
    const backup={version:2,items:state.items||[],snippets:state.snippets||[],workspaces:state.workspaces||[],reviews:state.reviews||[],templates:state.templates||[],settings:state.settings};
    const validated=validateImport(JSON.stringify(backup));
    const text=JSON.stringify({version:2,...validated},null,2);
    if(new TextEncoder().encode(text).length>LIMITS.importBytes)throw new Error('This backup exceeds the 32 MB import limit. Export fewer saved records.');
    return text;
  }

  function formatDate(value, input = {}) {
    if (value === null || value === undefined || value === '') return '';
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    const settings = normalizeSettings(input);
    return new Intl.DateTimeFormat(settings.locale === 'auto' ? undefined : settings.locale, {
      year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23',
      ...(settings.timeZone === 'UTC' ? {timeZone:'UTC',timeZoneName:'short'} : {})
    }).format(date);
  }

  function filterItems(items, query = '') {
    const words = String(query).toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    return items.filter(item => {
      const haystack = [item.title,item.repo,item.note,item.type].join(' ').toLocaleLowerCase();
      return words.every(word=>haystack.includes(word));
    }).sort((a,b)=>b.updatedAt-a.updatedAt || a.url?.localeCompare(b.url || '') || 0);
  }

  function markdownLink(context) {
    const parsed = parseContext(context?.url,context?.title);
    if (!parsed) return '';
    const label = parsed.title.replace(/[\\[\]*_`<>]/g, '\\$&');
    const url = parsed.url.replace(/\(/g,'%28').replace(/\)/g,'%29');
    return `[${label}](${url})`;
  }

  globalThis.GHE = {...globalThis.GHE,DEFAULT_SETTINGS,LIMITS,parseContext,normalizeSettings,validateSettingsPatch,validateItem,validateSnippet,validateWorkspace,validateReview,validateTemplate,validateReviewFile,validateId,validateRevision,validatePath,canonicalPrUrl,reviewStatus,validateImport,exportBackup,formatDate,filterItems,markdownLink};
})();
