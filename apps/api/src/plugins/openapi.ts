import fp from "fastify-plugin";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { jsonSchemaTransform } from "fastify-type-provider-zod";

/**
 * OpenAPI generation from the zod route schemas + a Scalar/Swagger UI at `/docs`.
 * The spec is derived from the same schemas that validate requests, so docs and
 * validation can't drift. `/openapi.json` serves the raw document.
 */
export const openapiPlugin = fp(
  async function openapi(app) {
    await app.register(swagger, {
      openapi: {
        info: {
          title: "Cura API",
          description: "Ambient AI scribe gateway — sessions, notes, templates.",
          version: "0.1.0",
        },
        components: {
          securitySchemes: {
            sessionCookie: { type: "apiKey", in: "cookie", name: app.platform.settings.sessionCookieName },
            bearer: { type: "http", scheme: "bearer" },
          },
        },
      },
      transform: jsonSchemaTransform,
    });

    // The Swagger UI serves bundled static assets via `__dirname`, which breaks
    // when the server is esbuild-bundled into a single file for production. The
    // machine-readable spec (`/openapi.json`) is always available; the human UI
    // at `/docs` is a dev/staging convenience only.
    if (process.env.NODE_ENV !== "production") {
      await app.register(swaggerUi, { routePrefix: "/docs" });
    }

    app.get("/openapi.json", { schema: { hide: true }, config: { public: true } }, async () =>
      app.swagger(),
    );
  },
  { name: "openapi" },
);
