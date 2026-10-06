const express=require("express");
const http=require("http");
const path=require("path");
const {Server}=require("socket.io");
const app=express();
const server=http.createServer(app);
const io=new Server(server,{cors:{origin:"*"}});
const PORT=process.env.PORT||3000;
const waitingUsers=new Set();
const partners=new Map();
let onlineUsers=0;

app.use(express.static(__dirname));
app.get("/health",(req,res)=>res.json({status:"ok",online:onlineUsers,waiting:waitingUsers.size}));

function removeWaiting(id){waitingUsers.delete(id)}
function getWaiting(exclude){
  for(const id of waitingUsers){
    if(id!==exclude&&io.sockets.sockets.has(id))return id;
    waitingUsers.delete(id);
  }
  return null;
}
function endPair(id,notify=true){
  const other=partners.get(id);if(!other)return null;
  partners.delete(id);partners.delete(other);
  const s=io.sockets.sockets.get(other);
  if(s&&notify)s.emit("partner-left");
  return other;
}
function findMatch(socket){
  removeWaiting(socket.id);
  if(partners.has(socket.id))endPair(socket.id);
  const otherId=getWaiting(socket.id);
  if(!otherId){waitingUsers.add(socket.id);socket.emit("waiting");return}
  removeWaiting(otherId);
  const other=io.sockets.sockets.get(otherId);
  if(!other){waitingUsers.add(socket.id);socket.emit("waiting");return}
  partners.set(socket.id,otherId);partners.set(otherId,socket.id);
  socket.emit("matched",{partnerId:otherId,initiator:true});
  other.emit("matched",{partnerId:socket.id,initiator:false});
}
io.on("connection",socket=>{
  onlineUsers++;io.emit("online-count",onlineUsers);
  socket.on("find-partner",()=>findMatch(socket));
  socket.on("signal",({to,data}={})=>{
    if(!to||partners.get(socket.id)!==to)return;
    const target=io.sockets.sockets.get(to);if(target)target.emit("signal",{from:socket.id,data});
  });
  socket.on("next",()=>{
    removeWaiting(socket.id);
    const other=endPair(socket.id);
    if(other){const s=io.sockets.sockets.get(other);if(s)s.emit("partner-left")}
    findMatch(socket);
  });
  socket.on("disconnect",()=>{
    removeWaiting(socket.id);const other=partners.get(socket.id);
    if(other){partners.delete(socket.id);partners.delete(other);const s=io.sockets.sockets.get(other);if(s)s.emit("partner-left")}
    onlineUsers=Math.max(0,onlineUsers-1);io.emit("online-count",onlineUsers);
  });
});
server.listen(PORT,()=>console.log(`Ruletka server running on port ${PORT}`));
