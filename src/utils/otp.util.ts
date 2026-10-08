import { randomInt } from "crypto";



export function generateOtp(length = 6) {
    const max = 10 ** length;
    const n = randomInt(0, max);
    return String(n).padStart(length, '0');
}