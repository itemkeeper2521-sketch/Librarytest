// My Library: reading list, continue reading, borrowed books, waitlist
ready.then(async()=>{
const user=me();
if(user){
  const by=ids=>ids.map(findBook).filter(Boolean);
  const fill=(grid,empty,html,list)=>{$(grid).innerHTML=list.map(html).join('');$(empty).hidden=list.length>0};
  const wrap=action=>b=>`<div class="book-card-wrap">${cardHTML(b)}<div class="book-card__actions"><button type="button" class="btn btn--ghost" data-action="${action[0]}" data-book-id="${b.id}">${action[1]}</button></div></div>`;
  function render(){
    fill('#reading-list-grid','#reading-list-empty',cardHTML,by(user.list));
    fill('#loans-grid','#loans-empty',wrap(['return','Return']),by(user.loans));
    fill('#waitlist-grid','#waitlist-empty',wrap(['unwait','Leave waitlist']),by(user.waits));
    const started=by(Object.keys(user.progress).map(Number)).filter(b=>chaptersOf(b).length);
    $('#continue-section').hidden=!started.length;
    $('#continue-grid').innerHTML=started.map(b=>{const p=user.progress[b.id];
      return `<div class="book-card-wrap">${cardHTML(b)}<div class="book-card__actions"><a class="btn" href="reader.html?id=${b.id}&ch=${p.ch}">Continue chapter ${p.ch}</a></div></div>`}).join('');
  }
  document.addEventListener('click',e=>{
    const a=e.target.dataset.action,id=+e.target.dataset.bookId;if(!a)return;
    if(a==='return')returnBook(user,id);
    if(a==='unwait')user.waits=user.waits.filter(i=>i!==id);
    saveUsers();render();
  });
  render();
}
});
