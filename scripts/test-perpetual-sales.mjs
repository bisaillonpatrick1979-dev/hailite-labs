import assert from 'node:assert/strict';
import { validatePerpetualCheckout, perpetualActif, isFullyRefundedCharge } from '../src/abonnements.js';

const env = { STRIPE_PRICE_PERPETUAL: 'price_1234', STRIPE_SECRET_KEY:'sk_test_example',
              MANAGER_API_URL:'https://example.invalid', BILLING_API_SECRET:'secure_test' };
assert.equal(perpetualActif(env),true);
assert.equal(perpetualActif({...env,STRIPE_PRICE_PERPETUAL:''}),false);
const session = {
  id:'cs_test_ABCDEFGHIJKLMNOPQRSTUVWXYZ', mode:'payment',
  status:'complete', payment_status:'paid',
  metadata:{type:'perpetual'},
};
const items={data:[{price:{id:'price_1234'},quantity:1}],has_more:false};
assert.equal(validatePerpetualCheckout(session,items,'price_1234'),true);
for(const bad of [
 [{...session, payment_status:'unpaid'},items],
 [{...session,status:'open'},items],
 [{...session,mode:'subscription'},items],
 [{...session,metadata:{type:'credits_ia'}},items],
 [session,{data:[{price:{id:'price_other'},quantity:1}]}],
 [session,{data:[{price:{id:'price_1234'},quantity:2}]}],
 [session,{...items,has_more:true}],
 [session,{data:[...items.data,{price:{id:'price_other'},quantity:1}]}],
])assert.equal(validatePerpetualCheckout(bad[0],bad[1],'price_1234'),false);
console.log('Perpetual checkout must be paid, complete and match the configured Stripe price exactly.');

assert.equal(isFullyRefundedCharge({refunded:true,amount:24900,amount_refunded:24900}),true);
assert.equal(isFullyRefundedCharge({refunded:false,amount:24900,amount_refunded:200}),false);
assert.equal(isFullyRefundedCharge({refunded:true,amount:24900,amount_refunded:0}),false);
