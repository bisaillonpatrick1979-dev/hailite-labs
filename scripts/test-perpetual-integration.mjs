import assert from 'node:assert/strict';
import worker from '../src/index.js';
import { createHmac } from 'node:crypto';

const SESSION = 'cs_test_ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const intent = 'pi_ABCDEFGHIJKLMNOPQRST';
const PRICE = 'price_PERMANENT2026';
let currentPrice = PRICE, refunded = false, provisionCalls = 0, revokedCalls = 0, createMode = null;
const orders = new Map();
const session = () => ({
  id:SESSION, status:'complete', mode:'payment', payment_status:'paid',
  payment_intent:intent, customer:'cus_EXAMPLE123456789',
  metadata:{type:'perpetual'},
  customer_details:{name:'Test Customer',email:'test@example.com',address:{country:'CA',state:'QC'}},
  custom_fields:[{key:'entreprise',text:{value:'Compagnie Essai'}},
    {key:'administrateur',text:{value:'Client Démo'}}]
});
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url);
  const body = typeof init.body === 'string' ? init.body : init.body?.toString() || '';
  let data, status = 200;
  if (url.hostname === 'api.stripe.com') {
    if (url.pathname === '/v1/checkout/sessions' && init.method === 'POST') {
      const fields = new URLSearchParams(body);
      createMode = fields.get('mode');
      assert.equal(fields.get('line_items[0][price]'),PRICE);
      data = { id:SESSION,url:'https://checkout.stripe.com/pay/valid' };
    } else if (url.pathname === `/v1/checkout/sessions/${SESSION}`) data=session();
    else if (url.pathname === `/v1/checkout/sessions/${SESSION}/line_items`) {
      data={data:[{price:{id:currentPrice},quantity:1}],has_more:false};
    } else if (url.pathname === `/v1/payment_intents/${intent}`) {
      data={id:intent, latest_charge:{refunded,amount:24900,amount_refunded:refunded?24900:0}};
    } else if (url.pathname === '/v1/checkout/sessions' && init.method === 'GET') {
      data={data:[session()],has_more:false};
    } else throw new Error('Unexpected Stripe call '+url.pathname);
  } else if (url.hostname === 'manager.invalid') {
    if (url.pathname === '/api/billing/perpetual/provision') {
      provisionCalls++; assert.equal(JSON.parse(body).purchaseReference,SESSION);
      data={created:true,accessCode:'comp-1234',adminName:'Client Démo',adminPin:'4826'};
      status=201;
    } else if (url.pathname === '/api/billing/perpetual/revoke') {
      revokedCalls++; assert.equal(JSON.parse(body).reason,'refunded');
      data={ok:true};
    } else throw new Error('Unexpected manager call '+url.pathname);
  } else throw new Error('Unexpected host '+url.hostname);
  return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
};

const env={
  STRIPE_SECRET_KEY:'sk_test_mock', BILLING_API_SECRET:'really-long-test-token',
  MANAGER_API_URL:'https://manager.invalid', STRIPE_PRICE_PERPETUAL:PRICE,
  STRIPE_WEBHOOK_SECRET:'whsec_integration_tests',
  DB:{prepare(sql) {
    const command={
      values:[],
      bind(...values){this.values=values;return this},
      async first(){return orders.get(this.values[0]) ?? null},
      async run(){
        const [id,company,name,nip,plan,email]=this.values;
        if(sql.includes('INSERT INTO commandes')) {
          orders.set(id,{session_id:id,code_entreprise:company,nom_admin:name,
            nip_admin:nip,palier:plan,courriel:email,cree_le:'2026-10-12 00:00:00'});
        } else if(sql.includes('UPDATE commandes')) {
          const row=orders.get(this.values[0]);if(row)row.nip_admin=null;
        } else throw new Error('Unsupported D1 statement: '+sql);
        return {success:true};
      }
    };return command
  }}
};
const req=(path,method='GET',body=null,headers={})=>new Request('https://hailitelabs.com'+path,{
  method,...(body===null?{}:{body:JSON.stringify(body),headers:{'content-type':'application/json',...headers}}),
  ...(body===null&&Object.keys(headers).length?{headers}:{})
});
try {
  let reply=await worker.fetch(req('/api/licence-permanente','POST',{langue:'fr'}),env);
  assert.equal(reply.status,200);
  assert.equal(createMode,'payment');
  assert.ok((await reply.json()).url.startsWith('https://checkout.stripe.com'));

  currentPrice='price_FAKE';
  reply=await worker.fetch(req('/api/bienvenue?session_id='+SESSION),env);
  assert.equal(reply.status,409);
  assert.equal(provisionCalls,0,'Unverified Stripe price may NEVER activate');

  currentPrice=PRICE;
  reply=await worker.fetch(req('/api/bienvenue?session_id='+SESSION),env);
  assert.equal(reply.status,200);
  const account=await reply.json();
  assert.equal(account.codeEntreprise,'comp-1234');
  assert.equal(account.nip,'4826');
  assert.equal(account.palier,'perpetual');
  assert.equal(provisionCalls,1);

  refunded=true;
  const event={type:'charge.refunded',data:{object:{refunded:true,amount:24900,amount_refunded:24900,payment_intent:intent}}};
  const payload=JSON.stringify(event);
  const t=Math.floor(Date.now()/1000);
  const sig=createHmac('sha256',env.STRIPE_WEBHOOK_SECRET).update(t+'.'+payload).digest('hex');
  reply=await worker.fetch(new Request('https://hailitelabs.com/api/stripe/webhook',{
    method:'POST',headers:{'stripe-signature':`t=${t},v1=${sig}`},body:payload
  }),env);
  assert.equal(reply.status,200);
  assert.equal(revokedCalls,1);
  orders.clear();
  reply=await worker.fetch(req('/api/bienvenue?session_id='+SESSION),env);
  assert.equal(reply.status,409,'Refunded transaction may NEVER be reactivated');
  assert.equal(provisionCalls,1);
  console.log('Stripe checkout → confirmed account → refund revocation → replay denied.');
} finally {globalThis.fetch=originalFetch}
