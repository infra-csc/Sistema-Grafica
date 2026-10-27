// Teste real das APIs da VPS e R2, restrito a copia e registros sinteticos.
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { S3Client, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

assert.equal(new URL(process.env.DATABASE_URL).pathname,'/grafica_import_20261008');
assert.equal(process.env.BOOK_EMAIL_NOTIFICATIONS_ENABLED,'false');
assert.equal(process.env.REVISAO_DIGEST_ENABLED,'false');
assert.equal(process.env.GESTAO_DIGEST_ENABLED,'false');
const base='https://grafica.appsnorte.com';
const run=randomUUID(); const prefix=`TESTE HOMOLOG ${run}`;
const db=new pg.Client({connectionString:process.env.DATABASE_URL});
const r2=new S3Client({region:'auto',endpoint:`https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  forcePathStyle:true,requestChecksumCalculation:'WHEN_REQUIRED',responseChecksumValidation:'WHEN_REQUIRED',
  credentials:{accessKeyId:process.env.R2_ACCESS_KEY_ID,secretAccessKey:process.env.R2_SECRET_ACCESS_KEY}});
const accounts={},cookies={},events=[],sponsors=[],items=[],orders=[],objects=[],checks=[];
const check=label=>{checks.push(label);console.log('OK: '+label);};
const fetchApi=(path, options={})=>fetch(base+path,{redirect:'manual',signal:AbortSignal.timeout(30000),...options});
async function api(role,method,path,body,status=200){
  const r=await fetchApi(path,{method,headers:{Cookie:cookies[role]||'',Origin:base,'Content-Type':'application/json'},
    ...(body===undefined?{}:{body:JSON.stringify(body)})});
  const text=await r.text();
  assert.equal(r.status,status,`${role} ${method} ${path}: ${text.slice(0,400)}`);
  return text?JSON.parse(text):null;
}
async function upload(role,bytes,type){
  const res=await fetchApi('/api/objects/upload-direct',{method:'PUT',headers:{Cookie:cookies[role],Origin:base,'Content-Type':type},body:bytes});
  assert.equal(res.status,200,await res.clone().text());
  const {url}=await res.json(); assert.match(url,/^\/objects\/uploads\/[a-f0-9-]+$/);
  const key='.private/'+url.slice('/objects/'.length); objects.push(key);
  const read=await fetchApi(url,{headers:{Cookie:cookies[role]}});
  assert.equal(read.status,200); assert.deepEqual(Buffer.from(await read.arrayBuffer()),bytes);
  assert.equal((await fetchApi(url)).status,401);
  await r2.send(new HeadObjectCommand({Bucket:process.env.R2_BUCKET,Key:key}));
  check(`Upload/download ${type}: bytes identicos, R2 HEAD e bloqueio anonimo`);
  return url;
}
async function state(id,expected){
  const {rows}=await db.query('SELECT status,quantity_produced,delivered_qty FROM items WHERE id=$1',[id]);
  assert.ok([expected].flat().includes(rows[0]?.status),JSON.stringify(rows[0]));
  check('Estado persistido: '+rows[0].status);
  return rows[0];
}
await db.connect();
const baseline=(await db.query('SELECT (SELECT count(*) FROM users)::int AS users,(SELECT count(*) FROM events)::int AS events,(SELECT count(*) FROM items)::int AS items')).rows[0];
let failure;
try{
  for(const [label,role,kit,cultura] of [['admin','admin',false,false],['solicitacao','solicitacao',false,false],['arte','arte',false,false],['atendimento','atendimento',false,false],['grafica','grafica',false,false],['kit','solicitacao',true,false],['cultura','atendimento',false,true]]){
    const id=randomUUID(),email=`homolog-${label}-${run}@example.invalid`;
    accounts[label]=id;
    await db.query('INSERT INTO users(id,name,email,password_hash,role,kit,cultura,must_change_password) VALUES($1,$2,$3,$4,$5,$6,$7,false)',[id,`${prefix} ${label}`,email,'!disabled',role,kit,cultura]);
    const token=jwt.sign({email,app:'producao'},process.env.SSO_SECRET,{algorithm:'HS256',issuer:'norte-portal',audience:'producao',expiresIn:'2m'});
    const entry=await fetchApi('/?portal_sso='+encodeURIComponent(token));
    assert.equal(entry.status,302);
    const exchangeToken=new URL(entry.headers.get('location'),base).searchParams.get('sso_exchange');
    const exchange=await fetchApi('/api/auth/sso-exchange',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({exchangeToken})});
    assert.equal(exchange.status,200);
    cookies[label]=exchange.headers.getSetCookie().find(c=>c.startsWith('connect.sid=')).split(';')[0];
    const me=await api(label,'GET','/api/auth/me'); assert.equal(me.id,id); assert.equal(me.role,role);
    check(`Sessao/perfil ${label}`);
  }
  await api('admin','GET','/api/users');
  for(const role of ['solicitacao','arte','grafica','atendimento','kit','cultura'])await api(role,'GET','/api/users',undefined,403);
  check('Administracao de usuarios restrita ao admin');
  const date=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);
  const eventBody={name:prefix,startDate:date(60),truckDepartureDate:date(50)+'T08:00',franchise:'HOMOLOGACAO'};
  for(const role of ['atendimento','arte','grafica'])await api(role,'POST','/api/events',eventBody,403);
  const event=await api('solicitacao','POST','/api/events',eventBody,201);events.push(event.id);
  const culturaEvent=await api('cultura','POST','/api/events',{...eventBody,name:prefix+' Cultura'},201);events.push(culturaEvent.id);
  check('Criacao de evento: Solicitacao e Cultura autorizadas; demais perfis recusados');
  const sponsor=await api('admin','POST','/api/sponsors',{name:prefix+' Patrocinador'},201);sponsors.push(sponsor.id);
  await api('solicitacao','POST',`/api/events/${event.id}/sponsors`,{sponsorId:sponsor.id},201);
  const order=await api('atendimento','POST','/api/pedidos-de-peca',{linhas:[{eventId:event.id,sponsorIds:[sponsor.id],quantidade:10,observacao:prefix+' Pedido',tipoDePeca:'Portico',largura:3,altura:1}]},201);orders.push(order.id);
  for(const role of ['arte','grafica','solicitacao'])await api(role,'POST','/api/pedidos-de-peca',{linhas:[]},403);
  const pieceBody={eventId:event.id,type:'Portico',description:prefix+' Peca',quantity:10,material:'Lona 440g',finish:'Ilhos',measurement:'3 x 1',fileWidth:'3.00',fileHeight:'1.00',area:'3.00',visual:'3.00',calculatedM2:'30.00',skipApproval:false};
  const piece=await api('solicitacao','POST','/api/items',pieceBody,201);items.push(piece.id);
  const line=(await db.query('SELECT id FROM pedidos_de_peca_linhas WHERE pedido_id=$1',[order.id])).rows[0];
  await api('atendimento','PATCH',`/api/pedidos-de-peca/linhas/${line.id}/atender`,{itemId:piece.id},403);
  await api('solicitacao','PATCH',`/api/pedidos-de-peca/linhas/${line.id}/atender`,{itemId:piece.id});
  check('Pedido Atendimento criado e atendido pela Solicitacao');
  await api('solicitacao','POST',`/api/events/${event.id}/items/submit`,{});
  await api('solicitacao','POST','/api/items/send-to-arte',{itemIds:[piece.id]});
  await state(piece.id,'awaiting_submission');
  const png=await sharp({create:{width:40,height:30,channels:3,background:'#e26d32'}}).png().toBuffer();
  const jpeg=await sharp(png).jpeg().toBuffer();
  const pdfDoc=await PDFDocument.create();pdfDoc.addPage([200,200]);const pdf=Buffer.from(await pdfDoc.save());
  const photo=await upload('grafica',jpeg,'image/jpeg');
  const thumb=await upload('arte',png,'image/png');
  const final=await upload('arte',pdf,'application/pdf');
  const mini=await fetchApi(thumb+'?thumb=1',{headers:{Cookie:cookies.arte}});
  assert.equal(mini.status,200);assert.match(mini.headers.get('content-type'),/image\/webp/);
  const miniBytes=Buffer.from(await mini.arrayBuffer());assert.ok(miniBytes.length>0);
  await r2.send(new HeadObjectCommand({Bucket:process.env.R2_BUCKET,Key:objects.find(k=>k.endsWith(thumb.split('/').pop()))+'/thumb.webp'}));
  check('Miniatura WebP visualizada pelo app e persistida no R2');
  const fake=await fetchApi('/api/objects/upload-direct',{method:'PUT',headers:{Cookie:cookies.arte,Origin:base,'Content-Type':'application/pdf'},body:png});
  assert.equal(fake.status,200);
  const fakeUrl=(await fake.json()).url;objects.push('.private/'+fakeUrl.slice('/objects/'.length));
  const identified=await fetchApi(fakeUrl,{headers:{Cookie:cookies.arte}});
  assert.match(identified.headers.get('content-type'),/image\/png/);
  assert.deepEqual(Buffer.from(await identified.arrayBuffer()),png);
  const unsafe=await fetchApi('/api/objects/upload-direct',{method:'PUT',headers:{Cookie:cookies.arte,Origin:base,'Content-Type':'image/png'},body:Buffer.from('<html>teste</html>')});
  assert.ok([400,415].includes(unsafe.status));
  check('Tipo determinado pelos bytes; HTML disfarçado recusado');
  await api('solicitacao','PATCH',`/api/items/${piece.id}/submit-for-approval`,{approvalThumbUrl:thumb},403);
  await api('arte','PATCH',`/api/items/${piece.id}/submit-for-approval`,{approvalThumbUrl:thumb});
  await state(piece.id,'awaiting_sponsor_approval');
  await api('arte','PATCH',`/api/items/${piece.id}/sponsor-approve`,{},403);
  await api('atendimento','POST',`/api/items/${piece.id}/sponsor-approvals/${sponsor.id}/approve`,{});
  await state(piece.id,'sponsor_approved');
  await api('arte','PATCH',`/api/items/${piece.id}/submit-final-file`,{finalFileUrl:final});
  await state(piece.id,'awaiting_final_review');
  await api('arte','PATCH',`/api/items/${piece.id}/creator-review`,{approved:true},403);
  await api('solicitacao','PATCH',`/api/items/${piece.id}/creator-review`,{approved:true});
  await state(piece.id,['ready_for_production','approved']);
  check('Arte, aprovacao por patrocinador e revisao final com separacao de perfis');
  for(const role of ['solicitacao','atendimento','arte'])await api(role,'PATCH',`/api/items/${piece.id}/start-printing`,{printMachine:'1'},403);
  await api('grafica','PATCH',`/api/items/${piece.id}/start-printing`,{},400);
  let started=false;
  for(const machine of ['1','2','3','4']){
    const res=await fetchApi(`/api/items/${piece.id}/start-printing`,{method:'PATCH',headers:{Cookie:cookies.grafica,Origin:base,'Content-Type':'application/json'},body:JSON.stringify({printMachine:machine})});
    const text=await res.text();if(res.status===200){started=true;break;}assert.equal(res.status,409,text);assert.ok(text.includes('PRINTER_BUSY'),text);
  }
  assert.ok(started,'Nenhuma impressora livre');await state(piece.id,'inProduction');
  await api('grafica','PATCH',`/api/items/${piece.id}/start-production`,{quantityProduced:6});
  assert.equal((await db.query('SELECT quantity_produced FROM items WHERE id=$1',[piece.id])).rows[0].quantity_produced,6);
  await api('grafica','PATCH',`/api/items/${piece.id}/start-production`,{quantityProduced:10});
  await state(piece.id,'produced');
  await api('grafica','POST',`/api/items/${piece.id}/confer`,{qty:10},400);
  await api('grafica','POST',`/api/items/${piece.id}/confer`,{conferencePhotoUrl:photo,qty:10});
  await state(piece.id,'conferred');
  const tube=await api('grafica','POST',`/api/events/${event.id}/tubos`,{itens:[{id:piece.id,quantidade:10}],fotos:[photo]},201);
  await state(piece.id,'packed');
  await api('grafica','POST',`/api/tubos/${tube.id}/entregar`,{receivedBy:prefix+' Recebedor',photoUrl:photo});
  assert.equal((await state(piece.id,'delivered')).delivered_qty,10);
  check('Producao parcial/total, conferencia com foto, embalagem e entrega do volume');
  assert.equal((await fetchApi(thumb,{headers:{Cookie:cookies.kit}})).status,403);
  check('Kit nao acessa arquivo de peca alheia');
}catch(error){failure=error;console.error('FALHA: '+error.message);}
finally{
  for(const key of objects){for(const Key of [key,key+'/thumb.webp'])await r2.send(new DeleteObjectCommand({Bucket:process.env.R2_BUCKET,Key:Key}));}
  await db.query('BEGIN');
  try{
    if(items.length)await db.query('DELETE FROM inventory_assets WHERE original_item_id=ANY($1::varchar[])',[items]);
    if(orders.length)await db.query('DELETE FROM pedidos_de_peca WHERE id=ANY($1::varchar[])',[orders]);
    if(events.length)await db.query('DELETE FROM events WHERE id=ANY($1::varchar[])',[events]);
    if(sponsors.length)await db.query('DELETE FROM sponsors WHERE id=ANY($1::varchar[])',[sponsors]);
    const ids=Object.values(accounts);
    await db.query('DELETE FROM session WHERE sess::jsonb->>\'userId\'=ANY($1::text[])',[ids]);
    await db.query('DELETE FROM sso_tokens_de_troca WHERE user_id=ANY($1::varchar[])',[ids]);
    await db.query('DELETE FROM audit_logs WHERE user_id=ANY($1::varchar[])',[ids]);
    await db.query('DELETE FROM users WHERE id=ANY($1::varchar[])',[ids]);
    await db.query('COMMIT');
  }catch(e){await db.query('ROLLBACK');throw e;}
  const after=(await db.query('SELECT (SELECT count(*) FROM users)::int AS users,(SELECT count(*) FROM events)::int AS events,(SELECT count(*) FROM items)::int AS items')).rows[0];
  assert.deepEqual(after,baseline,'Contagens apos limpeza devem coincidir com antes');
  console.log('RESULTADO_HOMOLOGACAO='+JSON.stringify({run,result:failure?'FALHOU':'OK',baseline,after,checks,cleaned:true}));
  await db.end();r2.destroy();
}
if(failure)process.exitCode=1;
