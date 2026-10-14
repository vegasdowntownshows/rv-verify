/**
 * RV VERIFY - Client-Side Multi-Vector Fingerprinting Engine
 */

(function () {
  'use strict';

  // Helper to hash string via SubtleCrypto
  async function sha256(str) {
    const buffer = new TextEncoder().encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // ==========================================
  // 1. Persistent Storage Token (Evercookie Lite)
  // ==========================================
  const STORAGE_KEY = 'rv_device_token';

  function getCookie(name) {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : null;
  }

  function setCookie(name, val, days = 730) {
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(val)}; expires=${expires}; path=/; SameSite=Lax`;
  }

  function openIndexedDB() {
    return new Promise((resolve) => {
      try {
        const req = indexedDB.open('rv_verify_db', 1);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          if (!db.objectStoreNames.contains('tokens')) {
            db.createObjectStore('tokens');
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
  }

  async function getIndexedDBToken() {
    const db = await openIndexedDB();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction('tokens', 'readonly');
        const store = tx.objectStore('tokens');
        const req = store.get(STORAGE_KEY);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch (e) {
        resolve(null);
      }
    });
  }

  async function setIndexedDBToken(val) {
    const db = await openIndexedDB();
    if (!db) return;
    try {
      const tx = db.transaction('tokens', 'readwrite');
      const store = tx.objectStore('tokens');
      store.put(val, STORAGE_KEY);
    } catch (e) {
      // Ignored
    }
  }

  async function resolvePersistentDeviceToken() {
    const cookieToken = getCookie(STORAGE_KEY);
    const localToken = localStorage.getItem(STORAGE_KEY);
    const sessionToken = sessionStorage.getItem(STORAGE_KEY);
    const idbToken = await getIndexedDBToken();

    // Find any existing token
    let token = cookieToken || localToken || idbToken || sessionToken;

    if (!token) {
      // Generate unique device token
      token = 'rv_' + crypto.randomUUID().replace(/-/g, '') + '_' + Date.now().toString(36);
    }

    // Sync across all storage mechanisms
    try { localStorage.setItem(STORAGE_KEY, token); } catch (e) {}
    try { sessionStorage.setItem(STORAGE_KEY, token); } catch (e) {}
    try { setCookie(STORAGE_KEY, token); } catch (e) {}
    try { await setIndexedDBToken(token); } catch (e) {}

    return token;
  }

  // ==========================================
  // 2. Deep Canvas Fingerprinting
  // ==========================================
  async function getCanvasFingerprint() {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 280;
      canvas.height = 60;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      // Text with styling and blending
      ctx.textBaseline = 'top';
      ctx.font = '14px "Arial", "Times New Roman", sans-serif';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#f60';
      ctx.fillRect(125, 1, 62, 20);

      ctx.fillStyle = '#069';
      ctx.fillText('RV-VERIFY.IO 🔒 0xDEADBEEF', 2, 15);
      ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
      ctx.fillText('ANTI-ALT-INTEGRITY-GATE', 4, 35);

      // Curved bezier path & composite operation
      ctx.globalCompositeOperation = 'multiply';
      ctx.beginPath();
      ctx.arc(50, 25, 20, 0, Math.PI * 2, true);
      ctx.closePath();
      ctx.fillStyle = 'rgb(255,0,255)';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(65, 25, 20, 0, Math.PI * 2, true);
      ctx.closePath();
      ctx.fillStyle = 'rgb(0,255,255)';
      ctx.fill();

      const dataUrl = canvas.toDataURL();
      return await sha256(dataUrl);
    } catch (e) {
      return null;
    }
  }

  // ==========================================
  // 3. WebGL GPU Fingerprinting
  // ==========================================
  async function getWebGLFingerprint() {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) return { renderer: 'No WebGL', vendor: 'No WebGL', hash: null };

      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const vendor = ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR);
      const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);

      // Render a simple colored shader to get hardware rasterizer hash
      const vsSource = `
        attribute vec2 position;
        void main() {
          gl_Position = vec4(position, 0.0, 1.0);
        }
      `;
      const fsSource = `
        precision mediump float;
        void main() {
          gl_FragColor = vec4(0.8, 0.2, 0.5, 1.0);
        }
      `;

      const vs = gl.createShader(gl.VERTEX_SHADER);
      gl.shaderSource(vs, vsSource);
      gl.compileShader(vs);

      const fs = gl.createShader(gl.FRAGMENT_SHADER);
      gl.shaderSource(fs, fsSource);
      gl.compileShader(fs);

      const program = gl.createProgram();
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      gl.useProgram(program);

      const vertices = new Float32Array([-1, -1, 1, -1, 0, 1]);
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

      const positionLocation = gl.getAttribLocation(program, 'position');
      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      const pixels = new Uint8Array(100 * 100 * 4);
      gl.readPixels(0, 0, 100, 100, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      const hash = await sha256(pixels.join(','));

      return {
        vendor: vendor || 'Unknown Vendor',
        renderer: renderer || 'Unknown Renderer',
        hash
      };
    } catch (e) {
      return { renderer: 'WebGL Error', vendor: 'WebGL Error', hash: null };
    }
  }

  // ==========================================
  // 4. AudioContext Fingerprinting
  // ==========================================
  async function getAudioFingerprint() {
    return new Promise(async (resolve) => {
      try {
        const AudioContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        if (!AudioContext) return resolve(null);

        const context = new AudioContext(1, 44100, 44100);
        const oscillator = context.createOscillator();
        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(10000, context.currentTime);

        const compressor = context.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-50, context.currentTime);
        compressor.knee.setValueAtTime(40, context.currentTime);
        compressor.ratio.setValueAtTime(12, context.currentTime);
        compressor.reduction.setValueAtTime(-20, context.currentTime);
        compressor.attack.setValueAtTime(0, context.currentTime);
        compressor.release.setValueAtTime(0.25, context.currentTime);

        oscillator.connect(compressor);
        compressor.connect(context.destination);
        oscillator.start(0);

        context.startRendering();
        context.oncomplete = async (e) => {
          try {
            const buffer = e.renderedBuffer.getChannelData(0);
            let sum = 0;
            for (let i = 4500; i < 5000; i++) {
              sum += Math.abs(buffer[i]);
            }
            const hash = await sha256(sum.toString());
            resolve(hash);
          } catch (err) {
            resolve(null);
          }
        };
      } catch (e) {
        resolve(null);
      }
    });
  }

  // ==========================================
  // 5. WebRTC Local IP Leak Detection
  // ==========================================
  function detectWebRtcIps() {
    return new Promise((resolve) => {
      const ips = [];
      try {
        const pc = new (window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection)({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });

        pc.onicecandidate = (event) => {
          if (event && event.candidate && event.candidate.candidate) {
            const candidate = event.candidate.candidate;
            const match = candidate.match(/([0-9]{1,3}(\.[0-9]{1,3}){3})/);
            if (match && !ips.includes(match[1])) {
              ips.push(match[1]);
            }
          }
        };

        pc.createDataChannel('rv_webrtc');
        pc.createOffer()
          .then(offer => pc.setLocalDescription(offer))
          .catch(() => {});

        setTimeout(() => {
          try { pc.close(); } catch (e) {}
          resolve(ips);
        }, 1200);
      } catch (e) {
        resolve([]);
      }
    });
  }

  // ==========================================
  // 6. Automation & Environment Checks
  // ==========================================
  async function getEnvironmentData() {
    let storageQuota = null;
    let isIncognito = false;
    if (navigator.storage && navigator.storage.estimate) {
      try {
        const est = await navigator.storage.estimate();
        storageQuota = est.quota;
        if (storageQuota && storageQuota < 120 * 1024 * 1024) {
          isIncognito = true;
        }
      } catch (e) {}
    }

    const hasCdcProps = Object.keys(window).some(k => k.startsWith('cdc_') || k.startsWith('__webdriver'));

    return {
      webdriver: Boolean(navigator.webdriver),
      hasCdcProps,
      isIncognito,
      storageQuota,
      pluginCount: navigator.plugins ? navigator.plugins.length : 0,
      languagesCount: navigator.languages ? navigator.languages.length : 0,
      isMobile: /Android|iPhone|iPad|iPod/i.test(navigator.userAgent),
      screenRes: `${window.screen.width}x${window.screen.height}@${window.screen.colorDepth}`,
      devicePixelRatio: window.devicePixelRatio || 1,
      cpuCores: navigator.hardwareConcurrency || 2,
      ramGb: navigator.deviceMemory || 4,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      platform: navigator.platform || 'Unknown'
    };
  }

  // ==========================================
  // UI & Flow Controller
  // ==========================================
  const urlParams = new URLSearchParams(window.location.search);
  const sessionToken = urlParams.get('token');
  const oauthCode = urlParams.get('code');
  const oauthState = urlParams.get('state');

  const statusTitle = document.getElementById('status-title');
  const statusDesc = document.getElementById('status-desc');
  const loader = document.getElementById('loader');
  const stepFp = document.getElementById('step-fp');
  const stepVpn = document.getElementById('step-vpn');
  const stepAlt = document.getElementById('step-alt');
  const resultBox = document.getElementById('result-box');
  const resultHeading = document.getElementById('result-heading');
  const resultMessage = document.getElementById('result-message');
  const resultDetails = document.getElementById('result-details');
  const actionContainer = document.getElementById('action-container');
  const verifyBtn = document.getElementById('verify-btn');
  const userSection = document.getElementById('user-section');
  const userAvatar = document.getElementById('user-avatar');
  const userTag = document.getElementById('user-tag');
  const accountAge = document.getElementById('account-age');

  function updateStep(element, status, iconText) {
    element.className = `step-item ${status}`;
    element.querySelector('.step-icon').textContent = iconText;
  }

  function showResult(success, heading, message, details = null) {
    loader.style.display = 'none';
    resultBox.style.display = 'block';
    resultBox.className = `result-box ${success ? 'success' : 'danger'}`;
    resultHeading.textContent = heading;
    resultMessage.textContent = message;

    if (details) {
      resultDetails.style.display = 'block';
      resultDetails.textContent = details;
    } else {
      resultDetails.style.display = 'none';
    }
  }

  async function startVerificationProcess() {
    if (!sessionToken && !oauthCode) {
      statusTitle.textContent = 'Invalid Session';
      statusDesc.textContent = 'No verification token provided. Please click the Verify button inside the Discord server.';
      loader.style.display = 'none';
      return;
    }

    try {
      // Step 1: Hardware & Device Fingerprint
      updateStep(stepFp, 'active', '⟳');
      const deviceUuid = await resolvePersistentDeviceToken();
      const canvasHash = await getCanvasFingerprint();
      const webgl = await getWebGLFingerprint();
      const audioHash = await getAudioFingerprint();
      const env = await getEnvironmentData();
      const webrtcIps = await detectWebRtcIps();
      updateStep(stepFp, 'done', '✓');

      // Step 2: Check Discord User Authentication
      const tokenToUse = sessionToken || oauthState;
      const sessionRes = await fetch(`/api/session-info?token=${encodeURIComponent(tokenToUse)}`);
      const sessionData = await sessionRes.json();

      if (!sessionData.authenticated) {
        // Need to authorize Discord OAuth2
        statusTitle.textContent = 'Discord Authorization Required';
        statusDesc.textContent = 'Please authorize RV VERIFY to verify your Discord account identity.';
        actionContainer.style.display = 'block';

        verifyBtn.onclick = () => {
          window.location.href = `/auth/discord?token=${encodeURIComponent(tokenToUse)}`;
        };
        return;
      }

      // Display authenticated user profile
      userSection.style.display = 'flex';
      userTag.textContent = sessionData.user.username;
      userAvatar.src = sessionData.user.avatar
        ? `https://cdn.discordapp.com/avatars/${sessionData.user.id}/${sessionData.user.avatar}.png`
        : 'https://cdn.discordapp.com/embed/avatars/0.png';
      accountAge.textContent = `Age: ${Math.floor(sessionData.user.ageDays)} days`;

      // Step 3: Network & Proxy Verification
      updateStep(stepVpn, 'active', '⟳');
      statusTitle.textContent = 'Analyzing Security Integrity...';
      statusDesc.textContent = 'Validating network fingerprint and cross-referencing server anti-alt database.';

      // Submit verification package to server
      const verifyPayload = {
        sessionToken: tokenToUse,
        deviceUuid,
        canvasHash,
        webglRenderer: webgl.renderer,
        webglVendor: webgl.vendor,
        audioHash,
        webrtcIps,
        screenRes: env.screenRes,
        cpuCores: env.cpuCores,
        ramGb: env.ramGb,
        timezone: env.timezone,
        platform: env.platform,
        webdriver: env.webdriver,
        hasCdcProps: env.hasCdcProps,
        isIncognito: env.isIncognito,
        storageQuota: env.storageQuota,
        pluginCount: env.pluginCount,
        languagesCount: env.languagesCount,
        isMobile: env.isMobile
      };

      const res = await fetch('/api/verify-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(verifyPayload)
      });

      const result = await res.json();

      if (result.status === 'VERIFIED') {
        updateStep(stepVpn, 'done', '✓');
        updateStep(stepAlt, 'done', '✓');
        statusTitle.textContent = 'Verification Complete!';
        statusDesc.textContent = 'Your device and account have passed all anti-alt integrity checks.';
        showResult(
          true,
          'Access Granted!',
          'Your account has been verified successfully. You may now return to the Discord server and enjoy full access.'
        );
      } else if (result.status === 'ALT_REJECTED') {
        updateStep(stepVpn, 'done', '✓');
        updateStep(stepAlt, 'error', '✕');
        statusTitle.textContent = 'Alt Account Detected!';
        statusDesc.textContent = 'Our anti-alt engine detected linked accounts matching your device.';
        showResult(
          false,
          'Verification Denied: Multiple Accounts Detected',
          'Alting, multi-accounting, and bot farming are prohibited. Server administrators have been notified with the full dossier of your linked accounts.',
          `Detection Vector: ${result.matchVector || 'Hardware & Device Profile Match'}\nConfidence: ${result.confidence || 98}%`
        );
      } else if (result.status === 'VPN_REJECTED') {
        updateStep(stepVpn, 'error', '✕');
        statusTitle.textContent = 'VPN / Proxy Detected';
        statusDesc.textContent = 'You are connecting through a VPN, proxy, or datacenter IP.';
        showResult(
          false,
          'VPN Connection Blocked',
          'Please turn off any active VPN, proxy, or iCloud Private Relay and refresh this page to complete verification.'
        );
      } else if (result.status === 'AGE_REJECTED') {
        updateStep(stepAlt, 'error', '✕');
        statusTitle.textContent = 'Account Too Fresh';
        statusDesc.textContent = `Your Discord account must be at least ${result.minDays} days old to enter this server.`;
        showResult(
          false,
          'Account Age Requirement Not Met',
          'To prevent raid bots and throwaway alts, your Discord account does not meet the minimum age requirement.'
        );
      } else {
        showResult(false, 'Verification Failed', result.error || 'An unexpected verification error occurred.');
      }
    } catch (err) {
      console.error('[Verification Error]', err);
      showResult(false, 'System Error', 'Failed to communicate with verification servers. Please try again later.');
    }
  }

  // Start process on page load
  window.addEventListener('DOMContentLoaded', startVerificationProcess);
})();
