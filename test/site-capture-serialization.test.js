import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {assertGalleryPresentation,galleryRecords} from '../docs/site/publication.mjs';
const home=await fs.readFile('docs/site/index.html','utf8'),records=await galleryRecords(process.cwd());
test('alternate serialization and decoded accessibility claims cannot evade historical capture admission',()=>{
 const cases=[
 home.replace('alt="Actual packaged Windows History view','alt="Current packaged Windows History view'),
 home.replace('alt="Actual packaged Windows History view','title="Current rebuilt interface" alt="Actual packaged Windows History view'),
 home.replace('aria-label="Open the historical History capture at full size"',"aria-label='Open the current History capture at full size'"),
 home.replace('aria-label="Open the historical History capture','ARIA-LABEL="Open the current History capture'),
 home.replace('src="images/captures/desktop-locked.png"',"src='images/captures/unreviewed.png'"),
 home.replace('src="images/captures/desktop-locked.png"','src = "images/captures/unreviewed.png"'),
 home.replace('Historical packaged Windows interface · source','Curr&#101;nt packaged Windows interface · source'),
 home.replace('alt="Actual packaged Windows History view','alt="Cu&#114rent packaged Windows History view'),
 home.replace('Historical packaged Windows interface · source','Cur<strong>rent</strong> packaged Windows interface · source'),
 home.replace('aria-label="Open the historical History capture','title="Current rebuilt interface" aria-label="Open the historical History capture')
 ];
 for(const [index,damaged]of cases.entries()){assert.notEqual(damaged,home);assert.throws(()=>assertGalleryPresentation(damaged,records),/Historical|Noncanonical|absent|outside|Unsupported/,String(index));}
 assert.equal(assertGalleryPresentation(home,records),true);
});
