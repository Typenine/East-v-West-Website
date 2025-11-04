#!/usr/bin/env node
import http from 'node:http'

function get(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { headers: { 'cache-control': 'no-store' } }, (res) => {
      let data = ''
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => resolve({ status: res.statusCode || 0, body: data }))
    })
    req.on('error', reject)
  })
}

const url = process.argv[2] || 'http://localhost:3000/api/health/storage'
get(url)
  .then((r) => {
    console.log(r.body)
    process.exit(r.status >= 200 && r.status < 300 ? 0 : 1)
  })
  .catch((e) => {
    console.error(String(e))
    process.exit(1)
  })
