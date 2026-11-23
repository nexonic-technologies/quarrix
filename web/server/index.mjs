import { openStore } from "./store.mjs";
import { createApp } from "./app.mjs";
import { mailer } from "./email.mjs";
import express from "express";
const production = process.env.NODE_ENV === "production",
  origin = process.env.PUBLIC_ORIGIN || "http://127.0.0.1:4322";
if (production && !/^https:\/\//.test(origin))
  throw Error("Production requires HTTPS PUBLIC_ORIGIN");
const awaitingSetup =
  production && (!process.env.DATABASE_URL || !process.env.DATA_KEY);
if (awaitingSetup && process.env.ALLOW_REGISTRATION !== "false")
  throw Error("Production requires DATABASE_URL and DATA_KEY");
const sendMail = mailer(origin);
if (production && process.env.ALLOW_REGISTRATION === "true" && !sendMail)
  throw Error("Registration requires SMTP_URL and MAIL_FROM");
const store = awaitingSetup ? null : await openStore();
const app = awaitingSetup
  ? express()
  : createApp(store, { production, origin, sendMail });
if (awaitingSetup) {
  app.disable("x-powered-by");
  app.use((req, res) => {
    res.set({
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    });
    if (req.path.startsWith("/api/"))
      return res.status(503).json({ error: "Portal setup in progress" });
    res
      .status(200)
      .type("html")
      .send(
        "<!doctype html><html lang='en'><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>Quarrix — setup in progress</title><h1>Quarrix</h1><p>Portal setup in progress. Please check back shortly.</p></html>",
      );
  });
}
const server = app.listen(
  Number(process.env.PORT || 4322),
  production ? "0.0.0.0" : "127.0.0.1",
  () => console.log("Quarrix Web started"),
);
process.on("SIGTERM", () =>
  server.close(async () => {
    if (store) await store.close();
    process.exit(0);
  }),
);
