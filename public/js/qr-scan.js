// In-app QR scanner. Reads a SpaceHub facility code and opens /checkin/<token> on THIS site,
// ignoring whatever domain was printed in the code.
(function () {
  var TOKEN = /(?:^|[^a-f0-9])([a-f0-9]{32})(?![a-f0-9])/i;
  function tokenFrom(text) {
    var m = TOKEN.exec(String(text || "").trim());
    return m ? m[1].toLowerCase() : null;
  }
  function go(token) { window.location.href = "/checkin/" + token; }

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
    if (t) { err.hidden = true; go(t); } else { err.hidden = false; input.focus(); }
  });

  var stream = null, stopped = false;
  function stop() { stopped = true; if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); }

  if (!("BarcodeDetector" in window) || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    status.textContent = "Camera scanning isn't supported in this browser. Use your phone's camera app to scan, or paste the link below.";
    return;
  }
  if (!window.isSecureContext) {
    status.textContent = "Camera scanning needs a secure (HTTPS) connection. Paste the link below instead.";
    return;
  }

  var detector;
  try { detector = new window.BarcodeDetector({ formats: ["qr_code"] }); }
  catch (e) { status.textContent = "Camera scanning isn't available. Paste the link below instead."; return; }

  startBtn.hidden = false;
  status.textContent = "Tap Open Camera, then point it at the QR code.";

  startBtn.addEventListener("click", function () {
    startBtn.hidden = true;
    status.textContent = "Starting camera…";
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false })
      .then(function (s) {
        stream = s; video.srcObject = s; view.hidden = false;
        return video.play();
      })
      .then(function () {
        status.textContent = "Point the camera at the QR code.";
        (function tick() {
          if (stopped) return;
          detector.detect(video).then(function (codes) {
            for (var i = 0; i < codes.length; i++) {
              var t = tokenFrom(codes[i].rawValue);
              if (t) { stop(); status.textContent = "Code found…"; go(t); return; }
            }
            setTimeout(tick, 250);
          }).catch(function () { setTimeout(tick, 400); });
        })();
      })
      .catch(function () {
        view.hidden = true; startBtn.hidden = false;
        status.textContent = "Camera access was blocked. Allow camera permission or paste the link below.";
      });
  });
  window.addEventListener("pagehide", stop);
})();
