
require("dotenv").config();

const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

const API_KEYS = [
    process.env.CONSENSUS_API_KEY,
    process.env.CONSENSUS_API_KEY_2
].filter(Boolean);

if (API_KEYS.length === 0) {
    console.error("No Consensus API keys found in .env");
    process.exit(1);
}

// Tracks which key will be used next.
let nextKeyIndex = 0;

function getNextApiKey() {
    const key = API_KEYS[nextKeyIndex];

    nextKeyIndex = (nextKeyIndex + 1) % API_KEYS.length;

    return key;
}

app.post("/api/consensus", async (req, res) => {
    try {
        const { query } = req.body;

        if (!query || typeof query !== "string" || !query.trim()) {
            return res.status(400).json({
                error: "A research query is required."
            });
        }

        if (query.length > 1000) {
            return res.status(400).json({
                error: "Research query is too long."
            });
        }

        // Select the next key for this request.
        const apiKey = getNextApiKey();

        console.log(
            `Consensus request using key ${nextKeyIndex === 0
                ? API_KEYS.length
                : nextKeyIndex}`
        );

        const response = await fetch(
            "https://api.consensus.app/v1/search?query=" +
            encodeURIComponent(query.trim()),
            {
                method: "GET",
                headers: {
                    "x-api-key": apiKey
                },
                signal: AbortSignal.timeout(30000)
            }
        );

        const data = await response.json();

        if (!response.ok) {
            console.error("Consensus API status:", response.status);

            return res.status(response.status).json({
                error: data.error || "Consensus API request failed."
            });
        }

        return res.json(data);

    } catch (error) {
        console.error("Consensus error:", error);

        return res.status(500).json({
            error: error.name === "TimeoutError"
                ? "Consensus request timed out."
                : "Consensus request failed."
        });
    }
});

app.listen(PORT, () => {
    console.log(`NEXUS backend running at http://localhost:${PORT}`);
    console.log(`Consensus keys configured: ${API_KEYS.length}`);
});
