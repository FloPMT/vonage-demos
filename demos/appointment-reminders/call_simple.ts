// Appointment reminders at their simplest: one call to one patient, in the language on their
// record, who presses 1 to confirm or 2 to cancel. call.ts adds spoken answers, a second try,
// the language menu and the appointment's own day and time: here it is always tomorrow at 10.
//
// To run it, set VOICE_TO_NUMBER, stop `npm run reminders`, which holds the tunnel's port, and
// pass the patient's record:
// node --env-file=.env demos/appointment-reminders/call_simple.ts \
//   '{ "name": "Hugo", "language": "fr" }'
import {
  describeVonageError,
  env,
  logCallEvent,
  startServer,
  voice,
  webhookUrl,
} from "@vonage-demos/shared";

// The patient's record, as your booking system would send it. The language picks what they hear.
// The phone number comes from .env, so the call only rings your own phone.
const patient: { name: string; language: "es" | "fr" } = JSON.parse(process.argv[2] ?? "{}");

// What the clinic says, in each language it serves.
const texts = {
  es: {
    locale: "es-ES",
    reminder: `Hola, ${patient.name}. Le llamamos de su centro médico para recordarle su cita de mañana a las 10. Para confirmarla, pulse 1. Para cancelarla, pulse 2.`,
    confirmed: "Gracias. Su cita queda confirmada. Hasta pronto.",
    cancelled: "Su cita ha sido cancelada. Llámenos para pedir una nueva. Adiós.",
    unclear: "No hemos recibido su respuesta. Llámenos para confirmar su cita. Adiós.",
  },
  fr: {
    locale: "fr-FR",
    reminder: `Bonjour ${patient.name}, ici votre cabinet médical. Nous vous rappelons votre rendez-vous de demain à 10 heures. Pour le confirmer, appuyez sur 1. Pour l'annuler, appuyez sur 2.`,
    confirmed: "Merci, votre rendez-vous est confirmé. À bientôt.",
    cancelled: "Votre rendez-vous est annulé. Rappelez-nous pour en prendre un nouveau. Au revoir.",
    unclear: "Nous n'avons pas reçu votre réponse. Rappelez-nous pour confirmer votre rendez-vous.",
  },
};
// One patient per run, so the reply's language comes straight from the record. call.ts calls
// many, and looks each appointment up by its ID.
const say = texts[patient.language];
if (!patient.name || !say) {
  console.error(`Pass the patient as JSON: '{ "name": "Hugo", "language": "fr" }', in es or fr`);
  process.exit(1);
}

// Stands in for your booking system's ID for the appointment. It goes in the input webhook's URL,
// so it comes back with the patient's answer. Vonage's own call ID cannot do this job: Vonage can
// leave it out when the patient presses nothing.
const appointment = crypto.randomUUID().slice(0, 6).toUpperCase();

const webhooks = await startServer();

// Vonage reports each step of the call: started, ringing, answered, completed.
webhooks.post("/event", logCallEvent);

// Vonage sends the key the patient pressed, if any. Your reply is what they hear next, then the
// call ends.
webhooks.post("/input", (req, res) => {
  const key = req.body.dtmf?.digits;
  const answer = key === "1" ? "confirmed" : key === "2" ? "cancelled" : "unclear";
  res.json([{ action: "talk", text: say[answer], language: say.locale }]);
  // This is where your booking system looks the appointment up by its ID, then confirms it or
  // frees the slot.
  console.log(`Appointment ${req.query.appointment}: ${answer}`);
});

// The call's script travels with the request: read the reminder, then wait for one key.
try {
  const call = await voice.createOutboundCall({
    to: [{ type: "phone", number: env("VOICE_TO_NUMBER") }],
    from: { type: "phone", number: env("VONAGE_VIRTUAL_NUMBER") },
    eventUrl: [webhookUrl("/event")],
    ncco: [
      { action: "talk", text: say.reminder, language: say.locale },
      // 10 seconds rather than the default 3: patients first take the phone from their ear.
      {
        action: "input",
        type: ["dtmf"],
        dtmf: { maxDigits: 1, timeOut: 10 },
        eventUrl: [webhookUrl(`/input?appointment=${appointment}`)],
      },
    ],
  });
  console.log(`Appointment ${appointment}: calling the patient, call ${call.uuid}`);
} catch (error) {
  console.error(`Could not place the call: ${await describeVonageError(error)}`);
  process.exit(1);
}
