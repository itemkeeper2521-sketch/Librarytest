// Admin: add, edit and delete books. Every change is saved by committing files to the website's GitHub repository.
const F=id=>$('#'+id),rows=F('chapter-rows'),form=F('book-form'),status=F('save-status');
const natural=(a,b)=>a.localeCompare(b,undefined,{numeric:true});
const isPdf=f=>/\.pdf$/i.test(f.name)||f.type==='application/pdf';
const pad=i=>String(i+1).padStart(4,'0');
const msg=err=>/^(PDF|GitHub|Add )/.test(err?.message||'')?err.message:'Something went wrong: '+(err?.message||err);

// ---- GitHub connection (settings are kept in this browser only)
const getCfg=()=>{try{return JSON.parse(localStorage.getItem('ghcfg')||sessionStorage.getItem('ghcfg')||'null')}catch{return null}};
const setCfg=(c,remember)=>{localStorage.removeItem('ghcfg');sessionStorage.removeItem('ghcfg');if(c)(remember?localStorage:sessionStorage).setItem('ghcfg',JSON.stringify(c))};
async function gh(path,opt={}){
  const c=getCfg();if(!c)throw new Error('GitHub: connect to your repository first (open "GitHub connection").');
  const r=await fetch(`https://api.github.com/repos/${c.owner}/${c.repo}/${path}`,{method:opt.method||'GET',
    headers:{Authorization:`Bearer ${c.token}`,Accept:'application/vnd.github+json','Content-Type':'application/json'},body:opt.body&&JSON.stringify(opt.body)});
  if(!r.ok)throw new Error(`GitHub: ${r.status} ${(await r.json().catch(()=>({}))).message||''}`.trim());
  return r.json();
}
const fromB64=s=>new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g,'')),c=>c.charCodeAt(0)));
async function toB64(data){
  const bytes=new Uint8Array(await (data instanceof Blob?data:new Blob([data])).arrayBuffer());let s='';
  for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
  return btoa(s);
}
async function readRepoBooks(){
  try{const f=await gh(`contents/library/books.json?ref=${encodeURIComponent(getCfg().branch)}`);return JSON.parse(fromB64(f.content))}
  catch(e){if(/ 404/.test(e.message))return [];throw e}
}
// One commit = the new files + the updated library/books.json.
// build(currentBooks) returns { books, files: [[path, blobOrText]], remove: [pathPrefix] }
async function commit(message,build){
  const c=getCfg();
  if(!c)throw new Error('GitHub: connect to your repository first (open "GitHub connection").');
  for(let attempt=0;attempt<2;attempt++){
    status.textContent='Reading the repository...';
    const head=(await gh(`git/ref/heads/${c.branch}`)).object.sha;
    const base=await gh(`git/commits/${head}`);
    const tree=await gh(`git/trees/${base.tree.sha}?recursive=1`);
    if(tree.truncated)throw new Error('GitHub: the repository is too large to read in one request.');
    const entry=tree.tree.find(t=>t.path==='library/books.json');
    const current=entry?JSON.parse(fromB64((await gh(`git/blobs/${entry.sha}`)).content)):[];
    const out=build(current),items=[];
    for(const t of tree.tree)if(t.type==='blob'&&out.remove.some(p=>t.path.startsWith(p)))items.push({path:t.path,mode:'100644',type:'blob',sha:null});
    const all=[...out.files,['library/books.json',JSON.stringify(out.books,null,1)]];
    let done=0;
    for(let i=0;i<all.length;i+=4)await Promise.all(all.slice(i,i+4).map(async([path,data])=>{
      const blob=await gh('git/blobs',{method:'POST',body:{content:await toB64(data),encoding:'base64'}});
      items.push({path,mode:'100644',type:'blob',sha:blob.sha});
      status.textContent=`Uploading ${++done} of ${all.length} files...`;
    }));
    const nt=await gh('git/trees',{method:'POST',body:{base_tree:base.tree.sha,tree:items}});
    const nc=await gh('git/commits',{method:'POST',body:{message,tree:nt.sha,parents:[head]}});
    try{await gh(`git/refs/heads/${c.branch}`,{method:'PATCH',body:{sha:nc.sha}});return out.books}
    catch(err){if(attempt===1||!/ 422/.test(err.message))throw err}   // someone else saved first: read again and retry once
  }
}

