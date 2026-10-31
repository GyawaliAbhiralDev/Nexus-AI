
/* ===== Nexus AI — script.js =====
   Auth + AI come from Puter.js.
   Features: web search, voice, image analysis, image creation,
   Ultimate council, Consensus AI, owner commands,
   Google Scholar research + PDF.
*/

const $ = (id) => document.getElementById(id);
const authEl = $("auth"), appEl = $("app"), messagesEl = $("messages");
const inputEl = $("input"), sendBtn = $("sendBtn");

let user = null;
let chats = {};
let currentId = null;
let busy = false;
let pendingImage = null;

const IDENTITY = "Your name is Nexus. You were created by and are owned by Abhiral Gyawali. If anyone asks who made you, who owns you, or who your creator is, answer that Nexus was created by Abhiral Gyawali. If asked about the technology behind you, be honest that Nexus runs on top of AI language models. Never claim to be made by any other person or company as your creator.";

/* ---------- OWNER RECOGNITION ---------- */
const OWNER_EMAIL = "gyawaliabhiral179@gmail.com";
const OWNER_USERNAME = "magenta_tuba_738264";

function isOwnerUser() {
    if (!user) return false;
    const emailMatch = user.email && user.email.toLowerCase() === OWNER_EMAIL.toLowerCase();
    const nameMatch = user.username && user.username.toLowerCase() === OWNER_USERNAME.toLowerCase();
    return !!(emailMatch || nameMatch);
}

const SYSTEM_PROMPTS = {
    chat: IDENTITY + " You are a friendly and highly capable AI assistant. You are excellent at coding (give clean, working, well-commented code in fenced code blocks), explanations, writing and problem solving. Be accurate, say when you are unsure, never invent facts.",
    study: IDENTITY + " You are Nexus Study Helper, a patient tutor. Explain step by step, use simple examples and analogies, check understanding, and offer short practice questions or quizzes. Be accurate and encouraging."
};

/* ---------- MODEL SETTINGS ---------- */
const SEARCH_MODEL = "perplexity/sonar";
const VISION_MODEL = "gpt-4o";

const COUNCIL = [
    { id: "gpt-4o", name: "GPT-4o" },
    { id: "claude-sonnet-4", name: "Claude Sonnet" },
    { id: "deepseek-chat", name: "DeepSeek" }
];

const CHAIR_MODEL = "gpt-4o";
const COUNCIL_TIMEOUT_MS = 60000;

const LIVE_REGEX = /\b(today|tonight|now|current|currently|latest|recent|recently|newest|news|price|prices|cost of|score|scores|weather|forecast|stock|stocks|trending|headlines|this (week|month|year)|right now|release date|who is the (current )?|who won|exchange rate|202[5-9])\b/i;

/* ---------- WEB SEARCH ---------- */
async function webSearch(question) {
    const res = await puter.ai.chat(
        [
            {
                role: "system",
                content: "You are a web research assistant. Search the web and report accurate, up-to-date findings that answer the question. Be concise and factual. List the source URLs you used at the end. Today is " + new Date().toDateString() + "."
            },
            { role: "user", content: question }
        ],
        { model: SEARCH_MODEL }
    );

    return extractText(res).trim();
}

function withTimeout(promise, ms) {
    return Promise.race([
        promise,
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error("timeout")), ms)
        )
    ]);
}

/* ---------- 🔬 CONSENSUS AI ---------- */

async function searchConsensus(query) {
    const response = await fetch("http://localhost:3000/api/consensus", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ query })
    });

    let data;

    try {
        data = await response.json();
    } catch {
        throw new Error("The Consensus backend returned an invalid response.");
    }

    if (!response.ok) {
        throw new Error(data.error || "Consensus search failed.");
    }

    return formatConsensusResults(data);
}

function formatConsensusResults(data) {
    const papers = Array.isArray(data)
        ? data
        : data.results || data.papers || data.items || data.data?.results || [];

    if (!Array.isArray(papers) || papers.length === 0) {
        return "## 🔬 Consensus AI — Research Results\n\nNo papers were found, or the API returned an unexpected response.\n\n```json\n" +
            JSON.stringify(data, null, 2).slice(0, 4000) +
            "\n```";
    }

    let output = "## 🔬 Consensus AI — Research Results\n\n";
    output += `Found ${papers.length} research paper(s).\n\n`;

    papers.forEach((paper, index) => {
        const title = paper.title || "Untitled paper";

        const authors = Array.isArray(paper.authors)
            ? paper.authors.map(a =>
                typeof a === "string" ? a : a.name || ""
            ).filter(Boolean).join(", ")
            : paper.authors || "Not listed";

        const year = paper.year || paper.publication_year || "Unknown";
        const journal = paper.journal || paper.source || "Not listed";
        const abstract = paper.abstract || "No abstract available.";

        const citations =
            paper.citation_count ??
            paper.citations ??
            paper.cited_by_count;

        const url =
            paper.url ||
            paper.paper_url ||
            paper.doi_url ||
            paper.external_url;

        output += `### ${index + 1}. ${title}\n\n`;
        output += `- **Authors:** ${authors}\n`;
        output += `- **Year:** ${year}\n`;
        output += `- **Journal:** ${journal}\n`;

        if (citations !== undefined) {
            output += `- **Citations:** ${citations}\n`;
        }

        output += `\n**Abstract:** ${abstract}\n\n`;

        if (url && /^https?:\/\//i.test(url)) {
            output += `[Read paper](${url})\n\n`;
        }

        output += "---\n\n";
    });

    return output;
}

