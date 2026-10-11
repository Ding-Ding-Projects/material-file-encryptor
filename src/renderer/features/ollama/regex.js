export const REGEX_LIMITS=Object.freeze({pattern:128,rows:10000,row:32767,total:4*1024*1024,timeout:150});
export function createRegexFilter({createWorker=()=>new Worker(new URL('./regex-worker.js',import.meta.url),{type:'module'}),timeout=REGEX_LIMITS.timeout}={}) {
  let active=null,disposed=false;
  const cancel=()=>{active?.finish(new Error('Search was superseded.'));};
  return {
    filter(pattern,rows,anchor='any') {
      cancel();
      if(disposed)return Promise.reject(new Error('Search surface is closed.'));
      if(typeof pattern!=='string'||pattern.length>REGEX_LIMITS.pattern||!['any','start','exact'].includes(anchor)||!Array.isArray(rows)||rows.length>REGEX_LIMITS.rows)return Promise.reject(new Error('Search exceeds the supported expression or text limits.'));
      let bytes=0;const encoder=new TextEncoder();
      for(const row of rows){if(typeof row!=='string'||row.length>REGEX_LIMITS.row||(bytes+=encoder.encode(row).byteLength)>REGEX_LIMITS.total)return Promise.reject(new Error('Search exceeds the supported expression or text limits.'));}
      return new Promise((resolve,reject)=>{
        let worker,timer,done=false;
        const job={finish(error,matches){if(done)return;done=true;clearTimeout(timer);worker?.terminate();if(active===job)active=null;error?reject(error):resolve(matches);}};
        active=job;
        try{
          worker=createWorker();
          worker.onmessage=event=>{const result=event.data;if(result?.error)return job.finish(new Error(result.error));if(!Array.isArray(result?.matches)||result.matches.some(i=>!Number.isInteger(i)||i<0||i>=rows.length))return job.finish(new Error('Search worker returned an invalid result.'));job.finish(null,result.matches);};
          worker.onerror=()=>job.finish(new Error('Search worker could not run.'));
          timer=setTimeout(()=>job.finish(new Error('Regular expression exceeded the search deadline. Simplify the pattern.')),timeout);
          worker.postMessage({pattern,anchor,rows});
        }catch{job.finish(new Error('Search worker could not start.'));}
      });
    },
    cancel,
    dispose(){disposed=true;cancel();},
  };
}
