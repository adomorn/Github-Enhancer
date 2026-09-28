const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
cp.execFileSync(process.execPath,['scripts/check.cjs'],{stdio:'inherit'});
const version=JSON.parse(fs.readFileSync('manifest.json','utf8')).version;
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);
const files=['manifest.json',...walk('src'),...walk('assets/icons')].filter(f=>!path.basename(f).startsWith('.')).sort();
fs.mkdirSync('dist',{recursive:true});const out=`dist/github-enhancer-${version}.zip`;if(fs.existsSync(out))fs.unlinkSync(out);
cp.execFileSync('zip',['-q','-X',out,...files]);console.log(`Packaged ${files.length} files → ${out} (${fs.statSync(out).size} bytes)`);
