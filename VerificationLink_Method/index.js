require("dotenv").config();
const express = require("express");
const nodemailer = require("nodemailer");
const mongoose = require("mongoose");
const rateLimit = require("express-rate-limit");
const { emailModal } = require("./modal.js");
const crypto = require("crypto");
const app = express();
app.use(express.json());

function isValidEmail(email) {
    return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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


const signupLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    message: { message: "Too many signup requests from this IP, please try later." }
});

async function mailer(email, verificationToken) {
    const html = `<p>Click here to verify your email <strong>http://localhost:3000/verify/${verificationToken}</strong>. It expires in 5 minutes.</p>`;
    return transporter.sendMail({
        from: `"no-reply" <${process.env.EMAIL}>`,
        to: email,
        subject: "Email verification",
        text: `Click here to verify your email http://localhost:3000/verify/${verificationToken}. It expires in 5 minutes.`,
        html,
    });
}

app.post("/signup", signupLimiter, async (req, res) => {
    const { email } = req.body;
    if (!email || !isValidEmail(email)) return res.status(400).json({ message: "Valid email is required" });

    try {
        const verificationToken = crypto.randomBytes(20).toString('hex');
        const tokenExpire = new Date(Date.now() + 5 * 60 * 1000);
        await emailModal.findOneAndUpdate(
            { email: email.toLowerCase().trim() },
            { $set: { verificationToken, tokenExpire, verified: false, attempts: 0 } },
            { upsert: true, new: true }
        );

        await mailer(email, verificationToken);

        return res.status(200).json({ message: "Verification link sent" });
    } catch (err) {
        console.error("signup error:", err);
        return res.status(500).json({ message: "Failed to send link" });
    }
});

app.post("/verify/:token", async (req, res) => {
    const token = req.params.token;
    if (!token) return res.status(400).json({ message: "Invalid token" });
    try {
        const record = await emailModal.findOne({ verificationToken: token.trim() });
        if (!record) return res.status(404).json({ message: "No email associated with this link" });

        if (record.verified) return res.status(200).json({ message: "Email already verified" });

        if (!record.tokenExpire || new Date() > new Date(record.tokenExpire)) {
            return res.status(400).json({ message: "Link is expired. Please request a new one." });
        }

        record.attempts = (record.attempts || 0) + 1;
        if (record.attempts > 5) {
            await record.save();
            return res.status(429).json({ message: "Too many attempts. Request a new link." });
        }

        if (String(record.verificationToken) === String(token)) {
            record.verified = true;
            record.verificationToken = undefined;
            record.tokenExpire = undefined;
            record.attempts = 0;
            await record.save();
            return res.status(200).json({ message: "Verification complete" });
        } else {
            await record.save();
            return res.status(400).json({ message: "Invalid link" });
        }
    } catch (err) {
        console.error("verify-link error:", err);
        return res.status(500).json({ message: "Server error" });
    }
});

async function main() {
    try {
        await mongoose.connect(process.env.MONGO_URL);
        console.log("DB connected");
        await transporter.verify()
        console.log("Mailer ready")
        const PORT = process.env.PORT || 3000;
        app.listen(PORT, () => console.log(`Listening on http://localhost:${PORT}`));
    } catch (err) {
        console.error(err.message);
        process.exit(1);
    }
}
main();
