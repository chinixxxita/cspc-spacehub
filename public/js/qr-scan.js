
(function () {
  var TOKEN = /(?:^|[^a-f0-9])([a-f0-9]{32})(?![a-f0-9])/i;

  function tokenFrom(text) {
    var m = TOKEN.exec(String(text || "").trim());
    return m ? m[1].toLowerCase() : null;
  }

  function go(token) {
    window.location.href = "/checkin/" + token;
  }

  var form = document.getElementById("scanner-form");
  var input = document.getElementById("scanner-input");
  var err = document.getElementById("scanner-error");
  var status = document.getElementById("scanner-status");
  var startBtn = document.getElementById("scanner-start");
  var view = document.getElementById("scanner-view");
  var video = document.getElementById("scanner-video");

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var t = tokenFrom(input.value);

    if (t) {
      err.hidden = true;
      go(t);
    } else {
      err.hidden = false;
      input.focus();
    }
  });

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    status.textContent = "Camera unavailable. Use a supported browser or enter the QR token below.";
    return;
  }

  if (!window.isSecureContext) {
    status.textContent = "Camera scanning requires HTTPS. Enter the QR token below instead.";
    return;
  }

  if (typeof window.jsQR !== "function") {
    status.textContent = "QR scanner could not load. Check your internet connection.";
    return;
  }

  var stream = null;
  var stopped = false;
  var canvas = document.createElement("canvas");
  var ctx = canvas.getContext("2d", { willReadFrequently: true });

  function stop() {
    stopped = true;
    if (stream) {
      stream.getTracks().forEach(function (track) {
        track.stop();
      });
    }
  }

  startBtn.hidden = false;
  status.textContent = "Tap Open Camera to scan the facility QR code.";

  startBtn.addEventListener("click", function () {
    startBtn.hidden = true;
    status.textContent = "Starting camera...";

    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false
    })
    .then(function (s) {
      stream = s;
      video.srcObject = s;
      view.hidden = false;
      return video.play();
    })
    .then(function () {
      status.textContent = "Point the camera at the facility QR code.";

      function scan() {
        if (stopped) return;

        if (video.readyState >= 2 && video.videoWidth > 0) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;

          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

          var image = ctx.getImageData(0, 0, canvas.width, canvas.height);
          var result = window.jsQR(
            image.data,
            image.width,
            image.height,
            { inversionAttempts: "dontInvert" }
          );

          if (result) {
            var token = tokenFrom(result.data);

            if (token) {
              stop();
              status.textContent = "QR code detected. Opening check-in...";
              go(token);
              return;
            }
          }
        }

        setTimeout(scan, 150);
      }

      scan();
    })
   .catch(function (error) {
  console.error("SpaceHub camera error:", error);

  view.hidden = true;
  startBtn.hidden = false;

  var messages = {
    NotAllowedError: "Camera permission denied. Check Chrome and Windows camera permissions.",
    NotFoundError: "No camera was detected on this device.",
    NotReadableError: "The camera is being used by another application.",
    OverconstrainedError: "The selected camera does not support the requested settings.",
    SecurityError: "Camera access is blocked by browser security settings."
  };

  status.textContent =
    messages[error.name] ||
    "Camera error: " + error.name + ". " + error.message;
});
});

  window.addEventListener("pagehide", stop);
})();
