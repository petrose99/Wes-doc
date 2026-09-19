// Turns × context calculator. Markup: <div class="calc" data-cost-calc> with
// #turns, #start, #growth range inputs and <output> elements #sent, #avg, #cost.
// Rates are NOT hard-coded: the page supplies data-read-rate / data-write-rate (USD per million)
// copied from the pricing page by the learner, so the number is theirs.
(function(){
  var c=document.querySelector('[data-cost-calc]'); if(!c) return;
  var $=function(id){return c.querySelector('#'+id)};
  function fmt(n){return n>=1e6?(n/1e6).toFixed(2)+'M':Math.round(n/1e3)+'K'}
  function run(){
    var turns=+$('turns').value, start=+$('start').value*1000, growth=+$('growth').value*1000;
    var sent=0, ctx=start; for(var i=0;i<turns;i++){ sent+=ctx; ctx+=growth; }
    var avg=sent/Math.max(turns,1);
    $('turns-v').textContent=turns; $('start-v').textContent=fmt(start); $('growth-v').textContent=fmt(growth);
    $('sent').textContent=fmt(sent); $('avg').textContent=fmt(avg); $('end').textContent=fmt(ctx);
    var read=parseFloat(c.dataset.readRate||'0'); var cost=$('cost');
    if(read>0){ cost.textContent='$'+(sent*0.97*read/1e6 + sent*0.03*parseFloat(c.dataset.writeRate||read)/1e6).toFixed(2); }
    else cost.textContent='enter the cache-read rate from the pricing page';
  }
  ['turns','start','growth'].forEach(function(id){ $(id).addEventListener('input',run); });
  var rr=c.querySelector('#read-rate'), wr=c.querySelector('#write-rate');
  if(rr) rr.addEventListener('input',function(){ c.dataset.readRate=rr.value; run(); });
  if(wr) wr.addEventListener('input',function(){ c.dataset.writeRate=wr.value; run(); });
  run();
})();
