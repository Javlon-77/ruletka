const socket = io();

const localVideo = document.getElementById("localVideo");
const remoteVideo = document.getElementById("remoteVideo");

const remotePlaceholder =
  document.getElementById("remotePlaceholder");

const statusText =
  document.getElementById("statusText");

const startButton =
  document.getElementById("startButton");

const nextButton =
  document.getElementById("nextButton");

const micButton =
  document.getElementById("micButton");

const cameraButton =
  document.getElementById("cameraButton");

const onlineCount =
  document.getElementById("onlineCount");

const connectionStatus =
  document.getElementById("connectionStatus");

const errorBox =
  document.getElementById("errorBox");

const statusCircle =
  document.querySelector(".status-circle");


let localStream = null;
let peerConnection = null;
let partnerId = null;

let started = false;
let waiting = false;

let microphoneEnabled = true;
let cameraEnabled = true;


// STUN serverlar.
// Internetdagi foydalanuvchilar bir-birini topishi uchun kerak.
const rtcConfiguration = {
  iceServers: [
    {
      urls: "stun:stun.l.google.com:19302"
    },
    {
      urls: "stun:stun1.l.google.com:19302"
    }
  ]
};


// --------------------------------------------------
// UI
// --------------------------------------------------

function setStatus(text, active = false) {
  connectionStatus.textContent = text;

  if (active) {
    statusCircle.classList.add("active");
  } else {
    statusCircle.classList.remove("active");
  }
}


function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.remove("hidden");
}


function hideError() {
  errorBox.textContent = "";
  errorBox.classList.add("hidden");
}


function showRemotePlaceholder(text) {
  statusText.textContent = text;
  remotePlaceholder.classList.remove("hidden");
}


function hideRemotePlaceholder() {
  remotePlaceholder.classList.add("hidden");
}


function clearRemoteVideo() {
  remoteVideo.srcObject = null;
  showRemotePlaceholder("Hamroh qidirilmoqda...");
}


function resetPeerConnection() {
  if (peerConnection) {
    peerConnection.ontrack = null;
    peerConnection.onicecandidate = null;
    peerConnection.onconnectionstatechange = null;

    peerConnection.close();
    peerConnection = null;
  }

  partnerId = null;
}


// --------------------------------------------------
// MEDIA
// --------------------------------------------------

async function startCamera() {
  hideError();

  if (localStream) {
    return true;
  }

  try {
    localStream =
      await navigator.mediaDevices.getUserMedia({
        video: {
          width: {
            ideal: 1280
          },
          height: {
            ideal: 720
          },
          facingMode: "user"
        },
        audio: true
      });

    localVideo.srcObject = localStream;

    microphoneEnabled = true;
    cameraEnabled = true;

    micButton.disabled = false;
    cameraButton.disabled = false;

    nextButton.disabled = false;

    setStatus("Kamera va mikrofon yoqildi", true);

    return true;

  } catch (error) {
    console.error(error);

    let message =
      "Kamera yoki mikrofonni ishga tushirib bo‘lmadi.";

    if (error.name === "NotAllowedError") {
      message =
        "Kamera va mikrofon uchun ruxsat bering.";
    }

    if (error.name === "NotFoundError") {
      message =
        "Kamera yoki mikrofon topilmadi.";
    }

    showError(message);

    return false;
  }
}


// --------------------------------------------------
// WEBRTC
// --------------------------------------------------

function createPeerConnection() {

  resetPeerConnection();

  peerConnection =
    new RTCPeerConnection(rtcConfiguration);

  if (localStream) {
    localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(
        track,
        localStream
      );
    });
  }


  peerConnection.onicecandidate = (event) => {

    if (!event.candidate) {
      return;
    }

    if (!partnerId) {
      return;
    }

    socket.emit("signal", {
      to: partnerId,
      data: {
        type: "candidate",
        candidate: event.candidate
      }
    });
  };


  peerConnection.ontrack = (event) => {

    const [stream] = event.streams;

    if (stream) {
      remoteVideo.srcObject = stream;

      hideRemotePlaceholder();

      setStatus(
        "Hamroh bilan bog‘landingiz",
        true
      );
    }
  };


  peerConnection.onconnectionstatechange = () => {

    if (!peerConnection) {
      return;
    }

    const state =
      peerConnection.connectionState;

    console.log(
      "WebRTC state:",
      state
    );

    if (state === "connected") {

      setStatus(
        "Hamroh bilan bog‘langan",
        true
      );

      hideRemotePlaceholder();
    }

    if (
      state === "failed" ||
      state === "disconnected"
    ) {

      setStatus(
        "Ulanish uzildi",
        false
      );
    }
  };

  return peerConnection;
}


async function createOffer() {

  if (!partnerId) {
    return;
  }

  const pc = createPeerConnection();

  try {

    const offer =
      await pc.createOffer();

    await pc.setLocalDescription(offer);

    socket.emit("signal", {
      to: partnerId,
      data: {
        type: "offer",
        offer
      }
    });

  } catch (error) {

    console.error(
      "Offer error:",
      error
    );
  }
}


async function handleOffer(offer) {

  const pc =
    peerConnection ||
    createPeerConnection();

  try {

    await pc.setRemoteDescription(
      new RTCSessionDescription(offer)
    );

    const answer =
      await pc.createAnswer();

    await pc.setLocalDescription(answer);

    socket.emit("signal", {
      to: partnerId,
      data: {
        type: "answer",
        answer
      }
    });

  } catch (error) {

    console.error(
      "Offer handling error:",
      error
    );
  }
}


async function handleAnswer(answer) {

  if (!peerConnection) {
    return;
  }

  try {

    await peerConnection.setRemoteDescription(
      new RTCSessionDescription(answer)
    );

  } catch (error) {

    console.error(
      "Answer error:",
      error
    );
  }
}


