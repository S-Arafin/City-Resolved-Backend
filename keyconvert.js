const fs = require('fs');
const key = fs.readFileSync('./city-resolved-firebase-adminsdk-fbsvc-1083de362d.json', 'utf8')
const base64 = Buffer.from(key).toString('base64')
console.log(base64)