import express from "express";
import cors from "cors";

import { config } from "./config.js";
import { campaignMetadataRouter } from "./routes/campaign-metadata.js";

const app = express();

// Ne pas afficher l'en-tête identifiant Express.
app.disable("x-powered-by");

// Autoriser les appels du futur frontend.
// CORS ne remplace pas l'authentification.
app.use(
    cors({
        origin: config.frontendOrigin,
        methods: ["GET", "POST"],
    })
);

// Lire les corps JSON et limiter leur taille.
// Les formulaires avec image sont traités par Multer dans la route.
app.use(express.json({ limit: "32kb" }));

// ----------------------------------------------------------
// Vérification du fonctionnement du serveur
// ----------------------------------------------------------

app.get("/api/health", (req, res) => {
    res.json({
        status: "ok",
        service: "crowdfunding-ipfs-backend",
    });
});

// ----------------------------------------------------------
// Réception des métadonnées et envoi sur IPFS
// ----------------------------------------------------------

// POST /api/campaign-metadata
app.use(
    "/api/campaign-metadata",
    campaignMetadataRouter
);

// ----------------------------------------------------------
// Routes inconnues
// ----------------------------------------------------------

app.use((req, res) => {
    res.status(404).json({
        error: "Route introuvable.",
    });
});

// ----------------------------------------------------------
// Gestion des erreurs
// Ce middleware doit rester après les routes.
// ----------------------------------------------------------

app.use((error, req, res, next) => {
    if (res.headersSent) {
        return next(error);
    }

    if (error.type === "entity.too.large") {
        return res.status(413).json({
            error: "Les données envoyées sont trop volumineuses.",
        });
    }

    if (error.type === "entity.parse.failed") {
        return res.status(400).json({
            error: "Le corps JSON est invalide.",
        });
    }

    // Ne pas afficher l'erreur complète :
    // elle pourrait contenir des informations sensibles.
    console.error("Une erreur interne est survenue.");

    return res.status(500).json({
        error: "Erreur interne du serveur.",
    });
});

// ----------------------------------------------------------
// Démarrage du serveur
// ----------------------------------------------------------

const server = app.listen(
    config.port,
    config.host,
    () => {
        console.log(
            `Backend démarré : http://${config.host}:${config.port}`
        );

        console.log(
            `Frontend autorisé : ${config.frontendOrigin}`
        );
    }
);

server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
        console.error(
            `Le port ${config.port} est déjà utilisé.`
        );
    } else {
        console.error("Impossible de démarrer le serveur.");
    }

    process.exitCode = 1;
});

// ----------------------------------------------------------
// Arrêt propre du serveur
// ----------------------------------------------------------

function shutdown() {
    console.log("\nArrêt du backend...");

    server.close(() => {
        process.exit(0);
    });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);