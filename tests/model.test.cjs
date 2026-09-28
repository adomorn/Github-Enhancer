const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
if (fs.existsSync(require('node:path').join(__dirname, '../src/shared/model.js'))) require('../src/shared/model.js');
const model = () => globalThis.GHE || {};

test('canonical context rejects unsafe origins and GitHub application routes', () => {
  assert.equal(typeof model().parseContext, 'function');
  for (const url of ['https://example.org/a/b', 'https://github.com.evil.test/a/b', 'http://github.com/a/b', 'https://u:p@github.com/a/b', 'https://github.com/settings/profile', 'https://github.com/orgs/openai', 'https://github.com/search?q=test', 'https://github.com/a', 'https://github.com/a/b/not-a-route', 'https://github.com/a%2Fb/c']) {
    assert.equal(model().parseContext(url), null, url);
  }
});

test('canonical context keeps code refs and discussion anchors without tracking', () => {
  assert.equal(typeof model().parseContext, 'function');
  assert.deepEqual(model().parseContext('https://github.com/Owner/Repo/blob/feature/ui/src/a%20b.js?ref=feature%2Fui&utm_source=x#L3-L9', 'Code'), {
    url: 'https://github.com/owner/repo/blob/feature/ui/src/a%20b.js?ref=feature%2Fui#L3-L9', owner: 'owner', name: 'repo', repo: 'owner/repo', type: 'code', title: 'Code'
  });
  const issue = model().parseContext('https://github.com/O/R/issues/42?utm_source=a&ref=bad#issuecomment-123', '  Fix bug · GitHub ');
  assert.equal(issue.url, 'https://github.com/o/r/issues/42#issuecomment-123');
  assert.equal(issue.type, 'issue');
  assert.equal(issue.title, 'Fix bug · GitHub');
  assert.equal(model().parseContext('https://github.com/O/R/').url, 'https://github.com/o/r');
  assert.equal(model().parseContext('https://github.com/o/r/pull/2/files').type, 'pull');
  assert.equal(model().parseContext('https://github.com/o/r/discussions/3').type, 'discussion');
  assert.equal(model().parseContext('https://github.com/o/r/commit/abcdef').type, 'commit');
});

test('real github organization and encoded branch names remain valid repository contexts', () => {
  assert.equal(model().parseContext('https://github.com/github/linguist')?.repo, 'github/linguist');
  assert.equal(model().parseContext('https://github.com/o/r/tree/feature%2Fui')?.type, 'code');
  assert.equal(model().parseContext('https://github.com/o/r/pull/2/files/unexpected'), null);
});

test('pull changes commit routes retain full revisions and reject ambiguous tails', () => {
  const sha='a'.repeat(40);
  const url=`https://github.com/O/R/pull/42/changes/${sha}?utm_source=test#diff-file`;
  assert.equal(model().parseContext(url)?.type,'pull');
  assert.equal(model().parseContext(url)?.url,`https://github.com/o/r/pull/42/changes/${sha}#diff-file`);
  assert.equal(model().canonicalPrUrl(url),'https://github.com/o/r/pull/42');
  for(const tail of ['main','abcdef',`${sha}/extra`])assert.equal(model().parseContext(`https://github.com/o/r/pull/42/changes/${tail}`),null);
  assert.equal(model().parseContext(`https://github.com/o/r/pull/42/checks/${sha}`),null);
});

test('settings reject invalid values and migrate only relevant legacy preferences', () => {
  assert.equal(typeof model().normalizeSettings, 'function');
  const settings = model().normalizeSettings({ enabled: false, wide: 'yes', focus: true, theme: 'neon', locale: 'bad!!!', timeZone: 'UTC', unknown: true }, {enhanceDateTimes: false});
  assert.equal(settings.enabled, false);
  assert.equal(settings.wide, false);
  assert.equal(settings.focus, true);
  assert.equal(settings.exactDates, false);
  assert.equal(settings.theme, 'auto');
  assert.equal(settings.locale, 'auto');
  assert.equal(settings.timeZone, 'UTC');
  assert.equal(Object.hasOwn(settings, 'unknown'), false);
  assert.equal(model().normalizeSettings({exactDates:true}, {enhanceDateTimes:false}).exactDates, true);
});

test('imports validate bounds and canonicalize metadata instead of trusting caller', () => {
  assert.equal(typeof model().validateImport, 'function');
  const item = {url:'https://github.com/O/R/issues/2?utm_source=x', title:'A', note:'<script>text only</script>', createdAt:10, updatedAt:20, repo:'fake/repo', type:'repository'};
  const result = model().validateImport(JSON.stringify({version:1, items:[item], settings:{focus:true}}));
  assert.equal(result.items[0].repo, 'o/r');
  assert.equal(result.items[0].type, 'issue');
  assert.equal(result.items[0].url, 'https://github.com/o/r/issues/2');
  assert.equal(result.items[0].note, '<script>text only</script>');
  assert.equal(result.settings.focus, true);
  for (const bad of ['null', '{}', '{', JSON.stringify({version:99,items:[]}), JSON.stringify({items:[{...item,url:'javascript:alert(1)'}]}), JSON.stringify({items:[{...item,note:'x'.repeat(10001)}]}), JSON.stringify({items:[{...item,title:'x'.repeat(301)}]}), JSON.stringify({items:[{...item,updatedAt:-1}]}), JSON.stringify({items:Array.from({length:501},()=>item)}), ' '.repeat(32*1024*1024+1)]) {
    assert.throws(() => model().validateImport(bad));
  }
});

