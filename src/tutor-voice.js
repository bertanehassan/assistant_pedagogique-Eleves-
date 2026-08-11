/**
 * tutor-voice.js
 * Module de dictée vocale et synthèse vocale pour le Tuteur Expert.
 * CE FICHIER EST EXCLU DE L'OBFUSCATION intentionnellement :
 * les callbacks SpeechRecognition (onstart, onresult, onend) sont
 * cassés par controlFlowFlattening et stringArrayEncoding.
 */

// ═══════════════════════════════════════════════════════
// 🎤 DICTÉE VOCALE (Speech-to-Text)
// ═══════════════════════════════════════════════════════
window._tutorVoiceRecognition = null;
window._tutorVoiceIsRecording = false;

window.toggleTutorVoice = function () {
  var SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
  var voiceBtn  = document.getElementById('tutor-voice-btn');
  var voiceIcon = document.getElementById('tutor-voice-icon');

  if (!SpeechRecognitionAPI) {
    if (voiceBtn) voiceBtn.style.display = 'none';
    return;
  }

  // Si déjà en cours → arrêter
  if (window._tutorVoiceIsRecording) {
    if (window._tutorVoiceRecognition) {
      try { window._tutorVoiceRecognition.stop(); } catch(e) {}
    }
    return;
  }

  var recognition = new SpeechRecognitionAPI();
  recognition.lang = 'fr-FR';
  recognition.continuous = false;
  recognition.interimResults = false;
  window._tutorVoiceRecognition = recognition;

  recognition.onstart = function () {
    window._tutorVoiceIsRecording = true;
    var b = document.getElementById('tutor-voice-btn');
    var i = document.getElementById('tutor-voice-icon');
    if (b) { b.classList.add('recording'); b.title = 'Arrêter la dictée'; }
    if (i) i.textContent = 'mic_off';
  };

  recognition.onresult = function (e) {
    var transcript = '';
    for (var k = 0; k < e.results.length; k++) {
      transcript += e.results[k][0].transcript;
    }
    var inp = document.getElementById('tutor-user-input');
    if (inp && transcript) {
      inp.value = inp.value ? inp.value + ' ' + transcript : transcript;
      inp.style.height = '';
      inp.style.height = Math.min(inp.scrollHeight, 120) + 'px';
      inp.focus();
    }
  };

  recognition.onend = function () {
    window._tutorVoiceIsRecording = false;
    window._tutorVoiceRecognition = null;
    var b = document.getElementById('tutor-voice-btn');
    var i = document.getElementById('tutor-voice-icon');
    if (b) { b.classList.remove('recording'); b.title = 'Dicter votre question à voix haute'; }
    if (i) i.textContent = 'mic';
  };

  recognition.onerror = function (evt) {
    window._tutorVoiceIsRecording = false;
    window._tutorVoiceRecognition = null;
    var b = document.getElementById('tutor-voice-btn');
    var i = document.getElementById('tutor-voice-icon');
    if (b) { b.classList.remove('recording'); b.title = 'Dicter votre question à voix haute'; }
    if (i) i.textContent = 'mic';
    if (evt.error === 'not-allowed') {
      alert('Accès au microphone refusé.\nAutorisez-le dans les paramètres du navigateur (icône 🔒 dans la barre d\'adresse).');
    }
    // 'no-speech' est normal (silence), on ne montre pas d'erreur
  };

  try {
    recognition.start();
  } catch (err) {
    window._tutorVoiceIsRecording = false;
    window._tutorVoiceRecognition = null;
    console.error('[TutorVoice] Erreur start():', err);
  }
};

// ═══════════════════════════════════════════════════════
// 🔊 SYNTHÈSE VOCALE (Text-to-Speech)
// ═══════════════════════════════════════════════════════
window._tutorTTSEnabled = false;

window.toggleTutorTTS = function () {
  var btn  = document.getElementById('tutor-tts-btn');
  var icon = document.getElementById('tutor-tts-icon');

  if (!('speechSynthesis' in window)) {
    if (btn) btn.style.display = 'none';
    return;
  }

  window._tutorTTSEnabled = !window._tutorTTSEnabled;

  if (window._tutorTTSEnabled) {
    if (btn)  { btn.classList.add('tts-active'); btn.title = 'Désactiver la lecture vocale'; }
    if (icon) icon.textContent = 'volume_up';
  } else {
    if (btn)  { btn.classList.remove('tts-active'); btn.title = 'Lire les réponses à voix haute'; }
    if (icon) icon.textContent = 'volume_off';
    window.speechSynthesis.cancel();
  }
};

window.tutorSpeak = function (text) {
  if (!window._tutorTTSEnabled || !text || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();

  var clean = text
    .replace(/<[^>]+>/g, ' ')
    .replace(/```[\s\S]*?```/g, 'bloc de code.')
    .replace(/#{1,6}\s/g, '')
    .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!clean) return;

  var utterance = new SpeechSynthesisUtterance(clean);
  utterance.lang    = 'fr-FR';
  utterance.rate    = 0.95;
  utterance.pitch   = 1.05;
  utterance.volume  = 1;

  function pickVoiceAndSpeak() {
    var voices = window.speechSynthesis.getVoices();
    for (var i = 0; i < voices.length; i++) {
      if (voices[i].lang.startsWith('fr') && voices[i].localService) {
        utterance.voice = voices[i]; break;
      }
    }
    if (!utterance.voice) {
      for (var j = 0; j < voices.length; j++) {
        if (voices[j].lang.startsWith('fr')) { utterance.voice = voices[j]; break; }
      }
    }
    window.speechSynthesis.speak(utterance);
  }

  // Sur Android/Chrome, getVoices() est vide au premier appel.
  // On attend l'événement voiceschanged si nécessaire.
  var voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) {
    pickVoiceAndSpeak();
  } else {
    window.speechSynthesis.addEventListener('voiceschanged', function onVoicesChanged() {
      window.speechSynthesis.removeEventListener('voiceschanged', onVoicesChanged);
      pickVoiceAndSpeak();
    });
    // Fallback si voiceschanged ne tire pas (certains navigateurs)
    setTimeout(pickVoiceAndSpeak, 300);
  }
};
