import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {assertGalleryPresentation,galleryRecords} from '../docs/site/publication.mjs';
const home=await fs.readFile('docs/site/index.html','utf8'),records=await galleryRecords(process.cwd());
const first=home.match(/src="(images\/captures\/[^"]+)"/)[1];
test('alternate serialization cannot evade current capture admission',()=>{
 const cases=[
 home.replace(`src="${first}"`,"src='images/captures/unreviewed.png'"),
 home.replace(`src="${first}"`,'src = "images/captures/unreviewed.png"'),
 home.replace(`src="${first}"`,'src="images/captures/unreviewed.png"'),
 home.replace('<h2 id="screenshots-heading">Interface captures.</h2>','<H2 id="screenshots-heading">Interface captures.</H2>'),
 home.replace('<figcaption><strong>History</strong>','<FIGCAPTION><strong>History</strong>'),
 home.replace('<p class="eyebrow">Inside the application</p>','<P CLASS="EYEBROW">Inside the application</P>'),
 home.replace('data-gallery-role="current"','data-gallery-role="historical"'),
 home.replace('data-gallery-role="current"','DATA-GALLERY-ROLE="current"')
 ];
 for(const [index,damaged]of cases.entries()){assert.notEqual(damaged,home);assert.throws(()=>assertGalleryPresentation(damaged,records),/role|Noncanonical|absent|outside|Unsupported/,String(index));}
 assert.equal(assertGalleryPresentation(home,records),true);
});