// ---- PDF to page images (PDF.js, loaded only when needed)
let pdfReady;
function loadPdfJs(){
  return pdfReady||(pdfReady=(async()=>{
    for(const base of ['lib/','https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/']){
      try{
        await new Promise((ok,no)=>{const s=document.createElement('script');s.src=base+'pdf.min.js';s.onload=ok;s.onerror=no;document.head.append(s)});
        pdfjsLib.GlobalWorkerOptions.workerSrc=base+'pdf.worker.min.js';return;
      }catch{}
    }
    pdfReady=null;throw new Error('PDF library not found. Connect to the internet once, or put pdf.min.js and pdf.worker.min.js in a lib folder.');
  })());
}
async function pdfToImages(file,onPage){
  await loadPdfJs();
  const pdf=await pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise,out=[];
  for(let i=1;i<=pdf.numPages;i++){
    const page=await pdf.getPage(i),w=page.getViewport({scale:1}).width,vp=page.getViewport({scale:Math.min(2,1400/w)});
    const c=document.createElement('canvas');c.width=vp.width;c.height=vp.height;
    await page.render({canvasContext:c.getContext('2d'),viewport:vp}).promise;
    out.push(await new Promise(r=>c.toBlob(r,'image/webp',.82)));
    page.cleanup();onPage?.(i,pdf.numPages);
  }
  return out;
}
async function toPages(files){      // image files and PDFs -> list of page images, in order
  const out=[];
  for(const f of files)out.push(...(isPdf(f)?await pdfToImages(f,(i,n)=>status.textContent=`Converting ${f.name}: page ${i} of ${n}`):[f]));
  return out;
}
// every page is saved as a WebP about 1000 px wide, so the repository stays small
const toWebp=file=>file.type==='image/webp'&&file.size<400000?Promise.resolve(file):new Promise(res=>{
  const u=URL.createObjectURL(file),i=new Image();
  i.onload=()=>{const k=Math.min(1,1000/i.width),c=document.createElement('canvas');c.width=Math.round(i.width*k);c.height=Math.round(i.height*k);
    c.getContext('2d').drawImage(i,0,0,c.width,c.height);c.toBlob(b=>{URL.revokeObjectURL(u);res(b||file)},'image/webp',.8)};
  i.onerror=()=>{URL.revokeObjectURL(u);res(file)};i.src=u;
});

// ---- form
const textRows=F('text-chapter-rows');
const toggleType=()=>{const t=F('book-type').value==='text';F('text-chapters-field').hidden=!t;F('chapters-field').hidden=t;if(t&&!textRows.children.length){addTextRow();showTc(0)}};
F('book-type').onchange=toggleType;
function addRow(c={}){
  const r=F('chapter-row-template').content.firstElementChild.cloneNode(true),n=c.pages?.length??c.pageCount??0;
  $('.ch-number',r).value=c.number||rows.children.length+1;$('.ch-title',r).value=c.title||'';
  $('.ch-count',r).textContent=n?`${n} pages kept (choose images or a PDF to replace them)`:'No pages yet';
  r._ch=c;rows.append(r);
}
F('add-chapter').onclick=()=>addRow();
rows.onclick=e=>{if(e.target.matches('.ch-remove'))e.target.closest('.chapter-row').remove()};
// text books: one big box per chapter
function addTextRow(c={},text=''){
  const r=F('text-chapter-row-template').content.firstElementChild.cloneNode(true);
  $('.tc-number',r).value=c.number||textRows.children.length+1;$('.tc-title',r).value=c.title||'';$('.tc-text',r).value=text;
  r._ch=c;textRows.append(r);
}
// only one chapter is shown at a time: < goes back, > goes forward (or opens a new empty chapter at the end)
let tcIndex=0;
function showTc(i){
  const rs=[...textRows.children];if(!rs.length)return;
  tcIndex=Math.max(0,Math.min(i,rs.length-1));
  rs.forEach((r,k)=>r.hidden=k!==tcIndex);
  F('tc-jump').innerHTML=rs.map((r,k)=>`<option value="${k}"${k===tcIndex?' selected':''}>Chapter ${esc($('.tc-number',r).value||k+1)}${$('.tc-title',r).value?': '+esc($('.tc-title',r).value):''}</option>`).join('');
  F('tc-prev').disabled=tcIndex===0;
}
const focusTc=()=>$('.tc-text',textRows.children[tcIndex]).focus?.();
F('tc-prev').onclick=()=>{showTc(tcIndex-1);focusTc()};
F('tc-jump').onchange=e=>{showTc(+e.target.value);focusTc()};
F('tc-next').onclick=()=>{
  const n=textRows.children.length;
  if(tcIndex<n-1)showTc(tcIndex+1);
  else if(!$('.tc-text',textRows.children[tcIndex]).value.trim()){toast('Write this chapter first, then go to the next one.');return}
  else{addTextRow();showTc(n)}
  focusTc();
};
textRows.addEventListener('input',()=>showTc(tcIndex));      // keeps the chapter list in the dropdown up to date
textRows.onclick=e=>{
  if(!e.target.matches('.tc-remove'))return;
  const row=e.target.closest('.text-chapter-row');
  if($('.tc-text',row).value.trim()&&!confirm('Remove this chapter and its text?'))return;
  row.remove();if(!textRows.children.length)addTextRow();showTc(tcIndex);
};
// reads a chapter's text from the repository (newest version), or from the live site
async function loadTextAdmin(b,c){
  const f=c?.textFile||b.textFile;if(!f)return b.text||'';
  if(getCfg())try{return fromB64((await gh(`contents/${f}?ref=${encodeURIComponent(getCfg().branch)}`)).content)}catch{}
  try{const r=await fetch(f);if(r.ok)return await r.text()}catch{}
  return null;
}
function resetForm(){rows.innerHTML='';textRows.innerHTML='';F('book-id').value='';F('form-title').textContent='Add a book';toggleType()}
form.addEventListener('reset',()=>setTimeout(resetForm));

