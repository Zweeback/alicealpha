import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeTraces } from '../llmops/audit.mjs';

test('aggregates sanitized token usage, latency, error rate and explicitly configured EUR prices', () => {
  const input = [
    JSON.stringify({provider:'openai',model:'demo',input_tokens:1000,output_tokens:200,latency_ms:100,ok:true,prompt:'PRIVATE'}),
    JSON.stringify({provider:'openai',model:'demo',input_tokens:500,output_tokens:100,latency_ms:200,ok:false,api_key:'SECRET'})
  ].join('\n');
  const report = analyzeTraces(input, { 'openai/demo': {input_per_million_eur: 1, output_per_million_eur: 2} });
  assert.equal(report.requests, 2);
  assert.equal(report.failures, 1);
  assert.equal(report.error_rate, 0.5);
  assert.equal(report.input_tokens, 1500);
  assert.equal(report.output_tokens, 300);
  assert.equal(report.latency_p95_ms, 200);
  assert.equal(report.known_cost_eur, 0.0021);
  assert.equal(report.unpriced_requests, 0);
  assert.equal(JSON.stringify(report).includes('PRIVATE'), false);
  assert.equal(JSON.stringify(report).includes('SECRET'), false);
});

test('reports missing prices as unknown, not free', () => {
  const report = analyzeTraces(JSON.stringify({provider:'gemini',model:'trial',input_tokens:100,output_tokens:10,latency_ms:20,ok:true}));
  assert.equal(report.known_cost_eur, null);
  assert.equal(report.unpriced_requests, 1);
});

test('rejects untrusted free-form model names and negative counts', () => {
  assert.throws(() => analyzeTraces(JSON.stringify({provider:'openai',model:'private email@example.com',input_tokens:2,output_tokens:1,latency_ms:4,ok:true})), /line 1/);
  assert.throws(() => analyzeTraces(JSON.stringify({provider:'openai',model:'demo',input_tokens:-1,output_tokens:0,latency_ms:1,ok:true})), /line 1/);
});

test('reports malformed JSONL without echoing private payload', () => {
  assert.throws(() => analyzeTraces('secret: {password:abcd}'), err => /line 1/.test(err.message) && !err.message.includes('abcd'));
});

test('rejects missing required provider and model fields', () => {
  assert.throws(() => analyzeTraces(JSON.stringify({model:'demo',input_tokens:1,output_tokens:1,latency_ms:1,ok:true})), /line 1/);
  assert.throws(() => analyzeTraces(JSON.stringify({provider:'demo',input_tokens:1,output_tokens:1,latency_ms:1,ok:true})), /line 1/);
});
