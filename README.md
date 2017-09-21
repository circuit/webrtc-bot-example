# webrtc-bot-example

> Requires Circuit SDK version 1.2.1800 which will be available at the end of September 2017.

[Electron](https://electron.atom.io/)-based Bot utilizing the WebRTC capabilities of the [Circuit JS SDK](https://github.com/circuit/circuit-sdk).

> Electron is based on node.js and Chromium and is therefore able to utilize the Circuit JS WebRTC APIs unlike a regular node.js app.

## Scenarios covered in this example:
### Greet participants by name when joining a conference
* Using `callStatus` event listen for participants joining
* Use [IBM Text to Speech](https://www.ibm.com/watson/services/text-to-speech/) service to generate audio buffer for greeting
* Use the [AudioContext]((https://developer.mozilla.org/en-US/docs/Web/API/AudioContext)) of the Web Audio API to convert the audio buffer to a MediaStream
* Use the new [`setAudioVideoStream`](https://circuitsandbox.net/sdk/classes/Client.html#method_setAudioVideoStream) API to transmit the greeting to the conference

### Transcribe the conference and post to the conversation
* Todo
* Use https://cloud.google.com/speech/ or https://www.ibm.com/watson/services/speech-to-text/


## Getting Started

* [Register an account](https://www.circuit.com/web/developers/registration) on circuitsandbox.net (if you didn't yet)
* [Register a bot](http://circuit.github.io/oauth) on the sandbox (OAuth 2.0 Client Credentials)

### Run the app

```bash
    git clone https://github.com/circuit/webrtc-bot-example.git
    cd webrtc-bot-example
    npm install
    npm start
```
