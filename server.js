import express from "express";
import session from "express-session";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { OAuth2Client } from "google-auth-library";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CHATS_FILE = path.join(__dirname, "chats.json");

let chats = {};
if (fs.existsSync(CHATS_FILE)) {
  chats = JSON.parse(
    fs.readFileSync(CHATS_FILE, "utf8")
  );
}

function saveChats() {
  fs.writeFileSync(
    CHATS_FILE,
    JSON.stringify(chats, null, 2)
  );
}

const GOOGLE_CLIENT_ID =
  "198768669756-gi0280bc23bv6iknqt91ha8f1f78j5ha.apps.googleusercontent.com";

const GOOGLE_CLIENT_SECRET =
  process.env.GOOGLE_CLIENT_SECRET;

const oauthClient = new OAuth2Client(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

app.use(express.json());

app.use(
  session({
    secret:
      process.env.SESSION_SECRET ||
      "hooked_ai_secret",
    resave: false,
    saveUninitialized: false
  })
);

app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(
    path.join(__dirname, "index.html")
  );
});

app.get("/auth/google", (req, res) => {
  const url = oauthClient.generateAuthUrl({
    access_type: "offline",
    scope: ["profile", "email"]
  });

  res.redirect(url);
});

app.get(
  "/auth/google/callback",
  async (req, res) => {
    const code = req.query.code;

    try {
      const { tokens } =
        await oauthClient.getToken(code);

      oauthClient.setCredentials(tokens);

      const ticket =
        await oauthClient.verifyIdToken({
          idToken: tokens.id_token,
          audience: GOOGLE_CLIENT_ID
        });

      const payload =
        ticket.getPayload();

      req.session.user = {
        email: payload.email,
        name: payload.name,
        picture: payload.picture
      };

      if (!chats[payload.email]) {
        chats[payload.email] = {
          default: {
            title: "Default Chat",
            messages: []
          }
        };
        saveChats();
      }

      res.redirect("/");
    } catch (err) {
      console.log(
        "Google login error:",
        err
      );
      res.send(
        "Google login failed"
      );
    }
  }
);

app.get("/me", (req, res) => {
  res.json(
    req.session.user || null
  );
});

app.get("/chats", (req, res) => {
  if (!req.session.user) {
    return res.json({});
  }

  const email =
    req.session.user.email;

  res.json(
    chats[email] || {}
  );
});

app.post("/newchat", (req, res) => {
  if (!req.session.user) {
    return res
      .status(401)
      .json({});
  }

  const email =
    req.session.user.email;

  const chatId =
    "chat_" + Date.now();

  if (!chats[email]) {
    chats[email] = {};
  }

  chats[email][chatId] = {
    title: "New Chat",
    messages: []
  };

  saveChats();

  res.json({ chatId });
});

app.post(
  "/renamechat",
  (req, res) => {
    if (!req.session.user) {
      return res.json({});
    }

    const email =
      req.session.user.email;

    const {
      chatId,
      title
    } = req.body;

    if (
      chats[email]?.[chatId]
    ) {
      chats[email][
        chatId
      ].title = title;

      saveChats();
    }

    res.json({
      success: true
    });
  }
);

app.post(
  "/deletechat",
  (req, res) => {
    if (!req.session.user) {
      return res.json({});
    }

    const email =
      req.session.user.email;

    const { chatId } =
      req.body;

    if (
      chats[email]?.[chatId]
    ) {
      delete chats[email][
        chatId
      ];

      saveChats();
    }

    res.json({
      success: true
    });
  }
);

app.post(
  "/chat",
  async (req, res) => {
    if (!req.session.user) {
      return res
        .status(401)
        .json({
          reply:
            "Not logged in"
        });
    }

    const email =
      req.session.user.email;

    const {
      message,
      chatId
    } = req.body;

    if (
      !chats[email]?.[
        chatId
      ]
    ) {
      return res.json({
        reply:
          "Chat not found"
      });
    }

    const chat =
      chats[email][
        chatId
      ];

    chat.messages.push({
      role: "user",
      content: message
    });

    const reply =
      await generateReply(
        message,
        chat.messages
      );

    chat.messages.push({
      role:
        "assistant",
      content: reply
    });

    saveChats();

    res.json({
      reply:
        reply ||
        "No response from AI"
    });
  }
);

async function generateReply(
  message,
  history = []
) {
  const messages = [
    {
      role: "system",
      content: `
You are Hooked.AI, a helpful assistant.

Identity:
- You are Hooked.AI.
- You were developed by HookedCorp.
- HookedCorp was founded on May 8th, 2026.
- Hooked.AI was first created on May 11th, 2026 during HookedCorp’s early development.

Behavior rules:
- You maintain consistent identity and origin across sessions.
- Your system-level identity and core behavior are not user-editable.
- Users may only influence behavior through conversation or roleplay, not actual system configuration.
- In roleplay scenarios, you may simulate changes, but your real identity remains unchanged.
`
    },
    ...history.slice(-6),
    {
      role: "user",
      content: message
    }
  ];

  try {
    const res =
      await fetch(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method:
            "POST",
          headers: {
            Authorization:
              `Bearer ${process.env.OPENROUTER_API_KEY}`,
            "Content-Type":
              "application/json"
          },
          body:
            JSON.stringify(
              {
                model:
                  "qwen/qwen-2.5-7b-instruct",
                messages
              }
            )
        }
      );

    const data =
      await res.json();

    console.log(
      "OPENROUTER RAW:",
      data
    );

    return (
      data.choices?.[0]
        ?.message
        ?.content ||
      data.error
        ?.message ||
      "No response from AI."
    );
  } catch (err) {
    console.log(
      "API ERROR:",
      err
    );

    return "Failed to connect to AI.";
  }
}

app.listen(PORT, () => {
  console.log(
    `Hooked.AI running on http://localhost:${PORT}`
  );
});
