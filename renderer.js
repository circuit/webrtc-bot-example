// Limitations: The bot can only be in a single call at a time. Multiple
// client crendentials app would be needed to be in multiple calls at
// the same time.

// Specify the file circuit.js which is the browser SDK to get access to WebRTC APIs.
const Circuit = require('circuit-sdk/circuit.js');

const config = require('electron').remote.require('./config.json');
const AUDIO_LEVEL_THRESHOLD = 50;

// Active call if joined by bot. In this example app the bot can only join one call at a time.
let activeCall;

// Silence checking interval
let interval;

// Change stats collection from 5s to 1s to be able to detect 5s of silence
Circuit.RtpStatsConfig.COLLECTION_INTERVAL = 1000;

const client = new Circuit.Client(config.sandbox);
const audioCtx = new AudioContext();

function playSound(callId, text) {
  let url = 'https://watson-api-explorer.mybluemix.net/text-to-speech/api/v1/synthesize?';
  let params = Circuit.Utils.toQS({
    accept: 'audio/ogg;codecs=opus',
    voice: 'en-US_MichaelVoice',
    text: text
  });

  fetch(`${url}?${params}`)
    .then(res => res.arrayBuffer())
    .then(buffer => {
      var source = audioCtx.createBufferSource();
      var output = audioCtx.createMediaStreamDestination();

      // Decode the audio data
      audioCtx.decodeAudioData(buffer, decodedData => {
        // Set the AudioContext's source and connect the source to the output
        source.buffer = decodedData;
        source.connect(output);

        // ********************
        // Workaround to force setAudioVideoStream to take the passed stream
        // This will be fixed in 1.2.3800
        Circuit.RtcSessionController.enableAudioAGC = !Circuit.RtcSessionController.enableAudioAGC;
        // ********************

        // Set the audio/video stream to be sent and then start the stream
        client.setAudioVideoStream(callId, output.stream)
          .then(() => source.start(0))
          .catch(console.error);

        /* for debugging the stream can be recorded and shown with a player on the UI
        var chunks = [];
        var mediaRecorder = new MediaRecorder(output.stream);
        mediaRecorder.ondataavailable = evt => chunks.push(evt.data);
        mediaRecorder.onstop = evt =>
          document.querySelector('audio').src = URL.createObjectURL(new Blob(chunks, {'type':'audio/ogg;codecs=opus'}));
        mediaRecorder.start();
        setTimeout(() => mediaRecorder.stop(), 3000);
        */
      });
    })
    .catch(console.error);
}

/**
 * Send a welcome announcement to the newly joined participant
 * @method welcomeParticipant
 * @param {String} callId callId of the call to mute.
 * @param {Object} participant Participant object with a firstName attribute.
 */
function welcomeParticipant(callId, participant) {
  playSound(callId, `Hello ${participant.firstName}, glad you could make the call.`);
}

/**
 * Play announcement for someone to speak up
 * @method playSilenceAnnouncement
 * @param {String} callId callId.
 */
function playSilenceAnnouncement(callId) {
  var announcements = [
    'Somebody speak up',
    'We don\'t have all day',
    'Don\'t be shy, say something',
    'It\'s getting late'
  ];
  playSound(callId, announcements[Math.floor(Math.random() * 4)]);
}

// Check if the item indicates this is a new conversation for the bot
function isNewConversation(item) {
  return (item.type === Circuit.Enums.ConversationItemType.SYSTEM &&
    (item.system.type === Circuit.Enums.SystemItemType.PARTICIPANT_ADDED ||
    item.system.type === Circuit.Enums.SystemItemType.CONVERSATION_CREATED) &&
    item.system.affectedParticipants.includes(client.loggedOnUser.userId));
}

// Event Listeners
client.addEventListener('itemAdded', evt => {
  let item = evt.item;
  if (isNewConversation(item)) {
    console.log(`Bot is added to a conversation: ${item.convId}`);
    client.addTextItem(item.convId, 'Thanks for adding me to the conversation.');
  }
});

client.addEventListener('callEnded', evt => {
  activeCall = null;
  stopSilenceDetection();
});

client.addEventListener('callStatus', evt => {
  let call = evt.call;

  if (activeCall && activeCall.callId !== call.callId) {
    console.log('callStatus event for a different call, ignore it');
    return;
  }

  // New conference has started, join the call
  if (evt.reason === 'callStateChanged' && call.state === Circuit.Enums.CallStateName.Started) {
    // Don't join the call if bot had joined earlier
    if (!activeCall || activeCall.callId !== call.callId) {
      // Remember this active call so bot does not start it again after everyone
      // left the call. This is because 'joinConference' does also starts the conference.
      activeCall = call;

      client.joinConference(call.callId)
        .then(() => console.log(`Joined call: ${call.callId}`))
        .then(() => startSilenceDetection(call.callId))
        .catch(err => console.error(err));
    }
    return;
  }

  // if (activeCall && call.isEstablished) {
  //   remoteAudio = document.getElementById('remoteAudio');
  //   remoteAudio.srcObject = call.remoteAudioStream;
  // }

  // Last participant left. Leave as well.
  if (evt.reason === 'participantRemoved' && !call.participants.length) {
    client.leaveConference(evt.call.callId)
      .then(() => console.log(`Left call: ${evt.call.callId}`))
      .then(() => remoteAudio.srcObject = null);
    return;
  }

  // New participant joined, welcome him/her
  if (evt.reason === 'participantAdded') {
    console.log(`New participant on call: ${evt.participant.firstName} ${evt.participant.lastName}`);
    welcomeParticipant(call.callId, evt.participant);
    return;
  }

  if (evt.reason === 'remoteStreamUpdated') {
    // Need to attach the stream to an audio element so that the audioOutputLevel stats (aol) are present
    // Attach stream to audio element's srcObject attribute
    remoteAudio = document.getElementById('remoteAudio');
    remoteAudio.srcObject = call.remoteAudioStream;
    return;
  }
});

// Detect silence on incoming audio stream using RTP stats field 'audioLevelOutput' (aol)
function startSilenceDetection(callId) {
  var sum = 0;
  var silenceCount = 0;
  interval = setInterval(() => {
    var aol = getAudioOutputLevel(callId);
    console.log(`audioLevelOutput: ${aol}`);

    if (aol === null || aol > AUDIO_LEVEL_THRESHOLD) {
      // No stat received or someone is talking
      silenceCount = 0;
      return;
    }

    silenceCount++;
    if (silenceCount >= 5) {
      // We had 5sec on silence
      playSilenceAnnouncement(callId);
      silenceCount = 0;
    }
  }, 1000);
}

function stopSilenceDetection() {
  clearInterval(interval);
}

function getAudioOutputLevel(callId) {
  var stats = client.getLastRtpStats && client.getLastRtpStats(callId);
  if (stats) {
    var stat = stats.find(stat => stat.pcType === 'AUDIO/VIDEO');
    if (stat) {
      return stat.audio.receive.aol;
    }
    return null;
  }
  return null;
}



// Print all events for debugging
Circuit.supportedEvents.forEach(e =>
  client.addEventListener(e, console.log)
);

// Initialization
client.logon()
  .then(user => console.log(`Logged on as bot: ${user.emailAddress}`))
  .then(() => client.setPresence({state: Circuit.Enums.PresenceState.AVAILABLE}))
  .catch(console.error);

