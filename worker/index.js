// Worker de exoticjoyeria.lat: delante de los archivos estáticos (binding ASSETS).
//  * www.exoticjoyeria.lat -> https://exoticjoyeria.lat (301, conserva ruta y query)
//  * /categoria/:slug -> /coleccion/:slug (301; la app conserva la misma redirección como respaldo)
//  * /admin y /mayoristas/* (acceso, pedidos…): X-Robots-Tag noindex. Para que Google vea el noindex NO se bloquean en robots.txt.
// La landing pública /mayoristas sí se indexa.
const APEX = 'exoticjoyeria.lat';
const NOINDEX = /^\/(admin(\/|$)|mayoristas\/)/;
const LEGACY_CATEGORY = /^\/categoria\/([^/]+)\/?$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.hostname === `www.${APEX}`) {
      url.hostname = APEX;
      url.protocol = 'https:';
      return Response.redirect(url.toString(), 301);
    }

    const legacy = url.pathname.match(LEGACY_CATEGORY);
    if (legacy) {
      url.pathname = `/coleccion/${legacy[1]}`;
      return Response.redirect(url.toString(), 301);
    }

    const response = await env.ASSETS.fetch(request);
    if (NOINDEX.test(url.pathname)) {
      const res = new Response(response.body, response);
      res.headers.set('X-Robots-Tag', 'noindex, nofollow');
      return res;
    }
    return response;
  },
};
