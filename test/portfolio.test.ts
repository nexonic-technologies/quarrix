import {test} from 'node:test';import assert from 'node:assert/strict';
import {EMPTY_PORTFOLIO,validatePortfolio,portfolioText} from '../src/shared/portfolio';
import {EMPTY_PROPOSAL,quotationText} from '../src/shared/proposals';
test('portfolio documents use only supplied facts and template substitutions are nonrecursive',()=>{
 const p=validatePortfolio({...EMPTY_PORTFOLIO,name:'Example',role:'Engineer',skills:'Python',target:'Role',summary:'{name}',template:'{summary} / {target}'});
 assert.match(portfolioText(p,'cv'),/SKILLS\nPython/);assert.ok(!portfolioText(p,'portfolio').includes('EDUCATION'));assert.equal(portfolioText(p,'application'),'{name} / Role');assert.throws(()=>validatePortfolio({...p,name:'x'.repeat(501)}));
});
test('quotation is distinct from proposal and uses exact minor-unit totals',()=>{
 const p={...EMPTY_PROPOSAL,scope:'Not included here',items:[{description:'Service',quantity:2,unitMinor:1001}],discountBps:1000};const t=quotationText(p,'Customer');assert.match(t,/Total: USD 18\.02/);assert.ok(!t.includes('Not included here'));
});
