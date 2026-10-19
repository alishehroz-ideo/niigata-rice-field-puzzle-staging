'use strict';
(function(root){
class GameBullError extends Error {
  constructor(code,message,params={}){super(message);this.name='GameBullError';this.code=code;this.params=params;}
}
const fail=(code,message)=>new GameBullError(code,message);
class GameBullClient {
  constructor(config,{fetchImpl=globalThis.fetch,now=()=>Date.now(),availableStages=600}={}){
    this.config=config;this.fetch=fetchImpl.bind(globalThis);this.now=now;this.availableStages=availableStages;
    this.token='';this.tenant='';this.context=null;this.attempt=null;this.pending=false;this.uncertainStart=false;this.offset=0;
  }
  configureLaunch(search){
    const p=new URLSearchParams(search);this.token=p.get(this.config.bootTokenParam)||'';this.tenant=p.get(this.config.tenantSlugParam)||'';
    if(!this.config.apiBase)throw fail('integration.not_configured','GameBullの接続先が未設定です。開発者に接続設定を依頼してください。');
    const url=new URL(this.config.apiBase);
    if(url.username||url.password||url.search||url.hash||!(url.protocol==='https:'||(url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname))))throw fail('integration.invalid_config','GameBullの接続設定が正しくありません。');
    if(!this.token||!this.tenant)throw fail('integration.launch_required','GameBullのゲーム画面から開いてください。');
  }
  async request(path,{method='GET',body}={}){
    const abort=new AbortController(),timeout=setTimeout(()=>abort.abort(),this.config.requestTimeoutMs||15000);
    try{
      const response=await this.fetch(this.config.apiBase.replace(/\/$/,'')+path,{method,headers:{'Accept':'application/json',...(method==='GET'?{'Authorization':'Bearer '+this.token}:{'Content-Type':'application/json'})},...(body?{body:JSON.stringify(body)}:{}),signal:abort.signal,cache:'no-store',credentials:'omit',redirect:'error',referrerPolicy:'no-referrer'});
      const stamp=Date.parse(response.headers?.get('Date'));if(Number.isFinite(stamp))this.offset=stamp-this.now();
      let data;try{data=await response.json();}catch{throw fail('integration.bad_response','GameBullからの応答を確認できませんでした。');}
      if(!response.ok){const error=new GameBullError(typeof data.code==='string'?data.code:'integration.http_error',typeof data.message==='string'?data.message:'GameBullへの接続に失敗しました。',data.params||{});error.httpStatus=response.status;throw error;}
      return data;
    }catch(e){if(e instanceof GameBullError)throw e;throw fail('integration.network','通信結果を確認できませんでした。接続を確認してください。');}
    finally{clearTimeout(timeout);}
  }
  validateMode(mode){
    const n=mode?.totalStages,h=mode?.highestCleared,next=mode?.nextStage;
    if(!Number.isInteger(n)||n<1||n>this.availableStages||!Number.isInteger(h)||h<0||h>n||typeof mode.freeReplays!=='boolean'||(h===n?next!==null:next!==h+1))throw fail('integration.bad_context','ステージ情報がゲームと一致しません。管理者に確認してください。');
    if(!Number.isFinite(mode.maxAttemptSeconds)||mode.maxAttemptSeconds<=0)throw fail('integration.bad_context','GameBullの制限時間を確認できません。');
    return mode;
  }
  async refresh(){
    const data=await this.request('/play/games/'+encodeURIComponent(this.config.gameCode)+'/context?tenantSlug='+encodeURIComponent(this.tenant));
    if(!data.stageMode)throw fail('integration.stage_mode_required','このゲームのステージモードをGameBull側で有効にしてください。');
    this.validateMode(data.stageMode);this.context=data;return data;
  }
  get mode(){return this.context?.stageMode;}
  get lives(){let n=this.context;for(const k of (this.config.livesPath||'lives').split('.'))n=n?.[k];return Number.isInteger(n)&&n>=0?n:null;}
  canStart(stage){return !!this.mode&&Number.isInteger(stage)&&(stage===this.mode.nextStage||(this.mode.freeReplays&&stage>=1&&stage<=this.mode.highestCleared));}
  kind(stage){return stage<=this.mode.highestCleared?'FREE_REPLAY':'PAID';}
  async start(stage){
    if(this.pending)throw fail('integration.busy','通信中です。しばらくお待ちください。');
    if(this.uncertainStart)throw fail('integration.start_unknown','前回の開始結果が不明です。進捗を再取得してから、新しい挑戦を選んでください。');
    if(!this.canStart(stage))throw fail('stage.stage_not_playable','このステージはまだプレイできません。');
    this.pending=true;
    try{
      const data=await this.request('/play/plays',{method:'POST',body:{bootToken:this.token,stage}});
      const sm=data.stageMode,deadline=Date.parse(sm?.deadlineAt),expires=Date.parse(data.expiresAt);
      if(typeof data.playToken!=='string'||!data.playToken||data.mode!=='STAGE_CLEAR'||sm?.stage!==stage||!['PAID','FREE_REPLAY'].includes(sm?.kind)||!Number.isFinite(deadline)||!Number.isFinite(expires)||!Number.isFinite(sm.maxAttemptSeconds)||sm.maxAttemptSeconds<=0)throw fail('integration.bad_response','挑戦の開始情報を確認できませんでした。');
      const startedAt=this.now()+this.offset;
      this.attempt={stage,token:data.playToken,kind:sm.kind,clockOffset:this.offset,deadline:Math.min(deadline,expires,startedAt+sm.maxAttemptSeconds*1000),startedAt,finishedAt:null,clearBody:null,result:null,ended:false};
      // Balance is refreshed from /context; never subtract locally.
      this.context={...this.context};return this.attempt;
    }catch(e){if(e.httpStatus>=500||['integration.network','integration.bad_response','integration.http_error'].includes(e.code))this.uncertainStart=true;throw e;}
    finally{this.pending=false;}
  }
  remainingMs(){return this.attempt?Math.max(0,this.attempt.deadline-(this.now()+this.attempt.clockOffset)):0;}
  expired(){return !!this.attempt&&!this.attempt.ended&&!this.attempt.clearBody&&this.remainingMs()<=0;}
  finish(){
    const a=this.attempt;if(!a||a.ended)throw fail('integration.no_attempt','有効な挑戦がありません。');
    if(!a.clearBody){if(this.remainingMs()<=0)throw fail('stage.time_exceeded','時間切れです。');a.finishedAt=this.now()+a.clockOffset;a.clearBody={sessionToken:a.token,playTimeMs:Math.max(0,Math.round(a.finishedAt-a.startedAt))};}
  }
  end(){if(this.attempt)this.attempt.ended=true;}
  async clear(){
    if(this.pending)throw fail('integration.busy','通信中です。');
    const a=this.attempt;if(!a||!a.clearBody)throw fail('integration.no_attempt','クリア情報がありません。');
    if(a.result)return a.result;
    this.pending=true;
    try{
      const data=await this.request('/play/stage-clears',{method:'POST',body:a.clearBody});
      if(!['CLEARED','ALREADY_CLEARED','REPLAY','TIME_EXCEEDED'].includes(data.status)||data.stage!==a.stage)throw fail('integration.bad_response','クリア判定を確認できませんでした。');
      this.validateMode({...this.mode,totalStages:data.totalStages,highestCleared:data.highestCleared,nextStage:data.nextStage});
      a.result=data;a.ended=true;
      if(data.status!=='TIME_EXCEEDED')this.context={...this.context,stageMode:{...this.mode,totalStages:data.totalStages,highestCleared:data.highestCleared,nextStage:data.nextStage,rewardClaimed:data.reward?.status==='ISSUED'||this.mode.rewardClaimed}};
      return data;
    }finally{this.pending=false;}
  }
}
root.GameBullClient=GameBullClient;root.GameBullError=GameBullError;
if(typeof module!=='undefined')module.exports={GameBullClient,GameBullError};
})(typeof window==='undefined'?globalThis:window);
