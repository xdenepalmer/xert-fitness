import assert from 'node:assert/strict';
import test from 'node:test';
import * as checkout from '../api/checkout.js';
import { CASUAL_VISIT_ACTION } from '../src/lib/casualVisit.js';

const visitor = {action:CASUAL_VISIT_ACTION,first_name:'Casey',last_name:'Example',email:'casey@example.test',phone:'0400111222'};
function dependencies(settings, error=null) {
  const created = [];
  const admin = {from(table){
    assert.equal(table,'admin_settings');
    let columns;
    const query = {
      select(value){columns=value;return query;},limit(){return query;},
      async maybeSingle(){return {data:settings && Object.fromEntries(columns.split(',').map(key => key.trim()).map(key => [key,settings[key]])),error};},
    };
    return query;
  }};
  const createStripe = () => ({checkout:{sessions:{async create(parameters,options){
    created.push({parameters,options});
    return {url:'https://checkout.stripe.com/c/pay/cs_test_casual'};
  }}}});
  const json = (body,status=200) => ({body,status});
  return {admin,createStripe,json,created};
}

test('casual checkout charges the server discount only when enabled and valid, ignoring browser amounts', async () => {
  assert.equal(typeof checkout.handleCasualVisitCheckout,'function');
  for (const {discount,enabled,expected} of [
    {discount:1000,enabled:true,expected:1000},
    {discount:1000,enabled:false,expected:2000},
    {discount:2500,enabled:true,expected:2000},
    {discount:null,enabled:true,expected:2000},
  ]) {
    const deps=dependencies({casual_payments_enabled:true,casual_visit_price_cents:2000,casual_visit_discount_cents:discount,casual_visit_discount_enabled:enabled});
    const result=await checkout.handleCasualVisitCheckout({...deps,payload:{...visitor,priceCents:1,amount_cents:1},request:{url:'https://xert-fitness.vercel.app/api/checkout'}});
    assert.equal(result.status,200);
    assert.equal(result.body.amount_cents,expected);
    assert.equal(deps.created.length,1);
    const {parameters,options}=deps.created[0];
    assert.equal(parameters.line_items[0].price_data.unit_amount,expected);
    assert.equal(parameters.metadata.xert_amount_cents,String(expected));
    assert.equal(parameters.metadata.casual_visit_email,'casey@example.test');
    assert.equal(new URL(parameters.success_url).pathname,'/casual');
    assert.equal(new URL(parameters.success_url).search,'?paid=1');
    assert.equal(new URL(parameters.cancel_url).search,'?cancelled=1');
    assert.match(options.idempotencyKey,new RegExp(`^casual-casey@example\\.test-${expected}-\\d+$`));
  }
});

test('casual checkout stops on settings read failure or disabled payments before creating Stripe sessions', async () => {
  assert.equal(typeof checkout.handleCasualVisitCheckout,'function');
  for (const deps of [dependencies(null,{message:'Read failed'}),dependencies({casual_payments_enabled:false})]) {
    const result=await checkout.handleCasualVisitCheckout({...deps,payload:visitor,request:{url:'https://xert-fitness.vercel.app/api/checkout'}});
    assert.equal(result.status,503);
    assert.equal(deps.created.length,0);
  }
});

test('casual checkout keeps the existing default amount when settings are absent', async () => {
  assert.equal(typeof checkout.handleCasualVisitCheckout,'function');
  const deps=dependencies(null);
  const result=await checkout.handleCasualVisitCheckout({...deps,payload:visitor,request:{url:'https://xert-fitness.vercel.app/api/checkout'}});
  assert.equal(result.status,200);
  assert.equal(result.body.amount_cents,1560);
});
