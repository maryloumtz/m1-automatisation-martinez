import http from 'node:http';

const listenHost = '127.0.0.1';
const listenPort = 5680;
const webhookPath = '/webhook/tickets-webhook';
const maxBodySize = 1024 * 1024;

const server = http.createServer((request, response) => {
  if (request.method !== 'POST' || request.url !== webhookPath) {
    response.writeHead(404, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  let receivedBytes = 0;
  const chunks = [];

  request.on('data', (chunk) => {
    receivedBytes += chunk.length;

    if (receivedBytes > maxBodySize) {
      request.destroy();
    } else {
      chunks.push(chunk);
    }
  });

  request.on('end', () => {
    if (receivedBytes > maxBodySize) {
      response.writeHead(413, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'Payload too large' }));
      return;
    }

    const body = Buffer.concat(chunks);
    const upstreamRequest = http.request(
      {
        hostname: '127.0.0.1',
        port: 5678,
        path: webhookPath,
        method: 'POST',
        headers: {
          'content-type': request.headers['content-type'] ?? 'application/json',
          'content-length': body.length,
        },
      },
      (upstreamResponse) => {
        response.writeHead(upstreamResponse.statusCode ?? 502, {
          'content-type': upstreamResponse.headers['content-type'] ?? 'application/json',
        });
        upstreamResponse.pipe(response);
      },
    );

    upstreamRequest.on('error', () => {
      response.writeHead(502, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'Webhook upstream unavailable' }));
    });

    upstreamRequest.end(body);
  });
});

server.listen(listenPort, listenHost, () => {
  process.stdout.write(`Webhook proxy listening on http://${listenHost}:${listenPort}${webhookPath}\n`);
});
