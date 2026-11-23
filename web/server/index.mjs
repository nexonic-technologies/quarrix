import { openStore } from "./store.mjs";
import { createApp } from "./app.mjs";
import { mailer } from "./email.mjs";
const production = process.env.NODE_ENV === "production",
  origin = process.env.PUBLIC_ORIGIN || "http://127.0.0.1:4322";
if (production && (!process.env.DATABASE_URL || !/^https:\/\//.test(origin)))
  throw Error("Production requires DATABASE_URL and HTTPS PUBLIC_ORIGIN");
const sendMail = mailer(origin);
if (production && process.env.ALLOW_REGISTRATION === "true" && !sendMail)
  throw Error("Registration requires SMTP_URL and MAIL_FROM");
const store = await openStore();
const app = createApp(store, { production, origin, sendMail });
const server = app.listen(
  Number(process.env.PORT || 4322),
  production ? "0.0.0.0" : "127.0.0.1",
  () => console.log("Quarrix Web started"),
);
process.on("SIGTERM", () =>
  server.close(async () => {
    await store.close();
    process.exit(0);
  }),
);
