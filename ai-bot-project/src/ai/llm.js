import fetch from 'node-fetch';
export async function genWithLLM(prompt, maxTokens=220) {
  const res = await fetch('http://127.0.0.1:11434/api/generate', {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({ model: 'llama3.1:8b', prompt, options: { num_predict: maxTokens } })
  });
  const chunks = (await res.text()).trim().split('\n');
  let out = '';
  for (const line of chunks) { try { out += JSON.parse(line).response || ''; } catch {} }
  return out.trim();
}