export async function runCollection({siteUrl,token,runId,triggerEvent,engine='github_actions',cronExpression='',timerOrigin='',attemptToken=crypto.randomUUID(),fetcher=fetch,log=()=>{},budgetMs=120000,concurrency=3,clock=Date.now}){
 const site=new URL(siteUrl);
 if(site.protocol!=='https:'||site.username||site.password||site.pathname!=='/'||site.search||site.hash)throw Error('Target must be an HTTPS origin');
 if(!token)throw Error('Collection service credential is missing');
 const deadline=clock()+budgetMs,workDeadline=deadline-15000,headers={'content-type':'application/json','OAI-Sites-Authorization':'Bearer '+token,'x-event-scheduler-key':token};
 async function call(data){
  for(let attempt=0;attempt<2;attempt++){
   const remaining=(data.phase==='finish'?deadline:workDeadline)-clock();if(remaining<=0)throw Error('Collection deadline reached');
   try{
    const response=await fetcher(new URL('/api/scheduler',site),{method:'POST',headers,body:JSON.stringify({...data,runId,attemptToken}),redirect:'error',signal:AbortSignal.timeout(Math.max(1,Math.min(30000,remaining)))});
    if((response.status===429||response.status>=500)&&attempt===0){await new Promise(resolve=>setTimeout(resolve,500));continue;}
    if(!response.ok)throw Error('Scheduler HTTP '+response.status);
    return response.json();
   }catch(error){if(attempt===0&&['TimeoutError','TypeError'].includes(error.name)&&clock()<workDeadline){await new Promise(resolve=>setTimeout(resolve,500));continue;}throw error;}
  }
 }
 const start=await call({phase:'start',engine,triggerEvent,cronExpression,timerOrigin});
 if(start.skipped){log({event:'run_skipped',runId,engine,triggerEvent,reasonCode:start.reasonCode,modelCalls:0});return start;}
 if(!Array.isArray(start.sources)||!start.sources.length)throw Error('No configured collection sources');
 log({event:'run_started',runId,entryPoint:start.entryPoint,engine,triggerEvent,cronExpression,modelCalls:0});
 let cursor=0;const results=[];
 await Promise.all(Array.from({length:Math.min(concurrency,start.sources.length)},async()=>{while(cursor<start.sources.length&&clock()<workDeadline){
  const source=start.sources[cursor++];let status;
  try{const result=await call({phase:'collect',source:source.id});status=result.status;
   if(status==='skipped'&&['partial','unavailable'].includes(result.cachedStatus))status=result.cachedStatus;
   if(status==='skipped'&&result.reasonCode==='in_progress')status='partial';
   if(!['ok','empty','skipped','partial','unavailable'].includes(status))status='unavailable';
  }catch{status='unavailable';}
  results.push({source:source.id,status});
 }}));
 const report=await call({phase:'finish',results});
 if(!report.persisted||report.runId!==runId||report.triggerEvent!==triggerEvent)throw Error('Persisted run did not match this execution');
 log({event:'run_persisted',runId,entryPoint:report.entryPoint,engine,triggerEvent,cronExpression,status:report.status,counts:report.counts,modelCalls:0});return report;
}

export {runCollection as run};
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {appendFile} from 'node:fs/promises';
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const report=await runCollection({siteUrl:process.env.EVENT_SITE_URL,token:process.env.EVENT_SITE_TOKEN,runId:process.env.GITHUB_RUN_ID+':'+process.env.GITHUB_RUN_ATTEMPT,triggerEvent:process.env.GITHUB_EVENT_NAME,cronExpression:process.env.EVENT_CRON_EXPRESSION,engine:'github_actions',budgetMs:420000,log:value=>console.log(JSON.stringify(value))});
  if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,['## HTTP collection','','Status: '+report.status,'','Model calls: 0',''].join(String.fromCharCode(10)));
  if(!['completed','skipped'].includes(report.status))process.exitCode=1;
 }catch(error){console.error(JSON.stringify({event:'run_failed',errorType:['Error','TimeoutError','TypeError'].includes(error.name)?error.name:'Error',modelCalls:0}));process.exitCode=1;}
}
