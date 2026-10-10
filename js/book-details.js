// Book details page: book-details.html?id=1
ready.then(async()=>{
const b=findBook(new URLSearchParams(location.search).get('id'));
if(!b){$('main').innerHTML='<p>Book not found. <a href="catalog.html">Back to catalog</a></p>'}
else{document.title=b.title+' | Online Library';bindDetails(document.body);showDetails(document,b)}
});