test('valid workspace backups larger than 2 MB round trip without dropping bounded notes', () => {
  const items = Array.from({length:210}, (_,index)=>({url:`https://github.com/o/r/issues/${index+1}`,title:`Issue ${index+1}`,note:'x'.repeat(10000),createdAt:10,updatedAt:20}));
  const backup = JSON.stringify({version:1,items},null,2);
  assert.ok(Buffer.byteLength(backup)>2*1024*1024);
  const imported = model().validateImport(backup);
  assert.equal(imported.items.length,210);
  assert.equal(imported.items[209].note,items[209].note);
  assert.throws(()=>model().validateImport(' '.repeat(32*1024*1024+1)), /32 MB/);
});

test('search includes notes and returns recent matches without mutating input', () => {
  assert.equal(typeof model().filterItems, 'function');
  const items = [{title:'Old',repo:'a/b',note:'review',type:'issue',updatedAt:1}, {title:'New',repo:'a/b',note:'review',type:'pull',updatedAt:3}, {title:'Other',repo:'x/y',note:'',type:'code',updatedAt:2}];
  assert.deepEqual(model().filterItems(items, 'REVIEW').map(x=>x.title), ['New','Old']);
  assert.deepEqual(model().filterItems(items, 'pull').map(x=>x.title), ['New']);
  assert.equal(items[0].title, 'Old');
});

test('formatting handles UTC, invalid dates and markdown metacharacters safely', () => {
  assert.equal(typeof model().formatDate, 'function');
  assert.match(model().formatDate('2026-01-02T13:04:00Z', {locale:'en-US',timeZone:'UTC'}), /Jan 2, 2026/);
  assert.match(model().formatDate('2026-01-02T13:04:00Z', {locale:'en-US',timeZone:'UTC'}), /13:04/);
  assert.equal(model().formatDate('not a date', {}), '');
  assert.equal(model().markdownLink({title:'A [b] \\ c\nnew',url:'https://github.com/o/r'}), '[A \\[b\\] \\\\ c new](https://github.com/o/r)');
});

test('copied markdown renders titles as literal text rather than embedded HTML or emphasis', () => {
  assert.equal(model().markdownLink({title:'<img> *urgent* _a_ `code`',url:'https://github.com/o/r'}), '[\\<img\\> \\*urgent\\* \\_a\\_ \\`code\\`](https://github.com/o/r)');
});

const snippetFixture = () => ({id:'snippet-1',url:'https://github.com/O/R/blob/feature/ui/file.js?utm_source=x#L2-L3',repo:'ignored/repo',title:'File selection',path:'src/file.js',language:'javascript',lineStart:2,lineEnd:3,code:'const one = 1;\nconst two = 2;',note:'Why it matters',revision:null,createdAt:1,updatedAt:2});
const reviewFixture = () => ({prUrl:'https://github.com/O/R/pull/42/changes#diff-abc',repo:'ignored/repo',files:[{path:'src/file.js',note:'Check edge case',reviewed:true,reviewedRevision:'a'.repeat(40),reviewedAt:2,updatedAt:2}],lastFile:'src/file.js',createdAt:1,updatedAt:2});

test('version 2 backups round trip snippets, workspace references and review provenance', () => {
  assert.equal(typeof model().exportBackup,'function');
  const state = {items:[],settings:model().DEFAULT_SETTINGS,snippets:[snippetFixture()],workspaces:[{id:'workspace-1',title:'Release',note:'Next steps',itemUrls:['https://github.com/O/R/issues/3#issuecomment-2'],snippetIds:['snippet-1'],createdAt:1,updatedAt:2}],reviews:[reviewFixture()]};
  const text = model().exportBackup(state);
  assert.equal(JSON.parse(text).version,2);
  const imported = model().validateImport(text);
  assert.equal(imported.snippets[0].repo,'o/r');
  assert.equal(imported.snippets[0].code,state.snippets[0].code);
  assert.equal(imported.workspaces[0].itemUrls[0],'https://github.com/o/r/issues/3#issuecomment-2');
  assert.equal(imported.reviews[0].prUrl,'https://github.com/o/r/pull/42');
  assert.equal(imported.reviews[0].files[0].reviewedRevision,'a'.repeat(40));
  assert.equal(model().parseContext('https://github.com/o/r/pull/42/changes').type,'pull');
});

