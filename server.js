const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

const PORT = process.env.PORT || 3000;

// Har bir kutayotgan user
const waitingUsers = new Set();

// Kim kim bilan ulanganini saqlash
const partners = new Map();

// Statistika
let onlineUsers = 0;

app.use(express.static(path.join(__dirname, "public")));

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    online: onlineUsers
  });
});

function removeFromWaiting(socketId) {
  waitingUsers.delete(socketId);
}

function getWaitingUser(excludeId) {
  for (const id of waitingUsers) {
    if (id !== excludeId && io.sockets.sockets.has(id)) {
      return id;
    }

    waitingUsers.delete(id);
  }

  return null;
}

function disconnectPartner(socketId) {
  const partnerId = partners.get(socketId);

  if (!partnerId) {
    return;
  }

  partners.delete(socketId);
  partners.delete(partnerId);

  const partner = io.sockets.sockets.get(partnerId);

  if (partner) {
    partner.emit("partner-left");
  }
}

function findMatch(socket) {
  removeFromWaiting(socket.id);

  // Agar allaqachon partner bor bo'lsa
  if (partners.has(socket.id)) {
    disconnectPartner(socket.id);
  }

  const partnerId = getWaitingUser(socket.id);

  if (!partnerId) {
    waitingUsers.add(socket.id);
    socket.emit("waiting");
    return;
  }

  removeFromWaiting(partnerId);

  const partner = io.sockets.sockets.get(partnerId);

  if (!partner) {
    waitingUsers.add(socket.id);
    socket.emit("waiting");
    return;
  }

  partners.set(socket.id, partnerId);
  partners.set(partnerId, socket.id);

  // Qaysi user offer yaratishini belgilaymiz
  socket.emit("matched", {
    initiator: true
  });

  partner.emit("matched", {
    initiator: false
  });
}

io.on("connection", (socket) => {
  onlineUsers++;

  io.emit("online-count", onlineUsers);

  console.log(`User connected: ${socket.id}`);
  console.log(`Online: ${onlineUsers}`);

  socket.on("find-partner", () => {
    findMatch(socket);
  });

  socket.on("signal", ({ to, data }) => {
    if (!to) return;

    const target = io.sockets.sockets.get(to);

    if (!target) return;

    // Faqat haqiqiy partnerga signal yuboriladi
    if (partners.get(socket.id) !== to) {
      return;
    }

    target.emit("signal", {
      from: socket.id,
      data
    });
  });

  socket.on("next", () => {
    const partnerId = partners.get(socket.id);

    removeFromWaiting(socket.id);

    if (partnerId) {
      partners.delete(socket.id);
      partners.delete(partnerId);

      const partner = io.sockets.sockets.get(partnerId);

      if (partner) {
        partner.emit("partner-left");
      }
    }

    findMatch(socket);
  });

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);

    removeFromWaiting(socket.id);

    const partnerId = partners.get(socket.id);

    if (partnerId) {
      partners.delete(socket.id);
      partners.delete(partnerId);

      const partner = io.sockets.sockets.get(partnerId);

      if (partner) {
        partner.emit("partner-left");
      }
    }

    onlineUsers = Math.max(0, onlineUsers - 1);

    io.emit("online-count", onlineUsers);

    console.log(`Online: ${onlineUsers}`);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
