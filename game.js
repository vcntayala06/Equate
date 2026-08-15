
(() => {
  "use strict";

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];
  const STORAGE_KEY = "equate-save-v1";
  const BEST_KEY = "equate-bests-v1";

  const DIRS = {
    right: [0,1],
    left: [0,-1],
    down: [1,0],
    up: [-1,0],
    dr: [1,1],
    dl: [1,-1],
    ur: [-1,1],
    ul: [-1,-1],
  };

  const OP_SYMBOL = { add:"+", sub:"−", mul:"×", div:"÷" };

  const DIFF = {
    beginner:     { baseStage:1,   size:6, range:[1,9], diag:false, reverse:false, snake:false },
    intermediate: { baseStage:41,  size:7, range:[1,40], diag:true,  reverse:false, snake:false },
    advanced:     { baseStage:81,  size:8, range:[1,99], diag:true,  reverse:true,  snake:false },
    expert:       { baseStage:121, size:9, range:[1,999],diag:true,  reverse:true,  snake:true  },
  };

  const state = {
    op:null,
    difficulty:null,
    stage:1,
    board:[],
    rows:0,
    cols:0,
    selected:[],
    pointerDown:false,
    pointerId:null,
    found:0,
    baseScore:0,
    bonus:0,
    penalty:0,
    freeUndos:2,
    history:[],
    secondsLeft:600,
    timerId:null,
    paused:false,
    sound:true,
    stageActive:false,
    hintCells:[],
    miniBoardCount:0,
  };

  function showScreen(id){
    $$(".screen").forEach(s => s.classList.toggle("active", s.id === id));
  }

  function keyForBest(){
    return `${state.op}:${state.difficulty}:${state.stage}`;
  }

  function loadBest(){
    const all = JSON.parse(localStorage.getItem(BEST_KEY) || "{}");
    return all[keyForBest()] || 0;
  }

  function saveBest(score){
    const all = JSON.parse(localStorage.getItem(BEST_KEY) || "{}");
    all[keyForBest()] = Math.max(all[keyForBest()] || 0, score);
    localStorage.setItem(BEST_KEY, JSON.stringify(all));
  }

  function saveProgress(){
    if(!state.stageActive) return;
    const payload = {
      op:state.op, difficulty:state.difficulty, stage:state.stage,
      board:state.board, rows:state.rows, cols:state.cols,
      found:state.found, baseScore:state.baseScore, bonus:state.bonus, penalty:state.penalty,
      freeUndos:state.freeUndos, history:state.history, secondsLeft:state.secondsLeft,
      miniBoardCount:state.miniBoardCount
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    $("#resumeBtn").hidden = false;
  }

  function clearProgress(){
    localStorage.removeItem(STORAGE_KEY);
    $("#resumeBtn").hidden = true;
  }

  function restoreProgress(){
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return false;
    try{
      Object.assign(state, JSON.parse(raw));
      state.selected = [];
      state.hintCells = [];
      state.paused = false;
      state.stageActive = true;
      showScreen("game");
      renderAll();
      startTimer();
      return true;
    }catch(e){ return false; }
  }

  function stageRules(){
    const d = DIFF[state.difficulty];
    const local = Math.max(1, state.stage - d.baseStage + 1);

    // Progressive board growth; board remains readable and scrolls rather than shrinking indefinitely.
    let size = d.size;
    if(local >= 11) size++;
    if(local >= 21) size++;
    if(local >= 31) size++;

    // 4x4 exists only as the earliest training feel; scored boards need enough cells for 10 equations,
    // so the stage can cycle mini-boards while preserving the 10-equation stage target.
    if(state.difficulty === "beginner" && local <= 2) size = 4;
    else if(state.difficulty === "beginner" && local <= 5) size = 5;

    const diag = state.difficulty !== "beginner" || local >= 5;
    const reverse = state.difficulty === "advanced" || state.difficulty === "expert" || local >= 45;
    const snake = state.difficulty === "expert" && local >= 10;

    // Whole numbers only.
    let maxOperand;
    if(local <= 10) maxOperand = 9;
    else if(local <= 20) maxOperand = 18;
    else if(local <= 30) maxOperand = 40;
    else if(local <= 40) maxOperand = 99;
    else maxOperand = Math.min(999, 100 + (local-40)*10);

    return { size, diag, reverse, snake, maxOperand, local };
  }

  function operationPool(){
    return state.op === "mixed" ? ["add","sub","mul","div"] : [state.op];
  }

  function randomInt(a,b){ return Math.floor(Math.random()*(b-a+1))+a; }

  function makeEquation(op, maxOperand){
    let a,b,c;
    if(op === "add"){
      a=randomInt(1,maxOperand);
      b=randomInt(1,maxOperand);
      c=a+b;
    }else if(op === "sub"){
      b=randomInt(1,Math.max(1,Math.floor(maxOperand*.75)));
      c=randomInt(0,Math.max(1,Math.floor(maxOperand*.75)));
      a=b+c;
    }else if(op === "mul"){
      const cap = Math.max(3, Math.min(25, Math.floor(Math.sqrt(maxOperand*6))));
      a=randomInt(2,cap); b=randomInt(2,cap); c=a*b;
    }else{
      const cap = Math.max(3, Math.min(20, Math.floor(Math.sqrt(maxOperand*5))));
      b=randomInt(2,cap); c=randomInt(1,cap); a=b*c;
    }
    const digits = `${a}${b}${c}`.split("").map(Number);
    return {op,a,b,c,digits,text:`${a} ${OP_SYMBOL[op]} ${b} = ${c}`};
  }

  function emptyBoard(rows,cols){
    return Array.from({length:rows*cols},(_,i)=>({value:null,blank:false,id:i}));
  }

  function inBounds(r,c,rows,cols){ return r>=0 && c>=0 && r<rows && c<cols; }
  function idx(r,c,cols){ return r*cols+c; }

  function allowedStraightDirs(rules){
    const dirs = ["right","down"];
    if(rules.diag) dirs.push("dr","dl");
    if(rules.reverse) dirs.push("left","up","ur","ul");
    return dirs;
  }

  function tryPlant(board, rows, cols, digits, dirName){
    const [dr,dc]=DIRS[dirName];
    for(let attempt=0; attempt<140; attempt++){
      const sr=randomInt(0,rows-1), sc=randomInt(0,cols-1);
      const er=sr+dr*(digits.length-1), ec=sc+dc*(digits.length-1);
      if(!inBounds(er,ec,rows,cols)) continue;
      const cells=[];
      let okay=true;
      for(let k=0;k<digits.length;k++){
        const r=sr+dr*k,c=sc+dc*k, i=idx(r,c,cols);
        if(board[i].value !== null){ okay=false; break; }
        cells.push(i);
      }
      if(!okay) continue;
      cells.forEach((i,k)=>board[i].value=digits[k]);
      return cells;
    }
    return null;
  }

  function generateMiniBoard(){
    const rules=stageRules();
    const size=rules.size;
    const rows=size, cols=size;
    let best=null;

    for(let bigTry=0; bigTry<120; bigTry++){
      const board=emptyBoard(rows,cols);
      const planted=[];
      const capacityTarget = size <=4 ? 3 : size===5 ? 4 : 5;
      const dirs=allowedStraightDirs(rules);

      let tries=0;
      while(planted.length<capacityTarget && tries<250){
        tries++;
        const opPool=operationPool();
        const op=opPool[randomInt(0,opPool.length-1)];
        const eq=makeEquation(op,rules.maxOperand);
        if(eq.digits.length > Math.max(rows,cols)) continue;
        const d=dirs[randomInt(0,dirs.length-1)];
        const cells=tryPlant(board,rows,cols,eq.digits,d);
        if(cells) planted.push({...eq,cells,dir:d});
      }

      if(!best || planted.length>best.planted.length) best={board,planted};
      if(planted.length>=Math.min(capacityTarget,3)) break;
    }

    const board=best.board;
    // Fill unused cells with random digits. These create legitimate alternate equations naturally.
    for(const cell of board){
      if(cell.value===null) cell.value=randomInt(0,9);
    }
    state.rows=rows; state.cols=cols; state.board=board;
    state.selected=[]; state.hintCells=[];
    state.miniBoardCount++;
  }

  function renderAll(){
    const rules=stageRules();
    $("#stageLabel").textContent=state.stage;
    $("#modeLabel").textContent=`${labelOp(state.op)} · ${capitalize(state.difficulty)}`;
    $("#scoreLabel").textContent=state.baseScore;
    $("#bestLabel").textContent=loadBest();
    $("#foundLabel").textContent=state.found;
    $("#progressFill").style.width=`${Math.min(100,state.found*10)}%`;
    $("#undoCost").textContent=state.freeUndos>0 ? `${state.freeUndos} free` : "−5 points";
    renderTimer();
    renderBoard();
  }

  function renderBoard(){
    const board=$("#board");
    board.innerHTML="";
    board.style.setProperty("--cols",state.cols);
    setCellSize();

    state.board.forEach((cell,i)=>{
      const btn=document.createElement("button");
      btn.className="cell";
      btn.dataset.i=i;
      btn.type="button";
      btn.setAttribute("aria-label",cell.blank ? "blank" : String(cell.value));
      if(cell.blank) btn.classList.add("blank");
      else btn.textContent=cell.value;
      if(state.selected.includes(i)) btn.classList.add("selected");
      if(state.hintCells.includes(i)) btn.classList.add("hint");
      board.appendChild(btn);
    });
    applyPeerHighlight();
  }

  function setCellSize(){
    const wrap=$("#boardWrap");
    if(!wrap || !state.cols) return;
    const availW=Math.max(260,wrap.clientWidth-8);
    const availH=Math.max(260,wrap.clientHeight-8);
    const min=44, max=82;
    let cell=Math.floor(Math.min(availW/state.cols, availH/Math.min(state.rows,9)));
    cell=Math.max(min,Math.min(max,cell));
    $("#board").style.setProperty("--cell",`${cell}px`);
  }

  function labelOp(op){
    return ({add:"Addition",sub:"Subtraction",mul:"Multiplication",div:"Division",mixed:"Mixed"})[op] || "";
  }
  function capitalize(s){return s ? s[0].toUpperCase()+s.slice(1):""}

  function coord(i){return [Math.floor(i/state.cols),i%state.cols]}

  // "Visible neighbors": blanks are treated as if they are not there.
  // An uncleared number blocks the ray.
  function rayConnect(a,b){
    if(a===b) return null;
    const [r1,c1]=coord(a), [r2,c2]=coord(b);
    const dr=Math.sign(r2-r1), dc=Math.sign(c2-c1);
    const sameRow=r1===r2, sameCol=c1===c2, diag=Math.abs(r2-r1)===Math.abs(c2-c1);
    if(!(sameRow||sameCol||diag)) return null;
    if(sameRow && dc===0) return null;
    if(sameCol && dr===0) return null;

    let r=r1+dr,c=c1+dc;
    while(r!==r2 || c!==c2){
      const cell=state.board[idx(r,c,state.cols)];
      if(!cell.blank) return null; // only cleared spaces may be skipped
      r+=dr;c+=dc;
    }
    return {dr,dc};
  }

  function selectionDirection(indices){
    if(indices.length<2) return null;
    const d=rayConnect(indices[0],indices[1]);
    return d;
  }

  function isStraightSelection(indices){
    if(indices.length<2) return true;
    const first=selectionDirection(indices);
    if(!first) return false;
    for(let k=1;k<indices.length-1;k++){
      const d=rayConnect(indices[k],indices[k+1]);
      if(!d || d.dr!==first.dr || d.dc!==first.dc) return false;
    }
    return true;
  }

  function allowedDirection(d){
    const rules=stageRules();
    if(!d) return true;
    if(d.dr===0 && d.dc===1) return true;
    if(d.dr===1 && d.dc===0) return true;
    if(Math.abs(d.dr)===1 && Math.abs(d.dc)===1 && rules.diag){
      if(d.dr===1) return true; // downward diagonals
      return rules.reverse;
    }
    if((d.dr<0 || d.dc<0) && rules.reverse) return true;
    return false;
  }

  function canAppend(i){
    if(state.board[i].blank || state.selected.includes(i)) return {ok:false,msg:"Already cleared or selected."};
    if(state.selected.length===0) return {ok:true};

    const prev=state.selected[state.selected.length-1];
    const ray=rayConnect(prev,i);
    if(!ray) return {ok:false,msg:"Not allowed — another number is blocking the path."};

    const rules=stageRules();

    if(!rules.snake){
      if(!allowedDirection(ray)){
        return {ok:false,msg: rules.diag ? "That direction unlocks later." : "Diagonal matches unlock soon."};
      }
      if(state.selected.length>=2){
        const first=selectionDirection(state.selected);
        if(first && (ray.dr!==first.dr || ray.dc!==first.dc)){
          return {ok:false,msg:"Stay in one straight direction."};
        }
      }
    }else{
      // Expert: problem stays straight; answer may snake. We validate the mathematical split later.
      // Every hop still obeys adjacency/blank-ray connection.
    }
    return {ok:true};
  }

  function appendSelection(i){
    const result=canAppend(i);
    if(!result.ok){
      feedback(result.msg,"bad");
      buzz("bad");
      return;
    }
    state.selected.push(i);
    state.hintCells=[];
    renderBoard();
    tryResolveSelection();
  }

  function selectedDigits(){
    return state.selected.map(i=>state.board[i].value).join("");
  }

  function parseEquationDigits(digitString, op){
    // Try every possible split into A | B | C.
    // No leading zero on multi-digit numbers.
    const out=[];
    for(let i=1;i<=digitString.length-2;i++){
      for(let j=i+1;j<=digitString.length-1;j++){
        const A=digitString.slice(0,i),B=digitString.slice(i,j),C=digitString.slice(j);
        if((A.length>1&&A[0]==="0")||(B.length>1&&B[0]==="0")||(C.length>1&&C[0]==="0")) continue;
        const a=Number(A),b=Number(B),c=Number(C);
        let ok=false;
        if(op==="add") ok=a+b===c;
        if(op==="sub") ok=a-b===c;
        if(op==="mul") ok=a*b===c;
        if(op==="div") ok=b!==0 && a/b===c && Number.isInteger(c);
        if(ok) out.push({op,a,b,c,text:`${a} ${OP_SYMBOL[op]} ${b} = ${c}`,split:[i,j]});
      }
    }
    return out;
  }

  function validEquationsForSelection(indices=state.selected){
    if(indices.length<3) return [];
    const digits=indices.map(i=>state.board[i].value).join("");
    const ops=operationPool();
    const results=[];
    for(const op of ops){
      results.push(...parseEquationDigits(digits,op));
    }

    const rules=stageRules();
    if(!rules.snake){
      if(!isStraightSelection(indices)) return [];
    }else{
      // Expert snaking rule: digits of A+B/problem stay straight through operand B.
      // Answer portion may then snake via valid blank-ray adjacency.
      return results.filter(eq=>{
        const problemCount=eq.split[1];
        const problemIndices=indices.slice(0,problemCount);
        return isStraightSelection(problemIndices);
      });
    }
    return results;
  }

  function tryResolveSelection(){
    if(state.selected.length<3) return;
    const matches=validEquationsForSelection();
    if(matches.length){
      resolveEquation(matches[0]);
      return;
    }

    // Keep allowing longer numbers up to a sane cap; reject only obviously overlong chains.
    if(state.selected.length>=9){
      feedback("Not an equation — try again.","bad");
      state.selected=[];
      renderBoard();
    }
  }

  function resolveEquation(eq){
    const snapshot = {
      cells:state.selected.map(i=>({i,value:state.board[i].value,blank:state.board[i].blank})),
      found:state.found, baseScore:state.baseScore, penalty:state.penalty
    };
    state.history.push(snapshot);

    for(const i of state.selected) state.board[i].blank=true;
    state.found++;
    state.baseScore=Math.min(100,state.baseScore+10);

    showEquation(eq.text);
    feedback("Correct! Keep looking ahead.","good");
    buzz("good");
    state.selected=[];
    state.hintCells=[];
    renderAll();
    saveProgress();

    if(state.found>=10){
      finishStage(false);
    }else if(noAvailableEquation()){
      // In tiny early boards, cycle a fresh mini-board so the stage still contains 10 scored equations.
      // In larger boards, this also prevents impossible waiting.
      setTimeout(()=>{
        feedback("New board — keep your stage score going.","warn");
        generateMiniBoard();
        renderAll();
        saveProgress();
      },550);
    }
  }

  function showEquation(text){
    const el=$("#equationToast");
    el.textContent=`${text}  ✓`;
    clearTimeout(showEquation.t);
    showEquation.t=setTimeout(()=>{ el.textContent=""; },1500);
  }

  function feedback(text,type=""){
    const el=$("#message");
    el.textContent=text;
    el.className=`message ${type}`;
  }

  function allVisibleCandidates(){
    const out=[];
    for(let i=0;i<state.board.length;i++){
      if(state.board[i].blank) continue;
      for(let j=0;j<state.board.length;j++){
        if(i===j || state.board[j].blank) continue;
        const d=rayConnect(i,j);
        if(d && (stageRules().snake || allowedDirection(d))) out.push([i,j]);
      }
    }
    return out;
  }

  function enumerateEquations(limit=1){
    // DFS through visible-neighbor graph, respecting stage rules.
    const found=[];
    const maxLen=8;
    const rules=stageRules();

    function dfs(path){
      if(found.length>=limit) return;
      if(path.length>=3){
        const eqs=validEquationsForSelection(path);
        if(eqs.length) found.push({cells:[...path],eq:eqs[0]});
      }
      if(path.length>=maxLen) return;
      const last=path[path.length-1];
      for(let i=0;i<state.board.length;i++){
        if(path.includes(i) || state.board[i].blank) continue;
        const ray=rayConnect(last,i);
        if(!ray) continue;

        if(!rules.snake){
          if(!allowedDirection(ray)) continue;
          if(path.length>=2){
            const d0=rayConnect(path[0],path[1]);
            if(!d0 || d0.dr!==ray.dr || d0.dc!==ray.dc) continue;
          }
        }
        path.push(i); dfs(path); path.pop();
        if(found.length>=limit) return;
      }
    }

    for(let i=0;i<state.board.length && found.length<limit;i++){
      if(!state.board[i].blank) dfs([i]);
    }
    return found;
  }

  function noAvailableEquation(){
    return enumerateEquations(1).length===0;
  }

  function useHint(){
    if(!state.stageActive || state.paused) return;
    const options=enumerateEquations(1);
    if(!options.length){
      feedback("No equation is available on this board. A new board is coming.","warn");
      setTimeout(()=>{ generateMiniBoard(); renderAll(); },350);
      return;
    }
    state.selected=[];
    state.hintCells=options[0].cells;
    renderBoard();
    feedback(`Hint: ${options[0].eq.text}`,"warn");
    buzz("hint");
  }

  function undo(){
    if(!state.stageActive || state.paused) return;
    const snap=state.history.pop();
    if(!snap){
      feedback("Nothing to undo yet.","warn"); return;
    }
    snap.cells.forEach(x=>{
      state.board[x.i].value=x.value;
      state.board[x.i].blank=x.blank;
    });
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
    renderAll(); saveProgress();
  }

  function startTimer(){
    clearInterval(state.timerId);
    state.timerId=setInterval(()=>{
      if(!state.stageActive || state.paused) return;
      state.secondsLeft=Math.max(0,state.secondsLeft-1);
      renderTimer();
      if(state.secondsLeft%10===0) saveProgress();
      if(state.secondsLeft<=0) finishStage(true);
    },1000);
  }

  function renderTimer(){
    const s=state.secondsLeft;
    const m=Math.floor(s/60), sec=s%60;
    $("#timerLabel").textContent=`${m}:${String(sec).padStart(2,"0")}`;
    $("#timerFill").style.width=`${(s/600)*100}%`;
  }

  function timeBonus(){
    // Simple visible relationship: faster completion earns up to +50.
    return Math.round((state.secondsLeft/600)*50);
  }

  function finishStage(timedOut){
    if(!state.stageActive) return;
    state.stageActive=false;
    clearInterval(state.timerId);
    state.bonus=timeBonus();
    const total=Math.max(0,state.baseScore+state.bonus-state.penalty);
    saveBest(total);
    clearProgress();

    const passed=state.found>=8;
    const perfect=state.found>=10;

    $("#resultBadge").textContent=perfect?"PERFECT CLEAR":passed?"PASS":"REPLAY";
    $("#resultBadge").style.background=perfect?"#503a13":passed?"#294f42":"#53252d";
    $("#resultBadge").style.color=perfect?"#ffd66e":passed?"#75e2aa":"#ff9aa4";
    $("#resultTitle").textContent=timedOut?"Time!":perfect?"Perfect Clear!":passed?"Stage Passed":"Keep Going";
    $("#resultBase").textContent=state.baseScore;
    $("#resultBonus").textContent=`+${state.bonus}`;
    $("#resultPenalty").textContent=state.penalty?`−${state.penalty}`:"0";
    $("#resultTotal").textContent=total;
    $("#nextBtn").hidden=!passed;
    $("#stageOverlay").hidden=false;
    renderAll();
  }

  function newStage(resetStage=false){
    const d=DIFF[state.difficulty];
    if(resetStage) state.stage=d.baseStage;
    state.found=0; state.baseScore=0; state.bonus=0; state.penalty=0;
    state.freeUndos=2; state.history=[]; state.secondsLeft=600;
    state.selected=[]; state.hintCells=[]; state.miniBoardCount=0;
    state.stageActive=true; state.paused=false;
    generateMiniBoard();
    $("#stageOverlay").hidden=true;
    $("#pauseOverlay").hidden=true;
    showScreen("game");
    renderAll();
    startTimer();
    saveProgress();
  }

  function nextStage(){
    state.stage++;
    newStage(false);
  }

  function pauseGame(){
    if(!state.stageActive) return;
    state.paused=true;
    $("#pauseOverlay").hidden=false;
  }
  function resumeGame(){
    state.paused=false;
    $("#pauseOverlay").hidden=true;
  }

  function buzz(kind){
    if(!state.sound || !navigator.vibrate) return;
    if(kind==="good") navigator.vibrate(35);
    if(kind==="bad") navigator.vibrate([20,25,20]);
    if(kind==="hint") navigator.vibrate(20);
  }

  function resetSelection(){
    if(!state.selected.length) return;
    state.selected=[];
    renderBoard();
  }

  function pointerCellFromEvent(e){
    const el=document.elementFromPoint(e.clientX,e.clientY);
    if(!el || !el.classList.contains("cell")) return null;
    return Number(el.dataset.i);
  }

  $("#board").addEventListener("pointerdown",e=>{
    if(!state.stageActive || state.paused) return;
    const cell=e.target.closest(".cell");
    if(!cell || cell.classList.contains("blank")) return;
    state.pointerDown=true; state.pointerId=e.pointerId;
    try{ $("#board").setPointerCapture(e.pointerId); }catch{}
    const i=Number(cell.dataset.i);

    if(state.selected.length && state.selected[state.selected.length-1]===i){
      return;
    }
    // A fresh tap after an unresolved selection starts over when same value/path isn't legal.
    if(state.selected.length && !canAppend(i).ok){
      state.selected=[];
    }
    appendSelection(i);
  });

  $("#board").addEventListener("pointermove",e=>{
    if(!state.pointerDown || !state.stageActive || state.paused) return;
    const i=pointerCellFromEvent(e);
    if(i===null || state.selected[state.selected.length-1]===i) return;
    appendSelection(i);
  });

  window.addEventListener("pointerup",()=>{
    state.pointerDown=false; state.pointerId=null;
  });

  $("#board").addEventListener("click",e=>{
    // Pointerdown already handles taps. Prevent synthetic duplicate behavior.
    e.preventDefault();
  });

  function applyPeerHighlight(){
    const rules=stageRules();
    // Early-stage training aid only.
    if(!(state.difficulty==="beginner" && rules.local<=6) || !state.selected.length) return;
    const firstVal=state.board[state.selected[0]].value;
    $$(".cell").forEach((el,i)=>{
      if(!state.board[i].blank && state.board[i].value===firstVal && !state.selected.includes(i)){
        el.classList.add("match-peer");
      }
    });
  }

  // Setup UI
  $("#startBtn").addEventListener("click",()=>showScreen("setup"));
  $("#levelBtn").addEventListener("click",()=>showScreen("setup"));
  $$("[data-back]").forEach(b=>b.addEventListener("click",()=>showScreen(b.dataset.back)));

  $("#operationChoices").addEventListener("click",e=>{
    const b=e.target.closest("button[data-op]"); if(!b) return;
    state.op=b.dataset.op;
    $$("#operationChoices button").forEach(x=>x.classList.toggle("selected",x===b));
    checkPlayReady();
  });
  $("#difficultyChoices").addEventListener("click",e=>{
    const b=e.target.closest("button[data-diff]"); if(!b) return;
    state.difficulty=b.dataset.diff;
    $$("#difficultyChoices button").forEach(x=>x.classList.toggle("selected",x===b));
    checkPlayReady();
  });
  function checkPlayReady(){ $("#playBtn").disabled=!(state.op&&state.difficulty); }
  $("#playBtn").addEventListener("click",()=>{
    state.stage=DIFF[state.difficulty].baseStage;
    newStage(false);
  });

  $("#hintBtn").addEventListener("click",useHint);
  $("#undoBtn").addEventListener("click",undo);
  $("#pauseBtn").addEventListener("click",pauseGame);
  $("#resumeGameBtn").addEventListener("click",resumeGame);
  $("#exitBtn").addEventListener("click",()=>{
    saveProgress(); clearInterval(state.timerId); showScreen("home");
  });
  $("#replayBtn").addEventListener("click",()=>newStage(false));
  $("#nextBtn").addEventListener("click",nextStage);
  $("#soundBtn").addEventListener("click",()=>{
    state.sound=!state.sound; $("#soundBtn").textContent=state.sound?"🔊":"🔇";
  });
  $("#resumeBtn").addEventListener("click",restoreProgress);

  window.addEventListener("resize",()=>requestAnimationFrame(setCellSize));
  window.addEventListener("orientationchange",()=>setTimeout(setCellSize,100));

  document.addEventListener("visibilitychange",()=>{
    if(document.hidden && state.stageActive && !state.paused) pauseGame();
  });

  // Resume indicator
  $("#resumeBtn").hidden=!localStorage.getItem(STORAGE_KEY);
})();
