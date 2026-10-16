import {createWarmWorkerRunner,MATCH_BUDGET_MS} from '../../../shared/surface/warm-worker.js';
// `timeout` is the budget for the match work alone. Worker start-up is measured separately.
export const REGEX_LIMITS=Object.freeze({pattern:128,rows:10000,row:32767,total:4*1024*1024,timeout:MATCH_BUDGET_MS});
export function createRegexFilter({createWorker=()=>new Worker(new URL('./regex-worker.js',import.meta.url),{type:'module'}),timeout=REGEX_LIMITS.timeout,startTimeout}={}) {
  const runner=createWarmWorkerRunner({createWorker,matchBudget:timeout,...(startTimeout?{startBudget:startTimeout}:{})});
  let disposed=false;
  const cancel=()=>{runner.cancel();};
  return {
    filter(pattern,rows,anchor='any') {
      cancel();
      if(disposed)return Promise.reject(new Error('Search surface is closed.'));
      if(typeof pattern!=='string'||pattern.length>REGEX_LIMITS.pattern||!['any','start','exact'].includes(anchor)||!Array.isArray(rows)||rows.length>REGEX_LIMITS.rows)return Promise.reject(new Error('Search exceeds the supported expression or text limits.'));
      let bytes=0;const encoder=new TextEncoder();
      for(const row of rows){if(typeof row!=='string'||row.length>REGEX_LIMITS.row||(bytes+=encoder.encode(row).byteLength)>REGEX_LIMITS.total)return Promise.reject(new Error('Search exceeds the supported expression or text limits.'));}
      return runner.run({pattern,anchor,rows}).then(result=>{
        if(result?.error)throw new Error(result.error);
        if(!Array.isArray(result?.matches)||result.matches.some(i=>!Number.isInteger(i)||i<0||i>=rows.length))throw new Error('Search worker returned an invalid result.');
        return result.matches;
      },error=>{
        if(error?.code==='match-timeout')throw new Error('Regular expression exceeded the search deadline. Simplify the pattern.');
        throw error;
      });
    },
    cancel,
    dispose(){disposed=true;runner.dispose();},
  };
}
