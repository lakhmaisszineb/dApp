const API_URL = (
  import.meta.env.VITE_API_URL ||
  "http://localhost:3001"
).replace(/\/$/, "");

export async function uploadCampaignMetadata(data, image) {
  if (!image) {
    throw new Error("Choisissez une image pour votre projet.");
  }

  if (image.size > 5 * 1024 * 1024) {
    throw new Error("L’image ne doit pas dépasser 5 Mo.");
  }

  const form = new FormData();

  form.append("title", data.title.trim());
  form.append("summary", data.summary.trim());
  form.append("description", data.description.trim());
  form.append("category", data.category);

  form.append(
    "fundsUsage",
    JSON.stringify([
      {
        label: "Utilisation des fonds",
        description: data.fundsUsage.trim(),
      },
    ])
  );

  form.append("image", image);

  /*
   * Ne pas définir Content-Type manuellement :
   * le navigateur construit le multipart/form-data.
   */
  const response = await fetch(
    `${API_URL}/api/campaign-metadata`,
    {
      method: "POST",
      body: form,
    }
  );

  let result;

  try {
    result = await response.json();
  } catch (error) {
    throw new Error(
      "Le serveur a retourné une réponse illisible.",
      { cause: error }
    );
  }

  if (!response.ok) {
    throw new Error(
      result.error ||
      "Impossible de publier la présentation du projet."
    );
  }

  if (
    typeof result.metadataURI !== "string" ||
    !result.metadataURI.startsWith("ipfs://")
  ) {
    throw new Error(
      "Le serveur n’a pas retourné de référence IPFS valide."
    );
  }

  return result;
}