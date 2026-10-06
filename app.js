const socket=io({transports:["websocket","polling"]});
const $=id=>document.getElementById(id);
const localVideo=$("localVideo"),remoteVideo=$("remoteVideo"),remotePlaceholder=$("remotePlaceholder"),localPlaceholder=$("localPlaceholder");
const statusText=$("statusText"),startButton=$("startButton"),nextButton=$("nextButton"),micButton=$("micButton"),cameraButton=$("cameraButton");
const onlineCount=$("onlineCount"),connectionStatus=$("connectionStatus"),statusCircle=$("statusCircle"),errorBox=$("errorBox");
let localStream=null,peerConnection=null,partnerId=null,started=false,waiting=false,micOn=true,cameraOn=true;
let pendingCandidates=[];
const rtcConfig={iceServers:[{urls:"stun:stun.l.google.com:19302"},{urls:"stun:stun1.l.google.com:19302"}]};

function setStatus(text,active=false){connectionStatus.textContent=text;statusCircle.classList.toggle("active",active)}
function error(message){errorBox.textContent=message;errorBox.classList.remove("hidden")}
function clearError(){errorBox.textContent="";errorBox.classList.add("hidden")}
function remoteState(text){statusText.textContent=text;remotePlaceholder.classList.remove("hidden")}
function hideRemote(){remotePlaceholder.classList.add("hidden")}
function clearRemote(){remoteVideo.srcObject=null;remoteState("Hamroh qidirilmoqda...")}
function closePeer(){if(peerConnection){peerConnection.ontrack=null;peerConnection.onicecandidate=null;peerConnection.onconnectionstatechange=null;peerConnection.close();peerConnection=null}partnerId=null;pendingCandidates=[]}
function showLocal(show){localPlaceholder.classList.toggle("hidden",show)}

async function startCamera(){
  clearError();
  if(localStream)return true;
  if(!navigator.mediaDevices?.getUserMedia){error("Brauzeringiz kamera/mikrofonni qo‘llab-quvvatlamaydi yoki sahifa HTTPS orqali ochilmagan.");return false}
  try{
    localStream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1280},height:{ideal:720},facingMode:"user"},audio:true});
    localVideo.srcObject=localStream;showLocal(true);micOn=true;cameraOn=true;
    micButton.disabled=false;cameraButton.disabled=false;nextButton.disabled=false;
    setStatus("Kamera va mikrofon yoqildi",true);return true;
  }catch(e){
    console.error(e);
    const msg=e.name==="NotAllowedError"?"Kamera va mikrofon uchun ruxsat bering.":e.name==="NotFoundError"?"Kamera yoki mikrofon topilmadi.":"Kamera/mikrofonni ishga tushirib bo‘lmadi.";
    error(msg);return false;
  }
}
function createPeer(){
  closePeer();
  const pc=new RTCPeerConnection(rtcConfig);peerConnection=pc;
  localStream?.getTracks().forEach(t=>pc.addTrack(t,localStream));
  pc.onicecandidate=e=>{if(e.candidate&&partnerId)socket.emit("signal",{to:partnerId,data:{type:"candidate",candidate:e.candidate}})};
  pc.ontrack=e=>{if(e.streams[0]){remoteVideo.srcObject=e.streams[0];hideRemote();setStatus("Hamroh bilan bog‘landingiz",true)}};
  pc.onconnectionstatechange=()=>{
    if(!peerConnection||pc!==peerConnection)return;
    if(pc.connectionState==="connected"){hideRemote();setStatus("Hamroh bilan bog‘langan",true)}
    if(["failed","disconnected","closed"].includes(pc.connectionState))setStatus("Ulanish uzildi",false);
  };
  return pc;
}
async function makeOffer(){
  if(!partnerId)return;
  const pc=createPeer();
  try{const offer=await pc.createOffer();await pc.setLocalDescription(offer);socket.emit("signal",{to:partnerId,data:{type:"offer",offer}})}
  catch(e){console.error("offer",e)}
}
async function handleOffer(offer){
  const pc=peerConnection||createPeer();
  try{
    await pc.setRemoteDescription(offer);
    for(const c of pendingCandidates)await pc.addIceCandidate(c).catch(()=>{});pendingCandidates=[];
    const answer=await pc.createAnswer();await pc.setLocalDescription(answer);
    socket.emit("signal",{to:partnerId,data:{type:"answer",answer}});
  }catch(e){console.error("handle offer",e)}
}
async function handleAnswer(answer){
  if(!peerConnection)return;
  try{await peerConnection.setRemoteDescription(answer);for(const c of pendingCandidates)await peerConnection.addIceCandidate(c).catch(()=>{});pendingCandidates=[]}
  catch(e){console.error("answer",e)}
}
async function handleCandidate(candidate){
  const c=new RTCIceCandidate(candidate);
  if(peerConnection?.remoteDescription?.type){await peerConnection.addIceCandidate(c).catch(console.error)}else pendingCandidates.push(c);
}

socket.on("connect",()=>{clearError();console.log("Connected",socket.id)});
socket.on("disconnect",()=>{if(started){setStatus("Server bilan aloqa uzildi",false);remoteState("Server bilan aloqa uzildi")}});
socket.on("online-count",n=>onlineCount.textContent=n);
socket.on("waiting",()=>{waiting=true;clearRemote();setStatus("Hamroh qidirilmoqda...",false)});
socket.on("matched",async info=>{
  waiting=false;clearError();partnerId=info.partnerId;remoteState("Video ulanish yaratilmoqda...");setStatus("Hamroh topildi. Ulanmoqda...",true);
  if(info.initiator)await makeOffer();
});
socket.on("signal",async({from,data})=>{
  if(partnerId!==from){partnerId=from}
  if(data.type==="offer")return handleOffer(data.offer);
  if(data.type==="answer")return handleAnswer(data.answer);
  if(data.type==="candidate")return handleCandidate(data.candidate);
});
socket.on("partner-left",()=>{closePeer();clearRemote();setStatus("Hamroh chatni tark etdi",false);if(started)setTimeout(findPartner,450)});
function findPartner(){if(!started)return;closePeer();clearRemote();remoteState("Hamroh qidirilmoqda...");setStatus("Hamroh qidirilmoqda...",false);socket.emit("find-partner")}
startButton.onclick=async()=>{if(started)return;if(!(await startCamera()))return;started=true;startButton.disabled=true;startButton.innerHTML="<span>✓</span> Started";nextButton.disabled=false;findPartner()};
nextButton.onclick=()=>{if(!started)return;socket.emit("next");closePeer();clearRemote();setStatus("Yangi hamroh qidirilmoqda...",false)};
micButton.onclick=()=>{if(!localStream)return;micOn=!micOn;localStream.getAudioTracks().forEach(t=>t.enabled=micOn);micButton.textContent=micOn?"🎤":"🔇"};
cameraButton.onclick=()=>{if(!localStream)return;cameraOn=!cameraOn;localStream.getVideoTracks().forEach(t=>t.enabled=cameraOn);cameraButton.textContent=cameraOn?"📹":"🚫";localPlaceholder.classList.toggle("hidden",cameraOn)};
window.addEventListener("beforeunload",()=>{localStream?.getTracks().forEach(t=>t.stop());peerConnection?.close()});
