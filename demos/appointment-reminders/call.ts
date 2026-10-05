import type { NCCOAction } from "@vonage/voice";
import {
  describeVonageError,
  env,
  logCallEvent,
  startServer,
  style,
  voice,
  webhookUrl,
} from "@vonage-demos/shared";
import express from "express";
// The demo sends through the Messages Sandbox. whatsapp.ts is its counterpart for your own
// WhatsApp number, where the reminder is a template.
import { sendReminder, sendReply, takeAnswers } from "./whatsapp_sandbox.ts";

// Everything the patient hears in their language, and the words they can answer with. Without a
// name, the greeting goes without it. After the language menu, which has said who is calling, the
// reminder thanks the patient and gives the appointment. On the second try, it apologizes and
// gives the appointment again, so the question that follows is still about it. The time is said
// the way people say it: Spanish and English on a 12-hour clock with the part of the day, French
// on the 24-hour clock. The message is what they read on WhatsApp when the call brings no answer,
// with the titles of its two buttons.
const languages = {
  es: {
    locale: "es-ES",
    menu: "Hola, le llamamos de su centro médico por su cita. Para español, pulse 1.",
    hour12: true,
    // "a las 7 y media de la tarde", but "a la una".
    time: (hour: string, minute: string, dayPeriod: string) =>
      `${hour === "1" ? "a la una" : `a las ${hour}`}${minute === "30" ? " y media" : ""} ${dayPeriod}`,
    reminder: (name: string, weekday: string, time: string) =>
      `Hola${name && `, ${name}`}. Le llamamos de su centro médico para recordarle su cita de mañana, ${weekday}, ${time}.`,
    afterMenu: (name: string, weekday: string, time: string) =>
      `Gracias${name && `, ${name}`}. Su cita es mañana, ${weekday}, ${time}.`,
    retry: (_name: string, weekday: string, time: string) =>
      `Perdone, no le hemos entendido. Su cita es mañana, ${weekday}, ${time}.`,
    noChoice: (_name: string, weekday: string, time: string) =>
      `Le recordamos su cita de mañana, ${weekday}, ${time}. Adiós.`,
    question:
      "Para confirmarla, pulse 1 o diga confirmar. Para cancelarla, pulse 2 o diga cancelar.",
    words: ["confirmar", "cancelar"],
    confirmed: "Gracias. Su cita queda confirmada. Hasta pronto.",
    cancelled: "Su cita ha sido cancelada. Llámenos cuando quiera para pedir una nueva. Adiós.",
    unclear: "No hemos podido registrar su respuesta. Llámenos para confirmar su cita. Adiós.",
    message: (name: string, weekday: string, time: string) =>
      `Hola${name && ` ${name}`}, le recordamos su cita de mañana, ${weekday}, ${time}. ¿Podrá asistir?`,
    confirm: "Confirmar",
    cancel: "Cancelar",
  },
  fr: {
    locale: "fr-FR",
    menu: "Bonjour, ici votre cabinet médical, au sujet de votre rendez-vous. Pour le français, appuyez sur 2.",
    hour12: false,
    // "à 19 heures 30"
    time: (hour: string, minute: string) =>
      `à ${Number(hour)} heures${minute === "30" ? " 30" : ""}`,
    reminder: (name: string, weekday: string, time: string) =>
      `Bonjour${name && ` ${name}`}, ici votre cabinet médical. Nous vous rappelons votre rendez-vous de demain, ${weekday}, ${time}.`,
    afterMenu: (name: string, weekday: string, time: string) =>
      `Merci${name && ` ${name}`}. Votre rendez-vous est demain, ${weekday}, ${time}.`,
    retry: (_name: string, weekday: string, time: string) =>
      `Pardon, nous n'avons pas compris. Votre rendez-vous est demain, ${weekday}, ${time}.`,
    noChoice: (_name: string, weekday: string, time: string) =>
      `Nous vous rappelons votre rendez-vous de demain, ${weekday}, ${time}. Au revoir.`,
    question:
      "Pour le confirmer, appuyez sur 1 ou dites confirmer. Pour l'annuler, appuyez sur 2 ou dites annuler.",
    words: ["confirmer", "annuler"],
    confirmed: "Merci, votre rendez-vous est confirmé. À bientôt.",
    cancelled: "Votre rendez-vous est annulé. Rappelez-nous pour en prendre un nouveau. Au revoir.",
    unclear:
      "Nous n'avons pas pu prendre en compte votre réponse. Merci de nous rappeler pour confirmer votre rendez-vous. Au revoir.",
    message: (name: string, weekday: string, time: string) =>
      `Bonjour${name && ` ${name}`}, nous vous rappelons votre rendez-vous de demain, ${weekday}, ${time}. Pourrez-vous venir ?`,
    confirm: "Confirmer",
    cancel: "Annuler",
  },
  en: {
    locale: "en-GB",
    menu: "Hello, this is your medical centre, about your appointment. For English, press 3.",
    hour12: true,
    // "at 7:30 in the evening"
    time: (hour: string, minute: string, dayPeriod: string) =>
      `at ${hour}${minute === "30" ? ":30" : ""} ${dayPeriod}`,
    reminder: (name: string, weekday: string, time: string) =>
      `Hello${name && `, ${name}`}. This is your medical centre, calling to remind you of your appointment tomorrow, ${weekday}, ${time}.`,
    afterMenu: (name: string, weekday: string, time: string) =>
      `Thank you${name && `, ${name}`}. Your appointment is tomorrow, ${weekday}, ${time}.`,
    retry: (_name: string, weekday: string, time: string) =>
      `Sorry, we did not catch that. Your appointment is tomorrow, ${weekday}, ${time}.`,
    noChoice: (_name: string, weekday: string, time: string) =>
      `This is a reminder of your appointment tomorrow, ${weekday}, ${time}. Goodbye.`,
    question: "To confirm it, press 1 or say confirm. To cancel it, press 2 or say cancel.",
    words: ["confirm", "cancel"],
    confirmed: "Thank you. Your appointment is confirmed. See you soon.",
    cancelled: "Your appointment has been cancelled. Call us any time to book a new one. Goodbye.",
    unclear: "We did not catch your answer. Please call us to confirm your appointment. Goodbye.",
    message: (name: string, weekday: string, time: string) =>
      `Hello${name && ` ${name}`}, this is a reminder of your appointment tomorrow, ${weekday}, ${time}. Can you make it?`,
    confirm: "Confirm",
    cancel: "Cancel",
  },
};
type Language = keyof typeof languages;
type Say = (typeof languages)[Language];

