// Login and register
const lf=$('#login-form'),rf=$('#register-form');
const swap=(hide,showEl)=>{hide.hidden=true;showEl.hidden=false};
const err=(f,t)=>{$('.form-error',f).textContent=t};
$('#show-register').onclick=e=>{e.preventDefault();swap(lf,rf)};
$('#show-login').onclick=e=>{e.preventDefault();swap(rf,lf)};
lf.onsubmit=e=>{
  e.preventDefault();
  const u=users.find(x=>x.username===$('#login-user').value.trim()&&x.password===$('#login-pass').value);
  if(!u)return err(lf,'Wrong username or password.');
  save('currentUser',u.username);
  location.href=u.role==='admin'?'admin.html':'catalog.html';
};
rf.onsubmit=e=>{
  e.preventDefault();
  const n=$('#reg-user').value.trim(),p=$('#reg-pass').value;
  if(n.length<3)return err(rf,'Username needs at least 3 characters.');
  if(p.length<5)return err(rf,'Password needs at least 5 characters.');
  if(p!==$('#reg-pass2').value)return err(rf,'The passwords do not match.');
  if(users.some(x=>x.username.toLowerCase()===n.toLowerCase()))return err(rf,'That username is taken.');
  users.push({username:n,password:p,role:'user',list:[],loans:[],waits:[],progress:{}});
  if(saveUsers()){save('currentUser',n);location.href='catalog.html'}
};
