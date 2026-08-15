(() => {
"use strict";

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const SAVE="equate-build5-save", BEST="equate-build5-best";
const SYMBOL={add:"+",sub:"−",mul:"×",div:"÷"};
const LABEL={add:"Addition",sub:"Subtraction",mul:"Multiplication",div:"Division",mixed:"Mixed"};
const DIRS={right:[0,1],down:[1,0],dr:[1,1],dl:[1,-1],left:[0,-1],up:[-1,0],ur:[-1,1],ul:[-1,-1]};
const DIFF={
 beginner:{base:1,size:4,max:9},
 intermediate:{base:41,size:5,max:30},
 advanced:{base:81,size:6,max:99},
 expert:{base:121,size:7,max:250}
};

const state={
 op:null,difficulty:null,stage:1,rows:4,cols:4,board:[],
 selected:[],hintCells:[],found:0,baseScore:0,penalty:0,freeUndos:2,
 history:[],secondsLeft:600,timerId:null,paused:false,sound:true,stageActive:false,
 pointerDown:false,inputEnabled:true,runningScore:0,page:1
};

const rnd=(a,b)=>Math.floor(Math.random()*(b-a+1))+a;
const idx=(r,c)=>r*state.cols+c;
const coord=i=>[Math.floor(i/state.cols),i%state.cols];
const inBounds=(r,c)=>r>=0&&c>=0&&r<state.rows&&c<state.cols;
const cap=s=>s?s[0].toUpperCase()+s.slice(1):"";

function show(id){$$(".screen").forEach(x=>x.classList.toggle("active",x.id===id))}
function ops(){return state.op==="mixed"?["add","sub","mul","div"]:[state.op]}

function rules(){
 const d=DIFF[state.difficulty], local=Math.max(1,state.stage-d.base+1);
 let size=d.size;
 if(state.difficulty==="beginner"){size=local<=2?4:local<=8?5:6}
 else size+=Math.floor((local-1)/10);
 const diag=state.difficulty!=="beginner"||local>=5;
 const reverse=state.difficulty==="advanced"||state.difficulty==="expert"||local>=45;
 let max=d.max;
 if(state.difficulty==="beginner") max=local<=10?9:local<=20?20:local<=30?50:99;
 return {local,size,diag,reverse,max};
}

function equationValid(a,b,c,op){
 if(op==="add")return a+b===c;
 if(op==="sub")return a-b===c;
 if(op==="mul")return a*b===c;
 return b!==0&&a/b===c&&Number.isInteger(c);
}
function makeEquation(op,max){
 let a,b,c;
 if(op==="add"){a=rnd(1,max);b=rnd(1,max);c=a+b}
 else if(op==="sub"){c=rnd(0,max);b=rnd(1,max);a=b+c}
 else if(op==="mul"){const m=Math.max(3,Math.min(15,Math.floor(Math.sqrt(max*2))));a=rnd(2,m);b=rnd(2,m);c=a*b}
 else{const m=Math.max(3,Math.min(12,Math.floor(Math.sqrt(max*2))));b=rnd(2,m);c=rnd(1,m);a=b*c}
 return {a,b,c,op,text:`${a} ${SYMBOL[op]} ${b} = ${c}`};
}
function allowedDirs(){
 const r=rules(), arr=["right","down"];
 if(r.diag)arr.push("dr","dl");
 if(r.reverse)arr.push("left","up","ur","ul");
 return arr;
}
function directionAllowed(d){
 if(!d)return false;
 const r=rules();
 if(d.dr===0&&d.dc===1)return true;
 if(d.dr===1&&d.dc===0)return true;
 if(r.diag&&d.dr===1&&Math.abs(d.dc)===1)return true;
 if(r.reverse){
   if(d.dr===0&&d.dc===-1)return true;
   if(d.dr===-1&&d.dc===0)return true;
   if(r.diag&&d.dr===-1&&Math.abs(d.dc)===1)return true;
 }
 return false;
}

function newBoard(){
 state.inputEnabled=false; state.pointerDown=false; state.selected=[]; state.hintCells=[]; state.history=[];
 const r=rules(); state.rows=r.size;state.cols=r.size;
 let chosen=null;

 for(let attempt=0;attempt<120;attempt++){
   const board=Array.from({length:state.rows*state.cols},(_,i)=>({id:i,value:null,blank:false}));
   const planted=[];
   const target=state.rows<=4?4:state.rows===5?5:6;
   let safe=0;
   while(planted.length<target&&safe++<350){
     const opList=ops(),op=opList[rnd(0,opList.length-1)],eq=makeEquation(op,r.max),dirs=allowedDirs(),dirName=dirs[rnd(0,dirs.length-1)];
     const [dr,dc]=DIRS[dirName];
     for(let t=0;t<80;t++){
       const sr=rnd(0,state.rows-1),sc=rnd(0,state.cols-1);
       const er=sr+dr*2,ec=sc+dc*2;if(!inBounds(er,ec))continue;
       const cells=[idx(sr,sc),idx(sr+dr,sc+dc),idx(sr+dr*2,sc+dc*2)];
       if(cells.some(i=>board[i].value!==null))continue;
       [eq.a,eq.b,eq.c].forEach((v,k)=>board[cells[k]].value=v);
       planted.push({...eq,cells,dirName});break;
     }
   }
   if(!chosen||planted.length>chosen.planted.length)chosen={board,planted};
   if(planted.length>=3)break;
 }
 state.board=chosen.board;
 for(const cell of state.board)if(cell.value===null)cell.value=state.difficulty==="beginner"?rnd(0,r.max):rnd(0,Math.max(12,r.max));
 renderBoard();
 state.inputEnabled=true;
 feedback(`Page ${state.page} — find an equation.`,"");
 save();
}

function sameLine(a,b){
 if(a===b)return null;
 const [r1,c1]=coord(a),[r2,c2]=coord(b),rd=r2-r1,cd=c2-c1;
 if(!(rd===0&&cd!==0)&&!(cd===0&&rd!==0)&&!(Math.abs(rd)===Math.abs(cd)&&rd!==0))return null;
 return {dr:Math.sign(rd),dc:Math.sign(cd)};
}
function rayConnect(a,b){
 const d=sameLine(a,b);if(!d)return null;
 const [r2,c2]=coord(b);let [r,c]=coord(a);r+=d.dr;c+=d.dc;
 while(r!==r2||c!==c2){if(!state.board[idx(r,c)].blank)return null;r+=d.dr;c+=d.dc}
 return d;
}
function canAppend(i){
 if(!state.inputEnabled)return {ok:false,msg:"One moment…"};
 if(state.board[i].blank)return {ok:false,msg:"That tile is already cleared."};
 if(state.selected.includes(i))return {ok:false,msg:"That number is already selected."};
 if(state.selected.length===0)return {ok:true};
 const prev=state.selected[state.selected.length-1],d=rayConnect(prev,i);
 if(!d)return {ok:false,msg:"Not allowed — an uncleared number blocks that path."};
 if(!directionAllowed(d)){
   if(!rules().diag&&Math.abs(d.dr)===1&&Math.abs(d.dc)===1)return {ok:false,msg:"Diagonal equations unlock soon."};
   return {ok:false,msg:"That direction unlocks later."};
 }
 if(state.selected.length>=2){
   const first=rayConnect(state.selected[0],state.selected[1]);
   if(first&&(first.dr!==d.dr||first.dc!==d.dc))return {ok:false,msg:"Stay in one direction."};
 }
 return {ok:true};
}
function currentEquation(){
 if(state.selected.length!==3)return null;
 const [a,b,c]=state.selected.map(i=>state.board[i].value);
 for(const op of ops())if(equationValid(a,b,c,op))return {a,b,c,op,text:`${a} ${SYMBOL[op]} ${b} = ${c}`};
 return null;
}
function clearSelection(delay=0){
 setTimeout(()=>{state.selected=[];state.hintCells=[];syncClasses()},delay);
}
function selectTile(i){
 if(!state.stageActive||state.paused||!state.inputEnabled)return;
 if(state.selected.includes(i)){clearSelection();feedback("Selection cleared.","");return}
 const test=canAppend(i);
 if(!test.ok){feedback(test.msg,"bad");sound("bad");flash(i);clearSelection(180);return}
 state.selected.push(i);state.hintCells=[];syncClasses();
 if(state.selected.length===3){
   const eq=currentEquation();
   if(eq)solve(eq);
   else{feedback("Not an equation — try again.","bad");sound("bad");state.selected.forEach(flash);clearSelection(240)}
 }
}
function solve(eq){
 state.inputEnabled=false;
 state.history.push({cells:state.selected.map(i=>({i,value:state.board[i].value,blank:state.board[i].blank})),found:state.found,baseScore:state.baseScore});
 state.selected.forEach(i=>state.board[i].blank=true);
 state.found++;state.baseScore=Math.min(100,state.baseScore+10);
 showEquation(eq.text);feedback("Correct!","good");sound("good");
 state.selected=[];state.hintCells=[];renderAll();save();
 if(state.found>=10){finish(false);return}
 setTimeout(()=>{
   if(enumerate(1).length===0){
     state.page++;
     feedback("Next page…","good");
     setTimeout(newBoard,350);
   }else{
     state.inputEnabled=true;syncClasses();
   }
 },220);
}
function enumerate(limit=10){
 const hits=[],dirs=allowedDirs();
 for(let i=0;i<state.board.length;i++){
   if(state.board[i].blank)continue;
   const [sr,sc]=coord(i);
   for(const name of dirs){
     const [dr,dc]=DIRS[name];
     let r=sr+dr,c=sc+dc,second=null;
     while(inBounds(r,c)){const j=idx(r,c);if(!state.board[j].blank){second=j;break}r+=dr;c+=dc}
     if(second===null)continue;
     r+=dr;c+=dc;let third=null;
     while(inBounds(r,c)){const j=idx(r,c);if(!state.board[j].blank){third=j;break}r+=dr;c+=dc}
     if(third===null)continue;
     const [a,b,cval]=[i,second,third].map(x=>state.board[x].value);
     for(const op of ops())if(equationValid(a,b,cval,op)){
       hits.push({cells:[i,second,third],eq:{text:`${a} ${SYMBOL[op]} ${b} = ${cval}`}});
       if(hits.length>=limit)return hits;
     }
   }
 }
 return hits;
}
function hint(){
 if(!state.stageActive||state.paused)return;
 const hits=enumerate(1);
 if(!hits.length){state.page++;feedback("New page…","warn");setTimeout(newBoard,300);return}
 state.selected=[];state.hintCells=hits[0].cells;syncClasses();feedback(`Hint: ${hits[0].eq.text}`,"warn");sound("hint");
}
function undo(){
 if(!state.stageActive||state.paused)return;
 const snap=state.history.pop();
 if(!snap){feedback("Nothing to undo on this page.","warn");return}
 snap.cells.forEach(c=>{state.board[c.i].value=c.value;state.board[c.i].blank=c.blank});
 state.found=snap.found;state.baseScore=snap.baseScore;
 if(state.freeUndos>0){state.freeUndos--;feedback("Undo used — free.","warn")}
 else{state.penalty+=5;feedback("Undo used — 5 point penalty.","warn")}
 state.inputEnabled=true;state.selected=[];state.hintCells=[];renderAll();save();
}

function renderBoard(){
 const board=$("#board");board.innerHTML="";board.style.setProperty("--cols",state.cols);
 state.board.forEach((cell,i)=>{
   const b=document.createElement("button");b.type="button";b.className="cell";b.dataset.i=i;
   if(cell.blank){b.classList.add("blank");b.setAttribute("aria-label","cleared")}
   else{b.textContent=cell.value;b.setAttribute("aria-label",String(cell.value))}
   board.appendChild(b);
 });
 fitBoard();syncClasses();
}
function syncClasses(){
 $$("#board .cell").forEach((el,i)=>{
   el.classList.toggle("selected",state.selected.includes(i));
   el.classList.toggle("hint",state.hintCells.includes(i));
   el.classList.remove("match-peer");
 });
 if(state.selected.length&&state.difficulty==="beginner"&&rules().local<=6){
   const v=state.board[state.selected[0]].value;
   $$("#board .cell").forEach((el,i)=>{if(!state.board[i].blank&&state.board[i].value===v&&!state.selected.includes(i))el.classList.add("match-peer")});
 }
}
function fitBoard(){
 const wrap=$("#boardWrap");if(!wrap||!state.cols)return;
 const w=Math.max(220,wrap.clientWidth-16),h=Math.max(220,wrap.clientHeight-16);
 let cell=Math.floor(Math.min(w/state.cols,h/state.rows));
 cell=Math.max(42,Math.min(92,cell));
 $("#board").style.setProperty("--cell",cell+"px");
}
function renderAll(){
 $("#stageLabel").textContent=state.stage;$("#modeLabel").textContent=`${LABEL[state.op]} · ${cap(state.difficulty)}`;
 $("#runningScoreLabel").textContent=(state.runningScore||0)+state.baseScore;
 $("#bestLabel").textContent=loadBest();$("#foundLabel").textContent=state.found;$("#scoreLabel").textContent=state.baseScore;
 $("#progressFill").style.width=Math.min(100,state.found*10)+"%";$("#undoCost").textContent=state.freeUndos>0?`${state.freeUndos} free`:"−5 points";
 renderTimer();renderBoard();
}
function renderTimer(){
 const s=state.secondsLeft,m=Math.floor(s/60),sec=s%60,pct=s/600;
 $("#timerLabel").textContent=`${m}:${String(sec).padStart(2,"0")}`;
 const deg=Math.max(0,Math.min(360,pct*360));
 $("#timerRing").style.background=`conic-gradient(#5df02e 0 ${deg*.35}deg,#ffe126 ${deg*.35}deg ${deg*.63}deg,#ff7c16 ${deg*.63}deg ${deg*.82}deg,#ff4d55 ${deg*.82}deg ${deg}deg,#201825 ${deg}deg 360deg)`;
}
function showEquation(t){$("#equationToast").textContent=t+" ✓";clearTimeout(showEquation.t);showEquation.t=setTimeout(()=>$("#equationToast").textContent="",1300)}
function feedback(t,type=""){const e=$("#message");e.textContent=t;e.className="message "+type}
function flash(i){const e=$(`#board .cell[data-i="${i}"]`);if(!e)return;e.classList.remove("rejected");void e.offsetWidth;e.classList.add("rejected");setTimeout(()=>e.classList.remove("rejected"),260)}

let audioCtx=null;
function tone(freq,dur=.07,type="sine",gain=.035,delay=0){
 if(!state.sound)return;
 try{if(!audioCtx)audioCtx=new(window.AudioContext||window.webkitAudioContext)();const s=audioCtx.currentTime+delay,o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=type;o.frequency.setValueAtTime(freq,s);g.gain.setValueAtTime(.0001,s);g.gain.exponentialRampToValueAtTime(gain,s+.006);g.gain.exponentialRampToValueAtTime(.0001,s+dur);o.connect(g);g.connect(audioCtx.destination);o.start(s);o.stop(s+dur+.02)}catch{}
}
function sound(k){
 if(k==="good"){tone(660,.06);tone(880,.08,"sine",.04,.06)}
 else if(k==="bad")tone(170,.09,"square",.02);
 else if(k==="hint"){tone(520,.05);tone(690,.06,"sine",.03,.05)}
 else if(k==="clear"){tone(523,.07);tone(659,.07,"sine",.04,.06);tone(784,.12,"sine",.045,.12)}
 else if(k==="tick")tone(950,.03,"square",.016);
 else if(k==="pause")tone(330,.04,"sine",.02);
 if(navigator.vibrate)navigator.vibrate(k==="bad"?[18,20,18]:22);
}
function startTimer(){
 clearInterval(state.timerId);state.timerId=setInterval(()=>{
   if(!state.stageActive||state.paused)return;
   state.secondsLeft=Math.max(0,state.secondsLeft-1);renderTimer();
   if(state.secondsLeft>0&&state.secondsLeft<=5)sound("tick");
   if(state.secondsLeft===0)finish(true);else if(state.secondsLeft%10===0)save();
 },1000);
}
function bonus(){return Math.round((state.secondsLeft/600)*50)}
function loadBest(){return Number(localStorage.getItem(BEST)||0)}
function saveBest(v){if(v>loadBest())localStorage.setItem(BEST,String(v))}
function finish(timedOut){
 if(!state.stageActive)return;state.stageActive=false;state.inputEnabled=false;clearInterval(state.timerId);
 const b=bonus(),stagePoints=Math.max(0,state.baseScore+b-state.penalty),passed=state.found>=8,perfect=state.found>=10;
 if(passed)state.runningScore+=stagePoints;saveBest(state.runningScore);clearSave();if(perfect)sound("clear");
 $("#resultBadge").textContent=perfect?"PERFECT CLEAR":passed?"PASS":"REPLAY";
 $("#resultTitle").textContent=timedOut?"Time!":perfect?"Perfect Clear!":passed?"Stage Passed":"Keep Going";
 $("#resultBase").textContent=state.baseScore;$("#resultBonus").textContent="+"+b;$("#resultPenalty").textContent=state.penalty?"−"+state.penalty:"0";$("#resultTotal").textContent=stagePoints;
 $("#nextBtn").hidden=!passed;$("#stageOverlay").hidden=false;$("#runningScoreLabel").textContent=state.runningScore;
}
function startStage(){
 state.found=0;state.baseScore=0;state.penalty=0;state.freeUndos=2;state.history=[];state.secondsLeft=600;state.selected=[];state.hintCells=[];state.paused=false;state.stageActive=true;state.inputEnabled=true;state.page=1;
 $("#stageOverlay").hidden=true;$("#pauseOverlay").hidden=true;show("game");newBoard();renderAll();startTimer();save();
}
function pause(){if(!state.stageActive)return;state.paused=true;state.pointerDown=false;$("#pauseOverlay").hidden=false;sound("pause")}
function resume(){state.paused=false;state.inputEnabled=true;$("#pauseOverlay").hidden=true;sound("pause")}

function save(){
 if(!state.stageActive)return;
 localStorage.setItem(SAVE,JSON.stringify({op:state.op,difficulty:state.difficulty,stage:state.stage,rows:state.rows,cols:state.cols,board:state.board,found:state.found,baseScore:state.baseScore,penalty:state.penalty,freeUndos:state.freeUndos,history:state.history,secondsLeft:state.secondsLeft,runningScore:state.runningScore,page:state.page}));
 $("#resumeBtn").hidden=false;
}
function clearSave(){localStorage.removeItem(SAVE);$("#resumeBtn").hidden=true}
function restore(){
 const raw=localStorage.getItem(SAVE);if(!raw)return;Object.assign(state,JSON.parse(raw));
 state.selected=[];state.hintCells=[];state.paused=false;state.stageActive=true;state.inputEnabled=true;state.pointerDown=false;
 show("game");renderAll();startTimer();
}

/* robust delegated input; survives every board/page rebuild */
$("#board").addEventListener("pointerdown",e=>{
 if(!state.stageActive||state.paused||!state.inputEnabled)return;
 const cell=e.target.closest(".cell");if(!cell||cell.classList.contains("blank"))return;
 e.preventDefault();state.pointerDown=true;selectTile(Number(cell.dataset.i));
});
$("#board").addEventListener("pointermove",e=>{
 if(!state.pointerDown||!state.stageActive||state.paused||!state.inputEnabled)return;
 const el=document.elementFromPoint(e.clientX,e.clientY),cell=el&&el.closest?el.closest(".cell"):null;
 if(!cell||cell.classList.contains("blank"))return;
 const i=Number(cell.dataset.i);if(state.selected[state.selected.length-1]!==i)selectTile(i);
});
function endPointer(){state.pointerDown=false}
window.addEventListener("pointerup",endPointer);window.addEventListener("pointercancel",endPointer);window.addEventListener("blur",endPointer);

$("#startBtn").onclick=()=>show("setup");
$$("[data-back]").forEach(b=>b.onclick=()=>show(b.dataset.back));
$("#operationChoices").onclick=e=>{const b=e.target.closest("[data-op]");if(!b)return;state.op=b.dataset.op;$$("#operationChoices .choice").forEach(x=>x.classList.toggle("selected",x===b));$("#playBtn").disabled=!(state.op&&state.difficulty)};
$("#difficultyChoices").onclick=e=>{const b=e.target.closest("[data-diff]");if(!b)return;state.difficulty=b.dataset.diff;$$("#difficultyChoices .choice").forEach(x=>x.classList.toggle("selected",x===b));$("#playBtn").disabled=!(state.op&&state.difficulty)};
$("#playBtn").onclick=()=>{state.stage=DIFF[state.difficulty].base;state.runningScore=0;startStage()};
$("#hintBtn").onclick=hint;$("#undoBtn").onclick=undo;$("#pauseBtn").onclick=pause;$("#resumeGameBtn").onclick=resume;
$("#settingsBtn").onclick=()=>feedback("Settings will stay simple — sound is available at the top.","warn");
$("#exitBtn").onclick=()=>{save();clearInterval(state.timerId);state.stageActive=false;show("home")};
$("#replayBtn").onclick=()=>startStage();
$("#nextBtn").onclick=()=>{state.stage++;startStage()};
$("#soundBtn").onclick=()=>{state.sound=!state.sound;$("#soundBtn").textContent=state.sound?"🔊":"🔇"};
$("#resumeBtn").onclick=restore;
window.addEventListener("resize",()=>requestAnimationFrame(fitBoard));window.addEventListener("orientationchange",()=>setTimeout(fitBoard,120));
document.addEventListener("visibilitychange",()=>{if(document.hidden&&state.stageActive&&!state.paused)pause()});
$("#resumeBtn").hidden=!localStorage.getItem(SAVE);
})();