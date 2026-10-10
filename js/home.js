// Home: featured books (the search form sends the user to catalog.html?q=...)
ready.then(async()=>{
const feat=[...new Map([...books.slice(0,6),...books.filter(b=>b.type!=='text').slice(0,2)].map(b=>[b.id,b])).values()];
$('#featured-grid').innerHTML=feat.length?feat.map(cardHTML).join(''):'<p class="empty-state">The library is empty. An admin can add books from the admin page.</p>';
});
