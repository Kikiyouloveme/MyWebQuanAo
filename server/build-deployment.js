// Explicit allowlist. Runtime secrets, databases, uploads, tests and dependencies never enter this bundle.
const fs=require('node:fs/promises');const path=require('node:path');
async function main(){
  const root=path.resolve('.'),target=path.resolve('server/private/deployment',Date.now().toString());await fs.mkdir(target,{recursive:true});
  const copied=[];
  async function copy(relative){const source=path.join(root,relative),destination=path.join(target,relative);await fs.mkdir(path.dirname(destination),{recursive:true});await fs.copyFile(source,destination);copied.push(relative.replaceAll('\\','/'));}
  async function walk(relative,accept){for(const entry of await fs.readdir(path.join(root,relative),{withFileTypes:true})){const next=path.join(relative,entry.name);if(entry.isDirectory()){if(!['private','node_modules','.git','data','uploads','returns','demo'].includes(entry.name))await walk(next,accept);}else if(accept(next))await copy(next);}}
  await walk('server',p=>p.endsWith('.js')&&!/[/\\](test[^/\\]*|seed[^/\\]*|backup-private|build-deployment|restore-private|import-json)\.js$/.test(p));
  await walk('client/dist',()=>true);await walk('assets',p=>/\.(svg|webp|png|jpe?g|woff2?|css)$/i.test(p));
  for(const p of ['package.json','package-lock.json'])await copy(p);
  for(const p of ['docs/IMAGE_SOURCES.md','docs/VELATHIER_V2_REMEDIATION.md'])await copy(p);
  try{await copy('server/data/vietnam-divisions.json');}catch(e){if(e.code!=='ENOENT')throw e;}
  const pkg=JSON.parse(await fs.readFile(path.join(target,'package.json'),'utf8'));pkg.scripts={start:'node server/server.js'};delete pkg.devDependencies;await fs.writeFile(path.join(target,'package.json'),JSON.stringify(pkg,null,2));
  await fs.writeFile(path.join(target,'MANIFEST.json'),JSON.stringify(copied,null,2));
  if(copied.some(p=>/(^|\/)(\.env|\.git|node_modules|private)(\/|$)/.test(p)))throw Error('Forbidden bundle entry');
  console.log(`Deployment source prepared: ${target}; ${copied.length} files. Install runtime dependencies on target using npm ci --omit=dev. Inject secrets through environment.`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
