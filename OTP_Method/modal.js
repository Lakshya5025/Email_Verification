// modal.js
const mongoose = require("mongoose");

const emailSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
    },
    otp: {
        type: String,
        default: null,
    },
    otpExpiry: {
        type: Date,
        default: null,
    },
    verified: {
        type: Boolean,
        default: false,
    },
    attempts: {
        type: Number,
        default: 0,
    }
}, {
    timestamps: true
});

emailSchema.index({ otpExpiry: 1 }, { expireAfterSeconds: 0 });
emailSchema.index({ email: 1 }, { unique: true });

const emailModal = mongoose.model("emails", emailSchema);
module.exports = { emailModal };
