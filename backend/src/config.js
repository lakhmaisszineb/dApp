import dotenv from "dotenv";

// Charger précisément backend/.env.
dotenv.config({
    path: new URL("../.env", import.meta.url),
    quiet: true,
});

function required(name) {
    const value = process.env[name]?.trim();

    if (!value) {
        throw new Error(
            `La variable ${name} manque dans backend/.env.`
        );
    }

    return value;
}

const pinataJwt = required("PINATA_JWT");
const pinataGateway = required("PINATA_GATEWAY");

if (
    pinataGateway.includes("://") ||
    pinataGateway.includes("/") ||
    /\s/.test(pinataGateway)
) {
    throw new Error(
        "PINATA_GATEWAY doit contenir seulement le domaine."
    );
}

const port = Number(process.env.PORT ?? "3001");

if (
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
) {
    throw new Error("PORT doit être un entier entre 1 et 65535.");
}

const frontendOrigin =
    process.env.FRONTEND_ORIGIN?.trim() ||
    "http://localhost:5173";

const parsedOrigin = new URL(frontendOrigin);

if (
    !["http:", "https:"].includes(parsedOrigin.protocol) ||
    parsedOrigin.origin !== frontendOrigin
) {
    throw new Error(
        "FRONTEND_ORIGIN doit être une origine HTTP valide, " +
        "sans chemin ni slash final."
    );
}

export const config = Object.freeze({
    port,
    host: process.env.HOST?.trim() || "127.0.0.1",
    frontendOrigin,
    pinataJwt,
    pinataGateway,
});