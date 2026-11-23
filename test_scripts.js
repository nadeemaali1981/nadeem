const https = require('https');

https.get('https://nadeem-lac.vercel.app', (res) => {
  let body = '';
  res.on('data', d => body += d);
  res.on('end', async () => {
    const scriptRegex = /src="(\/_next\/static\/[^"]+)"/g;
    let match;
    const scripts = [];
    while ((match = scriptRegex.exec(body)) !== null) {
      scripts.push(match[1]);
    }
    console.log('Found scripts:', scripts.length);

    for (const s of scripts) {
      await new Promise(resolve => {
        https.get('https://nadeem-lac.vercel.app' + s, (scriptRes) => {
          console.log(s, 'Status:', scriptRes.statusCode);
          scriptRes.resume();
          scriptRes.on('end', resolve);
        }).on('error', (e) => {
          console.error(s, 'Error:', e.message);
          resolve();
        });
      });
    }
  });
});
