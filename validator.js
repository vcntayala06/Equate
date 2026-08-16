(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.EquateCore=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const DIRS={right:[0,1],down:[1,0],dr:[1,1],dl:[1,-1],left:[0,-1],up:[-1,0],ur:[-1,1],ul:[-1,-1]};
  const SYMBOL={add:'+',sub:'−',mul:'×',div:'÷'};
  const DIFFICULTIES={beginner:{size:5,max:12},intermediate:{size:6,max:30},advanced:{size:7,max:75},expert:{size:9,max:150}};
  function unlocks(stage){stage=Math.max(1,Number(stage)||1);return {diagonal:stage>=3,reverse:stage>=5};}
  function allowedDirections(stage){const u=unlocks(stage),a=['right','down'];if(u.diagonal)a.push('dr','dl');if(u.reverse)a.push('left','up');if(u.diagonal&&u.reverse)a.push('ur','ul');return a;}
  function equationValid(a,b,c,op){
    if(![a,b,c].every(Number.isInteger))return false;
    if(op==='add')return a+b===c;
    if(op==='sub')return a-b===c;
    if(op==='mul')return a*b===c;
    return op==='div'&&b!==0&&a%b===0&&a/b===c;
  }
  function operations(mode){return mode==='mixed'?['add','sub','mul','div']:[mode];}
  function coord(i,cols){return [Math.floor(i/cols),i%cols];}
  function sameLine(a,b,cols){
    if(a===b)return null;const [r1,c1]=coord(a,cols),[r2,c2]=coord(b,cols),rd=r2-r1,cd=c2-c1;
    if(!(rd===0&&cd!==0)&&!(cd===0&&rd!==0)&&!(Math.abs(rd)===Math.abs(cd)&&rd!==0))return null;
    return {dr:Math.sign(rd),dc:Math.sign(cd)};
  }
  function directionName(d){for(const [name,v] of Object.entries(DIRS))if(v[0]===d.dr&&v[1]===d.dc)return name;return null;}
  function rayConnect(board,rows,cols,a,b){
    const d=sameLine(a,b,cols);if(!d)return null;const [r2,c2]=coord(b,cols);let [r,c]=coord(a,cols);r+=d.dr;c+=d.dc;
    while(r!==r2||c!==c2){const x=board[r*cols+c];if(!x||!x.blank)return null;r+=d.dr;c+=d.dc;}
    return d;
  }
  function validatePath(board,rows,cols,cells,stage){
    if(!Array.isArray(cells)||cells.length!==3||new Set(cells).size!==3)return null;
    if(cells.some(i=>!Number.isInteger(i)||i<0||i>=board.length||board[i].blank))return null;
    const d1=rayConnect(board,rows,cols,cells[0],cells[1]),d2=rayConnect(board,rows,cols,cells[1],cells[2]);
    if(!d1||!d2||d1.dr!==d2.dr||d1.dc!==d2.dc)return null;
    const name=directionName(d1);return allowedDirections(stage).includes(name)?{...d1,name}:null;
  }
  function validateMove({board,rows,cols,cells,stage,mode}){
    const direction=validatePath(board,rows,cols,cells,stage);if(!direction)return null;
    const [a,b,c]=cells.map(i=>board[i].value);
    for(const op of operations(mode))if(equationValid(a,b,c,op))return {cells:[...cells],a,b,c,op,direction:direction.name,text:`${a} ${SYMBOL[op]} ${b} = ${c}`};
    return null;
  }
  function enumerate(args,limit=Infinity){
    const {board,rows,cols,stage}=args,hits=[];
    for(let i=0;i<board.length;i++){
      if(board[i].blank)continue;const [sr,sc]=coord(i,cols);
      for(const name of allowedDirections(stage)){
        const [dr,dc]=DIRS[name],found=[];let r=sr+dr,c=sc+dc;
        while(r>=0&&c>=0&&r<rows&&c<cols&&found.length<2){const j=r*cols+c;if(!board[j].blank)found.push(j);r+=dr;c+=dc;}
        if(found.length===2){const move=validateMove({...args,cells:[i,...found]});if(move){hits.push(move);if(hits.length>=limit)return hits;}}
      }
    }
    return hits;
  }
  function makeEquation(op,max,rnd){let a,b,c;
    if(op==='add'){a=rnd(1,max);b=rnd(1,max);c=a+b;}
    else if(op==='sub'){c=rnd(0,max);b=rnd(1,max);a=b+c;}
    else if(op==='mul'){const m=Math.max(3,Math.min(12,Math.floor(Math.sqrt(max*2))));a=rnd(2,m);b=rnd(2,m);c=a*b;}
    else{const m=Math.max(3,Math.min(12,Math.floor(Math.sqrt(max*2))));b=rnd(2,m);c=rnd(1,m);a=b*c;}
    return {a,b,c,op};
  }
  function generateBoard({difficulty,stage,mode,random=Math.random}){
    const cfg=DIFFICULTIES[difficulty]||DIFFICULTIES.beginner,rows=cfg.size,cols=cfg.size,rnd=(a,b)=>Math.floor(random()*(b-a+1))+a;
    for(let attempt=0;attempt<100;attempt++){
      const board=Array.from({length:rows*cols},(_,id)=>({id,value:null,blank:false})),planted=[];
      for(let guard=0;guard<500&&planted.length<Math.max(6,Math.floor(rows*cols/5));guard++){
        const dirs=allowedDirections(stage),name=dirs[rnd(0,dirs.length-1)],[dr,dc]=DIRS[name],sr=rnd(0,rows-1),sc=rnd(0,cols-1),er=sr+dr*2,ec=sc+dc*2;
        if(er<0||ec<0||er>=rows||ec>=cols)continue;const cells=[sr*cols+sc,(sr+dr)*cols+sc+dc,er*cols+ec];if(cells.some(i=>board[i].value!==null))continue;
        const list=operations(mode),eq=makeEquation(list[rnd(0,list.length-1)],cfg.max,rnd);[eq.a,eq.b,eq.c].forEach((v,k)=>board[cells[k]].value=v);planted.push({...eq,cells});
      }
      board.forEach(x=>{if(x.value===null)x.value=rnd(0,cfg.max);});
      if(enumerate({board,rows,cols,stage,mode},1).length)return {board,rows,cols,planted};
    }
    throw new Error('Unable to generate an audited board');
  }
  function rulesText(stage){const u=unlocks(stage);if(!u.diagonal)return 'Across • Up • Down';if(!u.reverse)return stage===3?'DIAGONAL UNLOCKED — Across • Up • Down • Diagonal':'Across • Up • Down • Diagonal';return stage===5?'REVERSE UNLOCKED — equations can run either way':'ALL DIRECTIONS — Across • Up • Down • Diagonal • Reverse';}
  return {DIRS,SYMBOL,DIFFICULTIES,unlocks,allowedDirections,equationValid,validatePath,validateMove,enumerate,generateBoard,rulesText};
});
