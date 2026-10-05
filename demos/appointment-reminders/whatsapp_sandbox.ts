// The reminder on WhatsApp, for the patient who did not answer the call: a message with a button
// to confirm and a button to cancel, the patient's tap, and what becomes of each message. This is
// the file the demo runs. It goes through Vonage's Messages Sandbox, which needs no WhatsApp
// account of your own: add your phone to it and point its two webhooks at your tunnel (see the
// README). From your own WhatsApp number, the reminder goes out as a template: see whatsapp.ts.
import { auth, describeVonageError } from "@vonage-demos/shared";
import type { Router } from "express";

// A message to the patient, as one request to the Messages API: to the sandbox's host, from its
// WhatsApp number. Your booking system would message the number it called. The demo messages
// WHATSAPP_TO_NUMBER, the phone you added to the sandbox, and sends nothing while it is empty.
// Resolves to whether Vonage accepted the message.
async function send(appointment: string, message: object) {
  const to = process.env.WHATSAPP_TO_NUMBER;
  if (!to) return false;
  try {
    const response = await fetch("https://messages-sandbox.nexmo.com/v1/messages", {
      method: "POST",
      headers: {
        Authorization: await auth.createBearerHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel: "whatsapp",
        from: "14157386102",
        to,
        // Vonage sends this back with each status of the message, so the status names its
        // appointment.
        client_ref: appointment,
        ...message,
      }),
    });
    // Vonage accepts the message with a 202, or says what is wrong with the request.
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    console.log(`Appointment ${appointment}: WhatsApp message sent`);
    return true;
  } catch (error) {
    const reason = await describeVonageError(error);
    console.error(`Appointment ${appointment}: could not send the WhatsApp message: ${reason}`);
    return false;
  }
}

/**
 * Sends the reminder, with a button to confirm and a button to cancel. WhatsApp delivers a message
 * like this one only within 24 hours of the patient's last message: here, the one that added your
 * phone to the sandbox. A real reminder comes first, so it goes out as an approved template (see
 * whatsapp.ts).
 */
export function sendReminder(appointment: string, text: string, confirm: string, cancel: string) {
  return send(appointment, {
    message_type: "custom",
    custom: {
      type: "interactive",
      interactive: {
        type: "button",
        body: { text },
        action: {
          // Vonage sends the ID of the button the patient taps to the inbound webhook, so the
          // answer names its appointment. A button's title holds 20 characters.
          buttons: [
            { type: "reply", reply: { id: `confirm-${appointment}`, title: confirm } },
            { type: "reply", reply: { id: `cancel-${appointment}`, title: cancel } },
          ],
        },
      },
    },
  });
}

/** Sends the reply to a tap. The patient has just written, so WhatsApp delivers a plain text. */
export function sendReply(appointment: string, text: string) {
  return send(appointment, { message_type: "text", text });
}

/**
 * Mounts the sandbox's two webhooks, and calls `answered` with each tap: the appointment's ID and
 * the patient's answer.
 */
export function takeAnswers(
  webhooks: Router,
  answered: (appointment: string, answer: "confirmed" | "cancelled") => void,
) {
  // The patient tapped a button. Vonage posts the tap to the inbound webhook as a reply with the
  // button's ID: the answer, and the appointment it is for. Whatever else the patient writes
  // arrives here too, and the demo leaves it alone. The body carries the patient's number and
  // WhatsApp name, so it stays out of the logs.
  webhooks.post("/inbound", (req, res) => {
    res.sendStatus(200);
    const [word, appointment = ""] = String(req.body.reply?.id).split("-");
    if (word === "confirm") answered(appointment, "confirmed");
    if (word === "cancel") answered(appointment, "cancelled");
  });

  // Each status of a message: submitted, delivered and read, or rejected or undeliverable, with
  // the reason. Vonage accepts a message before WhatsApp does, so this is where you learn that
  // one did not arrive. The body carries the patient's number, so it stays out of the logs.
  webhooks.post("/status", (req, res) => {
    res.sendStatus(200);
    const { client_ref = "unknown", status, error } = req.body;
    const reason = error ? `: ${error.title}, ${error.detail}` : "";
    console.log(`Appointment ${client_ref}: WhatsApp message ${status}${reason}`);
  });
}
