const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const manifest=JSON.parse(fs.readFileSync('manifest.json','utf8'));
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
const files=walk('src');
for(const file of files.filter(f=>f.endsWith('.js')))cp.execFileSync(process.execPath,['--check',file],{stdio:'pipe'});
const refs=[manifest.background.service_worker,manifest.action.default_popup,manifest.options_page,...Object.values(manifest.icons),...manifest.content_scripts.flatMap(c=>[...c.js,...(c.css||[])]),...manifest.web_accessible_resources.flatMap(r=>r.resources)];
for(const file of refs)assert.ok(fs.existsSync(file),`Missing manifest asset: ${file}`);
for(const file of files.filter(f=>f.endsWith('.html'))){const text=fs.readFileSync(file,'utf8');for(const match of text.matchAll(/(?:src|href)="([^"#]+)"/g)){if(/^(https?:|data:)/.test(match[1]))continue;assert.ok(fs.existsSync(path.resolve(path.dirname(file),match[1])),`Missing HTML asset: ${file} -> ${match[1]}`);}}
assert.deepEqual([...manifest.permissions].sort(),['activeTab','storage']);assert.equal(manifest.host_permissions,undefined);assert.equal(manifest.version,JSON.parse(fs.readFileSync('package.json','utf8')).version);
console.log(`Checked ${files.filter(f=>f.endsWith('.js')).length} JavaScript files, manifest paths, HTML assets, version and minimal permissions.`);