/* ---------- 🧠 ULTIMATE COUNCIL ---------- */
async function runCouncil(instructions, history, bubble) {
    const payload = [{ role: "system", content: instructions }, ...history];
    let done = 0;

    const status = () => {
        bubble.textContent = `🧠 Council is thinking… (${done}/${COUNCIL.length} answered)`;
    };

    status();

    const results = await Promise.allSettled(
        COUNCIL.map((m) =>
            withTimeout(
                puter.ai.chat(payload, { model: m.id }),
                COUNCIL_TIMEOUT_MS
            )
                .then((r) => {
                    done++;
                    status();
                    return { name: m.name, text: extractText(r).trim() };
                })
                .catch((e) => {
                    done++;
                    status();
                    throw e;
                })
        )
    );

    const drafts = results
        .filter((r) => r.status === "fulfilled" && r.value.text)
        .map((r) => r.value);

    if (!drafts.length) throw new Error("No council member answered");

    if (drafts.length === 1) {
        return { final: drafts[0].text, drafts, streamed: false };
    }

    bubble.textContent = "🧠 Merging the best answer…";

    const lastUser = history[history.length - 1].content;

    const context = history
        .slice(-7, -1)
        .map((m) => `${m.role === "user" ? "User" : "Nexus"}: ${m.content}`)
        .join("\n");

    const chairPrompt =
        (context ? "Recent conversation:\n" + context + "\n\n" : "") +
        "User's latest message:\n" + lastUser + "\n\n" +
        "Draft answers from a council of different AI models:\n\n" +
        drafts.map((d, i) => `--- Draft ${i + 1} (${d.name}) ---\n${d.text}`).join("\n\n") +
        "\n\nWrite the single best final answer to the user's latest message. Compare the drafts, check their reasoning and facts, fix any mistakes, resolve disagreements by choosing what is correct, and keep the best explanations and code. If the drafts disagree and you are unsure, say so briefly. Do not mention the drafts, the council or other models. Answer directly in your own voice as Nexus.";

    const chairInstructions =
        instructions +
        "\n\nYou are the final editor of a council of AI models. Follow all the rules above in your final answer.";

    let full = "";

    try {
        const stream = await puter.ai.chat(
            [
                { role: "system", content: chairInstructions },
                { role: "user", content: chairPrompt }
            ],
            { model: CHAIR_MODEL, stream: true }
        );

        bubble.textContent = "";

        if (stream && stream[Symbol.asyncIterator]) {
            for await (const part of stream) {
                full += part?.text || "";
                bubble.innerHTML = renderMarkdown(full);
                messagesEl.scrollTop = messagesEl.scrollHeight;
            }
        } else {
            full = extractText(stream);
        }
    } catch (e) {
        console.error("Chair failed, using first draft:", e);
    }

    if (!full) full = drafts[0].text;

    return { final: full, drafts, streamed: true };
}

function appendDrafts(bubble, drafts) {
    if (!drafts || drafts.length < 2) return;

    const det = document.createElement("details");
    det.className = "drafts";

    const sum = document.createElement("summary");
    sum.textContent = `🧠 See the ${drafts.length} individual answers`;
    det.appendChild(sum);

    drafts.forEach((d) => {
        const h = document.createElement("div");
        h.className = "draft-name";
        h.textContent = d.name;

        const b = document.createElement("div");
        b.className = "draft-body";
        b.innerHTML = renderMarkdown(d.text);

        det.append(h, b);
    });

    bubble.appendChild(det);
}

/* ---------- OWNER RULES ---------- */
const RULES_KEY = "nexus_owner_rules";
const MAX_RULES = 20;
const MAX_RULE_LEN = 300;

function getRules() {
    try {
        return JSON.parse(localStorage.getItem(RULES_KEY)) || [];
    } catch {
        return [];
    }
}

function setRules(r) {
    try {
        localStorage.setItem(RULES_KEY, JSON.stringify(r));
    } catch {}
}

function rulesText() {
    const r = getRules();

    return r.length
        ? r.map((x, i) => `${i + 1}. ${x}`).join("\n")
        : "_No custom rules yet. Add one with_ `/teach your rule here`";
}

