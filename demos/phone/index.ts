import { readFileSync } from "node:fs";
import { tokenGenerate } from "@vonage/jwt";
import {
  describeVonageError,
  env,
  logCallEvent,
  startServer,
  style,
  users,
} from "@vonage-demos/shared";
import express from "express";

const applicationId = env("VONAGE_APPLICATION_ID");
const privateKey = readFileSync(env("VONAGE_PRIVATE_KEY"));

// The user the page logs in as. The reminders call it when VOICE_TO_NUMBER is empty.
const user = "browser";
try {
  await users.createUser({ name: user });
} catch (error) {
  const reason = await describeVonageError(error);
  // A duplicate name means an earlier run created the user.
  if (!reason.includes("duplicate-name")) {
    console.error(`Could not create the user: ${reason}`);
    process.exit(1);
  }
}

const webhooks = await startServer();

// When the page calls serverCall(), Vonage asks your application's Answer URL for the call flow,
// with the page's `to` in the query.
webhooks.get("/answer", (req, res) => {
  const to = String(req.query.to).replace(/\D/g, "");
  res.json([
    {
      action: "connect",
      from: env("VONAGE_VIRTUAL_NUMBER"),
      endpoint: [{ type: "phone", number: to }],
    },
  ]);
  console.log(`Connecting to ${to}`);
});

webhooks.post("/event", logCallEvent);

// The page and its token stay on localhost, off the tunnel: whoever holds a token can place calls
// from your account and take the user's calls.
const page = express();
page.get("/", (_req, res) => res.sendFile("index.html", { root: import.meta.dirname }));
page.use("/style", style);
page.get("/sdk.js", (_req, res) =>
  res.sendFile("vonageClientSDK.min.mjs", { root: "node_modules/@vonage/client-sdk/dist" }),
);
page.get("/token", (_req, res) => {
  const token = tokenGenerate(applicationId, privateKey, {
    sub: user,
    ttl: 3600,
    // Every API path the SDK uses to place, answer and decline calls, DTMF included. From
    // 30 November 2026, Vonage rejects requests outside the token's ACL.
    acl: {
      paths: {
        "/*/sessions/**": {},
        "/*/knocking/**": {},
        "/*/legs/**": {},
        "/*/conversations/**": {},
        "/*/rtc/**": {},
        "/*/v2/rtc/**": {},
      },
    },
  });
  res.json({ token });
});
page.listen(3001, "localhost", (error) => {
  if (error) throw error;
  console.log("Open http://localhost:3001");
});
