require("dotenv").config();
const express = require("express");
const nodemailer = require("nodemailer");
const mongoose = require("mongoose");
const rateLimit = require("express-rate-limit");
const { emailModal } = require("./modal.js");

const app = express();
app.use(express.json());

function isValidEmail(email) {
    return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function randomOTP() {
    return Math.floor(Math.random() * 1000000).toString().padStart(6, "0");
}

const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: {
        user: process.env.EMAIL,
        pass: process.env.EMAIL_PASSWORD,
    },
});

transporter.verify()
    .then(() => console.log("Mailer ready"))
    .catch(err => console.warn("Mailer verify failed:", err.message));

const signupLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    message: { message: "Too many signup requests from this IP, please try later." }
});

async function mailer(email, otp) {
    const html = `<p>Your OTP is <strong>${otp}</strong>. It expires in 5 minutes.</p>`;
    return transporter.sendMail({
        from: `"no-reply" <${process.env.EMAIL}>`,
        to: email,
        subject: "OTP verification",
        text: `Your OTP is ${otp}. It expires in 5 minutes.`,
        html,
    });
}

app.post("/signup", signupLimiter, async (req, res) => {
    const { email } = req.body;
    if (!email || !isValidEmail(email)) return res.status(400).json({ message: "Valid email is required" });

    try {
        const otp = randomOTP();
        const otpExpiry = new Date(Date.now() + 5 * 60 * 1000);

        await emailModal.findOneAndUpdate(
            { email: email.toLowerCase().trim() },
            { $set: { otp, otpExpiry, verified: false, attempts: 0 } },
            { upsert: true, new: true }
        );

        await mailer(email, otp);

        return res.status(200).json({ message: "OTP sent to email" });
    } catch (err) {
        console.error("signup error:", err);
        return res.status(500).json({ message: "Failed to send OTP" });
    }
});

app.post("/verify-otp", async (req, res) => {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ message: "Email and OTP are required" });
    if (!isValidEmail(email)) return res.status(400).json({ message: "Invalid email" });

    try {
        const record = await emailModal.findOne({ email: email.toLowerCase().trim() });
        if (!record) return res.status(404).json({ message: "No OTP request found for this email" });

        if (record.verified) return res.status(200).json({ message: "Email already verified" });

        if (!record.otpExpiry || new Date() > new Date(record.otpExpiry)) {
            return res.status(400).json({ message: "OTP expired. Please request a new one." });
        }

        record.attempts = (record.attempts || 0) + 1;
        if (record.attempts > 5) {
            await record.save();
            return res.status(429).json({ message: "Too many attempts. Request a new OTP." });
        }

        if (String(record.otp) === String(otp)) {
            record.verified = true;
            record.otp = undefined;
            record.otpExpiry = undefined;
            record.attempts = 0;
            await record.save();
            return res.status(200).json({ message: "Verification complete" });
        } else {
            await record.save();
            return res.status(400).json({ message: "Invalid OTP" });
        }
    } catch (err) {
        console.error("verify-otp error:", err);
        return res.status(500).json({ message: "Server error" });
    }
});

async function main() {
    try {
        await mongoose.connect(process.env.MONGO_URL);
        console.log("DB connected");
        const PORT = process.env.PORT || 3000;
        app.listen(PORT, () => console.log(`Listening on http://localhost:${PORT}`));
    } catch (err) {
        console.error("DB connection error:", err);
        process.exit(1);
    }
}
main();