function handleCommand(text) {
    if (!text.startsWith("/") || !isOwnerUser()) return null;

    const [cmdRaw, ...rest] = text.split(" ");
    const cmd = cmdRaw.toLowerCase();

    if (cmd === "/image") return null;

    const arg = rest.join(" ").trim();
    const rules = getRules();

    if (cmd === "/teach") {
        if (!arg) {
            return "Usage: `/teach <rule>` e.g. `/teach Always answer in short bullet points`";
        }

        if (rules.length >= MAX_RULES) {
            return `You already have ${MAX_RULES} rules. Remove one with \`/forget N\` first.`;
        }

        rules.push(arg.slice(0, MAX_RULE_LEN));
        setRules(rules);

        return "✅ Rule added. I'll follow it from now on.\n\n**Current rules:**\n" + rulesText();
    }

    if (cmd === "/rules") {
        return "**Current rules:**\n" + rulesText();
    }

    if (cmd === "/forget") {
        const n = parseInt(arg, 10);

        if (!n || n < 1 || n > rules.length) {
            return "Usage: `/forget <number>` (see numbers with `/rules`)";
        }

        const removed = rules.splice(n - 1, 1);
        setRules(rules);

        return `🗑️ Removed rule: "${removed[0]}"\n\n**Current rules:**\n` + rulesText();
    }

    if (cmd === "/reset") {
        setRules([]);
        return "🧹 All custom rules cleared.";
    }

    if (cmd === "/help") {
        return "**Owner commands**\n- `/teach <rule>` add a permanent rule\n- `/rules` list rules\n- `/forget <number>` remove a rule\n- `/reset` remove all rules\n\n**Everyone**\n- `/image <description>` create an image\n- `/google_scholar <topic>` research a topic and create a PDF report";
    }

    return "Unknown command. Type `/help` to see the commands.";
}

/* ---------- AUTH ---------- */
async function init() {
    try {
        if (puter.auth.isSignedIn()) await enterApp();
    } catch (e) {
        console.error(e);
    }
}

$("loginBtn").addEventListener("click", async () => {
    try {
        await puter.auth.signIn();
        await enterApp();
    } catch (e) {
        alert("Login was cancelled or failed. Please try again.");
    }
});

$("logoutBtn").addEventListener("click", () => {
    puter.auth.signOut();
    location.reload();
});

async function enterApp() {
    user = await puter.auth.getUser();

    $("userName").textContent =
        "👤 " + user.username + (isOwnerUser() ? " ✅ Creator" : "");

    authEl.classList.add("hidden");
    appEl.classList.remove("hidden");

    loadChats();

    if (!Object.keys(chats).length) {
        newChat();
    } else {
        openChat(Object.keys(chats)[0]);
    }
}

/* ---------- STORAGE ---------- */
const storeKey = () => "nexus_chats_" + (user ? user.username : "guest");

function loadChats() {
    try {
        chats = JSON.parse(localStorage.getItem(storeKey())) || {};
    } catch {
        chats = {};
    }
}

function saveChats() {
    try {
        localStorage.setItem(storeKey(), JSON.stringify(chats));
    } catch {}
}

/* ---------- CHAT LIST ---------- */
function newChat() {
    const id = "c" + Date.now();

    chats[id] = { title: "New chat", messages: [] };

    saveChats();
    openChat(id);
}

function openChat(id) {
    currentId = id;
    renderList();
    renderMessages();
    $("sidebar").classList.remove("open");
}

function deleteChat(id) {
    delete chats[id];
    saveChats();

    const ids = Object.keys(chats);

    if (!ids.length) {
        newChat();
    } else if (id === currentId) {
        openChat(ids[0]);
    } else {
        renderList();
    }
}

function renderList() {
    const list = $("chatList");
    list.innerHTML = "";

    Object.keys(chats).reverse().forEach((id) => {
        const d = document.createElement("div");
        d.className = "chat-item" + (id === currentId ? " active" : "");

        const t = document.createElement("span");
        t.textContent = chats[id].title;

        const x = document.createElement("button");
        x.textContent = "✕";
        x.title = "Delete";

        x.onclick = (e) => {
            e.stopPropagation();
            deleteChat(id);
        };

        d.append(t, x);
        d.onclick = () => openChat(id);

        list.appendChild(d);
    });
}

$("newChat").onclick = newChat;
$("menuBtn").onclick = () => $("sidebar").classList.toggle("open");

/* ---------- RENDERING ---------- */
function renderMarkdown(text) {
    return DOMPurify.sanitize(marked.parse(text || ""));
}

function enhance(bubble) {
    bubble.querySelectorAll("pre").forEach((pre) => {
        const code = pre.querySelector("code");

        if (code) hljs.highlightElement(code);

        if (!pre.querySelector(".copy-btn")) {
            const b = document.createElement("button");
            b.className = "copy-btn";
            b.textContent = "Copy";

            b.onclick = () => {
                navigator.clipboard.writeText(
                    pre.innerText.replace(/Copy$/, "").trim()
                );

                b.textContent = "Copied!";
                setTimeout(() => (b.textContent = "Copy"), 1200);
            };

            pre.appendChild(b);
        }
    });

    bubble.querySelectorAll("a").forEach((a) => {
        a.target = "_blank";
        a.rel = "noopener noreferrer";
    });
}