function renderTable(){
  F('book-table-body').innerHTML=!books.length?'<tr><td colspan="5" class="muted">No books yet. Use the form above to add one.</td></tr>':books.map(b=>`<tr data-book-id="${b.id}"><td>${esc(b.title)}</td><td>${TYPES[b.type]}</td><td>${b.copies}</td><td>${freeCopies(b)}</td>
  <td>${b.fromFile?'<span class="muted">Listed in library/books.js</span>':'<button type="button" class="btn btn--ghost" data-action="edit">Edit</button> <button type="button" class="btn btn--danger" data-action="delete">Delete</button>'}</td></tr>`).join('');
}

// ---- save (add or edit)
form.onsubmit=async e=>{
  e.preventDefault();
  if(!getCfg()){toast('Connect to GitHub first.');F('github-settings').open=true;F('github-settings').scrollIntoView();return}
  const btn=$('[type=submit]',form);btn.disabled=true;
  try{
    const editId=+F('book-id').value||0;
    const base={title:F('book-title').value.trim(),author:F('book-author').value.trim(),genre:F('book-genre').value,type:F('book-type').value,
      year:+F('book-year').value||new Date().getFullYear(),copies:Math.max(1,+F('book-copies').value||1),desc:F('book-desc').value.trim()};
    const isText=base.type==='text',prepared=[],texts=[];
    if(isText){
      let k=0;
      for(const r of $$('.text-chapter-row',textRows)){
        const text=$('.tc-text',r).value;if(!text.trim())continue;
        const number=+$('.tc-number',r).value||texts.length+1;
        texts.push({number,title:$('.tc-title',r).value.trim()||'Chapter '+number,key:r._ch.key||'t'+Date.now().toString(36)+(k++),text});
      }
      if(!texts.length)throw new Error('Add the text of at least one chapter first.');
    }else{
      let k=0;
      for(const r of $$('.chapter-row',rows)){
        const raw=[...$('.ch-pages',r).files].sort((a,b)=>natural(a.name,b.name)),number=+$('.ch-number',r).value||prepared.length+1,title=$('.ch-title',r).value.trim()||'Chapter '+number;
        if(raw.length)prepared.push({number,title,key:'c'+Date.now().toString(36)+(k++),blobs:await Promise.all((await toPages(raw)).map(toWebp))});
        else if(r._ch.folder)prepared.push({number,title,keep:r._ch});
      }
    }
    const result=await commit(`${editId?'Update':'Add'} book: ${base.title}`,cur=>{
      const id=editId||Math.max(0,...cur.map(b=>b.id),...EXTRA.map(b=>b.id))+1,old=cur.find(b=>b.id===id)||{},files=[],remove=[];
      const nb={...old,id,...base};delete nb.sample;delete nb.text;delete nb.fromFile;
      if(isText){
        const keepKeys=texts.map(t=>t.key);
        (old.chapters||[]).forEach(c=>{if(c.folder)remove.push(c.folder+'/');else if(c.textFile&&!keepKeys.includes(c.key))remove.push(c.textFile)});
        if(old.textFile)remove.push(old.textFile);delete nb.textFile;
        nb.chapters=texts.map(t=>{const textFile=`library/text/${id}/${t.key}.txt`;files.push([textFile,t.text]);return {number:t.number,title:t.title,key:t.key,textFile}}).sort((a,b)=>a.number-b.number);
      }else{
        if(old.textFile)remove.push(old.textFile);delete nb.textFile;
        (old.chapters||[]).forEach(c=>c.textFile&&remove.push(c.textFile));
        const keep=prepared.filter(p=>p.keep).map(p=>p.keep.folder);
        (old.chapters||[]).forEach(c=>c.folder&&!keep.includes(c.folder)&&remove.push(c.folder+'/'));
        nb.chapters=prepared.map(p=>{
          if(p.keep)return {...p.keep,number:p.number,title:p.title};
          const folder=`library/pages/${id}/${p.key}`;
          p.blobs.forEach((b,i)=>files.push([`${folder}/${pad(i)}.webp`,b]));
          return {number:p.number,title:p.title,key:p.key,folder,pageCount:p.blobs.length,ext:'webp',pad:4};
        }).sort((a,b)=>a.number-b.number);
      }
      return {books:old.id?cur.map(b=>b.id===id?nb:b):[...cur,nb],files,remove};
    });
    books=mergeExtra(result);form.reset();renderTable();
    status.textContent='Saved to GitHub. The live site updates in a minute or two.';toast('Saved to GitHub');
  }catch(err){status.textContent=msg(err);toast(msg(err))}
  finally{btn.disabled=false}
};