test('review status never verifies a marker without a matching known revision', () => {
  assert.equal(typeof model().reviewStatus,'function');
  const file=reviewFixture().files[0];
  assert.equal(model().reviewStatus(file,'a'.repeat(40)),'verified');
  assert.equal(model().reviewStatus(file,'b'.repeat(40)),'changed');
  assert.equal(model().reviewStatus(file,null),'unverified');
  assert.equal(model().reviewStatus({...file,reviewedRevision:null},'a'.repeat(40)),'unverified');
  assert.equal(model().reviewStatus({...file,reviewed:false},'a'.repeat(40)),'unreviewed');
});

test('extended imports reject invalid bounds and provenance before any data is used', () => {
  const snippet=snippetFixture(),review=reviewFixture();
  const badSnippets=[{...snippet,code:'x'.repeat(20001)},{...snippet,note:'x'.repeat(10001)},{...snippet,revision:'main'},{...snippet,lineEnd:1},{...snippet,language:'js\nmalicious'},{...snippet,url:'https://example.org/a/b'},{...snippet,id:'../bad'}];
  for(const value of badSnippets)assert.throws(()=>model().validateImport(JSON.stringify({version:2,items:[],snippets:[value]})));
  assert.throws(()=>model().validateImport(JSON.stringify({version:2,items:[],snippets:Array.from({length:101},snippetFixture)})));
  assert.throws(()=>model().validateImport(JSON.stringify({version:2,items:[],reviews:[{...review,prUrl:'https://github.com/o/r/issues/42'}]})));
  assert.throws(()=>model().validateImport(JSON.stringify({version:2,items:[],reviews:[{...review,files:[{...review.files[0],reviewedRevision:'bad'}]}]})));
  assert.throws(()=>model().validateImport(JSON.stringify({version:2,items:[],workspaces:[{id:'w',title:'x',note:'',itemUrls:['javascript:alert(1)'],snippetIds:[],createdAt:1,updatedAt:2}]})));
});

test('an optional blank snippet title uses the captured path as its saved label',()=>{
  const item=model().validateSnippet({...snippetFixture(),title:''});
  assert.equal(item.title,'src/file.js');
});

test('snippet imports require a blob citation with concrete source lines',()=>{
  const base=snippetFixture();
  for(const patch of [
    {url:'https://github.com/o/r/issues/1'},
    {url:'https://github.com/o/r/tree/main/src'},
    {lineStart:null,lineEnd:null},{lineStart:0},{lineEnd:null}
  ])assert.throws(()=>model().validateImport(JSON.stringify({version:2,items:[],snippets:[{...base,...patch}]})));
});

test('snippet provenance is derived from the cited URL and rejects inconsistent claims',()=>{
  const base=snippetFixture(),sha='a'.repeat(40),url=`https://github.com/o/r/blob/${sha}/src/file.js#L2-L3`;
  assert.equal(model().validateSnippet(base).revision,null);
  assert.equal(model().validateSnippet({...base,url}).revision,sha);
  assert.equal(model().validateSnippet({...base,url,revision:sha.toUpperCase()}).revision,sha);
  for(const input of [{...base,revision:sha},{...base,url,revision:'b'.repeat(40)}])assert.throws(()=>model().validateSnippet(input),/revision/i);
});

const templateFixture=(id='template-1')=>({id,title:'Ask for a test',body:'Could you add a test for this case?\n\nThanks!',createdAt:1,updatedAt:2});
test('v2 templates round trip and old backups provide an empty optional collection',()=>{
 const state={items:[],templates:[templateFixture()],settings:model().DEFAULT_SETTINGS};
 const backup=model().validateImport(model().exportBackup(state));assert.deepEqual(backup.templates,state.templates);
 for(const version of [1,2])assert.deepEqual(model().validateImport(JSON.stringify({version,items:[]})).templates,[]);
 assert.equal(model().validateTemplate({...templateFixture(),title:'  Clarify\n behavior  ',unexpected:'ignore'}).title,'Clarify behavior');
 assert.equal(Object.hasOwn(model().validateTemplate({...templateFixture(),unexpected:true}),'unexpected'),false);
});
test('templates reject blank content, excessive lengths, unsafe IDs and invalid timestamps',()=>{
 for(const patch of [{title:''},{title:' '.repeat(2)},{title:'\u0000'},{title:'x'.repeat(101)},{body:'\n\t '},{body:'x'.repeat(10001)},{id:'../x'},{createdAt:3,updatedAt:2}]){
  assert.throws(()=>model().validateImport(JSON.stringify({version:2,items:[],templates:[{...templateFixture(),...patch}]})));
 }
 assert.throws(()=>model().validateImport(JSON.stringify({version:2,items:[],templates:Array.from({length:41},(_,i)=>templateFixture('t'+i))})),/40/);
 assert.equal(model().validateTemplate({...templateFixture(),body:'x'.repeat(10000)}).body.length,10000);
});
