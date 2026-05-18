let currentChat = "default";
const chatBox = document.getElementById("chat");

let userInfo = null;
let typingBubble = null;

async function loadUser() {
  const res = await fetch("/me", {
    credentials: "include",
    cache: "no-store"
  });

  const data = await res.json();
  const label = document.getElementById("loggedUser");

  if (data && data.email) {
    userInfo = data;
    label.innerText = "Logged in as: " + data.email;
  } else {
    userInfo = null;
    label.innerText = "Logged in as: Guest";
  }
}

window.addEventListener("load", async () => {
  await loadUser();
  await loadChats();
});

function formatText(text) {
  return text
    .replace(/### (.*)/g, "<h3>$1</h3>")
    .replace(/\*\*(.*?)\*\*/g, "<b>$1</b>")
    .replace(/\n/g, "<br>");
}

function addMsg(text, type) {
  const welcome = document.getElementById("welcomeScreen");
  if (welcome) welcome.remove();

  const row = document.createElement("div");
  row.className = "msg-row " + type;

  const icon = document.createElement("img");
  icon.className = "msg-icon";
  icon.src =
    type === "user"
      ? userInfo?.picture || "default-user.png"
      : "Hooked.AI.png";

  const bubble = document.createElement("div");
  bubble.className = "msg " + type;
  bubble.innerHTML =
    type === "bot"
      ? formatText(text)
      : text;

  if (type === "user") {
    row.appendChild(bubble);
    row.appendChild(icon);
  } else {
    row.appendChild(icon);
    row.appendChild(bubble);
  }

  chatBox.appendChild(row);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function showTyping() {
  typingBubble = document.createElement("div");
  typingBubble.className = "msg-row bot";

  typingBubble.innerHTML = `
    <img class="msg-icon" src="Hooked.AI.png">
    <div class="msg bot">
      <div style="display:flex; gap:4px;">
        <div class="dot"></div>
        <div class="dot"></div>
        <div class="dot"></div>
      </div>
    </div>
  `;

  chatBox.appendChild(typingBubble);
}

function hideTyping() {
  if (typingBubble) {
    typingBubble.remove();
    typingBubble = null;
  }
}

function showChatStart(chatName) {
  const div = document.createElement("div");
  div.style.margin = "20px 0";
  div.style.color = "#777";
  div.style.display = "flex";
  div.style.justifyContent = "space-between";
  div.innerHTML = `
    <div>This is the beginning of "${chatName}" with Hooked.AI.</div>
    <div>
      <button onclick="downloadCurrentChat()">📄</button>
      <button onclick="deleteCurrentChat()">🗑</button>
    </div>
  `;
  chatBox.appendChild(div);
}

async function send() {
  const input = document.getElementById("msg");
  const msg = input.value.trim();
  if (!msg) return;

  if (!currentChat || currentChat === "default") {
    const newRes = await fetch("/newchat", {
      method: "POST",
      credentials: "include"
    });

    const newData = await newRes.json();
    currentChat = newData.chatId;
    await loadChats();
    chatBox.innerHTML = "";
  }

  addMsg(msg, "user");
  input.value = "";

  showTyping();

  const res = await fetch("/chat", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: msg,
      chatId: currentChat
    })
  });

  const data = await res.json();

  hideTyping();
  addMsg(data.reply || "No response", "bot");
}

async function loadChats() {
  const res = await fetch("/chats", {
    credentials: "include"
  });

  const data = await res.json();
  const list = document.getElementById("chatList");
  list.innerHTML = "";

  Object.keys(data).forEach(id => {
    const item = document.createElement("div");
    item.className = "chat-item";

    item.innerHTML = `
      <div class="chat-name">${data[id].title}</div>
      <div class="chat-actions">
        <button class="chat-btn" onclick="renameChat('${id}')">✏</button>
        <button class="chat-btn" onclick="deleteChat('${id}')">🗑</button>
      </div>
    `;

    item.querySelector(".chat-name").onclick =
      () => openChat(id, data[id]);

    list.appendChild(item);
  });
}

function openChat(id, chat) {
  currentChat = id;
  chatBox.innerHTML = "";

  document.getElementById("chatTitle").innerText =
    chat.title;

  // Show beginning message FIRST (top)
  showChatStart(chat.title);

  // Then show all chat messages underneath it
  chat.messages.forEach(m => {
    addMsg(
      m.content,
      m.role === "user"
        ? "user"
        : "bot"
    );
  });

  chatBox.scrollTop = 0;
}

async function newChat() {
  const res = await fetch("/newchat", {
    method: "POST",
    credentials: "include"
  });

  const data = await res.json();

  await loadChats();
  currentChat = data.chatId;
  chatBox.innerHTML = `
    <div class="welcome" id="welcomeScreen">
      <img src="Hooked.AI.png">
      <h2>Tell us what you want to get hooked on.</h2>
    </div>
  `;
}

async function renameChat(id) {
  const name = prompt("Rename chat:");
  if (!name) return;

  await fetch("/renamechat", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type":"application/json"
    },
    body: JSON.stringify({
      chatId:id,
      title:name
    })
  });

  loadChats();
}

async function deleteChat(id) {
  await fetch("/deletechat", {
    method:"POST",
    credentials:"include",
    headers:{
      "Content-Type":"application/json"
    },
    body: JSON.stringify({
      chatId:id
    })
  });

  loadChats();
}

function deleteCurrentChat() {
  deleteChat(currentChat);
}

async function downloadCurrentChat() {
  const res = await fetch("/chats", {
    credentials:"include"
  });

  const chats = await res.json();
  const chat = chats[currentChat];
  if (!chat) return;

  let text = "";

  chat.messages.forEach(m => {
    text +=
      (m.role==="user"
        ? "You: "
        : "Hooked.AI: ")
      + m.content + "\n\n";
  });

  const blob = new Blob(
    [text],
    {type:"text/plain"}
  );

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = chat.title + ".txt";
  a.click();
}

function login() {
  window.location.href = "/auth/google";
}