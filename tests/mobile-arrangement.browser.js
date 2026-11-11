// Playwright CLI browser regression: run on the static Pages preview or deployed site.
// playwright-cli open <site>, then run-code --filename tests/mobile-arrangement.browser.js
// Seeds a synthetic local demo only; it does not call or authenticate to a server.
async (page) => {
 const fixture={"saved": "{\"schema\":1,\"token\":\"local-demo-layout-fixture\",\"timbreConfirmed\":true,\"commands\":{},\"snapshot\":{\"code\":\"DMBR01\",\"mode\":\"demo\",\"self\":\"A\",\"role\":\"guide\",\"stage\":\"arrange\",\"version\":15,\"members\":[{\"id\":\"A\",\"connected\":true,\"ready\":true,\"swapReady\":true,\"launchReady\":false,\"shareConsent\":false,\"exhibitConsent\":false,\"word\":\"\",\"left\":false},{\"id\":\"B\",\"connected\":true,\"ready\":true,\"swapReady\":true,\"launchReady\":false,\"shareConsent\":false,\"exhibitConsent\":false,\"word\":\"\",\"left\":false}],\"gears\":[{\"id\":\"gear-1\",\"size\":\"small\",\"notches\":1,\"label\":\"小号 · 一道刻痕\"},{\"id\":\"gear-4\",\"size\":\"small\",\"notches\":3,\"label\":\"小号 · 三道刻痕\"},{\"id\":\"gear-2\",\"size\":\"medium\",\"notches\":2,\"label\":\"中号 · 两道刻痕\"},{\"id\":\"gear-5\",\"size\":\"large\",\"notches\":1,\"label\":\"大号 · 一道刻痕\"},{\"id\":\"gear-3\",\"size\":\"large\",\"notches\":3,\"label\":\"大号 · 三道刻痕\"}],\"installed\":{\"slot-1\":\"gear-1\",\"slot-2\":\"gear-2\",\"slot-3\":\"gear-3\"},\"slots\":[{\"id\":\"slot-1\",\"shape\":\"triangle\"},{\"id\":\"slot-2\",\"shape\":\"circle\"},{\"id\":\"slot-3\",\"shape\":\"square\"}],\"notes\":[\"leaf\",\"star\",\"moon\",\"star\"],\"melody\":\"bright\",\"timbre\":\"wood\",\"finish\":\"walnut\",\"marks\":[],\"hintCount\":0,\"expiresAt\":9999999999999,\"paused\":false,\"testConsent\":false,\"winding\":0,\"windingDurationMs\":1400,\"stamps\":{\"A\":\"sprout\",\"B\":\"spark\"},\"milestones\":[],\"paperNotes\":[],\"exhibitListed\":false,\"arrangement\":{\"current\":{\"tracks\":{\"A\":{\"notes\":[\"leaf\",\"star\",\"moon\",\"star\"],\"timbre\":\"wood\"},\"B\":{\"notes\":[\"leaf\",null,\"star\",null],\"timbre\":\"wood\"}},\"tempo\":\"slow\"},\"approved\":{\"A\":false,\"B\":false},\"revision\":1}}}", "session": {"code": "DMBR01", "token": "local-demo-layout-fixture"}};
 const results=[];
 const seed=async self=>{
   const stored=JSON.parse(fixture.saved);stored.snapshot.self=self;
   await page.evaluate(f=>{sessionStorage.clear();sessionStorage.setItem('hepai.static-demo.v1',f.saved);sessionStorage.setItem('hepai-static-session-v1',JSON.stringify(f.session));},{saved:JSON.stringify(stored),session:fixture.session});
   await page.reload();await page.locator('main.stage-arrange').waitFor();
 };
 const reachable=async locator=>{await locator.scrollIntoViewIfNeeded();return locator.evaluate(e=>{const r=e.getBoundingClientRect();const t=document.querySelector('.demo-toolbar');const tr=t.getBoundingClientRect();const ts=getComputedStyle(t);const limit=['fixed','sticky'].includes(ts.position)?Math.min(innerHeight,tr.top):innerHeight;const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return{rect:r.toJSON(),limit,hit:hit?.tagName,notOccluded:!!hit&&(e===hit||e.contains(hit)),fullyVisible:r.top>=-1&&r.bottom<=limit+1};});};
 for(const viewport of [{width:390,height:740},{width:390,height:844},{width:360,height:640}]){
   await page.setViewportSize(viewport);
   for(const self of ['A','B']){
     await seed(self);
     const panel=await page.locator('.tool-panel').evaluate(e=>{const r=e.getBoundingClientRect();const s=getComputedStyle(e);return{rect:r.toJSON(),height:e.clientHeight,scrollHeight:e.scrollHeight,overflow:s.overflow};});
     const tempo=await reachable(page.getByTestId('tempo-gentle'));
     const approve=await reachable(page.getByTestId('arrangement-approve'));
     const result={viewport,self,panel,tempo,approve,passed:panel.height>=280&&tempo.notOccluded&&tempo.fullyVisible&&approve.notOccluded&&approve.fullyVisible};
     results.push(result);
   }
 }
 await page.screenshot({path:'output/playwright/mobile-panel-regression-last.png',fullPage:true});
 return{passed:results.every(r=>r.passed),results};
}