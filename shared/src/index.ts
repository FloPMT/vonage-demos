import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Auth } from "@vonage/auth";
import { verifySignature } from "@vonage/jwt";
import { Users } from "@vonage/users";
import { Voice } from "@vonage/voice";
import express, { type RequestHandler } from "express";

/** A required setting from the root `.env`. */
export function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name} in .env`);
  return value;
}

// Requests carry a JWT signed with the application's private key. A call is handled in the region
// of the endpoint that creates it: the EU endpoint keeps the call and its data in the EU, where
// api.nexmo.com would handle them in the US.
export const auth = new Auth({
  applicationId: env("VONAGE_APPLICATION_ID"),
  privateKey: readFileSync(env("VONAGE_PRIVATE_KEY")),
});
const apiHost = "https://api-eu.vonage.com";

export const voice = new Voice(auth, { apiHost });

// The Client SDK can only log in as a user from the region it connects to.
export const users = new Users(auth, { apiHost });

/**
 * Starts the server on PORT (3000 by default) and returns the router for `/webhooks`.
 * Vonage signs every webhook with your signature secret, as an HS256 JWT in the Authorization
 * header, so the router only lets through requests that carry a valid one.
 */
export async function startServer() {
  const secret = env("VONAGE_SIGNATURE_SECRET");
  const webhooks = express.Router();
  const app = express();
  app.use(
    "/webhooks",
    (req, res, next) => {
      const token = req.get("authorization")?.replace("Bearer ", "");
      if (token && verifySignature(token, secret)) return next();
      // After a rare internal error, Vonage can send a webhook unsigned: a 503 has it retried,
      // signed. A wrong signature would fail again on every retry.
      res.sendStatus(token ? 401 : 503);
      console.warn(`Rejected ${req.baseUrl}${req.path}: ${token ? "wrong" : "no"} signature`);
    },
    express.json(),
    webhooks,
  );
  const port = Number(process.env.PORT || 3000);
  await new Promise<void>((resolve, reject) => {
    app.listen(port, (error) => (error ? reject(error) : resolve()));
  });
  return webhooks;
}

/** Serves the demo pages' stylesheet, `vonage.css`, with its fonts, the logo and the favicon. */
export const style = express.static(join(import.meta.dirname, "../style"));

/** The public URL of a webhook, through your tunnel. */
export function webhookUrl(path: string) {
  return new URL(`/webhooks${path}`, env("PUBLIC_BASE_URL")).href;
}

/** Logs each call event: started, ringing, answered, completed, or why the call failed. */
export const logCallEvent: RequestHandler = (req, res) => {
  res.sendStatus(204);
  console.log(`Call ${req.body.status}`, req.body);
};

// The SDK's errors carry the request, Authorization header included. Print Vonage's answer only.
export async function describeVonageError(error: unknown) {
  const response = (error as { response?: unknown }).response;
  if (response instanceof Response) return `HTTP ${response.status}: ${await response.text()}`;
  return error instanceof Error ? error.message : String(error);
}
