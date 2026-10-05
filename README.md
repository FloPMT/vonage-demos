# Vonage demos

Demos of the Vonage Voice API in TypeScript. Each demo is a folder in `demos/`. What they all need (settings, the Vonage clients and a webhook server) lives in `shared/`.

- [Appointment reminders](#appointment-reminders): a page that calls a patient in Spanish, French or English, or asks them to pick one, to confirm or cancel an appointment.
- [Phone](#phone): a phone in your browser that places calls and takes them, the reminder's included, with a dialpad that sends key presses during a call.

## Requirements

- Node 24, which runs the `.ts` files directly. With nvm, `nvm use` reads the version from `.nvmrc`.
- A Vonage account at [dashboard.vonage.com](https://dashboard.vonage.com). A trial account works.
- [ngrok](https://ngrok.com), or any HTTPS tunnel, so Vonage can reach the webhooks on your machine.

## Setup

```bash
nvm use
npm install
cp .env.example .env
```

Then fill in `.env`:

1. **Tunnel.** Run `ngrok http 3000` in another terminal, and copy the `https://` forwarding URL it prints into `PUBLIC_BASE_URL`.
2. **Application.** In the dashboard, under Applications, click **Create a new application** and name it:
   - Click **Generate public and private key**. The private key downloads once: save it at the repo root as `private.key` (gitignored).
   - Under Privacy, leave **Artificial intelligence** off. It allows Vonage to use the application's data for AI training, and a clinic's calls are health data.
   - Turn on **Voice**. Set the Answer URL to `https://<your tunnel>/webhooks/answer` with HTTP GET, and the Event URL to `https://<your tunnel>/webhooks/event` with HTTP POST. The phone uses both. The reminders send their own call flow and event URL with each call.
   - Under **Show advanced features**, check that **Use signed webhooks** is on. It is the default for new applications.
   - Click **Generate new application**, and copy the application ID from its page into `VONAGE_APPLICATION_ID`. The demos only place calls, so you don't need to link a number to the application.
3. **Signature secret.** In API Settings, under Signed webhooks, copy the signature secret into `VONAGE_SIGNATURE_SECRET`. It belongs to the API key, so every application on the key shares it: copy it rather than generate a new one.
4. **Numbers.** `VOICE_TO_NUMBER` is the phone the reminders call and `VONAGE_VIRTUAL_NUMBER` the caller ID, both in E.164 without the `+`. On a trial account, you can only call the number you signed up with, and the caller ID stays `123456789`. On a paid account, the caller ID must be a Vonage number on your account with voice enabled, or Vonage rejects the call. Some numbers are SMS only: check the number's **Features** in the dashboard. To take the reminder in your browser instead, leave `VOICE_TO_NUMBER` empty: see [Answer in your browser](#answer-in-your-browser).

When the tunnel URL changes, update `PUBLIC_BASE_URL` and the application's two URLs.

## Appointment reminders

A page calls a patient and reads a reminder of their appointment in Spanish, French or English. Without a language on record, the call opens with a menu: the patient presses 1 for Spanish, 2 for French or 3 for English. The patient presses 1 or says confirm, or presses 2 or says cancel, and hears a reply in the same language. When the call ends without an answer, the reminder follows as a WhatsApp message, with a button to confirm and a button to cancel, and the patient's tap sets the appointment's status. The page shows each appointment's status, and every call event is logged. The call is not recorded: the patient's answer is all the clinic needs.

For the idea in a few lines, read [call_simple.ts](demos/appointment-reminders/call_simple.ts): one call to one patient, in the language on their record, who presses 1 to confirm or 2 to cancel. The answer comes back with the appointment's ID, as in the full demo. It leaves out the page, spoken answers, the second try, the language menu and the appointment's own day and time: it always says tomorrow at 10. To run it, set `VOICE_TO_NUMBER`, stop `npm run reminders`, which holds the tunnel's port, and pass the patient's record as JSON, in `es` or `fr`:

```bash
node --env-file=.env demos/appointment-reminders/call_simple.ts '{ "name": "Hugo", "language": "fr" }'
```

### Run

```bash
npm run reminders
```

Open http://localhost:3003, enter the patient's name, pick their language and click **Call**. Leave the name empty and the greeting goes without it. Pick **Ask the patient** and the call opens with the language menu. The appointment is tomorrow, at this time rounded down to the half hour. Your phone rings within seconds. Under the form, the page lists each appointment with its ID, the patient's name, their language and its status: Pending while the call is under way, then Confirmed, Cancelled or No answer. The terminal follows the call:

```text
Open http://localhost:3003
Appointment 3F9A1C: calling the patient in es-ES, call <call uuid>
Call started { ... }
Call ringing { ... }
Call answered { ... }
Appointment 3F9A1C: patient pressed 1, confirmed
Call completed { ... }
```

Each click places another call, with its own row in the table. Stop the server with Ctrl+C.

### Answer in your browser

With `VOICE_TO_NUMBER` empty, the reminder calls the [phone](#phone) in your browser instead. Both demos run a webhook server, so give the phone another port:

```bash
PORT=3002 npm run phone
```

Open http://localhost:3001 in your browser, allow the microphone and wait for **Ready**. Then run `npm run reminders` in another terminal, open http://localhost:3003 in another tab and click **Call**. When the phone rings and shows **Call from**, click **Answer**, listen to the reminder and press 1 or 2 on the dialpad, or say the word. Click the phone's page once after it loads: browsers play sound only on a page you have used, so otherwise it rings in silence.

The call goes to `{ type: "app", user: "browser" }` instead of a phone number, with the same call flow: the `input` action takes your key press or your voice as it would a patient's. While the reminders hold port 3000, the phone takes calls but cannot place them, since the tunnel no longer reaches its Answer URL.

### Follow up on WhatsApp

With `WHATSAPP_TO_NUMBER` set, a call that ends without a confirmation or a cancellation is followed by the reminder as a WhatsApp message: nobody picks up, the patient hangs up, or their answer is not understood twice. The patient taps a button, and the appointment is confirmed or cancelled as it would be on the call.

1. In the dashboard, open **Messages Sandbox** and add WhatsApp. From your phone, send the passphrase the page shows to the sandbox's WhatsApp number, or scan its QR code. The sandbox needs no WhatsApp account of your own.
2. Put that phone's number in `WHATSAPP_TO_NUMBER`, in E.164 without the `+`.
3. On the **Messages Sandbox** page, under its webhooks, set the Inbound URL to `https://<your tunnel>/webhooks/inbound` and the Status URL to `https://<your tunnel>/webhooks/status`, then save. The sandbox keeps these two URLs apart from the application's, and they change with your tunnel's URL too.
4. Click **Call**, let the call go unanswered, then tap a button on your phone.

The terminal shows the message after the call's last event, then what became of it, then the patient's answer:

```text
Call completed { ... }
Appointment 3F9A1C: WhatsApp message sent
Appointment 3F9A1C: WhatsApp message submitted
Appointment 3F9A1C: WhatsApp message delivered
Appointment 3F9A1C: WhatsApp message read
Appointment 3F9A1C: patient tapped a button on WhatsApp, confirmed
Appointment 3F9A1C: WhatsApp message sent
```

The appointment's status turns to **No answer, WhatsApp sent**, then to **Confirmed** or **Cancelled** with the tap. Your phone then gets the reply the patient would have heard on the call: the last line above, and its statuses follow. With `WHATSAPP_TO_NUMBER` empty, no message goes out and the status stays **No answer**.

The message goes to that one phone, whoever the call rang: the sandbox only messages phones that have joined it. WhatsApp delivers the reminder only within 24 hours of your last message to the sandbox, so send it a word first if a day has passed. Vonage's sandbox guide asks for an application with the Messages capability: if Vonage rejects the request, the terminal prints its answer, and turning Messages on for the application is the first thing to try.

### How it works

- **The patient.** The page posts the patient to `/call` as JSON, `{ "name": "Hugo García", "language": "es" }`, as your booking system would. The language, `es`, `fr` or `en`, sets the voice and the texts: `es-ES`, `fr-FR` or `en-GB`. Either field can be empty: without a name, the reminder opens with "Hola", "Bonjour" or "Hello". The reminder says the time the way people do: "a las 7 y media de la tarde", "à 19 heures 30", "at 7:30 in the evening". `Intl.DateTimeFormat` names the weekday and the part of the day in the patient's language, in Central European Time, the time zone of mainland Spain and France, wherever the server runs. Reminders go out the day before, so the patient hears "tomorrow" and the weekday rather than a date. The name stays out of the logs.
- **The appointments.** The demo keeps each appointment in memory, where your booking system would: its ID, the patient's name and language, the time and the status: pending, confirmed, cancelled, unanswered or messaged. The ID is six random characters, short enough for the page's table. The page holds `/appointments` open, a stream of server-sent events, and the server sends it the table after every change, so an answer shows up while the patient is still on the line. A restart forgets them, and a call in progress then ends with a goodbye in all three languages.
- **Authentication.** Every Voice request carries a JWT signed with your application's private key. Vonage checks it against the public key it holds, so the private key never leaves your machine.
- **The call flow.** The demo sends the call flow, an NCCO, with the call request, so Vonage needs no answer webhook to fetch it:
  1. `talk` reads the reminder in the patient's language. It has no `bargeIn`, which lets the patient answer before a prompt ends: a hello as the patient picks up, or background noise, would cut it short too, before the patient has heard the appointment. Vonage recommends against `bargeIn` on the first prompt for this reason. A key pressed during it is ignored.
  2. A second `talk` asks for the answer, with `bargeIn`: a patient who knows the keys presses one, or speaks, and the question ends. Noise can end it too, so the second try, below, plays the question to the end.
  3. `input` takes one key press or a spoken answer, whichever comes first. `speech` sets the recognition language and gives the expected words as hints. The keypad waits 10 seconds, as long as speech does, rather than its default 3, too short for a patient who first takes the phone from their ear.
- **The language menu.** Without a language, the call opens with a menu. Each language, in its own voice, says who is calling and why, then which key picks it: "Hola, le llamamos de su centro médico por su cita. Para español, pulse 1." Every prompt has `bargeIn`, so a key cuts the menu short and a Spanish speaker need not wait for the French and the English: once `bargeIn` is on, a key skips every `talk` up to the `input`. `bargeIn` ends a `talk` on whatever the `input` listens for, so the menu takes keys only. With speech, background noise, or a patient's "¿Sí?" or "Allô?" as they pick up, would cut the menu short too. Spoken choices were unreliable anyway: one `input` recognizes one language, and in a live test, Spanish recognition did not hear a spoken "English". Vonage posts the answer to `/webhooks/language?appointment=<id>`, and the demo replies with the reminder's NCCO in that language and stores the language with the appointment. The menu has said who is calling, so the reminder opens with a thank you instead: "Gracias, Hugo. Su cita es mañana, jueves, a las 7 y media de la tarde." The URL carries the appointment's ID rather than the patient's name, which does not belong in a URL: the demo keeps the name in memory, where your booking system would. Without a choice, there is no language to ask the question in, so the patient hears the appointment in all three and the call ends: "Le recordamos su cita de mañana, jueves, a las 7 y media de la tarde. Adiós."
- **The answer.** Vonage posts the key press, or what it heard with the most likely transcript first, to the input's event URL, `/webhooks/input?appointment=3F9A1C&attempt=1`. The ID in the query string ties the answer to the appointment, and with it to the patient's language. The body carries Vonage's own call ID, `uuid`, but Vonage leaves it out when the input times out, which is just when you need the appointment: to ask again, in the patient's language. The demo takes any form of the word, such as confirmo or annulez, sets the appointment to confirmed or cancelled, and logs how the patient answered but not what they said. The demo replies with a new NCCO, which replaces the rest of the call: a `talk` in the patient's language, then the call ends. Noise, silence or another key gets one more try first. The reply apologizes and gives the appointment again, "Perdone, no le hemos entendido. Su cita es mañana, jueves, a las 7 y media de la tarde.", then asks the question, this time without `bargeIn`, with an `input` whose URL says `attempt=2`. After a second miss, a goodbye asks the patient to call back, and the table shows No answer once the call ends.
- **Speech recognition** is billed on top of the call. The SDK types the legacy `language` and `context` settings the demo uses. To choose the recognition provider, and with it the price tier, Vonage takes `provider` and `providerOptions` instead.
- **Call events.** Vonage posts each change in the call's status to `/webhooks/event`: started, ringing, answered and completed, or why the call failed. The completed event carries the call's duration and price. The event URL carries the appointment's ID too, `/webhooks/event?appointment=3F9A1C`. Every call ends with a completed event, or a rejected one when Vonage turns the call down, so an appointment still pending then goes unanswered: nobody picked up, or the patient did not answer the question. Vonage can send events out of order, so an answer that arrives after the completed event still counts.
- **The WhatsApp message.** The WhatsApp side has its own file, [whatsapp_sandbox.ts](demos/appointment-reminders/whatsapp_sandbox.ts): the two messages and the two webhooks. Next to it, [whatsapp.ts](demos/appointment-reminders/whatsapp.ts) is the same code for your own WhatsApp number, where the reminder is a template. The demo does not run it (see [Before production](#before-production)). When an appointment goes unanswered, the demo sends the reminder to the Messages API: one `POST` with the application's JWT, as the Voice requests carry. It is an interactive message with two reply buttons, "Confirmar" and "Cancelar" in Spanish, and each button's ID carries the appointment's ID, `confirm-3F9A1C`. Without a language, when nobody picked one in the menu, the patient reads the reminder in all three, as they hear all three on the call. A button's title holds 20 characters, so those buttons say yes and no in all three instead. The appointment goes from pending to unanswered once, so a repeated event sends no second message. Vonage accepts the message with a 202 and its ID, and the status turns to messaged. If Vonage rejects it, the terminal prints its answer and the status stays unanswered.
- **The patient's tap.** Vonage posts the tap to the sandbox's inbound webhook, `/webhooks/inbound`, as a message of type `reply` with the button's ID: `confirm-3F9A1C` gives the answer and its appointment. The handler sets the appointment's status, which is where your booking system would confirm the appointment or free the slot, then sends the reply the patient would have heard on the call. The patient has just written, so the reply goes out as plain text: WhatsApp delivers any message within 24 hours of the patient's last one. A later tap on the other button changes the answer. Whatever else the patient writes arrives on the same webhook, and the demo leaves it alone. The body carries the patient's number and WhatsApp name, so the terminal shows only the appointment and the answer.
- **The message's status.** Vonage accepts a message before WhatsApp does, so the 202 does not say that it arrived. Each status goes to the sandbox's status webhook, `/webhooks/status`: submitted, delivered and read, or rejected or undeliverable with the reason. The demo sends the appointment's ID as the message's `client_ref`, and Vonage sends it back with every status, so each line in the terminal names its appointment. Both Messages webhooks are signed like the Voice ones and expect a 200. Vonage retries one that answers 429 or a 5xx: first after 5 seconds, then at doubling intervals of up to 15 minutes, for 24 hours.
- **No recording.** The input webhook already gives you the patient's answer. A recording of the call would be health data to store, secure and delete, and patients would first have to hear that they are being recorded. To record anyway, put a `record` action first in the NCCO.
- **Signed webhooks.** Vonage signs every webhook with your signature secret, as a JWT in the `Authorization` header. The server answers 401 to a request with a wrong signature, and 503 to one without a signature: after a rare internal error, Vonage can send a webhook unsigned, and a 503 has it retried, signed.
- **Region.** The Voice client uses `api-eu.vonage.com`, so Vonage handles the call in the EU (Dublin, with Frankfurt as the fallback). The SDK's default, `api.nexmo.com`, handles calls in Virginia.
- **Localhost only.** The page is served on `localhost:3003`, apart from the webhook port the tunnel exposes: whoever reaches it places calls on your account.

## Phone

A phone in your browser. You dial a number and click **Call**: the browser carries your voice, and Vonage connects the call to that phone. Calls to the page's user ring the page, like the [reminder](#answer-in-your-browser): click **Answer**, or **Hang up** to decline. During a call, the dialpad sends key presses, for example to answer a phone menu.

### Run

```bash
npm run phone
```

Open http://localhost:3001 and allow the microphone. Once the page shows **Ready**, dial a number with its country code and click **Call**. The `+` is optional: hold 0 on the dialpad to dial it, as on a mobile phone. On a trial account, dial the number you signed up with. The page shows the call's status, and the terminal follows the call:

```text
Open http://localhost:3001
Connecting to 34600000000
Call started { ... }
Call ringing { ... }
Call answered { ... }
Call completed { ... }
```

### How it works

- **The user.** The Client SDK in the page logs in as a user of your application. On start, the server creates the user `browser` through the Users API. Later runs reuse it: Vonage answers that the name exists.
- **The token.** The page fetches a JWT from `/token`. The server signs it with your application's private key, which never reaches the browser. `sub` names the user, and `acl` lists the API paths the SDK uses to place, answer and decline calls, key presses included. From 30 November 2026, Vonage rejects requests outside a token's `acl`, and tokens that live longer than 24 hours. This one lives an hour: reload the page after that.
- **Placing a call.** `serverCall({ to })` starts a call from the browser. Vonage requests your application's Answer URL, signed like every other webhook, with `to` in the query string. The demo answers with an NCCO whose `connect` action calls that number, with `VONAGE_VIRTUAL_NUMBER` as the caller ID.
- **Taking a call.** A call to the user, such as the reminders' `{ type: "app", user: "browser" }`, rings every page logged in as that user. The SDK emits `callInvite`, and the page calls `answer()` or `reject()`. The SDK plays no ringtone, so while the call rings in, the page plays its own with the Web Audio API, makes **Answer** pulse and puts "Incoming call" in the tab's title. If the caller hangs up first, nobody answers in time or another page takes the call, the SDK emits `callInviteCancel` instead. The page listens before it logs in, so a call that arrives as it logs in still rings.
- **Key presses.** During a call, `sendDTMF()` sends each key's tone. A phone hears it, and an NCCO `input` action, like the reminders', posts it to its event URL.
- **Call events.** Vonage posts each call's events to that call's event URL: your application's Event URL for the calls the page places, and the one in the request for calls placed through the Voice API, like the reminders'. The SDK reports the call's status to the page: ringing, answered, completed, and why the call ended.
- **Localhost only.** The page and its token are served on `localhost:3001`, apart from the webhook port the tunnel exposes: whoever holds a token can place calls from your account and take the user's calls.
- **Region.** The server creates the user through `api-eu.vonage.com`, and the page connects with `region: "EU"`. A user belongs to the region that created it, and the SDK only logs in as a user of the region it connects to.

## Troubleshooting

| You see | Do this |
|---|---|
| `Unknown file extension ".ts"` | The terminal runs an older Node. Run `nvm use` in it, or install Node 24: each new terminal starts on your default version. |
| `node: .env: not found` | Run `cp .env.example .env` at the repo root. |
| `Set <NAME> in .env` | Fill in that setting. |
| `ENOENT: no such file or directory, open './private.key'` | Save the application's private key at the repo root as `private.key`. |
| `EADDRINUSE` | An earlier run still holds the port. Stop it, or set another `PORT` and point the tunnel at it. To run the phone beside the reminders, start it with `PORT=3002 npm run phone`. |
| `Could not place the call: HTTP 401` or `Could not create the user: HTTP 401` | The private key does not belong to `VONAGE_APPLICATION_ID`. Check the ID, or generate a new key pair for the application. |
| `Could not place the call` with another status, or a `Call failed` or `Call rejected` event | Vonage's reply, or the event, says why. On a trial account, you can only call the number you signed up with, from `123456789`. On a paid account, `VONAGE_VIRTUAL_NUMBER` must be one of your numbers, with voice enabled. |
| `Rejected /webhooks/...: no signature` | Turn on **Use signed webhooks** for the application, under **Show advanced features** in its Voice settings. |
| `Rejected /webhooks/...: wrong signature` | `VONAGE_SIGNATURE_SECRET` is not your signature secret. Copy it again from API Settings, under Signed webhooks. |
| The reminder plays, then the call ends without a reply, and no events show | Vonage cannot reach your webhooks. Check that ngrok is running and that `PUBLIC_BASE_URL` matches its URL. ngrok's inspector at http://127.0.0.1:4040 shows every request. |
| With `VOICE_TO_NUMBER` empty, the page does not ring | Vonage rings only pages that are logged in. Start the phone with `PORT=3002 npm run phone`, and wait for **Ready** before you click **Call**. The call's events say how it ended. |
| `could not send the WhatsApp message: HTTP ...` | Vonage's answer says why. Check that your phone has joined the Messages Sandbox and that `WHATSAPP_TO_NUMBER` is its number, in E.164 without the `+`. If the request itself is refused, turn on the Messages capability for the application. |
| The terminal shows `WhatsApp message sent`, and nothing reaches your phone | Vonage accepted the message and WhatsApp did not deliver it. The line that follows, `WhatsApp message rejected` or `undeliverable`, gives the reason. Most often a day has passed: send the sandbox's number a message from your phone, then try again, since WhatsApp delivers the reminder only within 24 hours of your last message. |
| You tap a button, and the appointment's status does not change. Or no `WhatsApp message delivered` line follows the message | Vonage cannot reach the sandbox's webhooks. On the Messages Sandbox page, check that the Inbound URL is `https://<your tunnel>/webhooks/inbound` and the Status URL `https://<your tunnel>/webhooks/status`, with your tunnel's current URL. `Unknown appointment` means the server restarted after the message went out: the demo keeps appointments in memory. |
| The phone's call ends at once, and the terminal shows no `Connecting to` | Vonage cannot reach your Answer URL. Check that ngrok is running, and that the application's Answer URL is `https://<your tunnel>/webhooks/answer` with HTTP GET. While the reminders hold port 3000, the phone only takes calls. |
| `Could not connect` with a permission error | Allow the microphone for http://localhost:3001 in your browser's site settings, and reload the page. |

## Before production

The demos show the API with as little code as possible. Before they call real patients:

- **Verify webhooks fully.** Compare the JWT's `payload_hash` with a SHA-256 hash of the raw body, reject an old `iat`, and match `api_key` and `application_id` to your own.
- **Make handlers idempotent.** Reply first, then do the work. Vonage retries a webhook after a timeout or a 429, 502, 503 or 504, so the same event can arrive twice.
- **Place reminders from your booking system.** The page's `/call` has no login and trusts what it receives. Place the calls from your backend instead, with each patient's number and language from your records.
- **Keep appointments in your booking system.** The demo keeps them in memory, so a restart loses them. Put your own appointment IDs in the webhook URLs.
- **Control a live call through the same region.** Transfer, hang up or modify a call through the endpoint that created it, here `api-eu.vonage.com`. Another region answers 404.
- **Keep secrets in a secret manager**, not in `.env` files. Never log a Vonage SDK error object, which carries the Authorization header, and never run with `DEBUG=vonage:*` or `DEBUG=*`, which make the SDK log the private key.
- **Treat call data as health data**, special-category data under GDPR Art. 9. Keep it in the EU, encrypt it and set a retention period. Speech recognition processes the patient's answer too: confirm with Vonage where it runs. Record calls only with a legal basis, and tell patients first.
- **Call from a local number.** Patients are more likely to answer a Spanish or French number than `123456789`. Numbers in both countries are ordered on request, with documents: Vonage gives 1 to 3 business days for Spain and 5 for France.
- **Send the WhatsApp reminder as a template.** WhatsApp delivers a free-form message, such as the sandbox's, only within 24 hours of the patient's last message. A reminder comes first, so it goes out as a template Meta has approved, from the clinic's own WhatsApp number, to a patient who has agreed to WhatsApp messages. [whatsapp.ts](demos/appointment-reminders/whatsapp.ts) is the sandbox's file rewritten for that. The demo does not run it, since the sandbox has no templates: read it next to [whatsapp_sandbox.ts](demos/appointment-reminders/whatsapp_sandbox.ts) to see what changes.
  - **The sender and the host.** Connect your WhatsApp Business Account to Vonage in the dashboard, link its number to the application, and put the number in `WHATSAPP_FROM_NUMBER`. The request goes to `https://api-eu.vonage.com/v1/messages`, the EU endpoint the calls use. Where WhatsApp itself stores messages is a separate setting, local data storage, which Vonage turns on by request.
  - **The reminder.** In WhatsApp Manager, create a template named `appointment_reminder` in the Utility category, once in each language. Its body has three gaps, `Hola {{1}}, le recordamos su cita de mañana, {{2}}, {{3}}. ¿Podrá asistir?`, and two quick reply buttons follow it. The request names the template and the language, fills the gaps with the patient's name, the weekday and the time, and gives each button a payload, `confirm-3F9A1C`.
  - **The tap.** A template's quick reply arrives as a message of type `button`, with that payload in `button.payload`, where the sandbox's button arrives as a `reply` with its ID. The tap opens WhatsApp's 24 hours, so the reply to it stays a plain text.
  - **The webhooks.** They are the application's own, no longer the sandbox's: turn on the application's Messages capability, with `/webhooks/inbound` as its Inbound URL and `/webhooks/status` as its Status URL, in webhook version v1, the format the code reads.

  To switch, import from `./whatsapp.ts` in [call.ts](demos/appointment-reminders/call.ts) and give `sendReminder` the patient's language, name, weekday and time, in place of the text and the button titles. The demo lets a patient go without a name or a language, and a template's words are fixed, so each needs a decision: a default language or a template that holds all three, and a template without the name's gap.
- **Reach more patients.** Leave a message on voicemail with `advanced_machine_detection`, ask again once when no answer comes, retry unanswered calls, and fall back to SMS.
- **Issue tokens to signed-in staff only.** Create a Vonage user for each member of staff, hand out their token only after your own login, and renew it with `refreshSession()` before it expires. From 30 November 2026, a token lives at most 24 hours.
- **Limit where the phone calls.** The Answer URL connects whatever number the page sends. Allow only the destinations you serve, for example Spanish and French numbers, so a leaked token cannot place premium or international calls on your account.
- **Route calls to your numbers.** The Answer URL treats every call as one the page placed. Before you link a Vonage number to the application, answer calls without `from_user` with a `connect` to the user, so they ring the page instead of dialling your own number back.

## Adding a demo

Create `demos/<name>/index.ts`, and add a script for it to the root `package.json`:

```json
"<name>": "node --env-file=.env demos/<name>/index.ts"
```

A demo with a page serves it on `localhost`, apart from the webhook port, like the phone. To give the page the demos' Vonage look, mount the stylesheet with `page.use("/style", style)` and link it from the page with `<link rel="stylesheet" href="/style/vonage.css" />`. It styles `main`, `h1` and the `vg-` classes: `vg-btn`, `vg-field`, `vg-dial`, `vg-keypad`, `vg-actions`, `vg-table` and `vg-status`. The same mount serves the logo: put `<img class="vg-logo" src="/style/vonage-logo.svg" alt="Vonage" />` above the `h1`, in a `<header>`. It also serves Vonage's favicon: link it with `<link rel="icon" href="/style/favicon.ico" />`. The stylesheet sets Vonage's typeface, Spezia, whose files are licensed and not in this repository: with them in `shared/style/fonts/`, the pages use it, and without them, Arial.

`@vonage-demos/shared` gives each demo:

| Export | What it is |
|---|---|
| `env(name)` | A required setting from `.env` |
| `auth` | Your application's credentials. `auth.createBearerHeader()` signs a request no client covers |
| `voice` | The Voice client on the EU endpoint, authenticated with your application's JWT |
| `users` | The Users client on the same endpoint, for the users the Client SDK logs in as |
| `startServer()` | Starts the server on `PORT` and returns the `/webhooks` router, behind signature verification |
| `webhookUrl(path)` | The public URL of a webhook, through your tunnel |
| `logCallEvent` | A handler that logs each call event |
| `describeVonageError(error)` | Vonage's reply to a failed request, without the Authorization header the SDK's error carries |
| `style` | Serves `vonage.css`, the pages' stylesheet, with its Spezia fonts, the Vonage logo and the favicon |

## Scripts

| Command | Does |
|---|---|
| `npm run reminders` | Runs the appointment reminders and their page |
| `npm run phone` | Runs the browser phone |
| `npm run typecheck` | Type-checks `shared/` and `demos/` (TypeScript 7) |
| `npm run check` | Lint and format check (Biome) |
| `npm run format` | Applies Biome's fixes and formatting |

## Resources

- **The NCCO.** Both demos control their calls with an NCCO, the list of actions a call follows. [What is an NCCO (Call Control Object) in Vonage?](https://www.youtube.com/watch?v=8xxw0rSuYwQ), a video from Vonage's developer channel, introduces it, and the [NCCO reference](https://developer.vonage.com/en/voice/voice-api/ncco-reference) lists each action with its options.
- **Vonage's MCP servers.** They connect a coding assistant, such as Claude, Cursor or VS Code, to Vonage: see the [introduction](https://developer.vonage.com/en/mcp-server/conceptual-guides/introduction-to-vonage-mcp). There are two:
  - **The documentation server** lets the assistant search Vonage's developer documentation and API reference, so it works from the current docs. It is hosted at `https://documentation-mcp.vonage.dev/mcp` and needs no credentials: see [how to install it](https://developer.vonage.com/en/mcp-server/how-to-guides/install-documentation-mcp-server).
  - **The tooling server** acts on your account: it sends SMS, WhatsApp and RCS messages, places calls, manages applications and numbers, and reads your balance. It runs on your machine, with `npx -y @vonage/vonage-mcp-server-api-bindings`, and takes your API key and secret and an application's ID and private key: see [how to install it](https://developer.vonage.com/en/mcp-server/how-to-guides/install-tooling-mcp-server). What the assistant does through it costs credit and reaches real phones, so give it credentials of its own, such as a subaccount's key and a separate application, and review each action before it runs.
