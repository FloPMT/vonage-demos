// The reminder on WhatsApp as a patient gets it outside the sandbox: from the clinic's own
// WhatsApp number, as a template Meta has approved. The demo does not run this file. It runs
// whatsapp_sandbox.ts, which needs no WhatsApp account of your own, and where templates are not
// available. What differs between the two files is what changes on the way to production: the
// host, the sender, the reminder and the shape of the patient's tap (see "Before production" in
// the README).
import { auth, describeVonageError, env } from "@vonage-demos/shared";
import type { Router } from "express";

// The template's name in WhatsApp Manager, where you create it once in each language (es, fr and
// en), in the Utility category. Its body has a gap for the patient's name, the weekday and the
// time: "Hola {{1}}, le recordamos su cita de mañana, {{2}}, {{3}}. ¿Podrá asistir?". Under it,
// two quick reply buttons: "Confirmar" and "Cancelar".
const template = "appointment_reminder";

// A message to the patient, as one request to the Messages API: to the EU endpoint, as the calls
// go, from WHATSAPP_FROM_NUMBER, the WhatsApp number you have linked to the application. Your
// booking system would message the number it called. This file messages WHATSAPP_TO_NUMBER, as
// the sandbox's does, and sends nothing while it is empty. Resolves to whether Vonage accepted
// the message.
async function send(appointment: string, message: object) {
  const to = process.env.WHATSAPP_TO_NUMBER;
  if (!to) return false;
  try {
    const response = await fetch("https://api-eu.vonage.com/v1/messages", {
      method: "POST",
      headers: {
        Authorization: await auth.createBearerHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        channel: "whatsapp",
        from: env("WHATSAPP_FROM_NUMBER"),
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
 * Sends the reminder as the template, in the patient's language: es, fr or en. Meta has approved
 * its words, so WhatsApp delivers it whether or not the patient has written to you. You send what
 * fills its gaps: the patient's name, the weekday and the time.
 */
export function sendReminder(
  appointment: string,
  language: string,
  name: string,
  weekday: string,
  time: string,
) {
  return send(appointment, {
    message_type: "custom",
    custom: {
      type: "template",
      template: {
        name: template,
        // Deterministic, the one policy WhatsApp has: this language, with no fallback to another.
        language: { policy: "deterministic", code: language },
        components: [
          {
            type: "body",
            // In the order of the gaps: {{1}}, {{2}} and {{3}}.
            parameters: [
              { type: "text", text: name },
              { type: "text", text: weekday },
              { type: "text", text: time },
            ],
          },
          // The template holds each button's title. You give its payload, which Vonage sends to
          // the inbound webhook when the patient taps the button, so the answer names its
          // appointment.
          {
            type: "button",
            sub_type: "quick_reply",
            index: 0,
            parameters: [{ type: "payload", payload: `confirm-${appointment}` }],
          },
          {
            type: "button",
            sub_type: "quick_reply",
            index: 1,
            parameters: [{ type: "payload", payload: `cancel-${appointment}` }],
          },
        ],
      },
    },
  });
}

/**
 * Sends the reply to a tap. The patient has just written, so WhatsApp delivers a plain text for
 * the next 24 hours: the reply needs no template.
 */
export function sendReply(appointment: string, text: string) {
  return send(appointment, { message_type: "text", text });
}

/**
 * Mounts the application's two Messages webhooks, and calls `answered` with each tap: the
 * appointment's ID and the patient's answer.
 */
export function takeAnswers(
  webhooks: Router,
  answered: (appointment: string, answer: "confirmed" | "cancelled") => void,
) {
  // The patient tapped a button. Vonage posts the tap to the application's Inbound URL as a
  // message of type button, with the payload you sent for that button: the answer, and the
  // appointment it is for. The sandbox's button arrives as a reply with its ID instead. Whatever
  // else the patient writes arrives here too, and this leaves it alone. The body carries the
  // patient's number and WhatsApp name, so it stays out of the logs.
  webhooks.post("/inbound", (req, res) => {
    res.sendStatus(200);
    const [word, appointment = ""] = String(req.body.button?.payload).split("-");
    if (word === "confirm") answered(appointment, "confirmed");
    if (word === "cancel") answered(appointment, "cancelled");
  });

  // Each status of a message, at the application's Status URL: submitted, delivered and read, or
  // rejected or undeliverable, with the reason. Vonage accepts a message before WhatsApp does, so
  // this is where you learn that one did not arrive: a template Meta has paused, or a patient
  // without WhatsApp. The body carries the patient's number, so it stays out of the logs.
  webhooks.post("/status", (req, res) => {
    res.sendStatus(200);
    const { client_ref = "unknown", status, error } = req.body;
    const reason = error ? `: ${error.title}, ${error.detail}` : "";
    console.log(`Appointment ${client_ref}: WhatsApp message ${status}${reason}`);
  });
}