async function handleCandidate(candidate) {

  if (!peerConnection) {
    return;
  }

  try {

    await peerConnection.addIceCandidate(
      new RTCIceCandidate(candidate)
    );

  } catch (error) {

    console.error(
      "ICE candidate error:",
      error
    );
  }
}


// --------------------------------------------------
// SOCKET.IO
// --------------------------------------------------

socket.on("connect", () => {

  console.log(
    "Socket connected:",
    socket.id
  );
});


socket.on("disconnect", () => {

  setStatus(
    "Server bilan aloqa uzildi",
    false
  );

  showRemotePlaceholder(
    "Server bilan aloqa uzildi"
  );
});


socket.on("online-count", (count) => {

  onlineCount.textContent = count;
});


socket.on("waiting", () => {

  waiting = true;
  partnerId = null;

  resetPeerConnection();

  clearRemoteVideo();

  showRemotePlaceholder(
    "Hamroh qidirilmoqda..."
  );

  setStatus(
    "Hamroh qidirilmoqda...",
    false
  );
});


socket.on("matched", async ({ initiator }) => {

  waiting = false;

  hideError();

  showRemotePlaceholder(
    "Video ulanish yaratilmoqda..."
  );

  // Server bu userning partner ID'sini
  // signal kelganda aniqlaydi.
  //
  // Socket.IO orqali matched eventning o'zida
  // partner ID berilmayapti.
  //
  // Shu sababli keyingi signalni kutamiz.

  if (initiator) {

    setStatus(
      "Hamroh topildi. Ulanmoqda...",
      true
    );

    // Initiator bo‘lgani uchun offer yaratish
    // uchun serverdan partner ID kerak.
    //
    // Bu versiyada matched event ichiga
    // partner ID yuboriladi.
  }
});


socket.on("signal", async ({ from, data }) => {

  partnerId = from;

  if (data.type === "offer") {

    await handleOffer(
      data.offer
    );

    return;
  }


  if (data.type === "answer") {

    await handleAnswer(
      data.answer
    );

    return;
  }


  if (data.type === "candidate") {

    await handleCandidate(
      data.candidate
    );
  }
});


// Serverdan keladigan yangi matched eventni
// initiator bilan ishlatish uchun qo‘shimcha
// event handler.
socket.on("matched", async (info) => {

  // Birinchi matched listener bilan birga
  // ishlaydi.

  if (
    info &&
    info.partnerId
  ) {

    partnerId =
      info.partnerId;

    if (info.initiator) {
      await createOffer();
    }
  }
});


socket.on("partner-left", () => {

  resetPeerConnection();

  clearRemoteVideo();

  showRemotePlaceholder(
    "Hamrohingiz chatni tark etdi"
  );

  setStatus(
    "Yangi hamroh qidirish mumkin",
    false
  );

  // Avtomatik yangi odam qidirish
  // bir necha yuz ms dan keyin
  // boshlanadi.

  if (started) {

    setTimeout(() => {

      if (started) {
        findPartner();
      }

    }, 700);
  }
});


// --------------------------------------------------
// MATCHING
// --------------------------------------------------

function findPartner() {

  if (!started) {
    return;
  }

  resetPeerConnection();

  clearRemoteVideo();

  showRemotePlaceholder(
    "Hamroh qidirilmoqda..."
  );

  setStatus(
    "Hamroh qidirilmoqda...",
    false
  );

  socket.emit("find-partner");
}


// --------------------------------------------------
// START
// --------------------------------------------------

startButton.addEventListener(
  "click",
  async () => {

    if (started) {
      return;
    }

    const success =
      await startCamera();

    if (!success) {
      return;
    }

    started = true;

    startButton.disabled = true;

    startButton.textContent =
      "✓ Started";

    nextButton.disabled = false;

    findPartner();
  }
);


// --------------------------------------------------
// NEXT
// --------------------------------------------------

nextButton.addEventListener(
  "click",
  () => {

    if (!started) {
      return;
    }

    resetPeerConnection();

    clearRemoteVideo();

    showRemotePlaceholder(
      "Yangi hamroh qidirilmoqda..."
    );

    setStatus(
      "Yangi hamroh qidirilmoqda...",
      false
    );

    socket.emit("next");
  }
);


// --------------------------------------------------
// MICROPHONE
// --------------------------------------------------

micButton.addEventListener(
  "click",
  () => {

    if (!localStream) {
      return;
    }

    const tracks =
      localStream.getAudioTracks();

    if (!tracks.length) {
      return;
    }

    microphoneEnabled =
      !microphoneEnabled;

    tracks.forEach(
      (track) => {
        track.enabled =
          microphoneEnabled;
      }
    );

    micButton.textContent =
      microphoneEnabled
        ? "🎤"
        : "🔇";
  }
);


// --------------------------------------------------
// CAMERA
// --------------------------------------------------

cameraButton.addEventListener(
  "click",
  () => {

    if (!localStream) {
      return;
    }

    const tracks =
      localStream.getVideoTracks();

    if (!tracks.length) {
      return;
    }

    cameraEnabled =
      !cameraEnabled;

    tracks.forEach(
      (track) => {
        track.enabled =
          cameraEnabled;
      }
    );

    cameraButton.textContent =
      cameraEnabled
        ? "📹"
        : "🚫";
  }
);


// --------------------------------------------------
// PAGE CLOSE
// --------------------------------------------------

window.addEventListener(
  "beforeunload",
  () => {

    if (localStream) {

      localStream
        .getTracks()
        .forEach(
          (track) =>
            track.stop()
        );
    }

    if (peerConnection) {
      peerConnection.close();
    }
  }
);
