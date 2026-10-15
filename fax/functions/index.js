// Cloud Functions for the self-service fax portal.
//
// createCheckoutSession: called from the public upload form once the
// document is in Storage and the Firestore request doc exists. Creates a
// Stripe Checkout Session for the flat fax fee and returns its URL.
//
// stripeWebhook: Stripe calls this directly (not the client) when a
// checkout session completes. Verifies the signature, flips the Firestore
// doc to "paid", and emails Jimmy so he knows to send it.
//
// Secrets (set with `firebase functions:secrets:set NAME`, never committed):
//   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, RESEND_API_KEY

const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret, defineInt } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const admin = require("firebase-admin");
const Stripe = require("stripe");

admin.initializeApp();
const db = admin.firestore();

const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");
const stripeWebhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET");
const resendApiKey = defineSecret("RESEND_API_KEY");
const faxFeeCents = defineInt("FAX_FEE_CENTS", { default: 500 });

const NOTIFY_EMAIL = "jimmy@londo.tech";
const FROM_EMAIL = "Londo Fax Service <fax@londo.tech>";
const SITE_ORIGIN = "https://www.londo.tech";

exports.createCheckoutSession = onCall(
    { secrets: [stripeSecretKey], region: "us-central1" },
    async (request) => {
        const requestId = request.data?.requestId;
        if (!requestId || typeof requestId !== "string") {
            throw new HttpsError("invalid-argument", "Missing requestId.");
        }

        const docRef = db.collection("faxRequests").doc(requestId);
        const snap = await docRef.get();
        if (!snap.exists) {
            throw new HttpsError("not-found", "Fax request not found.");
        }
        const data = snap.data();
        if (data.status !== "awaiting_payment") {
            throw new HttpsError("failed-precondition", "This request has already been paid or is no longer valid.");
        }

        const stripe = new Stripe(stripeSecretKey.value());
        const session = await stripe.checkout.sessions.create({
            mode: "payment",
            payment_method_types: ["card"],
            line_items: [{
                price_data: {
                    currency: "usd",
                    unit_amount: faxFeeCents.value(),
                    product_data: {
                        name: "Fax sending service",
                        description: `Send a fax to ${data.recipientFax}`,
                    },
                },
                quantity: 1,
            }],
            metadata: { requestId },
            success_url: `${SITE_ORIGIN}/fax/success.html?r=${requestId}`,
            cancel_url: `${SITE_ORIGIN}/fax/index.html?canceled=1`,
        });

        await docRef.update({ stripeSessionId: session.id });
        return { url: session.url };
    }
);

exports.stripeWebhook = onRequest(
    { secrets: [stripeSecretKey, stripeWebhookSecret, resendApiKey], region: "us-central1" },
    async (req, res) => {
        const stripe = new Stripe(stripeSecretKey.value());
        let event;
        try {
            event = stripe.webhooks.constructEvent(req.rawBody, req.headers["stripe-signature"], stripeWebhookSecret.value());
        } catch (err) {
            logger.warn("Stripe webhook signature verification failed", err.message);
            res.status(400).send(`Webhook Error: ${err.message}`);
            return;
        }

        if (event.type !== "checkout.session.completed") {
            res.status(200).send("ignored");
            return;
        }

        const session = event.data.object;
        const requestId = session.metadata?.requestId;
        if (!requestId) {
            logger.error("checkout.session.completed with no requestId in metadata", session.id);
            res.status(200).send("no requestId");
            return;
        }

        const docRef = db.collection("faxRequests").doc(requestId);
        const snap = await docRef.get();
        if (!snap.exists) {
            logger.error("Paid fax request not found in Firestore", requestId);
            res.status(200).send("not found");
            return;
        }
        const data = snap.data();

        // Idempotency: Stripe can retry webhook delivery, don't double-notify.
        if (data.status === "paid" || data.status === "sent") {
            res.status(200).send("already processed");
            return;
        }

        await docRef.update({
            status: "paid",
            paidAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        try {
            await sendNotificationEmail(resendApiKey.value(), requestId, data);
        } catch (err) {
            // The payment and status update already succeeded; a failed email
            // shouldn't fail the webhook (Stripe would just retry and re-charge
            // nothing, but it's noise). Log it so it's not silently lost.
            logger.error("Failed to send notification email", err);
        }

        res.status(200).send("ok");
    }
);

async function sendNotificationEmail(apiKey, requestId, data) {
    const adminUrl = `${SITE_ORIGIN}/fax/admin/?r=${requestId}`;
    const body = {
        from: FROM_EMAIL,
        to: [NOTIFY_EMAIL],
        subject: `Paid fax request: send to ${data.recipientFax}`,
        text: [
            `A new fax request was just paid for.`,
            ``,
            `Send to: ${data.recipientFax}${data.recipientName ? " (" + data.recipientName + ")" : ""}`,
            `From: ${data.senderName}, ${data.senderPhone}, ${data.senderEmail}`,
            data.note ? `Note: ${data.note}` : null,
            ``,
            `Open the request (document + details): ${adminUrl}`,
        ].filter(Boolean).join("\n"),
    };

    const resp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!resp.ok) {
        throw new Error(`Resend API returned ${resp.status}: ${await resp.text()}`);
    }
}
