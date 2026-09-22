// Shared quiz component. Markup: <div class="quiz" data-quiz> with .q blocks, each holding
// <p class="stem">, buttons with data-a="1" on the right answer and data-why on every button.
// Immediate feedback, retrieval-first: nothing is revealed until the learner commits.
(function(){
  document.querySelectorAll('[data-quiz] .q').forEach(function(q){
    var why=q.querySelector('.why'); var done=false;
    q.querySelectorAll('button').forEach(function(b){
      b.addEventListener('click',function(){
        if(done) return; done=true;
        var right=b.dataset.a==='1';
        b.classList.add(right?'right':'wrong');
        if(!right){ var r=q.querySelector('button[data-a="1"]'); if(r) r.classList.add('right'); }
        if(why) why.textContent=(right?'Right. ':'Not quite. ')+(b.dataset.why||'');
        var s=document.querySelector('[data-quiz-score]');
        if(s){ s.dataset.n=(+s.dataset.n||0)+1; s.dataset.ok=(+s.dataset.ok||0)+(right?1:0); s.textContent=s.dataset.ok+' / '+s.dataset.n; }
      });
    });
  });
})();
