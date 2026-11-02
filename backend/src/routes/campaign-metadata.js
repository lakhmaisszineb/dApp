import { Router } from "express";
import multer from "multer";
import sharp from "sharp";
import { rateLimit } from "express-rate-limit";

import { uploadCampaignMetadata } from "../services/ipfs.js";

export const campaignMetadataRouter = Router();

// Limite locale par adresse IP.
// Le compteur est en mémoire et repart à zéro au redémarrage.
const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error:
            "Trop de demandes. Réessaie dans quelques minutes.",
    },
});

// Recevoir un seul fichier en mémoire, avec des limites explicites.
// Aucun fichier temporaire n'est écrit sur le disque.
const upload = multer({
    storage: multer.memoryStorage(),

    limits: {
        fileSize: 5 * 1024 * 1024,
        files: 1,
        fields: 6,
        parts: 7,
        fieldSize: 64 * 1024,
        fieldNameSize: 100,
    },
});

class ValidationError extends Error {}

function readText(body, name, maxLength) {
    const value = body[name];

    if (typeof value !== "string" || !value.trim()) {
        throw new ValidationError(
            `Le champ ${name} est obligatoire et doit être un texte.`
        );
    }

    const trimmed = value.trim();

    if (trimmed.length > maxLength) {
        throw new ValidationError(
            `Le champ ${name} dépasse ${maxLength} caractères.`
        );
    }

    return trimmed;
}

function readFundsUsage(raw) {
    if (typeof raw !== "string") {
        throw new ValidationError(
            "fundsUsage doit être une liste encodée en JSON."
        );
    }

    let parsed;

    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new ValidationError(
            "Le JSON de fundsUsage est invalide."
        );
    }

    if (
        !Array.isArray(parsed) ||
        parsed.length < 1 ||
        parsed.length > 10
    ) {
        throw new ValidationError(
            "Prévois entre 1 et 10 rubriques d'utilisation des fonds."
        );
    }

    return parsed.map((item) => {
        if (
            !item ||
            typeof item !== "object" ||
            Array.isArray(item)
        ) {
            throw new ValidationError(
                "Chaque rubrique doit contenir label et description."
            );
        }

        // Reconstruire un objet avec les seuls champs acceptés.
        return {
            label: readText(item, "label", 120),
            description: readText(item, "description", 1000),
        };
    });
}

async function prepareImage(file) {
    if (!file) {
        throw new ValidationError(
            "Une image est obligatoire dans le champ image."
        );
    }

    try {
        // Limite aussi le nombre de pixels après décompression.
        const options = {
            limitInputPixels: 20_000_000,
            failOn: "warning",
        };

        const info = await sharp(
            file.buffer,
            options
        ).metadata();

        // On vérifie le contenu réel, pas seulement l'extension
        // ou le type MIME déclaré par le navigateur.
        if (!["jpeg", "png"].includes(info.format)) {
            throw new ValidationError(
                "Seules les images JPEG et PNG sont acceptées."
            );
        }

        if ((info.pages ?? 1) > 1) {
            throw new ValidationError(
                "Les images animées ne sont pas acceptées."
            );
        }

        // Décoder et réencoder l'image :
        // - orientation corrigée ;
        // - dimensions plafonnées ;
        // - transparence remplacée par un fond blanc ;
        // - sortie uniforme JPEG ;
        // - métadonnées d'origine non conservées par défaut.
        const buffer = await sharp(file.buffer, options)
            .rotate()
            .resize({
                width: 1600,
                height: 1600,
                fit: "inside",
                withoutEnlargement: true,
            })
            .flatten({ background: "#ffffff" })
            .jpeg({ quality: 85 })
            .toBuffer();

        if (buffer.length > 5 * 1024 * 1024) {
            throw new ValidationError(
                "L'image traitée est trop volumineuse."
            );
        }

        return buffer;
    } catch (error) {
        if (error instanceof ValidationError) {
            throw error;
        }

        throw new ValidationError(
            "Image invalide, endommagée ou trop grande en pixels."
        );
    }
}

// Gérer les erreurs de réception avant de traiter la campagne.
function receiveForm(req, res, next) {
    upload.single("image")(req, res, (error) => {
        if (!error) {
            return next();
        }

        if (error instanceof multer.MulterError) {
            const tooLarge =
                error.code === "LIMIT_FILE_SIZE" ||
                error.code === "LIMIT_FIELD_VALUE";

            return res.status(tooLarge ? 413 : 400).json({
                error:
                    error.code === "LIMIT_FILE_SIZE"
                        ? "L'image ne doit pas dépasser 5 Mo."
                        : "Formulaire trop volumineux ou champs inattendus.",
            });
        }

        return res.status(400).json({
            error: "Impossible de lire le formulaire envoyé.",
        });
    });
}

// Limiter les traitements et envois simultanés sur ce serveur.
let activeUploads = 0;
const MAX_ACTIVE_UPLOADS = 2;

campaignMetadataRouter.post(
    "/",
    uploadLimiter,

    // Ce contrôle est placé avant la réception du fichier.
    (req, res, next) => {
        if (activeUploads >= MAX_ACTIVE_UPLOADS) {
            res.set("Retry-After", "10");

            return res.status(503).json({
                error: "Serveur occupé. Réessaie dans quelques secondes.",
            });
        }

        activeUploads += 1;

        let released = false;

        const release = () => {
            if (!released) {
                activeUploads -= 1;
                released = true;
            }
        };

        res.once("finish", release);
        res.once("close", release);

        next();
    },

    receiveForm,

    async (req, res, next) => {
        let data;
        let imageBuffer;

        // Valider toutes les données avant de consommer le quota IPFS.
        try {
            const body = req.body ?? {};

            const allowedFields = new Set([
                "title",
                "summary",
                "description",
                "category",
                "fundsUsage",
            ]);

            for (const name of Object.keys(body)) {
                if (!allowedFields.has(name)) {
                    throw new ValidationError(
                        `Champ non accepté : ${name}`
                    );
                }
            }

            data = {
                title: readText(body, "title", 120),
                summary: readText(body, "summary", 300),
                description: readText(body, "description", 10000),
                category: readText(body, "category", 80),
                fundsUsage: readFundsUsage(body.fundsUsage),
            };

            imageBuffer = await prepareImage(req.file);
        } catch (error) {
            if (error instanceof ValidationError) {
                return res.status(400).json({
                    error: error.message,
                });
            }

            return next(error);
        }

        // Ne jamais retourner au navigateur l'erreur brute du SDK :
        // elle peut contenir des informations sur la requête.
        try {
            const result = await uploadCampaignMetadata({
                ...data,
                imageBuffer,
            });

            return res.status(201).json(result);
        } catch {
            console.error(
                "Échec de l'envoi des métadonnées vers Pinata."
            );

            return res.status(502).json({
                error:
                    "L'envoi vers IPFS n'a pas abouti. " +
                    "Un fichier peut avoir été envoyé avant l'erreur. " +
                    "Vérifie Pinata avant de recommencer.",
            });
        }
    }
);