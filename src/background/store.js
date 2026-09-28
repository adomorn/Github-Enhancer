/* Every operation is serialized by the worker; state is read from durable storage. */
(() => {
  'use strict';
  const G = globalThis.GHE;
  const {LIMITS,parseContext,normalizeSettings,validateSettingsPatch,validateItem,validateImport,validateSnippet,validateWorkspace,validateReview,validateTemplate,validateId,validateRevision,validatePath,canonicalPrUrl} = G;
  const STORAGE = Object.freeze({version:'ghe:schemaVersion',settings:'ghe:settings',itemPrefix:'ghe:item:',snippetPrefix:'ghe:snippet:',workspacePrefix:'ghe:workspace:',reviewPrefix:'ghe:review:',templatePrefix:'ghe:template:'});
  const COLLECTIONS = {
    items:{prefix:STORAGE.itemPrefix,id:'url',validate:validateItem},
    snippets:{prefix:STORAGE.snippetPrefix,id:'id',validate:validateSnippet},
    workspaces:{prefix:STORAGE.workspacePrefix,id:'id',validate:validateWorkspace},
    reviews:{prefix:STORAGE.reviewPrefix,id:'prUrl',validate:validateReview},
    templates:{prefix:STORAGE.templatePrefix,id:'id',validate:validateTemplate}
  };
  const MESSAGE_TYPES = Object.freeze(['GET_STATE','SAVE_ITEM','UPDATE_ITEM','REMOVE_ITEM','RESTORE_ITEM','SET_SETTINGS','IMPORT_ITEMS','SAVE_SNIPPET','UPDATE_SNIPPET','REMOVE_SNIPPET','RESTORE_SNIPPET','CREATE_WORKSPACE','UPDATE_WORKSPACE','LINK_WORKSPACE_ITEM','UNLINK_WORKSPACE_ITEM','LINK_WORKSPACE_SNIPPET','UNLINK_WORKSPACE_SNIPPET','REMOVE_WORKSPACE','RESTORE_WORKSPACE','UPDATE_REVIEW_FILE','SET_REVIEW_LAST_FILE','REMOVE_REVIEW','RESTORE_REVIEW','CREATE_TEMPLATE','UPDATE_TEMPLATE','REMOVE_TEMPLATE','RESTORE_TEMPLATE']);
  const keyFor = (collection,id) => COLLECTIONS[collection].prefix + encodeURIComponent(id);
  const timestamp = record => Math.max(Date.now(),(record?.updatedAt ?? -1)+1);
  const sorted = records => records.sort((a,b)=>b.updatedAt-a.updatedAt);

  function createStore(localArea, syncArea) {
    let queue = Promise.resolve();

    async function readState() {
      let data = await localArea.get(null);
      if (data[STORAGE.version] !== 2) {
        if(data[STORAGE.version]!==undefined && data[STORAGE.version]!==1)throw new Error('This workspace was saved by an unsupported extension version.');
        const legacy = data[STORAGE.version]===undefined && syncArea ? (await syncArea.get('github_enhancer_settings')).github_enhancer_settings : undefined;
        const settings = normalizeSettings(data[STORAGE.settings],legacy);
        await localArea.set({[STORAGE.settings]:settings,[STORAGE.version]:2});
        data = {...data,[STORAGE.settings]:settings,[STORAGE.version]:2};
      }
      const state={settings:normalizeSettings(data[STORAGE.settings]),items:[],snippets:[],workspaces:[],reviews:[],templates:[]};
      for (const [key,value] of Object.entries(data)) {
        for(const [name,collection] of Object.entries(COLLECTIONS)) {
          if(!key.startsWith(collection.prefix))continue;
          try {
            const record=collection.validate(value);
            if(key===keyFor(name,record[collection.id]))state[name].push(record);
          } catch { /* Damaged records must not prevent access to the rest of the workspace. */ }
          break;
        }
      }
      for(const name of Object.keys(COLLECTIONS))sorted(state[name]);
      return state;
    }

    function contextFrom(input) {
      const context = parseContext(input?.url,input?.title);
      if (!context) throw new Error('Choose a supported GitHub repository or work item.');
      return context;
    }
    function noteFrom(note) {
      if (typeof note !== 'string' || note.length > LIMITS.note) throw new Error(`Notes must be at most ${LIMITS.note} characters.`);
      return note;
    }
    function assertCapacity(name,records) {
      if (records.length > LIMITS[name]) throw new Error(`Your workspace can contain at most ${LIMITS[name]} ${name}.`);
    }
    function find(state,name,id) {
      const record=state[name].find(record=>record[COLLECTIONS[name].id]===id);
      if(!record)throw new Error('This saved record was not found.');
      return record;
    }
    function patchFrom(input,fields) {
      if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!fields.includes(key)))throw new Error('Invalid record patch field.');
      return {...input};
    }
    async function write(state,name,value) {
      const record=COLLECTIONS[name].validate(value),id=record[COLLECTIONS[name].id];
      if(!state[name].some(item=>item[COLLECTIONS[name].id]===id))assertCapacity(name,[...state[name],record]);
      await localArea.set({[keyFor(name,id)]:record});
    }
    async function restore(state,name,value) {
      const record=COLLECTIONS[name].validate(value);
      if(!state[name].some(item=>item[COLLECTIONS[name].id]===record[COLLECTIONS[name].id]))await write(state,name,record);
    }
    function mergeReview(local,imported) {
      const files=new Map(local.files.map(file=>[file.path,file]));
      for(const file of imported.files)if(!files.has(file.path)||file.updatedAt>files.get(file.path).updatedAt)files.set(file.path,file);
      const latest=imported.updatedAt>local.updatedAt?imported:local;
      return validateReview({...latest,files:[...files.values()],createdAt:Math.min(local.createdAt,imported.createdAt),updatedAt:Math.max(local.updatedAt,imported.updatedAt)});
    }

    async function handle(message) {
      if (!message || !MESSAGE_TYPES.includes(message.type)) throw new Error('Unsupported workspace message.');
      const state = await readState();
      if (message.type === 'GET_STATE') return state;
      switch(message.type) {
        case 'SET_SETTINGS':
          await localArea.set({[STORAGE.settings]:{...state.settings,...validateSettingsPatch(message.patch)}});
          break;
        case 'SAVE_ITEM': {
          const context=contextFrom(message.context),existing=state.items.find(item=>item.url===context.url),now=timestamp(existing);
          await write(state,'items',{...context,note:message.note===undefined?existing?.note||'':noteFrom(message.note),createdAt:existing?.createdAt??now,updatedAt:now});
          break;
        }
        case 'UPDATE_ITEM': {
          const {url}=contextFrom({url:message.url}),existing=find(state,'items',url);
          await write(state,'items',{...existing,note:noteFrom(message.note),updatedAt:timestamp(existing)});
          break;
        }
        case 'REMOVE_ITEM': await localArea.remove(keyFor('items',contextFrom({url:message.url}).url));break;
        case 'RESTORE_ITEM': await restore(state,'items',message.item);break;
        case 'SAVE_SNIPPET': {
          const input=message.snippet;
          if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('A snippet must be an object.');
          const id=input.id===undefined?globalThis.crypto.randomUUID():validateId(input.id);
          if(state.snippets.some(item=>item.id===id))throw new Error('This snippet already exists. Edit its title or note instead.');
          const now=Date.now();
          await write(state,'snippets',{...input,id,title:input.title??'',note:input.note??'',path:input.path??'',language:input.language??'',lineStart:input.lineStart??null,lineEnd:input.lineEnd??null,revision:input.revision??null,createdAt:now,updatedAt:now});
          break;
        }
        case 'UPDATE_SNIPPET': {
          const existing=find(state,'snippets',validateId(message.id));
          await write(state,'snippets',{...existing,...patchFrom(message.patch,['title','note']),updatedAt:timestamp(existing)});
          break;
        }
        case 'REMOVE_SNIPPET': await localArea.remove(keyFor('snippets',validateId(message.id)));break;
        case 'RESTORE_SNIPPET': await restore(state,'snippets',message.snippet);break;
        case 'CREATE_WORKSPACE': {
          const now=Date.now();
          await write(state,'workspaces',{id:globalThis.crypto.randomUUID(),title:message.title,note:message.note??'',itemUrls:[],snippetIds:[],createdAt:now,updatedAt:now});
          break;
        }
        case 'UPDATE_WORKSPACE': {
          const existing=find(state,'workspaces',validateId(message.id));
          await write(state,'workspaces',{...existing,...patchFrom(message.patch,['title','note']),updatedAt:timestamp(existing)});
          break;
        }
        case 'LINK_WORKSPACE_ITEM': case 'UNLINK_WORKSPACE_ITEM': case 'LINK_WORKSPACE_SNIPPET': case 'UNLINK_WORKSPACE_SNIPPET': {
          const workspace=find(state,'workspaces',validateId(message.id)),isItem=message.type.endsWith('_ITEM'),link=message.type.startsWith('LINK_');
          const field=isItem?'itemUrls':'snippetIds',id=isItem?contextFrom({url:message.url}).url:validateId(message.snippetId);
          if(link)find(state,isItem?'items':'snippets',id);
          const references=link?[...new Set([...workspace[field],id])]:workspace[field].filter(value=>value!==id);
          await write(state,'workspaces',{...workspace,[field]:references,updatedAt:timestamp(workspace)});
          break;
        }
        case 'REMOVE_WORKSPACE': await localArea.remove(keyFor('workspaces',validateId(message.id)));break;
        case 'RESTORE_WORKSPACE': await restore(state,'workspaces',message.workspace);break;
        case 'UPDATE_REVIEW_FILE': case 'SET_REVIEW_LAST_FILE': {
          const prUrl=canonicalPrUrl(message.prUrl),path=validatePath(message.path),existing=state.reviews.find(item=>item.prUrl===prUrl),now=timestamp(existing);
          const review=existing||{prUrl,files:[],lastFile:null,createdAt:now,updatedAt:now};
          if(message.type==='SET_REVIEW_LAST_FILE')await write(state,'reviews',{...review,lastFile:path,updatedAt:now});
          else {
            const patch=patchFrom(message.patch,['note','reviewed']),revision=validateRevision(message.revision);
            const current=review.files.find(file=>file.path===path)||{path,note:'',reviewed:false,reviewedRevision:null,reviewedAt:null,updatedAt:now};
            const file={...current,...patch,updatedAt:now};
            if(Object.hasOwn(patch,'reviewed')){if(typeof patch.reviewed!=='boolean')throw new Error('Reviewed must be a boolean.');file.reviewedRevision=patch.reviewed?revision:null;file.reviewedAt=patch.reviewed?now:null;}
            await write(state,'reviews',{...review,files:[...review.files.filter(value=>value.path!==path),file],updatedAt:now});
          }
          break;
        }
        case 'REMOVE_REVIEW': await localArea.remove(keyFor('reviews',canonicalPrUrl(message.prUrl)));break;
        case 'RESTORE_REVIEW': await restore(state,'reviews',message.review);break;
        case 'CREATE_TEMPLATE': {
          const now=Date.now();
          await write(state,'templates',{id:globalThis.crypto.randomUUID(),title:message.title,body:message.body,createdAt:now,updatedAt:now});
          break;
        }
        case 'UPDATE_TEMPLATE': {
          const existing=find(state,'templates',validateId(message.id));
          await write(state,'templates',{...existing,...patchFrom(message.patch,['title','body']),updatedAt:timestamp(existing)});
          break;
        }
        case 'REMOVE_TEMPLATE': await localArea.remove(keyFor('templates',validateId(message.id)));break;
        case 'RESTORE_TEMPLATE': await restore(state,'templates',message.template);break;
        case 'IMPORT_ITEMS': {
          const imported=validateImport(message.text),writes={};
          for(const [name,collection] of Object.entries(COLLECTIONS)){
            const merged=new Map(state[name].map(record=>[record[collection.id],record]));
            for(const record of imported[name]){
              const id=record[collection.id],existing=merged.get(id);
              if(existing&&name==='reviews'){
                const next=mergeReview(existing,record);merged.set(id,next);writes[keyFor(name,id)]=next;
              } else if(!existing||record.updatedAt>existing.updatedAt){merged.set(id,record);writes[keyFor(name,id)]=record;}
            }
            assertCapacity(name,[...merged.values()]);
          }
          if(imported.settings)writes[STORAGE.settings]={...state.settings,...imported.settings};
          if(Object.keys(writes).length)await localArea.set(writes);
          break;
        }
      }
      return readState();
    }
    return {dispatch(message){const operation=queue.then(()=>handle(message));queue=operation.catch(()=>{});return operation;}};
  }
  globalThis.GHE = {...globalThis.GHE,createStore,STORAGE,MESSAGE_TYPES};
})();
