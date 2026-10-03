const CORS = {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"Content-Type","Access-Control-Allow-Methods":"GET,POST,PUT,DELETE,OPTIONS"};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json",...CORS}});
const text=(data,status=200)=>new Response(data,{status,headers:{"Content-Type":"text/plain;charset=UTF-8",...CORS}});

function b64(bytes){let s="";for(const b of bytes)s+=String.fromCharCode(b);return btoa(s)}
function ub64(s){const x=atob(s);return Uint8Array.from(x,c=>c.charCodeAt(0))}
function hex(bytes){return [...bytes].map(x=>x.toString(16).padStart(2,"0")).join("")}
async function sha256(s){return hex(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s))))}
async function pbkdf2(password,saltB64,iterations=120000){const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(password),"PBKDF2",false,["deriveBits"]);const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt:ub64(saltB64),iterations,hash:"SHA-256"},key,256);return b64(new Uint8Array(bits))}
async function verifyPassword(password,salt,expected){const got=await pbkdf2(password,salt);return got===expected}
function token(){const a=new Uint8Array(32);crypto.getRandomValues(a);return b64(a).replaceAll("+","-").replaceAll("/","_").replaceAll("=","")}
async function auth(request,env){const raw=request.headers.get("Authorization")||"";if(!raw.startsWith("Bearer "))return null;const t=raw.slice(7);const th=await sha256(t);const r=await env.DB.prepare("SELECT u.id,u.email,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? ").bind(th,Date.now()).first();return r||null}
async function log(env,user,action,details=""){await env.DB.prepare("INSERT INTO logs(actor_id,action,details) VALUES(?,?,?)").bind(user?.id||null,action,details).run()}
function admin(u){return u&& (u.role==='admin'||u.role==='owner')}

