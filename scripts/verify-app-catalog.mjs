import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';
const root=process.cwd();
const publicPath=path.join(root,'public');
const catalog=JSON.parse(fs.readFileSync(path.join(publicPath,'app-data.json'),'utf8'));
assert.equal(catalog.schemaVersion,1);
assert.ok(Array.isArray(catalog.apps)&&catalog.apps.length>0);
const slugs=new Set();
for(const app of catalog.apps){
  assert.match(app.slug,/^[a-z0-9-]{1,60}$/);
  assert.ok(!slugs.has(app.slug),'Duplicate app slug: '+app.slug);
  slugs.add(app.slug);
  assert.ok(app.name&&app.fr&&app.en);
  assert.ok(['games','business','lifestyle'].includes(app.category));
  assert.ok(['web','development','concept'].includes(app.stage));
  assert.ok(['free','paid',undefined].includes(app.distribution),'Invalid sale classification');
  if(app.slug==='hailite-manager')assert.equal(app.distribution,'paid','Hailite Manager download cannot be public');
  const local=[app.icon,...(app.screenshots||[])].filter(Boolean);
  for(const asset of local){
    assert.ok(asset.startsWith('/')&&!asset.startsWith('//'),'Invalid local URL: '+asset);
    const file=path.join(publicPath,asset.slice(1));
    assert.ok(fs.existsSync(file),'Missing asset: '+file);
    if(file.endsWith('.png'))assert.equal(fs.readFileSync(file).subarray(0,8).toString('hex'),'89504e470d0a1a0a','Invalid PNG: '+file);
  }
  if(app.apk!==null){
    assert.ok(app.apk&&typeof app.apk==='object');
    assert.equal(app.apk.key,`releases/${app.slug}/${app.slug}-${app.apk.version}.apk`, 'R2 key must be strictly versioned');
    assert.match(app.apk.version,/^[0-9][a-zA-Z0-9.+-]{0,39}$/);
    assert.match(app.apk.sha256,/^[0-9a-f]{64}$/i);
  }
}
const html=fs.readFileSync(path.join(publicPath,'applications.html'),'utf8');
assert.ok(html.includes('id="appsGrid"')&&html.includes('id="installation"'));
assert.ok(fs.readFileSync(path.join(publicPath,'index.html'),'utf8').includes('href="/applications"'));
console.log('Catalogue validated:',catalog.apps.length,'apps /',slugs.size,'distinct slugs.');
