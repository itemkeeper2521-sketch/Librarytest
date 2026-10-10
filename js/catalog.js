// Catalog: live search and filters, plus the details pop-up
ready.then(async()=>{
const form=$('#filter-form'),modal=$('#book-modal');
bindDetails(modal);
$('#genre-select').innerHTML+=[...new Set(books.map(b=>b.genre))].sort().map(g=>`<option>${esc(g)}</option>`).join('');
$('#search-input').value=new URLSearchParams(location.search).get('q')||'';
function render(){
  const q=$('#search-input').value.toLowerCase().trim(),g=$('#genre-select').value,t=$('#type-select').value,a=$('#avail-select').value;
  const r=books.filter(b=>(!q||[b.title,b.author,b.genre].join(' ').toLowerCase().includes(q))&&(!g||b.genre===g)&&(!t||b.type===t)&&(!a||(a==='available')===(freeCopies(b)>0)));
  $('#catalog-grid').innerHTML=r.map(cardHTML).join('');
  $('#result-count').textContent=`${r.length} of ${books.length} titles`;
  $('#empty-state').textContent=books.length?'No matches. Try a different keyword or clear a filter.':'The library is empty. An admin can add books from the admin page.';
  $('#empty-state').hidden=r.length>0;
}
form.addEventListener('input',render);
form.addEventListener('submit',e=>e.preventDefault());
form.addEventListener('reset',()=>setTimeout(render));
$('#btn-close').onclick=()=>modal.close();
modal.addEventListener('click',e=>{if(e.target===modal)modal.close()});
window.onLibraryChange=render;
render();
});