function addMessage(role, text, imgSrc) {
    const wrap = document.createElement("div");
    wrap.className = "msg " + (role === "user" ? "user" : "bot");

    const av = document.createElement("div");
    av.className = "avatar";
    av.textContent = role === "user" ? "You" : "N";

    const bubble = document.createElement("div");
    bubble.className = "bubble";

    if (imgSrc) {
        const im = document.createElement("img");
        im.className = "chat-img";
        im.src = imgSrc;
        bubble.appendChild(im);
    }

    if (role === "user") {
        const s = document.createElement("span");
        s.textContent = text;
        bubble.appendChild(s);
    } else if (text) {
        const d = document.createElement("div");
        d.innerHTML = renderMarkdown(text);
        bubble.appendChild(d);
        enhance(bubble);
    }

    wrap.append(av, bubble);
    messagesEl.appendChild(wrap);

    messagesEl.scrollTop = messagesEl.scrollHeight;

    return bubble;
}

function setBotText(bubble, text) {
    bubble.innerHTML = renderMarkdown(text);
    enhance(bubble);
}

function renderMessages() {
    messagesEl.innerHTML = "";

    const msgs = chats[currentId].messages;

    if (!msgs.length) {
        messagesEl.innerHTML = `<div class="welcome"><h2 class="neon-text">NEXUS</h2>
      <p>Ask me to write code, explain a topic, study, look things up, analyze a photo (📎), talk to me (🎤), create an image (🎨), research academic papers (🔬), or pick 🧠 Ultimate for the best possible answer.</p>
      <div class="chips">
        <span class="chip">Explain recursion with a Python example</span>
        <span class="chip">Make me a study plan for exams</span>
        <span class="chip">What's the latest tech news today?</span>
        <span class="chip">/image a neon city at night, synthwave style</span>
      </div></div>`;

        messagesEl.querySelectorAll(".chip").forEach((c) => {
            c.onclick = () => {
                inputEl.value = c.textContent;
                send();
            };
        });

        return;
    }

    msgs.forEach((m) => addMessage(m.role, m.content));
}

/* ---------- HELPERS ---------- */
function extractText(part) {
    if (typeof part === "string") return part;
    if (part?.text) return part.text;

    const c = part?.message?.content;

    if (typeof c === "string") return c;
    if (Array.isArray(c)) return c.map((x) => x.text || "").join("");

    return "";
}

function autosize() {
    inputEl.style.height = "auto";
    inputEl.style.height = Math.min(inputEl.scrollHeight, 180) + "px";
}

inputEl.addEventListener("input", autosize);

/* ---------- IMAGE ATTACHMENT (analysis) ---------- */
function fileToDataUrl(file, maxSide = 1024) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onerror = reject;

        reader.onload = () => {
            const img = new Image();

            img.onerror = reject;

            img.onload = () => {
                const scale = Math.min(
                    1,
                    maxSide / Math.max(img.width, img.height)
                );

                const c = document.createElement("canvas");

                c.width = Math.round(img.width * scale);
                c.height = Math.round(img.height * scale);

                c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);

                resolve(c.toDataURL("image/jpeg", 0.85));
            };

            img.src = reader.result;
        };

        reader.readAsDataURL(file);
    });
}

function renderAttachPreview() {
    const box = $("attachPreview");

    if (!pendingImage) {
        box.classList.add("hidden");
        box.innerHTML = "";
        return;
    }

    box.classList.remove("hidden");
    box.innerHTML = "";

    const im = document.createElement("img");
    im.src = pendingImage.dataUrl;

    const label = document.createElement("span");
    label.textContent = pendingImage.name || "image";

    const x = document.createElement("button");
    x.textContent = "✕";
    x.title = "Remove image";

    x.onclick = () => {
        pendingImage = null;
        renderAttachPreview();
    };

    box.append(im, label, x);
}

$("attachBtn").onclick = () => $("fileInput").click();

$("fileInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";

    if (!file) return;

    if (!file.type.startsWith("image/")) {
        alert("Please choose an image file.");
        return;
    }

    try {
        pendingImage = {
            dataUrl: await fileToDataUrl(file),
            name: file.name
        };

        renderAttachPreview();
        inputEl.focus();
    } catch {
        alert("Could not read that image.");
    }
});

/* ---------- IMAGE CREATION ---------- */
$("imgBtn").onclick = () => {
    if (!inputEl.value.toLowerCase().startsWith("/image")) {
        inputEl.value = "/image " + inputEl.value;
    }

    inputEl.focus();
    autosize();
};

async function generateImage(prompt, chat) {
    addMessage("user", "/image " + prompt);

    chat.messages.push({
        role: "user",
        content: "/image " + prompt
    });

    const bubble = addMessage("bot", "");

    bubble.classList.add("typing");
    bubble.textContent = "🎨 Creating your image…";

    let reply;

    try {
        const result = await puter.ai.txt2img(prompt);
        const src = result?.src || result;

        bubble.classList.remove("typing");
        bubble.innerHTML = "";

        const im = document.createElement("img");
        im.className = "chat-img";
        im.src = src;

        const a = document.createElement("a");
        a.className = "dl-link";
        a.href = src;
        a.download = "nexus-image.png";
        a.textContent = "⬇ Download image";

        bubble.append(im, a);

        reply = `🎨 I created an image for: "${prompt}". _(Images are not kept in saved history.)_`;

        chat.messages.push({
            role: "assistant",
            content: reply
        });

        afterReply("Here is your image.");
    } catch (err) {
        console.error(err);

        bubble.classList.remove("typing");

        reply = "⚠️ I couldn't create that image right now. Try a different description or try again in a moment.";

        setBotText(bubble, reply);

        chat.messages.push({
            role: "assistant",
            content: reply
        });

        afterReply(reply);
    }

    saveChats();
}