// ---- edit and delete
F('book-table-body').onclick=async e=>{
  const a=e.target.dataset.action,b=findBook(e.target.closest('tr')?.dataset.bookId);if(!a||!b)return;
  if(a==='edit'){
    const cs=chaptersOf(b),texts=[];
    if(b.type==='text'){
      const list=cs.length?cs:(b.textFile||b.text?[{number:1,title:'Chapter 1'}]:[]);
      for(const c of list){const t=await loadTextAdmin(b,c);if(t===null){toast(`Could not load the text of "${b.title}". Check your connection and try again.`);return}texts.push([c,t])}
    }
    F('book-id').value=b.id;F('book-title').value=b.title;F('book-author').value=b.author;
    if(![...F('book-genre').options].some(o=>o.value===b.genre))F('book-genre').add(new Option(b.genre,b.genre));
    F('book-genre').value=b.genre;F('book-type').value=b.type;F('book-year').value=b.year;F('book-copies').value=b.copies;F('book-desc').value=b.desc;
    rows.innerHTML='';textRows.innerHTML='';
    if(b.type==='text'){texts.forEach(([c,t])=>addTextRow(c,t));showTc(0)}else cs.forEach(c=>addRow(c));
    toggleType();F('form-title').textContent='Edit book';scrollTo(0,0);
  }
  if(a==='delete'&&confirm(`Delete "${b.title}"? This removes it from the live library.`)){
    try{
      const result=await commit(`Delete book: ${b.title}`,cur=>({books:cur.filter(x=>x.id!==b.id),files:[],remove:[`library/pages/${b.id}/`,`library/text/${b.id}/`,`library/text/${b.id}.txt`]}));
      books=mergeExtra(result);
      users.forEach(u=>{['list','loans','waits'].forEach(k=>u[k]=u[k].filter(i=>i!==b.id));delete u.progress[b.id]});saveUsers();
      renderTable();status.textContent='Deleted. The live site updates in a minute or two.';toast('Deleted');
    }catch(err){status.textContent=msg(err);toast(msg(err))}
  }
};

// ---- GitHub connection form
const cfg=getCfg(),host=location.hostname.endsWith('.github.io')?{owner:location.hostname.split('.')[0],repo:location.pathname.split('/')[1]||location.hostname}:{};
F('gh-owner').value=cfg?.owner||host.owner||'';F('gh-repo').value=cfg?.repo||host.repo||'';F('gh-branch').value=cfg?.branch||'main';
if(cfg){F('gh-token').value=cfg.token;F('gh-remember').checked=!!localStorage.getItem('ghcfg');F('gh-status').textContent=`Connected to ${cfg.owner}/${cfg.repo}.`}
F('github-form').onsubmit=async e=>{
  e.preventDefault();
  const c={owner:F('gh-owner').value.trim(),repo:F('gh-repo').value.trim(),branch:F('gh-branch').value.trim()||'main',token:F('gh-token').value.trim()};
  setCfg(c,F('gh-remember').checked);F('gh-status').textContent='Checking...';
  try{
    await gh(`branches/${encodeURIComponent(c.branch)}`);
    books=mergeExtra(await readRepoBooks());renderTable();
    F('gh-status').textContent=`Connected to ${c.owner}/${c.repo} (${c.branch}). You can now save books.`;
  }catch(err){setCfg(null);F('gh-status').textContent=msg(err)}
};
F('gh-disconnect').onclick=()=>{setCfg(null);F('gh-token').value='';F('gh-status').textContent='Disconnected. The token was removed from this browser.'};

ready.then(async()=>{
  if(cfg)try{books=mergeExtra(await readRepoBooks())}catch{}      // always start from the newest list in the repository
  toggleType();renderTable();
});
