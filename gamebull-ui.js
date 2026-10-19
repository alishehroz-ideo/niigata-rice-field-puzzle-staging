'use strict';
const GB = (()=>{
  const config=window.GAMEBULL_CONFIG,params=new URLSearchParams(location.search);
  // Any launch parameters require a valid GameBull connection; never silently enter demo mode.
  const enabled=!!config.apiBase||[...params].length>0;
  const client=new GameBullClient(config,{availableStages:LEVELS.length});
  let busy=false,reporting=false,lastClear=null,returnAfterRefresh=null;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const messages={
    'play.no_lives':'ライフが足りません。GameBullに戻って確認してください。',
    'stage.daily_limit_reached':'本日の挑戦回数の上限に達しました。進捗は保存されています。',
    'stage.stage_not_playable':'このステージはまだプレイできません。進捗を更新します。',
    'stage.all_cleared':'すべてのステージをクリア済みです。',
    'stage.stage_required':'ステージ番号の送信に問題があります。開発者へお問い合わせください。',
    'stage.play_token_required':'挑戦情報を確認できません。開発者へお問い合わせください。',
    'play.session_token_expired':'挑戦の有効期限が切れました。新しい挑戦を開始してください。',
    'stage.score_not_accepted':'クリア報告の設定に問題があります。開発者へお問い合わせください。'
  };
  function life(){
    const display=document.querySelector('.life-display');
    $('life-count').textContent=enabled?(client.lives??'—'):'—';
    display.querySelector('small').textContent=enabled?(client.context?'GameBull連携':'接続待ち'):'デモ・消費なし';
    display.setAttribute('aria-label',enabled?'GameBullのライフ '+(client.lives??'未取得'):'デモモード。ライフ消費なし');
  }
  function timer(){
    if(!enabled)return;
    document.querySelector('.timer small').textContent='残り時間';
    const a=client.attempt;
    $('timer').textContent=a?clock((a.finishedAt?Math.max(0,a.deadline-a.finishedAt):client.remainingMs())/1000):'—';
  }
  function blockControls(value){busy=value;document.querySelectorAll('.dpad button,#restart,#pause,#levels').forEach(b=>b.disabled=value);}
  function pageForNext(){return Math.floor(((client.mode?.nextStage??client.mode?.totalStages??1)-1)/16);}
  function canMove(){return !enabled||(!busy&&!client.uncertainStart&&client.attempt&&!client.attempt.ended&&!client.attempt.clearBody&&client.attempt.stage===index+1&&client.remainingMs()>0);}
  function canChoose(stage){return !enabled||client.canStart(stage);}
  function info(){
    if(!enabled)return '';
    if(!client.mode)return '<p>GameBullへの接続が必要です。</p>';
    const m=client.mode;
    return `<p class="gb-progress">クリア ${m.highestCleared} / ${m.totalStages} · ${m.nextStage===null?'全ステージクリア':`次は ${m.nextStage}`}<br>${m.freeReplays?'クリア済みは無料リプレイ。':'クリア済みのリプレイは無効です。'}${m.dailyAttemptsRemaining!==null&&m.dailyAttemptsRemaining!==undefined?` 本日の残り挑戦 ${esc(m.dailyAttemptsRemaining)} 回`:''}${m.rewardClaimed?' 報酬は受け取り済みです。':''}</p>`;
  }
  function error(e,{retryClear=false}={}){
    const message=messages[e.code]||e.message||'GameBullとの接続に失敗しました。';
    openModal(`<div class="result"><h2>${retryClear?'クリア結果を確認できません':e.code==='play.no_lives'?'ライフ不足':'GameBullからのお知らせ'}</h2><p>${esc(message)}</p>${client.uncertainStart?'<p>開始要求は自動再送しません。すでに1ライフ消費されている可能性があります。進捗を再取得してから、新しい挑戦を選んでください。</p>':''}<div class="modal-actions">${retryClear?'<button id="gb-clear-retry" class="primary">同じクリア報告を再送</button>':'<button id="gb-refresh" class="primary">進捗を再取得</button>'}<button id="gb-back">戻る</button></div></div>`,'GameBull');
    if(retryClear)$('gb-clear-retry').onclick=submitClear;
    else $('gb-refresh').onclick=()=>refreshMap();
    $('gb-back').onclick=()=>{if(retryClear){$('status').textContent='クリア結果を確認中です。再送して結果を確認してください。';closeModal();}else if(client.mode&&!client.uncertainStart)choose(pageForNext());else closeModal();};
  }
  async function refreshMap(){
    if(busy)return;blockControls(true);
    try{
      if(!client.token)client.configureLaunch(location.search);
      await client.refresh();client.uncertainStart=false;life();choose(pageForNext());
    }catch(e){error(e);}finally{blockControls(false);}
  }
  async function initialize(){
    life();if(!enabled)return;
    blockControls(true);
    openModal('<div class="result"><h2>GameBullに接続中…</h2><p>進捗とライフを確認しています。</p></div>','GameBull');
    try{client.configureLaunch(location.search);await client.refresh();life();choose(pageForNext());}
    catch(e){error(e);}finally{blockControls(false);timer();}
  }
  function pick(stage){
    if(!enabled){dialog.close();loadLevel(stage-1);return;}
    if(busy)return;
    if(!client.canStart(stage)){error(new GameBullError('stage.stage_not_playable',messages['stage.stage_not_playable']));return;}
    const free=client.kind(stage)==='FREE_REPLAY';
    const active=client.attempt&&!client.attempt.ended;
    openModal(`<div class="result"><h2>田んぼ ${stage}${free?'をリプレイ':'に挑戦'}</h2><p>${free?'クリア済みの無料リプレイです。進捗と報酬は変わりません。':'開始すると1ライフを消費します。'}${active?'<br>現在の挑戦を終了して、新しい挑戦を開始します。':''}<br>制限時間は ${clock(client.mode.maxAttemptSeconds)}。一時停止中も時間は進みます。</p><div class="modal-actions"><button id="gb-cancel" class="primary" autofocus>続ける</button><button id="gb-start">${free?'無料で開始':'1ライフで開始'}</button></div></div>`,'GameBull · 挑戦の確認');
    $('gb-cancel').onclick=()=>{if(canMove())closeModal();else choose(pageForNext());};
    $('gb-start').onclick=()=>start(stage);$('gb-cancel').focus();
  }
  async function start(stage){
    if(busy)return;blockControls(true);
    $('gb-start')?.setAttribute('disabled','');
    try{
      await client.start(stage);lastClear=null;reporting=false;dialog.close();loadLevel(stage-1);timer();
      $('life-count').textContent='…';
      try{await client.refresh();life();}catch{document.querySelector('.life-display small').textContent='残高の再取得が必要';$('life-count').textContent='—';}
    }catch(e){
      if(!client.uncertainStart){try{await client.refresh();life();}catch{} }
      error(e);
    }finally{blockControls(false);tick();}
  }
  function tick(){
    if(!enabled)return;timer();
    if(client.expired()){
      client.end();game.state='lost';animation=null;queued=null;resultAt=0;gesture=null;canvas.setAttribute('aria-busy','false');
      openModal('<div class="result"><h2>時間切れです</h2><p>この挑戦は終了しました。再挑戦は新しい開始になります。</p><div class="modal-actions"><button id="gb-time-retry" class="primary">再挑戦を選ぶ</button><button id="gb-time-map">ステージマップ</button></div></div>','GameBull');
      $('gb-time-retry').onclick=()=>pick(index+1);$('gb-time-map').onclick=()=>refreshMap();
    }
  }
  function rewardHtml(reward){
    if(!reward||reward.status==='NONE_CONFIGURED')return '';
    const text={ISSUED:'ギフト券が発行され、GameBullのクーポン一覧に入りました。',ALREADY_CLAIMED:'この店舗の報酬はすでに受け取り済みです。',NONE_CONFIGURED:'全ステージクリア！',OUT_OF_STOCK:'報酬は一時的に在庫切れです。後でGameBullアプリのゲーム画面から受け取れます。'}[reward.status]||'報酬の状態はGameBullでご確認ください。';
    return `<div class="gb-reward"><h3>${esc(reward.title||'全クリア報酬')}</h3><p>${esc(text)}</p>${reward.benefit?`<p>${esc(reward.benefit)}</p>`:''}<div id="gb-reward-image"></div>${reward.status==='ISSUED'&&safeUrl(reward.redeemUrl)?`<a class="gb-coupon" href="${esc(reward.redeemUrl)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">GameBullでギフト券を開く</a>`:''}</div>`;
  }
  function safeUrl(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}}
  function showResult(data){
    const good=['CLEARED','ALREADY_CLEARED','REPLAY'].includes(data.status),won=data.status==='CLEARED';
    const titles={CLEARED:'ステージクリア！',ALREADY_CLEARED:'このステージはクリア済みです',REPLAY:'リプレイ完了',TIME_EXCEEDED:'時間切れです'};
    if(good){const prev=records[index+1]?.best??0;records[index+1]={best:Math.max(prev,game.score),completed:!!records[index+1]?.completed};persist();update();}
    openModal(`<div class="result ${won?'celebrate':''}"><h2>${titles[data.status]}</h2><p>${data.allCleared?'全ステージクリア！':data.status==='REPLAY'?'進捗と報酬は変わりません。':data.status==='TIME_EXCEEDED'?'この挑戦はクリアになりませんでした。':'進捗はGameBullに保存されています。'}</p><div class="big-score">${game.score}<span style="font-size:12px"> 点</span></div><p>ゲーム内得点です。GBポイント・ランキングには反映されません。</p>${rewardHtml(data.reward)}<div class="modal-actions">${good&&data.nextStage!==null?'<button id="gb-next" class="primary">次の田んぼを選ぶ</button>':''}<button id="gb-result-map">ステージマップ</button>${client.canStart(index+1)?'<button id="gb-result-retry">もう一度選ぶ</button>':''}</div></div>`,'GameBull · '+data.status);
    if($('gb-next'))$('gb-next').onclick=()=>pick(data.nextStage);
    $('gb-result-map').onclick=()=>refreshMap();if($('gb-result-retry'))$('gb-result-retry').onclick=()=>pick(index+1);
    if(data.reward&&safeUrl(data.reward.imageUrl)&&$('gb-reward-image')){const im=new Image();im.alt=data.reward.title||'全クリア報酬';im.referrerPolicy='no-referrer';im.src=data.reward.imageUrl;im.className='gb-reward-image';$('gb-reward-image').append(im);}
  }
  async function submitClear(){
    if(busy)return;blockControls(true);reporting=true;
    openModal('<div class="result"><h2>クリアを確認中…</h2><p>GameBullの判定をお待ちください。</p></div>','GameBull');
    try{
      const data=await client.clear();lastClear=data;
      try{await client.refresh();life();}catch{/* The clear response remains authoritative. */}
      showResult(data);
    }catch(e){if(e.code==='play.session_token_expired'){client.end();error(e);}else error(e,{retryClear:true});}
    finally{reporting=false;blockControls(false);}
  }
  function result(){
    if(!enabled)return false;
    if(game.state==='won'){
      try{client.finish();submitClear();}catch(e){client.end();error(e);}
    }else{
      client.end();openModal('<div class="result"><h2>進めるマスがありません</h2><p>失敗による追加消費はありません。再挑戦は新しい開始になります。</p><div class="modal-actions"><button id="gb-loss-retry" class="primary">再挑戦を選ぶ</button><button id="gb-loss-map">ステージマップ</button></div></div>','GameBull');
      $('gb-loss-retry').onclick=()=>pick(index+1);$('gb-loss-map').onclick=()=>refreshMap();
    }
    return true;
  }
  function retry(){if(!enabled)return false;if(busy)return true;if(client.attempt?.clearBody&&!client.attempt.result&&!client.attempt.ended){submitClear();return true;}pick(index+1);return true;}
  function openMap(){if(!enabled)return false;if(busy)return true;if(client.attempt?.clearBody&&!client.attempt.result&&!client.attempt.ended){submitClear();return true;}if(!client.mode)refreshMap();else choose(pageForNext());return true;}
  function canClose(){return !enabled||!busy;}
  function captureWin(){if(enabled){try{client.finish();}catch{tick();}}}
  return {enabled,initialize,canMove,canChoose,info,pick,retry,result,tick,timer,openMap,canClose,pageForNext,refreshMap,captureWin,totalStages:()=>client.mode?.totalStages??LEVELS.length,
    isCleared:stage=>enabled&&!!client.mode&&stage<=client.mode.highestCleared,
    label:stage=>!enabled?'':client.mode&&stage<=client.mode.highestCleared?(client.mode.freeReplays?'無料リプレイ':'クリア済み'):client.mode?.nextStage===stage?'挑戦 · 1ライフ':'ロック中'};
})();