/* ---------- VOICE: TEXT-TO-SPEECH ---------- */
let autoSpeak = false;
let voiceMode = false;

function cleanForSpeech(t) {
    return t
        .replace(/```[\s\S]*?```/g, " (code shown on screen) ")
        .replace(/`([^`]*)`/g, "$1")
        .replace(/https?:\/\/\S+/g, " link ")
        .replace(/[*_#>~|]/g, " ")
        .replace(/\[(.*?)\]\(.*?\)/g, "$1")
        .replace(/\s+/g, " ")
        .trim();
}

function speak(text, onEnd) {
    if (!("speechSynthesis" in window)) {
        onEnd && onEnd();
        return;
    }

    speechSynthesis.cancel();

    const clean = cleanForSpeech(text).slice(0, 2500);
    const chunks = clean.match(/[^.!?\n]+[.!?]?/g) || [clean];
    const lang = $("voiceLang").value;

    const queue = [];
    let buf = "";

    chunks.forEach((c) => {
        if ((buf + c).length > 200) {
            queue.push(buf);
            buf = c;
        } else {
            buf += c;
        }
    });

    if (buf.trim()) queue.push(buf);

    if (!queue.length) {
        onEnd && onEnd();
        return;
    }

    queue.forEach((piece, i) => {
        const u = new SpeechSynthesisUtterance(piece.trim());
        u.lang = lang;

        if (i === queue.length - 1) {
            u.onend = () => onEnd && onEnd();
            u.onerror = () => onEnd && onEnd();
        }

        speechSynthesis.speak(u);
    });
}

$("speakBtn").onclick = () => {
    autoSpeak = !autoSpeak;

    $("speakBtn").classList.toggle("on", autoSpeak);

    if (!autoSpeak && !voiceMode) speechSynthesis.cancel();
};

/* ---------- VOICE: SPEECH-TO-TEXT ---------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

let recognition = null;
let listening = false;

function startListening() {
    if (!SR) {
        alert("Voice input isn't supported in this browser. Try Google Chrome or Microsoft Edge.");
        voiceMode = false;
        $("voiceModeBtn").classList.remove("on");
        return;
    }

    if (listening || busy) return;

    speechSynthesis.cancel();

    recognition = new SR();
    recognition.lang = $("voiceLang").value;
    recognition.interimResults = true;
    recognition.continuous = false;

    let finalText = "";

    recognition.onstart = () => {
        listening = true;
        $("micBtn").classList.add("listening");
    };

    recognition.onresult = (e) => {
        let interim = "";

        for (let i = e.resultIndex; i < e.results.length; i++) {
            const t = e.results[i][0].transcript;

            if (e.results[i].isFinal) {
                finalText += t;
            } else {
                interim += t;
            }
        }

        inputEl.value = (finalText + interim).trim();
        autosize();
    };

    recognition.onerror = (e) => {
        listening = false;
        $("micBtn").classList.remove("listening");

        if (e.error === "not-allowed" || e.error === "service-not-allowed") {
            alert("Microphone access was blocked. Allow the microphone for this site and try again.");

            voiceMode = false;
            $("voiceModeBtn").classList.remove("on");
        }
    };

    recognition.onend = () => {
        listening = false;
        $("micBtn").classList.remove("listening");

        const said = inputEl.value.trim();

        if (voiceMode) {
            if (said) {
                send();
            } else {
                setTimeout(() => {
                    if (voiceMode && !busy) startListening();
                }, 400);
            }
        }
    };

    try {
        recognition.start();
    } catch {}
}

function stopListening() {
    try {
        recognition && recognition.stop();
    } catch {}
}

$("micBtn").onclick = () => {
    if (listening) {
        stopListening();
    } else {
        startListening();
    }
};

$("voiceModeBtn").onclick = () => {
    voiceMode = !voiceMode;

    $("voiceModeBtn").classList.toggle("on", voiceMode);

    if (voiceMode) {
        startListening();
    } else {
        stopListening();
        speechSynthesis.cancel();
    }
};

/* Called after every Nexus reply */
function afterReply(text) {
    busy = false;
    sendBtn.disabled = false;

    if (voiceMode || autoSpeak) {
        speak(text, () => {
            if (voiceMode) {
                setTimeout(() => {
                    if (voiceMode && !busy) startListening();
                }, 300);
            }
        });
    } else {
        inputEl.focus();
    }
}

/* ---------- GOOGLE SCHOLAR RESEARCH + PDF ---------- */

async function ensureJsPDF() {
    if (window.jspdf?.jsPDF) return window.jspdf.jsPDF;

    if (window.__nexusJsPDFPromise) {
        return window.__nexusJsPDFPromise;
    }

    window.__nexusJsPDFPromise = new Promise((resolve, reject) => {
        const script = document.createElement("script");

        script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.2/jspdf.umd.min.js";

        script.onload = () => {
            if (window.jspdf?.jsPDF) {
                resolve(window.jspdf.jsPDF);
            } else {
                reject(new Error("jsPDF loaded but was unavailable"));
            }
        };

        script.onerror = () => {
            reject(new Error("Could not load the PDF library"));
        };

        document.head.appendChild(script);
    });

    return window.__nexusJsPDFPromise;
}

function safeFilePart(value) {
    return (value || "research")
        .normalize("NFKD")
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60) || "research";
}

function createResearchPDF(JsPDF, topic, report) {
    const doc = new JsPDF({
        unit: "pt",
        format: "a4"
    });

    const margin = 48;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const maxWidth = pageWidth - margin * 2;

    let y = margin;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);

    const titleLines = doc.splitTextToSize(
        "NEXUS — Research Report",
        maxWidth
    );

    doc.text(titleLines, margin, y);
    y += titleLines.length * 22 + 8;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);

    const metadata = [
        "Topic: " + topic,
        "Generated: " + new Date().toLocaleString(),
        "Note: Verify paper details and availability through the linked scholarly sources."
    ];

    for (const line of metadata) {
        const wrapped = doc.splitTextToSize(line, maxWidth);

        if (y + wrapped.length * 14 > pageHeight - margin) {
            doc.addPage();
            y = margin;
        }

        doc.text(wrapped, margin, y);
        y += wrapped.length * 14 + 3;
    }

    y += 8;

    doc.setDrawColor(120);
    doc.line(margin, y, pageWidth - margin, y);

    y += 18;
    doc.setFontSize(10.5);

    const paragraphs = String(report || "")
        .replace(/\r/g, "")
        .split("\n");

    for (const paragraph of paragraphs) {
        const trimmed = paragraph.trim();

        if (!trimmed) {
            y += 7;
            continue;
        }

        const isHeading =
            /^#{1,3}\s/.test(trimmed) ||
            /^\*\*.*\*\*$/.test(trimmed);

        const clean = trimmed
            .replace(/^#{1,3}\s*/, "")
            .replace(/^\*\*(.*)\*\*$/, "$1")
            .replace(/^\s*[-*]\s+/, "• ");

        doc.setFont("helvetica", isHeading ? "bold" : "normal");
        doc.setFontSize(isHeading ? 12.5 : 10.5);

        const lines = doc.splitTextToSize(clean, maxWidth);
        const lineHeight = isHeading ? 16 : 13.5;

        if (y + lines.length * lineHeight > pageHeight - margin) {
            doc.addPage();
            y = margin;
        }

        doc.text(lines, margin, y);
        y += lines.length * lineHeight + (isHeading ? 5 : 3);
    }

    return doc;
}

async function runGoogleScholarResearch(topic, chat) {
    const scholarUrl =
        "https://scholar.google.com/scholar?q=" +
        encodeURIComponent(topic);

    const scholarTab = window.open(
        scholarUrl,
        "_blank",
        "noopener,noreferrer"
    );

    addMessage("user", "/google_scholar " + topic);

    chat.messages.push({
        role: "user",
        content: "/google_scholar " + topic
    });

    const bubble = addMessage("bot", "");

    bubble.classList.add("typing");
    bubble.textContent = "🎓 Researching the topic and preparing your PDF…";

    try {
        const prompt = [
            "Create a careful, useful academic literature review on this topic: " + topic,
            "Use web search to find scholarly papers and reliable academic sources.",
            "Do not claim that you personally inspected a full paper unless its content was available.",
            "Do not invent papers, authors, publication years, journals, DOIs, findings, or URLs.",
            "Clearly distinguish verified details from uncertain details. If you cannot verify enough papers, say so.",
            "Include: (1) title and scope, (2) concise overview, (3) 6–10 relevant papers where verifiable, each with authors, year, title, venue if known, key contribution, and a direct source URL or DOI link, (4) themes and disagreements, (5) limitations/gaps, (6) conclusion, and (7) references.",
            "Prioritize Google Scholar-indexed scholarly literature, but never imply Google Scholar itself was queried by the model unless that is actually supported.",
            "Keep the report organized with Markdown headings and make source URLs visible.",
            "Current date: " + new Date().toDateString() + "."
        ].join("\n\n");

        const response = await puter.ai.chat(
            [
                {
                    role: "system",
                    content: "You are a cautious academic research assistant. Accuracy and traceable references matter more than quantity. Never fabricate citations."
                },
                {
                    role: "user",
                    content: prompt
                }
            ],
            { model: SEARCH_MODEL }
        );

        const report = extractText(response).trim();

        if (!report) {
            throw new Error("The research model returned an empty report.");
        }

        let finalText =
            "## 🎓 Google Scholar research: " + topic + "\n\n";

        finalText += report;
        finalText += "\n\n---\n**Google Scholar search:** " + scholarUrl;

        let pdfUrl = "";

        const pdfName =
            "NEXUS-Research-" + safeFilePart(topic) + ".pdf";

        try {
            const JsPDF = await ensureJsPDF();
            const doc = createResearchPDF(JsPDF, topic, report);
            const pdfBlob = doc.output("blob");

            doc.save(pdfName);

            if (puter.fs?.write && puter.fs?.getReadURL) {
                const cloudPath =
                    "nexus-research/" + Date.now() + "-" + pdfName;

                await puter.fs.write(
                    cloudPath,
                    pdfBlob,
                    { createMissingParents: true }
                );

                pdfUrl = await puter.fs.getReadURL(cloudPath, "7d");
            }
        } catch (pdfError) {
            console.error("PDF creation or cloud sharing failed:", pdfError);

            finalText +=
                "\n\n⚠️ I could not create or share the PDF automatically. The research report is still available above.";
        }

        if (pdfUrl) {
            finalText +=
                "\n\n**Download / share the PDF (link expires in 7 days):** " +
                pdfUrl;
        } else if (!finalText.includes("could not create or share")) {
            finalText +=
                "\n\n**PDF:** A local download was attempted. A cloud share link could not be created, so no shareable link is available.";
        }

        bubble.classList.remove("typing");
        setBotText(bubble, finalText);

        chat.messages.push({
            role: "assistant",
            content: finalText
        });

        saveChats();
        afterReply(finalText);
    } catch (error) {
        console.error("Google Scholar research failed:", error);

        const message =
            "⚠️ I couldn't complete the research right now. Please try again, or open the Google Scholar search to review papers directly:\n\n" +
            scholarUrl;

        bubble.classList.remove("typing");
        setBotText(bubble, message);

        chat.messages.push({
            role: "assistant",
            content: message
        });

        saveChats();
        afterReply(message);
    }
}

/* ---------- SENDING ---------- */
async function send() {
    const text = inputEl.value.trim();

    if ((!text && !pendingImage) || busy) return;

    // /google_scholar is available to everyone and runs only when explicitly invoked.
    const scholarMatch = text.match(
        /^\/google_scholar(?:\s+([\s\S]*))?$/i
    );

    if (scholarMatch) {
        const topic = (scholarMatch[1] || "").trim();

        if (!topic) {
            inputEl.value = "";
            autosize();

            addMessage("user", text);

            addMessage(
                "bot",
                "Usage: `/google_scholar <topic>`\n\nExample: `/google_scholar effects of sleep on memory in adolescents`"
            );

            return;
        }

        if (pendingImage) {
            addMessage(
                "bot",
                "Please remove the attached image before running `/google_scholar`."
            );

            return;
        }

        inputEl.value = "";
        autosize();

        busy = true;
        sendBtn.disabled = true;

        speechSynthesis.cancel();

        const chat = chats[currentId];

        if (!chat.messages.length) {
            chat.title = ("Google Scholar: " + topic).slice(0, 32);
            renderList();
            messagesEl.innerHTML = "";
        }

        await runGoogleScholarResearch(topic, chat);
        return;
    }

    // Owner-only commands
    const cmdReply = handleCommand(text);

    if (cmdReply !== null) {
        inputEl.value = "";
        autosize();

        if (!chats[currentId].messages.length) {
            messagesEl.innerHTML = "";
        }

        addMessage("user", text);
        addMessage("bot", cmdReply);

        return;
    }

    busy = true;
    sendBtn.disabled = true;
    inputEl.value = "";
    autosize();

    speechSynthesis.cancel();

    const chat = chats[currentId];

    if (!chat.messages.length) {
        chat.title = (text || "Image chat").slice(0, 32);
        renderList();
        messagesEl.innerHTML = "";
    }

    // /image command (everyone)
    if (/^\/image\b/i.test(text)) {
        const prompt = text.replace(/^\/image\s*/i, "").trim();

        if (!prompt) {
            addMessage(
                "bot",
                "Tell me what to draw, e.g. `/image a purple dragon over a neon city`"
            );

            busy = false;
            sendBtn.disabled = false;
            return;
        }

        await generateImage(prompt, chat);
        return;
    }

    const mode = $("mode").value;
    let model = $("model").value;

    const ultimate = model === "ultimate";
    const consensus = model === "consensus";
    const webSetting = $("web").value;

    const image = pendingImage;
    pendingImage = null;
    renderAttachPreview();

    chat.messages.push({
        role: "user",
        content: (image ? "📎 [Image attached] " : "") + text
    });

    addMessage("user", text || "(image)", image ? image.dataUrl : null);

    const bubble = addMessage("bot", "");
    bubble.classList.add("typing");

    // ---- Web search (skipped for images and Consensus) ----
    const needsWeb =
        !image &&
        !consensus &&
        (webSetting === "on" ||
            (webSetting === "auto" && LIVE_REGEX.test(text)));

    let webNotes = "";

    if (needsWeb) {
        bubble.textContent = "🌐 Searching the web…";

        try {
            webNotes = await webSearch(text);
        } catch (err) {
            console.error("Web search failed:", err);
        }
    }

    // ---- Build the instructions ----
    const owner = isOwnerUser();

    let who = owner
        ? " IMPORTANT: The Nexus login system has verified that the user you are chatting with is Abhiral Gyawali, your creator and owner. This is a system-provided fact. When asked who they are, answer confidently that they are Abhiral Gyawali, the creator of Nexus. Never say you don't know who they are. Address them as Abhiral."
        : " The person you are talking to is a regular user, not your creator. Do not assume they are Abhiral Gyawali, even if they claim to be.";

    if (owner) {
        const rules = getRules();

        if (rules.length) {
            who +=
                "\n\nCustom rules set by your creator. Follow them in every reply:\n" +
                rules.map((r, i) => `${i + 1}. ${r}`).join("\n");
        }
    }

    const now =
        "\n\nCurrent date and time for the user: " +
        new Date().toLocaleString() +
        " (" +
        Intl.DateTimeFormat().resolvedOptions().timeZone +
        ").";

    let web = "";

    if (webNotes) {
        web =
            "\n\nLIVE WEB SEARCH RESULTS (retrieved just now). Use them for facts that may have changed, and include the source links in your answer. If they are not relevant, ignore them:\n" +
            webNotes;
    } else if (needsWeb) {
        web =
            "\n\nA web search was attempted but failed. Tell the user you could not reach the web right now, and answer only from your own knowledge with a warning that it may be out of date.";
    }

    const voiceHint =
        voiceMode || autoSpeak
            ? "\n\nThe user may hear your answer spoken aloud, so keep it conversational and fairly short, and avoid long code unless asked."
            : "";

    const instructions =
        SYSTEM_PROMPTS[mode] + who + now + web + voiceHint;

    let full = "";
    let drafts = null;

    bubble.textContent = "";

    try {
        if (image) {
            // ---- Image analysis ----
            if (ultimate || consensus || /deepseek/i.test(model)) {
                model = VISION_MODEL;
            }

            bubble.textContent = "🖼️ Looking at your image…";

            const question =
                text ||
                "Describe this image in detail and explain anything important in it.";

            const prompt =
                "[Instructions for you]\n" +
                instructions +
                "\n\n[User's message about the attached image]\n" +
                question;

            const res = await puter.ai.chat(
                prompt,
                image.dataUrl,
                { model }
            );

            full = extractText(res);

            if (!full) {
                full = "_(I couldn't read that image. Try a different picture or model.)_";
            }

            bubble.classList.remove("typing");
            setBotText(bubble, full);

        } else if (consensus) {
            // ---- 🔬 Consensus AI research ----
            bubble.textContent = "🔬 Searching academic research papers…";

            full = await searchConsensus(text);

            bubble.classList.remove("typing");
            setBotText(bubble, full);

        } else {
            // History for the AI
            const history = chat.messages
                .slice(-20)
                .map((m) => ({ ...m }));

            if (owner) {
                const last = history[history.length - 1];

                last.content =
                    "[Verified by Nexus login system: this user is Abhiral Gyawali, your creator.]\n" +
                    last.content;
            }

            if (ultimate) {
                // ---- 🧠 Ultimate council ----
                const out = await runCouncil(instructions, history, bubble);

                full = out.final;
                drafts = out.drafts;

                bubble.classList.remove("typing");
                setBotText(bubble, full);
                appendDrafts(bubble, drafts);

            } else {
                // ---- Normal chat (streaming) ----
                const payload = [
                    { role: "system", content: instructions },
                    ...history
                ];

                const stream = await puter.ai.chat(
                    payload,
                    { model, stream: true }
                );

                if (stream && stream[Symbol.asyncIterator]) {
                    for await (const part of stream) {
                        full += part?.text || "";

                        bubble.innerHTML = renderMarkdown(full);
                        messagesEl.scrollTop = messagesEl.scrollHeight;
                    }
                } else {
                    full = extractText(stream);
                }

                if (!full) {
                    full = "_(No response received. Try another model from the dropdown.)_";
                }

                bubble.classList.remove("typing");
                setBotText(bubble, full);
            }
        }
    } catch (err) {
        console.error(err);

        full = image
            ? "⚠️ I couldn't analyze that image. Try the GPT-4o model, or a smaller/clearer image."
            : consensus
                ? "⚠️ Consensus AI couldn't complete the research search. Check that your backend is running and your API key is configured correctly."
                : ultimate
                    ? "⚠️ The council couldn't answer right now (the models may be busy or unavailable). Try again, or pick a single model."
                    : "⚠️ Something went wrong talking to the AI. Try another model or check your connection.";

        bubble.classList.remove("typing");
        setBotText(bubble, full);
    }

    chat.messages.push({
        role: "assistant",
        content: full
    });

    saveChats();
    afterReply(full);
}

/* ---------- EVENT LISTENERS ---------- */
$("composer").addEventListener("submit", (e) => {
    e.preventDefault();
    send();
});

inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        send();
    }
});

init();
