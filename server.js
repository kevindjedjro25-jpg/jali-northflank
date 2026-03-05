const http = require('http');

const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  
  if (req.url === '/api/health') {
    res.writeHead(200);
    res.end(JSON.stringify({
      status: 'online',
      message: '✨ JALI plateforme est active et prête!'
    }));
  } else if (req.url === '/api/test') {
    res.writeHead(200);
    res.end(JSON.stringify({ message: 'JALI API working!' }));
  } else if (req.url === '/api/videos') {
    res.writeHead(200);
    res.end(JSON.stringify([
      { id: 1, title: 'Video 1', views: 100 },
      { id: 2, title: 'Video 2', views: 250 }
    ]));
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
