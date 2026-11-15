import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {appendFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';

export async function run({siteUrl,token,runId,triggerEvent,cronExpression='',timerOrigin='',fetcher=fetch,log=value=>console.log(JSON.stringify(value))}){
 const site=new URL(siteUrl);
 if(site.protocol!=='https:'||site.username||site.password||site.pathname!=='/'||site.search||site.hash)throw Error('Target must be an HTTPS origin');
 if(!token)throw Error('EVENT_SITE_TOKEN repository secret is missing');
 if(!['schedule','workflow_dispatch'].includes(triggerEvent))throw Error('Unsupported GitHub event');
 const headers={'content-type':'application/json','OAI-Sites-Authorization':'Bearer '+token,'x-event-scheduler-key':token};
 async function call(data){
  for(let attempt=0;attempt<2;attempt++){
   try{const response=await fetcher(new URL('/api/scheduler',site),{method:'POST',headers,body:JSON.stringify({...data,runId}),redirect:'error',signal:AbortSignal.timeout(180000)});
    if((response.status===429||response.status>=500)&&attempt===0){await delay(3000);continue;}
    if(!response.ok)throw Error('Scheduler HTTP '+response.status);
    return await response.json();
   }catch(error){if(attempt===0&&error.name==='TimeoutError'){await delay(3000);continue;}throw error;}
  }
 }
 const start=await call({phase:'start',triggerEvent,cronExpression,timerOrigin});if(!Array.isArray(start.sources)||!start.sources.length)throw Error('No configured collection sources');
 log({event:'run_started',runId,entryPoint:'github_actions',triggerEvent,cronExpression,timerOrigin,sources:start.sources.length,modelCalls:0});
 const results=[];let cursor=0;
 await Promise.all(Array.from({length:2},async()=>{while(cursor<start.sources.length){const source=start.sources[cursor++];let result;
  try{result=await call({phase:'collect',source:source.id});if(result.status==='skipped'&&['partial','unavailable'].includes(result.cachedStatus))result={...result,status:result.cachedStatus,reason:'최근 수집의 실패 상태를 그대로 표시합니다.'};
   if(result.status==='skipped'&&result.reasonCode==='in_progress')result={...result,status:'partial',reason:'다른 실행이 진행 중이므로 완료 여부 재확인이 필요합니다.'};
   if(!['ok','empty','skipped','partial','unavailable'].includes(result.status))throw Error('Invalid source result');}
  catch(error){result={source:source.id,status:'unavailable',reason:error.message};}
  results.push({source:source.id,status:result.status});
 }}));
 const report=await call({phase:'finish',results});if(!report.persisted||report.runId!==runId||report.triggerEvent!==triggerEvent)throw Error('Persisted scheduler readback did not match this run');
 log({event:'run_persisted',runId,entryPoint:'github_actions',triggerEvent,cronExpression,timerOrigin:report.timerOrigin,status:report.status,counts:report.counts,modelCalls:0});
 return report;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  const report=await run({siteUrl:process.env.EVENT_SITE_URL,token:process.env.EVENT_SITE_TOKEN,runId:process.env.GITHUB_RUN_ID+':'+process.env.GITHUB_RUN_ATTEMPT,triggerEvent:process.env.GITHUB_EVENT_NAME,cronExpression:process.env.EVENT_CRON_EXPRESSION,timerOrigin:process.env.EVENT_TIMER_ORIGIN});
  if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,'## HTTP collection\n\nStatus: '+report.status+'\n\nModel calls: 0\n\n```json\n'+JSON.stringify({runId:report.runId,triggerEvent:report.triggerEvent,cronExpression:report.cronExpression,counts:report.counts,failedSources:report.failedSources?.length||0,missing:report.missing?.length||0},null,2)+'\n```\n');
  if(report.status!=='completed')process.exitCode=1;
 }catch(error){console.error(JSON.stringify({event:'run_failed',entryPoint:'github_actions',errorCode:Number(error.message?.match(/^Scheduler HTTP (\d{3})$/)?.[1])||null,errorType:['Error','TypeError','TimeoutError'].includes(error.name)?error.name:'Error'}));process.exitCode=1;}
}