async function api(request,env){
 const url=new URL(request.url); const p=url.pathname; const method=request.method;
 if(method==='OPTIONS')return new Response(null,{headers:CORS});
 if(p==='/api/health')return json({ok:true,name:'IRIK Host',mode:'cloudflare-workers-d1',minecraftNodes:false});
 if(p==='/api/auth/register'&&method==='POST'){
  const b=await request.json(); const email=String(b.email||'').trim().toLowerCase(); const password=String(b.password||'');
  if(!/^\S+@\S+\.\S+$/.test(email)||password.length<8)return json({error:'Valid email and password of at least 8 characters are required'},400);
  const exists=await env.DB.prepare('SELECT id FROM users WHERE email=?').bind(email).first(); if(exists)return json({error:'Email already registered'},409);
  const saltA=new Uint8Array(16);crypto.getRandomValues(saltA);const salt=b64(saltA);const hash=await pbkdf2(password,salt);
  const r=await env.DB.prepare("INSERT INTO users(email,password_salt,password_hash,role) VALUES(?,?,?,'user') RETURNING id,email,role").bind(email,salt,hash).first();
  await log(env,r,'REGISTER','New account'); return json({user:r});
 }
 if(p==='/api/auth/login'&&method==='POST'){
  const b=await request.json();const email=String(b.email||'').trim().toLowerCase();const password=String(b.password||'');
  const u=await env.DB.prepare('SELECT * FROM users WHERE email=?').bind(email).first();
  if(!u||!(await verifyPassword(password,u.password_salt,u.password_hash)))return json({error:'Invalid email or password'},401);
  const t=token(),th=await sha256(t),expires=Date.now()+1000*60*60*24*7;
  await env.DB.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').bind(th,u.id,expires).run();await log(env,u,'LOGIN','Successful login');
  return json({token:t,user:{id:u.id,email:u.email,role:u.role}});
 }
 const user=await auth(request,env);
 if(p==='/api/auth/me'&&method==='GET')return user?json({user}):json({error:'Unauthorized'},401);
 if(p==='/api/auth/logout'&&method==='POST'){
  if(!user)return json({ok:true});const raw=request.headers.get('Authorization').slice(7);await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha256(raw)).run();return json({ok:true});
 }
 if(!user)return json({error:'Unauthorized'},401);
 if(p==='/api/servers'&&method==='GET'){
  const q=admin(user)?await env.DB.prepare("SELECT s.*,u.email owner_email FROM servers s JOIN users u ON u.id=s.owner_id ORDER BY s.id DESC").all():await env.DB.prepare('SELECT * FROM servers WHERE owner_id=? ORDER BY id DESC').bind(user.id).all();return json({servers:q.results});
 }
 if(p==='/api/servers'&&method==='POST'){
  const b=await request.json();const ownerId=admin(user)&&b.owner_id?Number(b.owner_id):user.id; if(!admin(user)&&ownerId!==user.id)return json({error:'Forbidden'},403);
  const r=await env.DB.prepare("INSERT INTO servers(owner_id,name,ram_mb,cpu_percent,disk_mb,minecraft_version) VALUES(?,?,?,?,?,?) RETURNING *").bind(ownerId,String(b.name||'Minecraft Server'),Number(b.ram_mb||1024),Number(b.cpu_percent||100),Number(b.disk_mb||10240),String(b.minecraft_version||'Paper 1.21.8')).first();await log(env,user,'SERVER_CREATE',`Server #${r.id}`);return json({server:r},201);
 }
 const sm=p.match(/^\/api\/servers\/(\d+)\/(start|stop|restart)$/);if(sm&&method==='POST'){
  const id=Number(sm[1]),action=sm[2];const s=await env.DB.prepare('SELECT * FROM servers WHERE id=?').bind(id).first();if(!s)return json({error:'Server not found'},404);if(!admin(user)&&s.owner_id!==user.id)return json({error:'Forbidden'},403);
  const status=action==='start'?'online':action==='stop'?'offline':'online';await env.DB.prepare('UPDATE servers SET status=? WHERE id=?').bind(status,id).run();await log(env,user,`SERVER_${action.toUpperCase()}`,`Server #${id}`);return json({ok:true,status,simulated:true,message:'Node not connected yet; status is simulated.'});
 }
 const sd=p.match(/^\/api\/servers\/(\d+)$/);if(sd&&method==='DELETE'){
  const id=Number(sd[1]);const s=await env.DB.prepare('SELECT * FROM servers WHERE id=?').bind(id).first();if(!s)return json({error:'Server not found'},404);if(!admin(user)&&s.owner_id!==user.id)return json({error:'Forbidden'},403);await env.DB.prepare('DELETE FROM servers WHERE id=?').bind(id).run();await log(env,user,'SERVER_DELETE',`Server #${id}`);return json({ok:true});
 }
 if(p==='/api/admin/users'&&method==='GET'){if(!admin(user))return json({error:'Forbidden'},403);const r=await env.DB.prepare('SELECT id,email,role,created_at FROM users ORDER BY id DESC').all();return json({users:r.results});}
 if(p==='/api/admin/users/role'&&method==='POST'){if(user.role!=='owner')return json({error:'Owner only'},403);const b=await request.json();const role=['user','admin','owner'].includes(b.role)?b.role:'user';if(Number(b.id)===user.id&&role!=='owner')return json({error:'Owner cannot demote self'},400);await env.DB.prepare('UPDATE users SET role=? WHERE id=?').bind(role,Number(b.id)).run();await log(env,user,'USER_ROLE_CHANGE',`User #${b.id} => ${role}`);return json({ok:true});}
 if(p==='/api/admin/logs'&&method==='GET'){if(!admin(user))return json({error:'Forbidden'},403);const r=await env.DB.prepare('SELECT l.*,u.email FROM logs l LEFT JOIN users u ON u.id=l.actor_id ORDER BY l.id DESC LIMIT 200').all();return json({logs:r.results});}
 if(p==='/api/admin/stats'&&method==='GET'){if(!admin(user))return json({error:'Forbidden'},403);const a=await env.DB.prepare('SELECT COUNT(*) n FROM users').first();const s=await env.DB.prepare('SELECT COUNT(*) n FROM servers').first();const on=await env.DB.prepare("SELECT COUNT(*) n FROM servers WHERE status='online'").first();return json({users:a.n,servers:s.n,online:on.n});}
 if(p==='/api/console'&&method==='GET'){return json({lines:['[IRIK Host] Console is ready.','[Node] No Minecraft node connected.','[IRIK Host] This is the control plane only.']});}
 return json({error:'Not found'},404);
}

export default {async fetch(request,env,ctx){const url=new URL(request.url);if(url.pathname.startsWith('/api/'))return api(request,env);return env.ASSETS.fetch(request)}};
