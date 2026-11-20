import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRepairServer } from '../server/index.ts';

// This launcher never reads DATA_DIR from a caller and never loads the main shop's data.
const tempRoot=path.resolve(tmpdir());
const dataDir=await mkdtemp(path.join(tempRoot,'hepai-museum-e2e-'));
// Software WebGL can be slower than a laptop GPU. Keep the real playback clock
// running long enough to verify touch orbit/expansion without racing the finale.
const server=createRepairServer({dataDir,port:3011,performanceDurationMs:20_000});
server.app.get('/__museum-test-boundary',(_request,response)=>{
  response.set('Cache-Control','no-store').json({kind:'isolated-museum-e2e',port:3011});
});
let stopping:Promise<void>|undefined;
async function stop(){
  if(stopping)return stopping;
  stopping=(async()=>{
    await server.stop();
    const absolute=path.resolve(dataDir);
    if(path.dirname(absolute)!==tempRoot||!path.basename(absolute).startsWith('hepai-museum-e2e-'))throw new Error('Refusing to remove an unexpected test data path');
    await rm(absolute,{recursive:true,force:true});
  })();
  return stopping;
}
for(const signal of ['SIGINT','SIGTERM'] as const)process.once(signal,()=>{void stop().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1);});});
try{
  await server.start(3011);
  console.log('Isolated museum E2E server ready at http://127.0.0.1:3011; data is temporary.');
}catch(error){
  await stop();throw error;
}
