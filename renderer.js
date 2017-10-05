// Limitations: The bot can only be in a single call at a time. Multiple
// client crendentials app would be needed to be in multiple calls at
// the same time.

const config = require('electron').remote.require('./config.json');

const activeCalls = {};

let client = new Circuit.Client(config.sandbox);

function welcomeParticipant(callId, participant) {
  let url = 'https://watson-api-explorer.mybluemix.net/text-to-speech/api/v1/synthesize?';
  let params = Circuit.Utils.toQS({
    accept: 'audio/ogg;codecs=opus',
    voice: 'en-US_MichaelVoice',
    text: `Hello ${participant.firstName}, glad you could make the call.`
  });

  fetch(`${url}?${params}`)
    .then(res => res.arrayBuffer())
    .then(buffer => {
      var audioCtx = new AudioContext();
      var source = audioCtx.createBufferSource();
      var output = audioCtx.createMediaStreamDestination();

      // Decode the audio data
      audioCtx.decodeAudioData(buffer, decodedData => {
        // Set the AudioContext's source and connect the source to the output
        source.buffer = decodedData;
        source.connect(output);

        // Set the audio/video stream to be sent and then start the stream
        client.setAudioVideoStream(callId, output.stream)
          .then(() => source.start(0));

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
    .catch(console.error)
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
  // Remove call from activeCalls list
  delete activeCalls[evt.call.callId];
});

client.addEventListener('callStatus', evt => {
  let call = evt.call;

  // New conference has started, join the call
  if (evt.reason === 'callStateChanged' && call.state === Circuit.Enums.CallStateName.Started) {
    // Don't join the call if bot had joined earlier
    if (!activeCalls[call.callId]) {
      // Remember this active call so bot does not start it again after everyone
      // left the call. This is because 'joinConference' does also starts the conference.
      activeCalls[call.callId] = true;

      client.joinConference(call.callId)
        .then(() => console.log(`Joined call: ${call.callId}`));
    }
    return;
  }

  // Last participant left. Leave as well.
  if (evt.reason === 'participantRemoved' && !call.participants.length) {
    client.leaveConference(evt.call.callId)
      .then(() => console.log(`Left call: ${evt.call.callId}`));
    return;
  }

  // New participant joined, welcome him/her
  if (evt.reason === 'participantAdded') {
    console.log(`New participant on call: ${evt.participant.firstName} ${evt.participant.lastName}`);
    welcomeParticipant(call.callId, evt.participant);
    return;
  }

  // New conference has started, join the call
  if (evt.reason === 'callStateChanged' && call.state === Circuit.Enums.CallStateName.Active) {
    console.log(call.getRemoteAudioStream());
    return;
  }

});

// Print all events for debugging
Circuit.supportedEvents.forEach(e =>
  client.addEventListener(e, console.log)
);

// Initialization
client.logon()
  .then(user => console.log(`Logged on as bot: ${user.emailAddress}`))