// The key that picks each language in the menu.
const menu = [
  { language: "es", key: "1" },
  { language: "fr", key: "2" },
  { language: "en", key: "3" },
] as const;

// Mainland Spain and France share Central European Time.
const timeZone = "Europe/Madrid";

// Stands in for your booking system. Each call's webhook URLs carry the appointment's ID, which
// ties the patient's answer to their appointment. Vonage sends its own call ID too, but leaves it
// out when the input times out, which is when you still have to reply. The ID, not the patient's
// name: a name does not belong in a URL. The map lives in memory, so after a restart, a call in
// progress ends with a goodbye.
type Appointment = {
  id: string;
  name: string;
  // Unknown until the patient picks one in the language menu.
  language?: Language;
  at: Date;
  // Pending while the call is under way. Messaged once the WhatsApp message has followed a call
  // that brought no answer.
  status: "pending" | "confirmed" | "cancelled" | "unanswered" | "messaged";
};
const appointments = new Map<string, Appointment>();

// The open pages, each holding a stream of server-sent events. After a change, each gets the whole
// table again: a few rows, not worth sending only what changed.
const pages = new Set<express.Response>();
function updatePages(to: Iterable<express.Response> = pages) {
  const data = JSON.stringify([...appointments.values()].reverse());
  for (const res of to) res.write(`data: ${data}\n\n`);
}

// The appointment in one language's words. Intl names the weekday and the part of the day in that
// language, in the clinic's time zone.
function appointmentText(
  say: Say,
  wording: "reminder" | "afterMenu" | "retry" | "noChoice" | "message",
  name: string,
  at: Date,
): string {
  const format = new Intl.DateTimeFormat(say.locale, {
    timeZone,
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
    hour12: say.hour12,
    dayPeriod: "long",
  });
  const {
    weekday = "",
    hour = "",
    minute = "",
    dayPeriod = "",
  } = Object.fromEntries(format.formatToParts(at).map(({ type, value }) => [type, value]));
  return say[wording](name.trim(), weekday, say.time(hour, minute, dayPeriod));
}

// The reminder in the patient's language, the question and their answer.
function reminder(
  appointment: Appointment,
  language: Language,
  wording: "reminder" | "afterMenu" | "retry" = "reminder",
): NCCOAction[] {
  const say = languages[language];
  const { locale } = say;
  const text = appointmentText(say, wording, appointment.name, appointment.at);
  const retry = wording === "retry";
  return [
    // The appointment plays to the end: without bargeIn, a hello as the patient picks up, or
    // noise, cannot cut it short. A key pressed while it plays is ignored.
    { action: "talk", text, language: locale },
    // On the first try, a key or a word ends the question, so the patient need not wait for it.
    // Noise can end it too, so the second try plays it to the end.
    { action: "talk", text: say.question, language: locale, bargeIn: !retry },
    // A key press or a spoken answer, with the expected words as hints. The keypad waits
    // 10 seconds, as long as speech, rather than its default 3: patients first take the phone
    // from their ear.
    {
      action: "input",
      type: ["dtmf", "speech"],
      dtmf: { maxDigits: 1, timeOut: 10 },
      speech: { language: locale, context: say.words },
      // Vonage posts the answer to this URL, so the appointment's ID comes back with it, and
      // which try this is.
      eventUrl: [webhookUrl(`/input?appointment=${appointment.id}&attempt=${retry ? 2 : 1}`)],
    },
  ];
}

