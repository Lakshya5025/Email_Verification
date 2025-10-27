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
    verificationToken: {
        type: String,
        default: null,
    },
    tokenExpire: {
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

emailSchema.index({ tokenExpire: 1 }, { expireAfterSeconds: 0 });
emailSchema.index({ email: 1 }, { unique: true });

const emailModal = mongoose.model("emails", emailSchema);
module.exports = { emailModal };
