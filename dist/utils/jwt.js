"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.signAccessToken = signAccessToken;
exports.signRefreshToken = signRefreshToken;
exports.verifyAccessToken = verifyAccessToken;
exports.verifyRefreshToken = verifyRefreshToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
function signAccessToken(payload) {
    const options = {
        expiresIn: env_1.ENV.JWT_ACCESS_EXPIRES_IN,
    };
    return jsonwebtoken_1.default.sign(payload, env_1.ENV.JWT_ACCESS_SECRET, options);
}
function signRefreshToken(payload) {
    const options = {
        expiresIn: env_1.ENV.JWT_REFRESH_EXPIRES_IN,
    };
    return jsonwebtoken_1.default.sign(payload, env_1.ENV.JWT_REFRESH_SECRET, options);
}
function verifyAccessToken(token) {
    return jsonwebtoken_1.default.verify(token, env_1.ENV.JWT_ACCESS_SECRET);
}
function verifyRefreshToken(token) {
    return jsonwebtoken_1.default.verify(token, env_1.ENV.JWT_REFRESH_SECRET);
}
