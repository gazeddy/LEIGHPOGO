// Preserve older printed event QR codes from dev.leighpogo.co.uk.
// Never serve the retired V4 test database again after promotion.
const http = require('node:http');
const port = Number(process.env.DEV_REDIRECT_PORT || 3001);
const target = 'https://leighpogo.co.uk';
http.createServer((req, res) => {
  const path = req.url && req.url.startsWith('/') ? req.url : '/';
  res.writeHead(308, {
    Location: `${target}${path}`,
    'Cache-Control': 'no-store',
    'Content-Type': 'text/plain; charset=utf-8',
  });
  res.end('LeighPogo has moved to leighpogo.co.uk.');
}).listen(port, '0.0.0.0', () => console.log(`Redirecting dev on ${port} to ${target}`));