// One line in each language, for a call that has no language to go on.
function inEveryLanguage(text: (say: Say) => string): NCCOAction[] {
  return Object.values(languages).map(
    (say): NCCOAction => ({ action: "talk", text: text(say), language: say.locale }),
  );
}

// Asks the patient for their language. Each language, in its own voice, says who is calling and
// why, so the patient knows to answer, then which key picks it. A key cuts the menu short, so the
// patient need not wait for the other languages. bargeIn ends a talk on whatever the input
// listens for, so the menu takes keys only: with speech, noise or a hello as the patient picks up
// would cut it short too.
function languageMenu(appointment: Appointment): NCCOAction[] {
  return [
    ...Object.values(languages).map(
      (say): NCCOAction => ({
        action: "talk",
        text: say.menu,
        language: say.locale,
        bargeIn: true,
      }),
    ),
    {
      action: "input",
      type: ["dtmf"],
      dtmf: { maxDigits: 1, timeOut: 10 },
      eventUrl: [webhookUrl(`/language?appointment=${appointment.id}`)],
    },
  ];
}

// What the patient reads on WhatsApp: in their language, or in all three while it is unknown, as
// they hear all three on the call.
function written({ language }: Appointment, text: (say: Say) => string): string {
  const says: Say[] = language ? [languages[language]] : Object.values(languages);
  return says.map(text).join("\n\n");
}

// The reminder as a WhatsApp message, for the call that brought no answer: the patient reads it
// when they can, and taps a button to confirm or cancel.
async function followUp(appointment: Appointment) {
  const { id, name, language, at } = appointment;
  const text = written(appointment, (say) => appointmentText(say, "message", name, at));
  // One language's words on the buttons, or yes and no in all three.
  const [confirm, cancel] = language
    ? [languages[language].confirm, languages[language].cancel]
    : ["Sí / Oui / Yes", "No / Non"];
  if (!(await sendReminder(id, text, confirm, cancel))) return;
  if (appointment.status === "unanswered") appointment.status = "messaged";
  updatePages();
}

const webhooks = await startServer();

// Every call ends with a completed event, or a rejected one when Vonage turns it down. An
// appointment still pending then goes unanswered: nobody picked up, or the patient did not
// answer the question. The WhatsApp message follows, once: a repeated event finds the appointment
// no longer pending. Events can arrive out of order, so an answer that comes later still counts.
webhooks.post("/event", (req, res, next) => {
  logCallEvent(req, res, next);
  const appointment = appointments.get(String(req.query.appointment));
  const ended = req.body.status === "completed" || req.body.status === "rejected";
  if (ended && appointment?.status === "pending") {
    appointment.status = "unanswered";
    followUp(appointment);
  }
  updatePages();
});

// The patient picked a language in the menu. The reminder in that language replaces the rest of
// the call. Without a choice, there is no language to ask the question in, so the patient hears
// the appointment in all three and the call ends.
webhooks.post("/language", (req, res) => {
  const appointment = appointments.get(String(req.query.appointment));
  const digits = req.body.dtmf?.digits;
  const choice = menu.find(({ key }) => digits === key);
  res.json(
    choice && appointment
      ? reminder(appointment, choice.language, "afterMenu")
      : inEveryLanguage((say) =>
          // After a restart, the demo no longer knows the appointment.
          appointment
            ? appointmentText(say, "noChoice", appointment.name, appointment.at)
            : say.unclear,
        ),
  );
  // /input replies in this language, and the page's table shows it.
  if (choice && appointment) appointment.language = choice.language;
  updatePages();
  const how = digits ? `pressed ${digits}` : "did not answer";
  const picked = choice ? languages[choice.language].locale : "no language";
  console.log(
    appointment
      ? `Appointment ${appointment.id}: patient ${how}, ${picked}`
      : "Unknown appointment",
  );
});

