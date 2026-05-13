export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Proxiraj sve /app/* zahtjeve na Railway booking app
    if (path === '/app' || path.startsWith('/app/')) {
      const railwayUrl = env.RAILWAY_URL; // npr. https://menshairstyle.up.railway.app
      if (!railwayUrl) {
        return new Response('RAILWAY_URL nije postavljen u environment varijablama.', { status: 500 });
      }

      const targetUrl = railwayUrl + path + url.search;
      const proxyRequest = new Request(targetUrl, {
        method: request.method,
        headers: request.headers,
        body: ['GET', 'HEAD'].includes(request.method) ? null : request.body,
        redirect: 'manual',
      });

      try {
        const response = await fetch(proxyRequest);
        // Preslikaj redirect odgovore
        if (response.status >= 300 && response.status < 400) {
          const location = response.headers.get('location');
          if (location) {
            const redirectHeaders = new Headers(response.headers);
            return new Response(null, {
              status: response.status,
              headers: redirectHeaders,
            });
          }
        }
        return response;
      } catch (err) {
        return new Response('Greška pri spajanju na booking server: ' + err.message, { status: 502 });
      }
    }

    // Sve ostalo — statični assets (glavni site)
    return env.ASSETS.fetch(request);
  },
};
