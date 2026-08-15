(() => {
"use strict";

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const SAVE_KEY = "equate-save-v2";
const BEST_KEY = "equate-bests-v2";

const SYMBOL = { add:"+", sub:"−", mul:"×", div:"÷" };
const LABEL = { add:"Addition", sub:"Subtraction", mul:"Multiplication", div:"Division", mixed:"Mixed" };

const DIRS = {
  right:[0,1], left:[0,-1], down:[1,0], up:[-1,0],
  dr:[1,1], dl:[1,-1], ur:[-1,1], ul:[-1,-1]
};

const DIFF = {
  beginner:     { base:1,   size:4, max:9,   diag:false, reverse:false, snake:false },
  intermediate: { base:41,  size:5, max:30,  diag:true,  reverse:false, snake:false },
  advanced:     { base:81,  size:6, max:99,  diag:true,  reverse:true,  snake:false },
  expert:       { base:121, size:7, max:250, diag:true,  reverse:true,  snake:true }
};

const state = {
  op:null, difficulty:null, stage:1,
  rows:0, cols:0, board:[],
  selected:[], hintCells:[],
  found:0, baseScore:0, penalty:0, freeUndos:2,
  history:[], secondsLeft:600, timerId:null,
  paused:false, sound:true, stageActive:false,
  pointerDown:false
};

const rnd = (a,b) => Math.floor(Math.random()*(b-a+1))+a;
const idx = (r,c) => r*state.cols+c;
const coord = (i) => [Math.floor(i/state.cols), i%state.cols];
const inBounds = (r,c) => r>=0 && c>=0 && r<state.rows && c<state.cols;
const cap = s => s ? s[0].toUpperCase()+s.slice(1) : "";

function showScreen(id){
  $$(".screen").forEach(x => x.classList.toggle("active", x.id===id));
}

function rules(){
  const d = DIFF[state.difficulty];
  const local = Math.max(1, state.stage-d.base+1);

  let size = d.size;
  if(state.difficulty==="beginner"){
    if(local<=2) size=4;
    else if(local<=8) size=5;
    else size=6;
  } else {
    size += Math.floor((local-1)/10);
  }

  const diag = state.difficulty!=="beginner" || local>=5;
  const reverse = state.difficulty==="advanced" || state.difficulty==="expert" || local>=45;
  const snake = state.difficulty==="expert" && local>=10;

  let max = d.max;
  if(state.difficulty==="beginner"){
    if(local<=10) max=9;
    else if(local<=20) max=20;
    else if(local<=30) max=50;
    else max=99;
  }

  return {local,size,diag,reverse,snake,max};
}

function operationPool(){
  return state.op==="mixed" ? ["add","sub","mul","div"] : [state.op];
}

function makeEquation(op,max){
  let a,b,c;

  if(op==="add"){
    a=rnd(1,max);
    b=rnd(1,max);
    c=a+b;
  } else if(op==="sub"){
    c=rnd(0,max);
    b=rnd(1,max);
    a=b+c;
  } else if(op==="mul"){
    const m=Math.max(3,Math.min(15,Math.floor(Math.sqrt(max*2))));
    a=rnd(2,m);
    b=rnd(2,m);
    c=a*b;
  } else {
    const m=Math.max(3,Math.min(12,Math.floor(Math.sqrt(max*2))));
    b=rnd(2,m);
    c=rnd(1,m);
    a=b*c;
  }

  return {a,b,c,op,text:`${a} ${SYMBOL[op]} ${b} = ${c}`};
}

function equationIsValid(a,b,c,op){
  if(op==="add") return a+b===c;
  if(op==="sub") return a-b===c;
  if(op==="mul") return a*b===c;
  if(op==="div") return b!==0 && a/b===c && Number.isInteger(c);
  return false;
}

function selectedEquation(){
  if(state.selected.length!==3) return null;
  const [a,b,c]=state.selected.map(i=>state.board[i].value);
  for(const op of operationPool()){
    if(equationIsValid(a,b,c,op)){
      return {a,b,c,op,text:`${a} ${SYMBOL[op]} ${b} = ${c}`};
    }
  }
  return null;
}

function allowedDirections(){
  const r=rules();
  let d=["right","down"];
  if(r.diag) d.push("dr","dl");
  if(r.reverse) d.push("left","up","ur","ul");
  return d;
}

function newCell(i){
  return {id:i,value:null,blank:false};
}

function plantTriple(board,eq,dirName){
  const [dr,dc]=DIRS[dirName];

  for(let tries=0;tries<100;tries++){
    const sr=rnd(0,state.rows-1), sc=rnd(0,state.cols-1);
    const er=sr+dr*2, ec=sc+dc*2;
    if(!inBounds(er,ec)) continue;

    const cells=[
      idx(sr,sc),
      idx(sr+dr,sc+dc),
      idx(sr+dr*2,sc+dc*2)
    ];

    if(cells.some(i=>board[i].value!==null)) continue;

    board[cells[0]].value=eq.a;
    board[cells[1]].value=eq.b;
    board[cells[2]].value=eq.c;
    return cells;
  }
  return null;
}

function generateBoard(){
  const r=rules();
  state.rows=r.size;
  state.cols=r.size;

  let best=null;

  for(let attempt=0;attempt<100;attempt++){
    const board=Array.from({length:state.rows*state.cols},(_,i)=>newCell(i));
    const planted=[];
    const target = state.rows<=4 ? 4 : state.rows===5 ? 5 : 6;
    const dirs=allowedDirections();

    let safety=0;
    while(planted.length<target && safety++<300){
      const ops=operationPool();
      const op=ops[rnd(0,ops.length-1)];
      const eq=makeEquation(op,r.max);
      const dir=dirs[rnd(0,dirs.length-1)];
      const cells=plantTriple(board,eq,dir);
      if(cells) planted.push({...eq,cells,dir});
    }

    if(!best || planted.length>best.planted.length) best={board,planted};
    if(planted.length>=Math.min(4,target)) break;
  }

  state.board=best.board;

  // Distractors use whole numbers too. Early beginner stays simple.
  for(const cell of state.board){
    if(cell.value===null){
      cell.value = state.difficulty==="beginner"
        ? rnd(0,r.max)
        : rnd(0,Math.max(r.max,12));
    }
  }

  state.selected=[];
  state.hintCells=[];
  renderBoard();
}

function sameLineDirection(a,b){
  if(a===b) return null;
  const [r1,c1]=coord(a), [r2,c2]=coord(b);
  const rd=r2-r1, cd=c2-c1;

  const sameRow=rd===0 && cd!==0;
  const sameCol=cd===0 && rd!==0;
  const diag=Math.abs(rd)===Math.abs(cd) && rd!==0;
  if(!(sameRow||sameCol||diag)) return null;

  return {dr:Math.sign(rd),dc:Math.sign(cd)};
}

/*
  Core Equate rule:
  A remaining number may connect to another remaining number in a valid straight
  direction when every tile between them has already been cleared.
  An uncleared number blocks the path.
*/
function rayConnect(a,b){
  const d=sameLineDirection(a,b);
  if(!d) return null;

  const [r2,c2]=coord(b);
  let [r,c]=coord(a);
  r+=d.dr; c+=d.dc;

  while(r!==r2 || c!==c2){
    const middle=state.board[idx(r,c)];
    if(!middle.blank) return null;
    r+=d.dr; c+=d.dc;
  }
  return d;
}

function directionAllowed(d){
  if(!d) return false;
  const r=rules();

  if(d.dr===0 && d.dc===1) return true;  // left to right
  if(d.dr===1 && d.dc===0) return true;  // top to bottom

  if(r.diag && d.dr===1 && Math.abs(d.dc)===1) return true;

  if(r.reverse){
    if(d.dr===0 && d.dc===-1) return true;
    if(d.dr===-1 && d.dc===0) return true;
    if(r.diag && d.dr===-1 && Math.abs(d.dc)===1) return true;
  }
  return false;
}

function canAppend(i){
  if(state.board[i].blank) return {ok:false,msg:"That tile is already cleared."};
  if(state.selected.includes(i)) return {ok:false,msg:"That number is already selected."};
  if(state.selected.length===0) return {ok:true};

  const prev=state.selected[state.selected.length-1];
  const d=rayConnect(prev,i);

  if(!d){
    return {ok:false,msg:"Not allowed — the numbers must connect with no uncleared number between them."};
  }

  if(!directionAllowed(d)){
    const r=rules();
    if(!r.diag && Math.abs(d.dr)===1 && Math.abs(d.dc)===1){
      return {ok:false,msg:"Diagonal equations unlock in later stages."};
    }
    return {ok:false,msg:"That direction unlocks later."};
  }

  // Normal play: one equation stays in one straight direction.
  // Expert snake handling can be expanded after the whole-number test is approved.
  if(state.selected.length>=2){
    const first=rayConnect(state.selected[0],state.selected[1]);
    if(first && (first.dr!==d.dr || first.dc!==d.dc)){
      return {ok:false,msg:"Stay in one direction for this stage."};
    }
  }

  return {ok:true};
}

function addSelection(i){
  const result=canAppend(i);
  if(!result.ok){
    feedback(result.msg,"bad");
    vibrate("bad");
    flashRejected(i);
    return;
  }

  state.selected.push(i);
  state.hintCells=[];
  syncSelectionClasses();

  if(state.selected.length===3){
    const eq=selectedEquation();
    if(eq){
      solve(eq);
    }else{
      feedback("Not an equation — try again.","bad");
      vibrate("bad");
      setTimeout(()=>{
        state.selected=[];
        syncSelectionClasses();
      },320);
    }
  }
}

function solve(eq){
  const snap={
    cells:state.selected.map(i=>({
      i,value:state.board[i].value,blank:state.board[i].blank
    })),
    found:state.found,
    baseScore:state.baseScore
  };
  state.history.push(snap);

  for(const i of state.selected){
    state.board[i].blank=true;
  }

  state.found++;
  state.baseScore=Math.min(100,state.baseScore+10);

  showEquation(eq.text);
  feedback("Correct!","good");
  vibrate("good");

  state.selected=[];
  state.hintCells=[];
  renderAll();
  saveProgress();

  if(state.found>=10){
    finishStage(false);
    return;
  }

  // If this small board is exhausted, generate another board while preserving stage score/timer.
  setTimeout(()=>{
    if(state.stageActive && enumerateEquations(1).length===0){
      feedback("Board cleared — keep going.","good");
      setTimeout(()=>{
        generateBoard();
        feedback("Find the next equation.","");
        saveProgress();
      },500);
    }
  },350);
}

function enumerateEquations(limit=10){
  const hits=[];
  const dirs=allowedDirections();

  for(let i=0;i<state.board.length;i++){
    if(state.board[i].blank) continue;

    const [sr,sc]=coord(i);

    for(const name of dirs){
      const [dr,dc]=DIRS[name];

      // Find visible second number along this ray.
      let r=sr+dr,c=sc+dc;
      let second=null;
      while(inBounds(r,c)){
        const j=idx(r,c);
        if(!state.board[j].blank){ second=j; break; }
        r+=dr;c+=dc;
      }
      if(second===null) continue;

      // Find visible third number continuing in same direction.
      r+=dr;c+=dc;
      let third=null;
      while(inBounds(r,c)){
        const j=idx(r,c);
        if(!state.board[j].blank){ third=j; break; }
        r+=dr;c+=dc;
      }
      if(third===null) continue;

      const vals=[i,second,third].map(x=>state.board[x].value);
      for(const op of operationPool()){
        if(equationIsValid(vals[0],vals[1],vals[2],op)){
          hits.push({
            cells:[i,second,third],
            eq:{a:vals[0],b:vals[1],c:vals[2],op,
                text:`${vals[0]} ${SYMBOL[op]} ${vals[1]} = ${vals[2]}`}
          });
          if(hits.length>=limit) return hits;
        }
      }
    }
  }
  return hits;
}

function useHint(){
  if(!state.stageActive || state.paused) return;
  const hits=enumerateEquations(1);

  if(!hits.length){
    feedback("No equation is available. Loading a new board…","warn");
    setTimeout(()=>generateBoard(),450);
    return;
  }

  state.selected=[];
  state.hintCells=hits[0].cells;
  syncSelectionClasses();
  feedback(`Hint: ${hits[0].eq.text}`,"warn");
}

function undo(){
  if(!state.stageActive || state.paused) return;
  const snap=state.history.pop();

  if(!snap){
    feedback("Nothing to undo yet.","warn");
    return;
  }

  for(const c of snap.cells){
    state.board[c.i].value=c.value;
    state.board[c.i].blank=c.blank;
  }

  state.found=snap.found;
  state.baseScore=snap.baseScore;

  if(state.freeUndos>0){
    state.freeUndos--;
    feedback("Undo used — free.","warn");
  }else{
    state.penalty+=5;
    feedback("Undo used — 5 point penalty.","warn");
  }

  state.selected=[];
  state.hintCells=[];
  renderAll();
  saveProgress();
}

function renderBoard(){
  const board=$("#board");
  board.innerHTML="";
  board.style.setProperty("--cols",state.cols);

  state.board.forEach((cell,i)=>{
    const b=document.createElement("button");
    b.type="button";
    b.className="cell";
    b.dataset.i=i;
    if(cell.blank){
      b.classList.add("blank");
      b.setAttribute("aria-label","cleared");
    }else{
      b.textContent=cell.value;
      b.setAttribute("aria-label",String(cell.value));
    }
    board.appendChild(b);
  });

  setCellSize();
  syncSelectionClasses();
}

function syncSelectionClasses(){
  $$("#board .cell").forEach((el,i)=>{
    el.classList.toggle("selected",state.selected.includes(i));
    el.classList.toggle("hint",state.hintCells.includes(i));
    el.classList.remove("match-peer");
  });

  // Early-stage training aid: selecting a number softly highlights all identical numbers.
  const r=rules();
  if(state.selected.length && state.difficulty==="beginner" && r.local<=6){
    const v=state.board[state.selected[0]].value;
    $$("#board .cell").forEach((el,i)=>{
      if(!state.board[i].blank && state.board[i].value===v && !state.selected.includes(i)){
        el.classList.add("match-peer");
      }
    });
  }
}

function flashRejected(i){
  const el=$(`#board .cell[data-i="${i}"]`);
  if(!el) return;
  el.animate(
    [{transform:"translateX(0)"},{transform:"translateX(-4px)"},{transform:"translateX(4px)"},{transform:"translateX(0)"}],
    {duration:180}
  );
}

function setCellSize(){
  const wrap=$("#boardWrap");
  if(!wrap || !state.cols) return;

  const availableW=Math.max(260,wrap.clientWidth-8);
  const availableH=Math.max(260,wrap.clientHeight-8);
  let cell=Math.floor(Math.min(availableW/state.cols,availableH/Math.min(state.rows,9)));
  cell=Math.max(48,Math.min(88,cell));
  $("#board").style.setProperty("--cell",`${cell}px`);
}

function showEquation(text){
  const el=$("#equationToast");
  el.textContent=`${text}  ✓`;
  clearTimeout(showEquation._t);
  showEquation._t=setTimeout(()=>el.textContent="",1500);
}

function feedback(text,type=""){
  const el=$("#message");
  el.textContent=text;
  el.className=`message ${type}`;
}

function vibrate(kind){
  if(!state.sound || !navigator.vibrate) return;
  navigator.vibrate(kind==="good" ? 35 : [20,25,20]);
}

function renderTimer(){
  const s=state.secondsLeft;
  const m=Math.floor(s/60), sec=s%60;
  $("#timerLabel").textContent=`${m}:${String(sec).padStart(2,"0")}`;
  $("#timerFill").style.width=`${(s/600)*100}%`;
}

function bestKey(){
  return `${state.op}:${state.difficulty}:${state.stage}`;
}

function getBest(){
  const all=JSON.parse(localStorage.getItem(BEST_KEY)||"{}");
  return all[bestKey()]||0;
}

function saveBest(score){
  const all=JSON.parse(localStorage.getItem(BEST_KEY)||"{}");
  all[bestKey()]=Math.max(all[bestKey()]||0,score);
  localStorage.setItem(BEST_KEY,JSON.stringify(all));
}

function renderAll(){
  $("#stageLabel").textContent=state.stage;
  $("#modeLabel").textContent=`${LABEL[state.op]} · ${cap(state.difficulty)}`;
  $("#scoreLabel").textContent=state.baseScore;
  $("#bestLabel").textContent=getBest();
  $("#foundLabel").textContent=state.found;
  $("#progressFill").style.width=`${Math.min(100,state.found*10)}%`;
  $("#undoCost").textContent=state.freeUndos>0 ? `${state.freeUndos} free` : "−5 points";
  renderTimer();
  renderBoard();
}

function startTimer(){
  clearInterval(state.timerId);
  state.timerId=setInterval(()=>{
    if(!state.stageActive || state.paused) return;
    state.secondsLeft=Math.max(0,state.secondsLeft-1);
    renderTimer();
    if(state.secondsLeft===0) finishStage(true);
    else if(state.secondsLeft%10===0) saveProgress();
  },1000);
}

function timeBonus(){
  return Math.round((state.secondsLeft/600)*50);
}

function finishStage(timedOut){
  if(!state.stageActive) return;
  state.stageActive=false;
  clearInterval(state.timerId);

  const bonus=timeBonus();
  const total=Math.max(0,state.baseScore+bonus-state.penalty);
  saveBest(total);
  clearSavedGame();

  const passed=state.found>=8;
  const perfect=state.found>=10;

  $("#resultBadge").textContent=perfect?"PERFECT CLEAR":passed?"PASS":"REPLAY";
  $("#resultTitle").textContent=timedOut?"Time!":perfect?"Perfect Clear!":passed?"Stage Passed":"Keep Going";
  $("#resultBase").textContent=state.baseScore;
  $("#resultBonus").textContent=`+${bonus}`;
  $("#resultPenalty").textContent=state.penalty?`−${state.penalty}`:"0";
  $("#resultTotal").textContent=total;
  $("#nextBtn").hidden=!passed;
  $("#stageOverlay").hidden=false;
  renderAll();
}

function saveProgress(){
  if(!state.stageActive) return;
  localStorage.setItem(SAVE_KEY,JSON.stringify({
    op:state.op,difficulty:state.difficulty,stage:state.stage,
    rows:state.rows,cols:state.cols,board:state.board,
    found:state.found,baseScore:state.baseScore,penalty:state.penalty,
    freeUndos:state.freeUndos,history:state.history,secondsLeft:state.secondsLeft
  }));
  $("#resumeBtn").hidden=false;
}

function clearSavedGame(){
  localStorage.removeItem(SAVE_KEY);
  $("#resumeBtn").hidden=true;
}

function restoreGame(){
  const raw=localStorage.getItem(SAVE_KEY);
  if(!raw) return;

  Object.assign(state,JSON.parse(raw));
  state.selected=[];
  state.hintCells=[];
  state.paused=false;
  state.stageActive=true;
  showScreen("game");
  renderAll();
  startTimer();
}

function startStage(){
  state.found=0;
  state.baseScore=0;
  state.penalty=0;
  state.freeUndos=2;
  state.history=[];
  state.secondsLeft=600;
  state.selected=[];
  state.hintCells=[];
  state.paused=false;
  state.stageActive=true;
  $("#stageOverlay").hidden=true;
  $("#pauseOverlay").hidden=true;
  showScreen("game");
  generateBoard();
  renderAll();
  startTimer();
  saveProgress();
}

function pause(){
  if(!state.stageActive) return;
  state.paused=true;
  $("#pauseOverlay").hidden=false;
}

function resume(){
  state.paused=false;
  $("#pauseOverlay").hidden=true;
}

/* Tap + swipe */
$("#board").addEventListener("pointerdown",e=>{
  if(!state.stageActive || state.paused) return;
  const cell=e.target.closest(".cell");
  if(!cell || cell.classList.contains("blank")) return;

  e.preventDefault();
  state.pointerDown=true;
  addSelection(Number(cell.dataset.i));
});

$("#board").addEventListener("pointermove",e=>{
  if(!state.pointerDown || !state.stageActive || state.paused) return;
  const el=document.elementFromPoint(e.clientX,e.clientY);
  const cell=el && el.closest ? el.closest(".cell") : null;
  if(!cell || cell.classList.contains("blank")) return;

  const i=Number(cell.dataset.i);
  if(state.selected[state.selected.length-1]!==i){
    addSelection(i);
  }
});

window.addEventListener("pointerup",()=>state.pointerDown=false);
window.addEventListener("pointercancel",()=>state.pointerDown=false);

$("#startBtn").addEventListener("click",()=>showScreen("setup"));
$("#levelBtn").addEventListener("click",()=>showScreen("setup"));
$$("[data-back]").forEach(b=>b.addEventListener("click",()=>showScreen(b.dataset.back)));

$("#operationChoices").addEventListener("click",e=>{
  const b=e.target.closest("button[data-op]");
  if(!b) return;
  state.op=b.dataset.op;
  $$("#operationChoices button").forEach(x=>x.classList.toggle("selected",x===b));
  $("#playBtn").disabled=!(state.op&&state.difficulty);
});

$("#difficultyChoices").addEventListener("click",e=>{
  const b=e.target.closest("button[data-diff]");
  if(!b) return;
  state.difficulty=b.dataset.diff;
  $$("#difficultyChoices button").forEach(x=>x.classList.toggle("selected",x===b));
  $("#playBtn").disabled=!(state.op&&state.difficulty);
});

$("#playBtn").addEventListener("click",()=>{
  state.stage=DIFF[state.difficulty].base;
  startStage();
});

$("#hintBtn").addEventListener("click",useHint);
$("#undoBtn").addEventListener("click",undo);
$("#pauseBtn").addEventListener("click",pause);
$("#resumeGameBtn").addEventListener("click",resume);

$("#exitBtn").addEventListener("click",()=>{
  saveProgress();
  clearInterval(state.timerId);
  showScreen("home");
});

$("#replayBtn").addEventListener("click",startStage);
$("#nextBtn").addEventListener("click",()=>{
  state.stage++;
  startStage();
});

$("#soundBtn").addEventListener("click",()=>{
  state.sound=!state.sound;
  $("#soundBtn").textContent=state.sound?"🔊":"🔇";
});

$("#resumeBtn").addEventListener("click",restoreGame);

window.addEventListener("resize",()=>requestAnimationFrame(setCellSize));
window.addEventListener("orientationchange",()=>setTimeout(setCellSize,100));

document.addEventListener("visibilitychange",()=>{
  if(document.hidden && state.stageActive && !state.paused) pause();
});

$("#resumeBtn").hidden=!localStorage.getItem(SAVE_KEY);

})();