// The NCCO you reply with replaces the rest of the call.
webhooks.post("/input", (req, res) => {
  const appointment = appointments.get(String(req.query.appointment));
  const { dtmf, speech } = req.body;
  const digits = dtmf?.digits;
  // Vonage lists what it heard, most likely first. Any form of the word counts, such as
  // "confirmo" or "annulez".
  const heard = speech?.results?.[0]?.text?.toLowerCase() ?? "";
  const answer =
    digits === "1" || /confirm/.test(heard)
      ? "confirmed"
      : digits === "2" || /cancel|annul/.test(heard)
        ? "cancelled"
        : "unclear";
  // Noise, silence or another key gets one more try, then a goodbye that asks for a call back.
  const again = answer === "unclear" && req.query.attempt === "1";
  const language = appointment?.language;
  if (!appointment || !language) {
    // After a restart, the demo no longer knows the appointment, nor its language.
    res.json(inEveryLanguage(({ unclear }) => unclear));
  } else if (again) {
    res.json(reminder(appointment, language, "retry"));
  } else {
    const say = languages[language];
    res.json([{ action: "talk", text: say[answer], language: say.locale }]);
  }
  // This is where your booking system confirms the appointment or frees the slot.
  if (appointment && answer !== "unclear") appointment.status = answer;
  updatePages();
  // What the patient said stays out of the logs: it can be health data.
  const how = digits ? `pressed ${digits}` : heard ? "spoke" : "did not answer";
  console.log(
    appointment
      ? `Appointment ${appointment.id}: patient ${how}, ${again ? "asking again" : answer}`
      : "Unknown appointment",
  );
});

// The patient tapped a button on the WhatsApp message.
takeAnswers(webhooks, (id, answer) => {
  // After a restart, the demo no longer knows the appointment.
  const appointment = appointments.get(id);
  if (!appointment) return console.log("Unknown appointment");
  // This is where your booking system confirms the appointment or frees the slot.
  appointment.status = answer;
  updatePages();
  console.log(`Appointment ${id}: patient tapped a button on WhatsApp, ${answer}`);
  // The reply the patient would hear on the call.
  const reply = written(appointment, (say) => say[answer]);
  sendReply(id, reply);
});

// The page stays on localhost, off the tunnel: whoever reaches it places calls on your account and
// reads your patients' names.
const page = express();
page.get("/", (_req, res) => res.sendFile("index.html", { root: import.meta.dirname }));
page.use("/style", style);

// The appointments for the page's table, newest first, as server-sent events: the table now, then
// again after every change, so an answer shows up while the patient is still on the line.
page.get("/appointments", (_req, res) => {
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
  pages.add(res);
  res.on("close", () => pages.delete(res));
  updatePages([res]);
});

// The page posts the patient as JSON, { name, language }, as your booking system would. Either can
// be left out.
page.post("/call", express.json(), async (req, res) => {
  const { name = "", language = "" } = req.body;
  if (typeof name !== "string" || (language && !Object.hasOwn(languages, language))) {
    res.status(400).json({ error: "Send the name as text and the language as es, fr or en" });
    return;
  }
  // Reminders go out the day before, so the patient hears "tomorrow" and the weekday. The
  // appointment is this time tomorrow, on the half hour before it, as a clinic books.
  const halfHour = 30 * 60 * 1000;
  // Your booking system has its own IDs. This one is short, to fit the page's table, and random: a
  // counter would start over after a restart, and a call still under way would answer the new
  // appointment with its number.
  const appointment: Appointment = {
    id: crypto.randomUUID().slice(0, 6).toUpperCase(),
    name,
    language: language || undefined,
    at: new Date(Math.floor((Date.now() + 48 * halfHour) / halfHour) * halfHour),
    status: "pending",
  };
  appointments.set(appointment.id, appointment);

  try {
    const number = process.env.VOICE_TO_NUMBER;
    const call = await voice.createOutboundCall({
      // Without a number, the call rings the page of `npm run phone`, logged in as `browser`.
      to: [number ? { type: "phone", number } : { type: "app", user: "browser" }],
      from: { type: "phone", number: env("VONAGE_VIRTUAL_NUMBER") },
      eventUrl: [webhookUrl(`/event?appointment=${appointment.id}`)],
      // The call flow travels with the request, so the call needs no answer webhook.
      ncco: language ? reminder(appointment, language) : languageMenu(appointment),
    });
    res.json({ uuid: call.uuid });
    // The name stays out of the logs: it is patient data.
    const how = language
      ? `in ${languages[language as Language].locale}`
      : "with the language menu";
    console.log(`Appointment ${appointment.id}: calling the patient ${how}, call ${call.uuid}`);
  } catch (error) {
    // No call, so no reminder to follow.
    appointments.delete(appointment.id);
    const reason = await describeVonageError(error);
    res.status(502).json({ error: reason });
    console.error(`Could not place the call: ${reason}`);
  }
  updatePages();
});
page.listen(3003, "localhost", (error) => {
  if (error) throw error;
  console.log("Open http://localhost:3003");
});
